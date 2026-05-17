/**
 * notificationService.js
 *
 * Single source of truth for every notification write in the app.
 *
 * RULES:
 *  1. Only this file calls addDoc on the "notifications" collection.
 *  2. Every notification document includes a `redirectPath` field so NavBar
 *     never has to guess — it just reads notification.redirectPath.
 *  3. Duplicate-guard: before writing, check that an unread notification of the
 *     same type + transactionId doesn't already exist.
 *  4. Cancellation cleanup: call deleteNewOfferNotification() when a buyer cancels.
 *  5. Rating notifications live in Firestore (not generated client-side on every load).
 */

import {
  collection, addDoc, getDocs, query, doc, updateDoc,
  where, serverTimestamp, deleteDoc,
} from 'firebase/firestore';
import { db } from '../firebase';

export const notifySellerOfOffer = async ({ transactionId, sellerId, buyerId, buyerName, listingTitle }) => {
  const docRef = await addDoc(collection(db, 'notifications'), {
    type: 'new_offer',
    userId: sellerId,
    transactionId,
    buyerId,
    buyerName: buyerName || 'Student',
    listingTitle: listingTitle || 'an item',
    read: false,
    createdAt: new Date(),
  });
  return docRef.id;
};

export const markNotificationAsRead = async (notificationId) => {
  const notifRef = doc(db, 'notifications', notificationId);
  await updateDoc(notifRef, { read: true });
}

// ─── 15. Notify buyer of acceptance (legacy wrapper) ──────────────────────────

/**
 * Legacy wrapper for notifyOfferAccepted.
 * Kept for backward compatibility with older code that expects notifyBuyerOfAcceptance.
 * 
 * @deprecated Use notifyOfferAccepted instead
 */
export async function notifyBuyerOfAcceptance({ transactionId, buyerId }) {
  console.warn('[notificationService] notifyBuyerOfAcceptance is deprecated. Use notifyOfferAccepted instead.');
  
  // Try to fetch transaction details to get listing info
  let listingId = null;
  let listingTitle = null;
  let agreedPrice = null;
  
  try {
    const txSnap = await getDoc(doc(db, 'transactions', transactionId));
    if (txSnap.exists()) {
      const txData = txSnap.data();
      listingId = txData.listingId;
      listingTitle = txData.listingTitle || 'your item';
      agreedPrice = txData.agreedPrice;
    }
  } catch (err) {
    console.error('[notificationService] Failed to fetch transaction details:', err);
  }
  
  return _write(
    buyerId,
    'offer_accepted',
    `/payment/${transactionId}`,
    { transactionId, listingId, listingTitle, agreedPrice },
  );
}

// ─── 16. Notify all admins when a report is submitted ─────────────────────────

/**
 * Called when a user submits a report (listing, user, or message).
 * Fetches all admin users and sends each a "new_report" notification.
 * 
 * @param {Object} params
 * @param {string} params.reportId - ID of the report document
 * @param {string} params.reportType - 'listing', 'user', or 'message'
 * @param {string} params.reportedId - UID or ID of the reported entity
 * @param {string} params.reportedName - Name/title of the reported entity
 * @param {string} params.reporterName - Name of the user who submitted the report
 * @param {string} params.reason - Short description of the report reason
 */
export async function notifyAdminsOfReport({
  reportId,
  reportType,
  reportedId,
  reportedName,
  reporterName,
  reason,
}) {
  // Fetch all admin users
  const adminsSnap = await getDocs(
    query(collection(db, 'users'), where('userType', '==', 'admin'))
  );

  const promises = adminsSnap.docs.map((adminDoc) =>
    _write(
      adminDoc.id,
      'new_report',
      `/admin/reports/${reportId}`,
      {
        reportId,
        reportType,
        reportedId,
        reportedName,
        reporterName,
        reason,
      }
    )
  );

  await Promise.all(promises);
};
