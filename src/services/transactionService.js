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