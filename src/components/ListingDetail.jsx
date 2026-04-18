// src/components/ListingDetail.jsx
// Route wrapper — fetches data from Firebase and passes it to ListingDetailView.
// ListingDetailView is re-exported here so the test import path stays the same:
//   import { ListingDetailView } from '../components/ListingDetail'
import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { onAuthStateChanged } from 'firebase/auth';
import NavBarTemp from './NavBarTemp';
import { ListingDetailView } from './ListingDetailView';

export { ListingDetailView };

const styles = {
  backBtn: { background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.9rem', color: '#555', padding: '0', fontFamily: 'Segoe UI, system-ui, sans-serif' },
};

export default function ListingDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [listing, setListing] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [existingTransaction, setExistingTransaction] = useState(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => setCurrentUser(user));
    return () => unsub();
  }, []);

  useEffect(() => {
    async function fetchListing() {
      try {
        const snap = await getDoc(doc(db, 'listings', id));
        if (snap.exists()) setListing({ id: snap.id, ...snap.data() });
      } catch (err) {
        console.error('Failed to fetch listing:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchListing();
  }, [id]);

  useEffect(() => {
    if (!currentUser || !id) return;
    async function checkExisting() {
      try {
        const snap = await getDocs(query(
          collection(db, 'transactions'),
          where('listingId', '==', id),
          where('buyerId', '==', currentUser.uid),
          where('status', '==', 'pending')
        ));
        if (!snap.empty) setExistingTransaction({ id: snap.docs[0].id, ...snap.docs[0].data() });
      } catch (err) {
        console.error('Failed to check existing transaction:', err);
      }
    }
    checkExisting();
  }, [currentUser, id]);

  if (loading) return <div style={{ padding: '40px', textAlign: 'center' }}>Loading...</div>;
  if (!listing) return <div style={{ padding: '40px', textAlign: 'center' }}>Listing not found.</div>;

  return (
    <>
      <NavBarTemp />
      <div style={{ padding: '16px 32px' }}>
        <button onClick={() => navigate(-1)} style={styles.backBtn}>← Back to listings</button>
      </div>
      <ListingDetailView
        listing={listing}
        currentUser={currentUser}
        existingTransaction={existingTransaction}
        navigate={navigate}
      />
    </>
  );
}
