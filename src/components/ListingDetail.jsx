// src/components/ListingDetail.jsx
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { createTransaction } from '../services/transactionService';
import { notifySellerOfOffer } from '../services/notificationService';

// Core logic — accepts props directly, used in tests
export function ListingDetailView({ listing, currentUser }) {

  const handleTransaction = async () => {
    const transactionId = await createTransaction({
      type: listing.listingType || listing.type,
      listingId: listing.id,
      buyerId: currentUser.uid,
      sellerId: listing.sellerUID || listing.sellerId,
    });

    await notifySellerOfOffer({
      transactionId,
      sellerId: listing.sellerUID || listing.sellerId,
      buyerId: currentUser.uid,
    });
  };

  const renderButton = () => {
    if (!currentUser) return null;

    const sellerId = listing.sellerUID || listing.sellerId;
    if (currentUser.uid === sellerId) return null;

    const type = listing.listingType || listing.type;

    if (type === 'For Sale' || type === 'sale') {
      return <button onClick={handleTransaction}>Buy Now</button>;
    }
    if (type === 'For Trade' || type === 'trade') {
      return <button onClick={handleTransaction}>Make Trade Offer</button>;
    }
    if (type === 'Both' || type === 'both' || type === 'Either') {
      return <button onClick={handleTransaction}>Buy Now / Make Trade Offer</button>;
    }
    return null;
  };

  return (
    <div>
      <h1>{listing.title}</h1>
      <p>{listing.description}</p>
      <p>R {listing.price}</p>
      <p>Condition: {listing.condition}</p>
      <p>Seller: {listing.sellerName}</p>
      {renderButton()}
    </div>
  );
}

// Default export — fetches its own data, used in the real app
export default function ListingDetail() {
  const { id } = useParams();
  const [listing, setListing] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    async function fetchListing() {
      try {
        const docRef = doc(db, 'listings', id);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setListing({ id: docSnap.id, ...docSnap.data() });
        }
      } catch (err) {
        console.error('Failed to fetch listing:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchListing();
  }, [id]);

  if (loading) return <div>Loading...</div>;
  if (!listing) return <div>Listing not found.</div>;

  return <ListingDetailView listing={listing} currentUser={currentUser} />;
}