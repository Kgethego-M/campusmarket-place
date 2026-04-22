// src/services/notificationService.js
import { collection, addDoc, doc, updateDoc, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase';

export const notifySellerOfOffer = async ({ transactionId, sellerId, buyerId, buyerName }) => {
  const docRef = await addDoc(collection(db, 'notifications'), {
    type: 'new_offer',
    userId: sellerId,
    transactionId,
    buyerId,
    buyerName: buyerName || 'Student',
    read: false,
    createdAt: new Date(),
  });
  return docRef.id;
};

export const markNotificationAsRead = async (notificationId) => {
  const notifRef = doc(db, 'notifications', notificationId);
  await updateDoc(notifRef, { read: true });
};

export const notifyBuyerOfAcceptance = async ({ transactionId, buyerId }) => {
  const docRef = await addDoc(collection(db, 'notifications'), {
    type: 'offer_accepted',
    userId: buyerId,
    transactionId,
    read: false,
    createdAt: new Date(),
  });
  return docRef.id;
};

export const updateTransactionStatus = async (transactionId, status) => {
  const transactionRef = doc(db, 'transactions', transactionId);
  await updateDoc(transactionRef, {
    status,
    updatedAt: new Date(),
  });
};

// ── Notify all admins when a report is submitted ─────────────────────────────
export const notifyAdminsOfReport = async ({
  reportId,
  reportType,
  reportedId,
  reportedName,
  reporterName,
  reason,
}) => {
  // Fetch all admin users
  const adminsSnap = await getDocs(
    query(collection(db, 'users'), where('userType', '==', 'admin'))
  );

  const promises = adminsSnap.docs.map((adminDoc) =>
    addDoc(collection(db, 'notifications'), {
      type: 'new_report',
      userId: adminDoc.id,
      reportId,
      reportType,
      reportedId,
      reportedName,
      reporterName,
      reason,
      read: false,
      createdAt: new Date(),
    })
  );

  await Promise.all(promises);
};