// src/services/transactionService.js
import { collection, addDoc, updateDoc, doc } from 'firebase/firestore';
import { db } from '../firebase';

export const createTransaction = async ({ type, listingId, buyerId, sellerId }) => {
  const docRef = await addDoc(collection(db, 'transactions'), {
    type,
    status: 'pending',
    listingId,
    buyerId,
    sellerId,
    createdAt: new Date(),
  });

  return docRef.id;
};

export const acceptOffer = async ({ transactionId, sellerId }) => {
  const transactionRef = doc(db, 'transactions', transactionId);

  await updateDoc(transactionRef, {
    status: 'accepted',
    acceptedBy: sellerId,
    acceptedAt: new Date(),
  });
};

export const declineOffer = async ({ transactionId, sellerId }) => {
  const transactionRef = doc(db, 'transactions', transactionId);

  await updateDoc(transactionRef, {
    status: 'declined',
    declinedBy: sellerId,
    declinedAt: new Date(),
  });
};