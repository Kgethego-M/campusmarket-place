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

// ─── internal helper ─────────────────────────────────────────────────────────

/**
 * Guard against duplicate notifications.
 * Returns true if an unread notification of this type already exists for
 * this user + transaction.
 */
async function _isDuplicate(userId, type, transactionId) {
  try {
    const q = query(
      collection(db, 'notifications'),
      where('userId',        '==', userId),
      where('type',          '==', type),
      where('transactionId', '==', transactionId),
      where('read',          '==', false),
    );
    const snap = await getDocs(q);
    return !snap.empty;
  } catch {
    return false; // fail open — better to duplicate than to silently drop
  }
}

/**
 * Core writer. All public functions funnel through here.
 * @param {string}      userId       - Firestore UID of the recipient
 * @param {string}      type         - notification type string
 * @param {string|null} redirectPath - where NavBar should navigate on click (null = no redirect)
 * @param {object}      extra        - any additional fields (listingId, listingTitle, buyerName, …)
 */
async function _write(userId, type, redirectPath, extra = {}) {
  const transactionId = extra.transactionId || null;

  // Duplicate guard (skip for overdue/cancellation types — those should always fire)
  const noGuardTypes = new Set([
    'overdue_dropoff_seller', 'overdue_dropoff_buyer',
    'overdue_collection_buyer', 'overdue_collection_seller',
    'cancelled_dropoff_seller', 'cancelled_dropoff_buyer',
    'cancelled_collection_seller', 'cancelled_collection_buyer',
  ]);
  if (transactionId && !noGuardTypes.has(type)) {
    const dupe = await _isDuplicate(userId, type, transactionId);
    if (dupe) {
      console.warn(`[notificationService] Skipped duplicate: ${type} for user ${userId}`);
      return null;
    }
  }

  try {
    const ref = await addDoc(collection(db, 'notifications'), {
      userId,
      type,
      redirectPath: redirectPath ?? null,
      read: false,
      createdAt: serverTimestamp(),
      ...extra,
    });
    return ref.id;
  } catch (err) {
    console.error(`[notificationService] Failed to write ${type}:`, err);
    return null;
  }
}

// ─── 1. Offer initiated (buyer → seller) ─────────────────────────────────────

/**
 * Called from ListingDetails.jsx after createTransaction() succeeds.
 * Sends seller a "new_offer" notification → redirects to Profile Offers tab.
 */
export async function notifySellerOfOffer({
  transactionId, sellerId, buyerId, buyerName, listingId, listingTitle, agreedPrice,
}) {
  return _write(
    sellerId,
    'new_offer',
    `/profile?tab=offers&highlight=${transactionId}`,
    { transactionId, listingId, listingTitle, buyerName, agreedPrice },
  );
}

// ─── 2. Buyer cancels (withdraw offer) ───────────────────────────────────────

/**
 * Called from ListingDetails.jsx when buyer clicks "Withdraw offer".
 * Deletes the seller's unread new_offer notification for this transaction.
 */
export async function deleteNewOfferNotification(transactionId) {
  if (!transactionId) return;
  try {
    const q = query(
      collection(db, 'notifications'),
      where('type',          '==', 'new_offer'),
      where('transactionId', '==', transactionId),
      where('read',          '==', false),
    );
    const snap = await getDocs(q);
    await Promise.all(snap.docs.map(d => deleteDoc(d.ref)));
  } catch (err) {
    console.error('[notificationService] deleteNewOfferNotification failed:', err);
  }
}

// ─── 3a. Seller accepts — sale (payment required) ────────────────────────────

/**
 * Called from OfferItem.jsx handleAccept() when type !== 'trade'.
 * Buyer gets "offer_accepted" → redirects to /payment/:transactionId
 */
export async function notifyOfferAccepted({
  transactionId, buyerId, sellerId, listingId, listingTitle, agreedPrice,
}) {
  return _write(
    buyerId,
    'offer_accepted',
    `/payment/${transactionId}`,
    { transactionId, listingId, listingTitle, agreedPrice },
  );
}

// ─── 3b. Seller accepts — trade ──────────────────────────────────────────────

/**
 * Called from OfferItem.jsx handleAccept() when type === 'trade'.
 * Both parties get "trade_waiting" → redirects to /trade-facility.
 */
export async function notifyTradeAccepted({
  transactionId, buyerId, sellerId, listingId, listingTitle,
}) {
  await Promise.all([
    _write(
      buyerId,
      'trade_waiting',
      '/trade-facility',
      { transactionId, listingId, listingTitle },
    ),
    _write(
      sellerId,
      'trade_waiting',
      '/trade-facility',
      { transactionId, listingId, listingTitle },
    ),
  ]);
}

// ─── 4. Seller declines ───────────────────────────────────────────────────────

/**
 * Called from OfferItem.jsx handleDecline().
 * Buyer gets "offer_declined" → no redirect (null).
 */
export async function notifyOfferDeclined({
  transactionId, buyerId, listingId, listingTitle,
}) {
  return _write(
    buyerId,
    'offer_declined',
    null,
    { transactionId, listingId, listingTitle },
  );
}

