// src/components/OfferItem.jsx
import React, { useEffect, useState } from 'react';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { notifyBuyerOfAcceptance } from '../services/notificationService';

export default function OfferItem({ offer }) {
  const [listing, setListing] = useState(null);
  const [buyer, setBuyer] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchInfo() {
      try {
        const [listSnap, buyerSnap] = await Promise.all([
          getDoc(doc(db, 'listings', offer.listingId)),
          getDoc(doc(db, 'users', offer.buyerId)),
        ]);

        if (listSnap.exists()) setListing({ id: listSnap.id, ...listSnap.data() });
        if (buyerSnap.exists()) setBuyer(buyerSnap.data());
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    fetchInfo();
  }, [offer]);

  const handleUpdate = async (status) => {
    try {
      await updateDoc(doc(db, 'transactions', offer.id), {
        status,
        updatedAt: new Date(),
      });

      if (status === 'accepted') {
        await notifyBuyerOfAcceptance({
          transactionId: offer.id,
          buyerId: offer.buyerId,
        });
      }

      alert(`Offer ${status}!`);
    } catch (err) {
      console.error('Error updating offer:', err);
      alert('Something went wrong.');
    }
  };

  if (loading) return <div style={styles.card}>Loading offer...</div>;

  const imageUrl = listing?.photos?.[0] || listing?.imageUrl || null;
  const buyerName = buyer
    ? `${buyer.firstName || ''} ${buyer.lastName || ''}`.trim()
    : 'Unknown Buyer';

  const typeColor = {
    'For Sale': '#e07b3a',
    sale: '#e07b3a',
    'For Trade': '#3a7be0',
    trade: '#3a7be0',
    Both: '#7b3ae0',
    Either: '#7b3ae0',
    both: '#7b3ae0',
  };

  const offerType = offer.type || '';

  return (
    <div style={styles.card}>

      {/* Left — listing image */}
      <div style={styles.imageWrapper}>
        {imageUrl ? (
          <img src={imageUrl} alt={listing?.title} style={styles.image} />
        ) : (
          <div style={styles.imagePlaceholder}>
            <span style={{ color: '#aaa', fontSize: '0.8rem' }}>No image</span>
          </div>
        )}
      </div>

      {/* Middle — details */}
      <div style={styles.details}>
        <p style={styles.itemTitle}>{listing?.title || 'Unknown Item'}</p>

        <p style={styles.meta}>
          <span style={styles.label}>Price:</span> R {Number(listing?.price || 0).toLocaleString()}
        </p>

        <p style={styles.meta}>
          <span style={styles.label}>Condition:</span> {listing?.condition || 'N/A'}
        </p>

        <p style={styles.meta}>
          <span style={styles.label}>Offer type:</span>{' '}
          <span style={{
            backgroundColor: typeColor[offerType] || '#555',
            color: '#fff',
            padding: '2px 8px',
            borderRadius: '12px',
            fontSize: '0.75rem',
            fontWeight: '600',
          }}>
            {offerType}
          </span>
        </p>

        <p style={styles.meta}>
          <span style={styles.label}>From:</span> {buyerName}
        </p>

        {buyer?.email && (
          <p style={styles.meta}>
            <span style={styles.label}>Email:</span> {buyer.email}
          </p>
        )}

        {offer.createdAt && (
          <p style={styles.meta}>
            <span style={styles.label}>Received:</span>{' '}
            {offer.createdAt?.toDate
              ? offer.createdAt.toDate().toLocaleDateString()
              : new Date(offer.createdAt).toLocaleDateString()}
          </p>
        )}

        {listing?.description && (
          <p style={styles.description}>{listing.description}</p>
        )}
      </div>

      {/* Right — actions */}
      <div style={styles.actions}>
        <button
          onClick={() => handleUpdate('accepted')}
          style={styles.acceptBtn}
        >
          ✓ Accept
        </button>
        <button
          onClick={() => handleUpdate('declined')}
          style={styles.declineBtn}
        >
          ✕ Decline
        </button>
      </div>

    </div>
  );
}

const styles = {
  card: {
    display: 'flex',
    gap: '16px',
    padding: '16px',
    border: '1px solid #e8eaed',
    borderRadius: '12px',
    marginBottom: '12px',
    backgroundColor: '#fff',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
  },
  imageWrapper: {
    width: '100px',
    height: '100px',
    borderRadius: '8px',
    overflow: 'hidden',
    backgroundColor: '#f0f2f5',
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  imagePlaceholder: {
    width: '100%',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  details: {
    flex: 1,
    minWidth: '200px',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  itemTitle: {
    margin: '0 0 6px 0',
    fontSize: '1rem',
    fontWeight: '700',
    color: '#1a1a1a',
    fontFamily: 'Segoe UI, system-ui, sans-serif',
  },
  meta: {
    margin: '0',
    fontSize: '0.85rem',
    color: '#555',
    fontFamily: 'Segoe UI, system-ui, sans-serif',
  },
  label: {
    fontWeight: '600',
    color: '#333',
  },
  description: {
    margin: '8px 0 0 0',
    fontSize: '0.82rem',
    color: '#777',
    fontFamily: 'Segoe UI, system-ui, sans-serif',
    lineHeight: '1.5',
    borderTop: '1px solid #f0f0f0',
    paddingTop: '8px',
  },
  actions: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    flexShrink: 0,
  },
  acceptBtn: {
    padding: '8px 20px',
    backgroundColor: '#1d9e75',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '0.9rem',
    fontWeight: '600',
    cursor: 'pointer',
    fontFamily: 'Segoe UI, system-ui, sans-serif',
  },
  declineBtn: {
    padding: '8px 20px',
    backgroundColor: '#fff',
    color: '#dc3545',
    border: '1px solid #dc3545',
    borderRadius: '8px',
    fontSize: '0.9rem',
    fontWeight: '600',
    cursor: 'pointer',
    fontFamily: 'Segoe UI, system-ui, sans-serif',
  },
};