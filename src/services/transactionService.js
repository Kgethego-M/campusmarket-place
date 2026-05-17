// src/services/transactionService.js
import { collection, addDoc, updateDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';

export const createTransaction = async (transactionData) => {
  // Save ALL fields passed in — previously this dropped most of them
  const docRef = await addDoc(collection(db, 'transactions'), {
    ...transactionData,
    status:    'pending',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return docRef.id;
};

export const acceptOffer = async ({ transactionId, sellerId }) => {
  await updateDoc(doc(db, 'transactions', transactionId), {
    status:     'accepted',
    acceptedBy: sellerId,
    acceptedAt: serverTimestamp(),
    updatedAt:  serverTimestamp(),
  });
};

export const declineOffer = async ({ transactionId, sellerId }) => {
  await updateDoc(doc(db, 'transactions', transactionId), {
    status:     'declined',
    declinedBy: sellerId,
    declinedAt: serverTimestamp(),
    updatedAt:  serverTimestamp(),
  });
};

// Add this new function to confirm payment for cash transactions
export const confirmCashPayment = async ({ transactionId, buyerId }) => {
  await updateDoc(doc(db, 'transactions', transactionId), {
    paymentConfirmed: true,
    paymentConfirmedAt: serverTimestamp(),
    paymentConfirmedBy: buyerId,
    updatedAt: serverTimestamp(),
  });
};