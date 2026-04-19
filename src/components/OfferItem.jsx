// src/components/OfferItem.jsx
import React, { useEffect, useState } from 'react';
import {
  doc, getDoc, updateDoc, deleteDoc,
  collection, query, where, getDocs, addDoc, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase';
import styles from './OfferItem.module.css';

export default function OfferItem({ offer }) {
  const [listing, setListing]   = useState(null);
  const [buyer, setBuyer]       = useState(null);
  const [loading, setLoading]   = useState(true);
  const [working, setWorking]   = useState(false); // action in progress

  useEffect(() => {
    async function fetchInfo() {
      try {
        const [listSnap, buyerSnap] = await Promise.all([
          getDoc(doc(db, 'listings',  offer.listingId)),
          getDoc(doc(db, 'users',     offer.buyerId)),
        ]);
        if (listSnap.exists())  setListing({ id: listSnap.id,  ...listSnap.data() });
        if (buyerSnap.exists()) setBuyer(buyerSnap.data());
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    fetchInfo();
  }, [offer]);

  // ── Core acceptance flow ────────────────────────────────────
  const handleAccept = async () => {
    if (working) return;
    setWorking(true);
    try {
      // 1. Mark THIS transaction as accepted
      await updateDoc(doc(db, 'transactions', offer.id), {
        status:    'accepted',
        updatedAt: serverTimestamp(),
      });

      // 2. Mark the listing as accepted (hides it from ViewListing)
      await updateDoc(doc(db, 'listings', offer.listingId), {
        status:    'accepted',
        updatedAt: serverTimestamp(),
      });

      // 3. Find all OTHER pending transactions for the same listing
      const otherTxSnap = await getDocs(
        query(
          collection(db, 'transactions'),
          where('listingId', '==', offer.listingId),
          where('status',    '==', 'pending'),
        )
      );

      // 4. For each other transaction: notify buyer → then delete it
      const declineJobs = otherTxSnap.docs
        .filter(d => d.id !== offer.id)
        .map(async (txDoc) => {
          const tx = txDoc.data();

          // Send declined notification to that buyer
          await addDoc(collection(db, 'notifications'), {
            userId:        tx.buyerId,
            type:          'offer_declined',
            transactionId: txDoc.id,
            listingId:     offer.listingId,
            read:          false,
            createdAt:     serverTimestamp(),
          });

          // Delete the transaction
          await deleteDoc(doc(db, 'transactions', txDoc.id));
        });

      await Promise.all(declineJobs);

      // 5. Notify the accepted buyer
      await addDoc(collection(db, 'notifications'), {
        userId:        offer.buyerId,
        type:          'offer_accepted',
        transactionId: offer.id,
        listingId:     offer.listingId,
        read:          false,
        createdAt:     serverTimestamp(),
      });

    } catch (err) {
      console.error('Error accepting offer:', err);
      alert('Something went wrong. Please try again.');
    } finally {
      setWorking(false);
    }
  };

  // ── Simple decline ─────────────────────────────────────────
  const handleDecline = async () => {
    if (working) return;
    setWorking(true);
    try {
      // Notify buyer
      await addDoc(collection(db, 'notifications'), {
        userId:        offer.buyerId,
        type:          'offer_declined',
        transactionId: offer.id,
        listingId:     offer.listingId,
        read:          false,
        createdAt:     serverTimestamp(),
      });

      // Delete the transaction so it disappears from offers list
      await deleteDoc(doc(db, 'transactions', offer.id));
    } catch (err) {
      console.error('Error declining offer:', err);
      alert('Something went wrong. Please try again.');
    } finally {
      setWorking(false);
    }
  };

 if (loading) return (
  <div className={styles.card} style={{ animation: 'none' }}>
    <div className={styles.imageWrapper} style={{ background: 'linear-gradient(90deg, #f0f2f5 25%, #e8ecf0 50%, #f0f2f5 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.2s infinite' }} />
    <div className={styles.details}>
      <div style={{ height: 14, width: '60%', borderRadius: 6, background: 'linear-gradient(90deg, #f0f2f5 25%, #e8ecf0 50%, #f0f2f5 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.2s infinite', marginBottom: 10 }} />
      <div style={{ height: 11, width: '40%', borderRadius: 6, background: 'linear-gradient(90deg, #f0f2f5 25%, #e8ecf0 50%, #f0f2f5 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.2s infinite', marginBottom: 6 }} />
      <div style={{ height: 11, width: '50%', borderRadius: 6, background: 'linear-gradient(90deg, #f0f2f5 25%, #e8ecf0 50%, #f0f2f5 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.2s infinite' }} />
    </div>
  </div>
);

  const imageUrl  = listing?.photos?.[0] || listing?.imageUrl || null;
  const buyerName = buyer
    ? `${buyer.firstName || ''} ${buyer.lastName || ''}`.trim() || buyer.email || 'Unknown Buyer'
    : 'Unknown Buyer';

  const TYPE_COLORS = {
    'For Sale': '#e07b3a', sale:  '#e07b3a',
    'For Trade': '#3a7be0', trade: '#3a7be0',
    Both: '#7b3ae0', Either: '#7b3ae0', either: '#7b3ae0',
  };
  const offerType = offer.type || '';

  return (
    <div className={styles.card}>

      {/* Image */}
      <div className={styles.imageWrapper}>
        {imageUrl ? (
          <img src={imageUrl} alt={listing?.title} className={styles.image} />
        ) : (
          <div className={styles.imagePlaceholder}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#ccc" strokeWidth="1.5">
              <rect x="3" y="3" width="18" height="18" rx="2"/>
              <circle cx="8.5" cy="8.5" r="1.5"/>
              <path d="M21 15l-5-5L5 21"/>
            </svg>
          </div>
        )}
      </div>

      {/* Details */}
      <div className={styles.details}>
        <p className={styles.itemTitle}>{listing?.title || 'Unknown Item'}</p>

        <div className={styles.metaGrid}>
          <span className={styles.metaLabel}>Price</span>
          <span className={styles.metaValue}>R {Number(listing?.price || 0).toLocaleString()}</span>

          <span className={styles.metaLabel}>Condition</span>
          <span className={styles.metaValue}>{listing?.condition || 'N/A'}</span>

          <span className={styles.metaLabel}>Offer type</span>
          <span>
            <span
              className={styles.typeBadge}
              style={{ background: TYPE_COLORS[offerType] || '#6b7280' }}
            >
              {offerType || '—'}
            </span>
          </span>

          <span className={styles.metaLabel}>From</span>
          <span className={styles.metaValue}>{buyerName}</span>

          {buyer?.email && (
            <>
              <span className={styles.metaLabel}>Email</span>
              <span className={styles.metaValue}>{buyer.email}</span>
            </>
          )}

          {offer.createdAt && (
            <>
              <span className={styles.metaLabel}>Received</span>
              <span className={styles.metaValue}>
                {offer.createdAt?.toDate
                  ? offer.createdAt.toDate().toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })
                  : new Date(offer.createdAt).toLocaleDateString()}
              </span>
            </>
          )}
        </div>

        {listing?.description && (
          <p className={styles.description}>{listing.description}</p>
        )}
      </div>

      {/* Actions */}
      <div className={styles.actions}>
        <button
          className={styles.acceptBtn}
          onClick={handleAccept}
          disabled={working}
        >
          {working ? (
            <span className={styles.spinner} />
          ) : (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
              Accept
            </>
          )}
        </button>
        <button
          className={styles.declineBtn}
          onClick={handleDecline}
          disabled={working}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
          Decline
        </button>
      </div>
    </div>
  );
}