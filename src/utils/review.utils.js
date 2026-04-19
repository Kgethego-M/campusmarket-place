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
  // 1. Prevent duplicate reviews for the same purchase
  const duplicateCheck = query(
    collection(db, 'reviews'),
    where('purchaseId', '==', purchaseId),
    where('reviewerUserId', '==', reviewerUserId)
  );
  const existing = await getDocs(duplicateCheck);
  if (!existing.empty) {
    throw new Error('You have already reviewed this transaction.');
  }

  // 2. Save the review document
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

  // 3. Recalculate average rating for the reviewed user
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

  // 4. Update the user's profile with new average
  const userRef = doc(db, 'users', reviewedUserId);
  await updateDoc(userRef, {
  rating: parseFloat(average.toFixed(2)),
  totalRatings: ratings.length,
});
}