// ─── 5. Buyer pays ────────────────────────────────────────────────────────────

/**
 * Called from Payment.jsx after payment is confirmed (cash or Stripe).
 * Seller gets "buyer_paid" → redirects to /trade-facility to book drop-off.
 */
export async function notifySellerBuyerPaid({
  transactionId, sellerId, buyerName, listingId, listingTitle, agreedPrice,
}) {
  return _write(
    sellerId,
    'buyer_paid',
    '/trade-facility',
    { transactionId, listingId, listingTitle, buyerName, agreedPrice },
  );
}

// ─── 6. Drop-off slot booked ──────────────────────────────────────────────────

/**
 * Called from BookDropOff.jsx after the booking documents are written.
 *
 * For seller booking: notifies seller (confirmation) + buyer (info).
 * For buyer trade booking: notifies buyer (confirmation) + seller (info).
 */
export async function notifyDropOffBooked({
  transactionId, sellerId, buyerId, listingId, listingTitle,
  role, // 'seller' | 'buyer'
  date, timeSlot, tradeItemName,
}) {
  const isBuyerRole = role === 'buyer';

  if (!isBuyerRole) {
    // Seller booked their slot
    await Promise.all([
      // Confirm to seller
      _write(
        sellerId,
        'dropoff_booked',
        '/trade-facility',
        {
          transactionId, listingId, listingTitle,
          message: `Your drop-off for "${listingTitle}" is confirmed for ${date} at ${timeSlot}.`,
        },
      ),
      // Inform buyer (sale) or prompt buyer to book their own slot (trade)
      tradeItemName
        ? _write(
            buyerId,
            'trade_dropoff_required',
            `/book-dropoff/${transactionId}`,
            {
              transactionId, listingId, listingTitle,
              message: `The seller has booked their drop-off. Book your slot to drop off "${tradeItemName}".`,
            },
          )
        : _write(
            buyerId,
            'seller_dropoff_booked',
            null,
            {
              transactionId, listingId, listingTitle,
              message: `The seller has scheduled drop-off for "${listingTitle}" on ${date} at ${timeSlot}.`,
            },
          ),
    ]);
  } else {
    // Buyer booked their trade slot
    await Promise.all([
      _write(
        buyerId,
        'buyer_dropoff_booked',
        '/trade-facility',
        {
          transactionId, listingId, listingTitle,
          message: `Your trade drop-off of "${tradeItemName || 'your item'}" is confirmed for ${date} at ${timeSlot}.`,
        },
      ),
      _write(
        sellerId,
        'buyer_dropoff_booked',
        '/trade-facility',
        {
          transactionId, listingId, listingTitle,
          message: `The buyer has booked their trade drop-off for "${listingTitle}" on ${date} at ${timeSlot}.`,
        },
      ),
    ]);
  }
}

// ─── 7. Staff confirms drop-off ───────────────────────────────────────────────

/**
 * Called from StaffDashboard.jsx handleConfirmDropOff() when confirmingSeller.
 * Seller gets "item_received_at_facility" → no redirect.
 * Buyer gets "item_at_facility" → no redirect.
 */
export async function notifyDropOffConfirmed({
  transactionId, sellerId, buyerId, listingId, listingTitle,
}) {
  await Promise.all([
    _write(
      sellerId,
      'item_received_at_facility',
      null,
      { transactionId, listingId, listingTitle },
    ),
    _write(
      buyerId,
      'item_at_facility',
      null,
      { transactionId, listingId, listingTitle },
    ),
  ]);
}

// ─── 8. Item ready for collection (both drop-offs done) ──────────────────────

/**
 * Called from StaffDashboard.jsx when bothDone === true (status → awaiting_collection).
 * Buyer gets "item_ready_for_collection" → no redirect.
 */
export async function notifyItemReadyForCollection({
  transactionId, buyerId, listingId, listingTitle,
}) {
  return _write(
    buyerId,
    'item_ready_for_collection',
    null,
    { transactionId, listingId, listingTitle },
  );
}

// ─── 9. Transaction complete + rate prompts ───────────────────────────────────

/**
 * Called from StaffDashboard.jsx handleConfirmCollection() when status → completed.
 *
 * Writes four documents:
 *  - buyer:  "item_collected"  → no redirect
 *  - seller: "transaction_complete" → no redirect
 *  - buyer:  "rate_seller"     → /review/:listingId?... (persists until review submitted)
 *  - seller: "rate_buyer"      → /review/:listingId?... (persists until review submitted)
 *
 * The rate_* notifications use a special persistUntilReviewed flag so NavBar
 * keeps them visible until a review document exists for that pair.
 */
