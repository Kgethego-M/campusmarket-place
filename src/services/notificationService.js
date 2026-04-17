// src/services/notificationService.js
import { collection, addDoc } from 'firebase/firestore';
import { db } from '../firebase';

export const notifySellerOfOffer = async ({ transactionId, sellerId, buyerId }) => {
  const docRef = await addDoc(collection(db, 'notifications'), {
    type: 'new_offer',
    userId: sellerId,
    transactionId,
    buyerId,
    read: false,
    createdAt: new Date(),
  });

  return docRef.id;
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
    status: status, // 'accepted' or 'declined'
    updatedAt: new Date(),
  });
};