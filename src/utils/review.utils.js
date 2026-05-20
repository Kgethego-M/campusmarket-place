import { db } from '../firebase';
import {
  collection,
  addDoc,
  doc,
  updateDoc,
  getDocs,
  query,
  where,
  serverTimestamp,
} from 'firebase/firestore';

export async function submitReview({
  reviewedUserId,
  reviewerUserId,
  reviewerName,
  listingId,
  purchaseId,
  rating,
  comment,
  role,
}) {
  const duplicateCheck = query(
    collection(db, 'reviews'),
    where('purchaseId', '==', purchaseId),
    where('reviewerUserId', '==', reviewerUserId)
  );
  const existing = await getDocs(duplicateCheck);
  if (!existing.empty) {
    throw new Error('You have already reviewed this transaction.');
  }

  await addDoc(collection(db, 'reviews'), {
    reviewedUserId,
    reviewerUserId,
    reviewerName,
    listingId,
    purchaseId: purchaseId,
    rating,
    comment,
    role,
    createdAt: serverTimestamp(),
  });

  const q = query(
    collection(db, 'reviews'),
    where('reviewedUserId', '==', reviewedUserId)
  );
  const snap = await getDocs(q);
  const ratings = snap.docs.map((d) => d.data().rating).filter(Boolean);
  const average =
    ratings.length > 0
      ? ratings.reduce((sum, r) => sum + r, 0) / ratings.length
      : 0;

  const userRef = doc(db, 'users', reviewedUserId);
  await updateDoc(userRef, {
    rating: parseFloat(average.toFixed(2)),
    totalRatings: ratings.length,
  });
}

export async function getUserReviews(reviewedUserId, role = null) {
  try {
    const constraints = [where('reviewedUserId', '==', reviewedUserId)];
    if (role) {
      constraints.push(where('role', '==', role));
    }
    const q = query(collection(db, 'reviews'), ...constraints);
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (error) {
    console.error('Error fetching reviews:', error);
    throw error;
  }
}

export function getAverageRating(reviews) {
  if (!reviews || reviews.length === 0) return '0.0';
  const total = reviews.reduce((sum, r) => sum + r.rating, 0);
  return (total / reviews.length).toFixed(1);
}