export async function notifyTransactionComplete({
  transactionId, buyerId, sellerId, listingId, listingTitle,
  buyerName, sellerName,
}) {
  const rateSellerPath =
    `/review/${listingId}?reviewedUserId=${sellerId}` +
    `&name=${encodeURIComponent(sellerName || 'Seller')}` +
    `&role=seller&purchaseId=${transactionId}`;

  const rateBuyerPath =
    `/review/${listingId}?reviewedUserId=${buyerId}` +
    `&name=${encodeURIComponent(buyerName || 'Buyer')}` +
    `&role=buyer&purchaseId=${transactionId}`;

  await Promise.all([
    // Completion confirmations
    _write(buyerId,  'item_collected',      null, { transactionId, listingId, listingTitle }),
    _write(sellerId, 'transaction_complete', null, { transactionId, listingId, listingTitle }),

    // Rate prompts — these stay unread until a review is submitted.
    // NavBar dismisses them when a matching review doc exists in /reviews.
    _write(
      buyerId,
      'rate_seller',
      rateSellerPath,
      {
        transactionId, listingId, listingTitle,
        reviewedUserId:   sellerId,
        reviewedUserName: sellerName || 'Seller',
        persistUntilReviewed: true,
      },
    ),
    _write(
      sellerId,
      'rate_buyer',
      rateBuyerPath,
      {
        transactionId, listingId, listingTitle,
        reviewedUserId:   buyerId,
        reviewedUserName: buyerName || 'Buyer',
        persistUntilReviewed: true,
      },
    ),
  ]);
}

// ─── 10. Overdue drop-off ─────────────────────────────────────────────────────

/**
 * Called from StaffDashboard.jsx handleAlertOverdue() when overdueType === 'drop_off'.
 * Seller gets "overdue_dropoff_seller" → no redirect.
 * Buyer gets "overdue_dropoff_buyer"   → no redirect.
 */
export async function notifyOverdueDropOff({
  transactionId, sellerId, buyerId, listingId, listingTitle,
}) {
  await Promise.all([
    _write(
      sellerId,
      'overdue_dropoff_seller',
      null,
      {
        transactionId, listingId, listingTitle,
        message: `Your drop-off for "${listingTitle}" is overdue. Please bring your item to the trade facility as soon as possible.`,
      },
    ),
    _write(
      buyerId,
      'overdue_dropoff_buyer',
      null,
      {
        transactionId, listingId, listingTitle,
        message: `The seller has not yet dropped off "${listingTitle}". They have been notified and given 24 hours.`,
      },
    ),
  ]);
}

// ─── 11. Overdue collection ───────────────────────────────────────────────────

/**
 * Called from StaffDashboard.jsx handleAlertOverdue() when overdueType === 'collection'.
 * Buyer gets "overdue_collection_buyer"   → no redirect.
 * Seller gets "overdue_collection_seller" → no redirect.
 */
export async function notifyOverdueCollection({
  transactionId, sellerId, buyerId, listingId, listingTitle,
}) {
  await Promise.all([
    _write(
      buyerId,
      'overdue_collection_buyer',
      null,
      {
        transactionId, listingId, listingTitle,
        message: `Your collection of "${listingTitle}" is overdue. Please come to the trade facility as soon as possible.`,
      },
    ),
    _write(
      sellerId,
      'overdue_collection_seller',
      null,
      {
        transactionId, listingId, listingTitle,
        message: `The buyer has not yet collected "${listingTitle}". They have been notified and given 24 hours.`,
      },
    ),
  ]);
}

// ─── 12. Cancelled — seller missed drop-off ───────────────────────────────────

/**
 * Called from StaffDashboard.jsx handleCancelOverdue() when overdueType === 'drop_off'.
 */
export async function notifyCancelledDropOff({
  transactionId, sellerId, buyerId, listingId, listingTitle, wasOnlinePayment,
}) {
  await Promise.all([
    _write(
      sellerId,
      'cancelled_dropoff_seller',
      null,
      {
        transactionId, listingId, listingTitle,
        message: `Your transaction for "${listingTitle}" has been cancelled due to a missed drop-off.`,
      },
    ),
    _write(
      buyerId,
      'cancelled_dropoff_buyer',
      null,
      {
        transactionId, listingId, listingTitle,
        message: wasOnlinePayment
          ? `Your transaction for "${listingTitle}" was cancelled — the seller did not drop off in time. You will be refunded within 24 hours.`
          : `Your transaction for "${listingTitle}" was cancelled — the seller did not drop off in time. No payment was collected.`,
      },
    ),
  ]);
}

// ─── 13. Cancelled — buyer missed collection ──────────────────────────────────

/**
 * Called from StaffDashboard.jsx handleCancelOverdue() when overdueType === 'collection'.
 */
export async function notifyCancelledCollection({
  transactionId, sellerId, buyerId, listingId, listingTitle,
}) {
  await Promise.all([
    _write(
      buyerId,
      'cancelled_collection_buyer',
      null,
      {
        transactionId, listingId, listingTitle,
        message: `Your transaction for "${listingTitle}" was cancelled due to non-collection.`,
      },
    ),
    _write(
      sellerId,
      'cancelled_collection_seller',
      null,
      {
        transactionId, listingId, listingTitle,
        message: `The buyer did not collect "${listingTitle}" — the transaction has been cancelled. Please collect your item from the trade facility.`,
      },
    ),
  ]);
}

// ─── 14. Mark notification as read ────────────────────────────────────────────

/**
 * Called from NavBar.jsx or anywhere else to mark a single notification as read.
 */
export async function markNotificationAsRead(notificationId) {
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
}