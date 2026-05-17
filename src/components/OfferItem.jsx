// src/components/OfferItem.jsx
import React, { useEffect, useState } from 'react';
import {
  doc, getDoc, updateDoc, deleteDoc,
  collection, query, where, getDocs, addDoc, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase';
import styles from './OfferItem.module.css';

const shimmerStyle = {
  background: 'linear-gradient(90deg, #f0f2f5 25%, #e8ecf0 50%, #f0f2f5 75%)',
  backgroundSize: '200% 100%',
  animation: 'none',
  borderRadius: 6,
};

const odStyles = {
  box: {
    marginTop: '12px',
    padding: '12px 14px',
    background: '#f0f7ff',
    border: '1px solid #bfdbfe',
    borderRadius: '10px',
    fontFamily: 'Segoe UI, system-ui, sans-serif',
  },
  heading: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    margin: '0 0 10px',
    fontSize: '0.78rem',
    fontWeight: '700',
    color: '#2563eb',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'auto 1fr',
    columnGap: '14px',
    rowGap: '6px',
    alignItems: 'start',
  },
  label: {
    fontSize: '0.78rem',
    fontWeight: '600',
    color: '#64748b',
    whiteSpace: 'nowrap',
  },
  value: {
    fontSize: '0.82rem',
    color: '#1a1a1a',
  },
  original: {
    fontSize: '0.75rem',
    color: '#94a3b8',
    fontWeight: '400',
  },
};

export default function OfferItem({ offer }) {
  const [listing, setListing] = useState(null);
  const [buyer,   setBuyer]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [done,    setDone]    = useState(false);

  useEffect(() => {
    async function fetchInfo() {
      try {
        const [listSnap, buyerSnap] = await Promise.all([
          getDoc(doc(db, 'listings', offer.listingId)),
          getDoc(doc(db, 'users',    offer.buyerId)),
        ]);
        if (listSnap.exists())  setListing({ id: listSnap.id, ...listSnap.data() });
        if (buyerSnap.exists()) setBuyer(buyerSnap.data());
      } catch (err) {
        console.error('OfferItem fetch error:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchInfo();
  }, [offer.listingId, offer.buyerId]);

  // ── Accept ────────────────────────────────────────────────────
  const handleAccept = async () => {
    if (working) return;
    setWorking(true);
    try {
      const isTrade = offer.type === 'trade';
      const paymentMethod = (offer.paymentMethod || offer.paymentType || "").toLowerCase();
      const isCashOnly = paymentMethod === "cash" || paymentMethod === "cod" || paymentMethod === "fully_cash";
      
      // For cash transactions, payment is already confirmed (buyer committed)
      const shouldConfirmPayment = isCashOnly;
      
      const newStatus = isTrade ? 'accepted' : 'accepted';

      console.log('Step 1: updating transaction', offer.id, '→', newStatus);
      await updateDoc(doc(db, 'transactions', offer.id), {
        status:    newStatus,
        updatedAt: serverTimestamp(),
        // For cash transactions, set paymentConfirmed true immediately
        ...(shouldConfirmPayment && { paymentConfirmed: true, paymentConfirmedAt: serverTimestamp() })
      });
      console.log('Step 1 done ✓');

      console.log('Step 2: updating listing', offer.listingId, '→', newStatus);
      await updateDoc(doc(db, 'listings', offer.listingId), {
        status:    newStatus,
        updatedAt: serverTimestamp(),
      });
      console.log('Step 2 done ✓');

      console.log('Step 3: finding other pending offers');
      const otherSnap = await getDocs(
        query(
          collection(db, 'transactions'),
          where('listingId', '==', offer.listingId),
          where('status',    '==', 'pending'),
        )
      );
      console.log('Step 3 done ✓ — found', otherSnap.docs.length, 'others');

      console.log('Step 4: declining others');
      await Promise.all(
        otherSnap.docs
          .filter(d => d.id !== offer.id)
          .map(async (txDoc) => {
            const tx = txDoc.data();
            console.log('  Notifying buyer', tx.buyerId, 'of decline');
            await addDoc(collection(db, 'notifications'), {
              userId:        tx.buyerId,
              type:          'offer_declined',
              transactionId: txDoc.id,
              listingId:     offer.listingId,
              read:          false,
              createdAt:     serverTimestamp(),
            });
            console.log('  Deleting transaction', txDoc.id);
            await deleteDoc(doc(db, 'transactions', txDoc.id));
            console.log('  Done with', txDoc.id, '✓');
          })
      );
      console.log('Step 4 done ✓');

      if (isTrade) {
        // ── Trade: notify buyer their trade offer was accepted → go book drop-off
        console.log('Step 5 (trade): notifying buyer', offer.buyerId, '→ trade_waiting');
        await addDoc(collection(db, 'notifications'), {
          userId:        offer.buyerId,
          type:          'trade_waiting',
          isTrade:       true,
          transactionId: offer.id,
          listingId:     offer.listingId,
          read:          false,
          createdAt:     serverTimestamp(),
          redirectUrl:   `/trade-facility`,
        });


      } else {
        // ── Sale: notify buyer their offer was accepted → head to payment (or cash confirmation)
        console.log('Step 5 (sale): notifying accepted buyer', offer.buyerId, '→ offer_accepted');
        await addDoc(collection(db, 'notifications'), {
          userId:        offer.buyerId,
          type:          'offer_accepted',
          isTrade:       false,
          paymentMethod: offer.paymentMethod || offer.paymentType || null,
          agreedPrice:   offer.agreedPrice   ?? null,
          partialAmount: offer.partialAmount  ?? null,
          transactionId: offer.id,
          listingId:     offer.listingId,
          read:          false,
          createdAt:     serverTimestamp(),
          redirectUrl:   isCashOnly ? `/my-purchases?open=${offer.id}` : `/payment/${offer.id}`,
        });


      }
      console.log('All steps done ✓');

      setDone(true);
    } catch (err) {
      console.error('Accept error:', err);
      console.error('Error code:', err.code);
      console.error('Error message:', err.message);
      alert(`Failed at: ${err.message}`);
    } finally {
      setWorking(false);
    }
  };

  // ── Decline ───────────────────────────────────────────────────
  const handleDecline = async () => {
    if (working) return;
    setWorking(true);
    try {
      await addDoc(collection(db, 'notifications'), {
        userId:        offer.buyerId,
        type:          'offer_declined',
        transactionId: offer.id,
        listingId:     offer.listingId,
        read:          false,
        createdAt:     serverTimestamp(),
        redirectUrl:   `/view-listing`,
      });
      await deleteDoc(doc(db, 'transactions', offer.id));
      setDone(true);
    } catch (err) {
      console.error('Decline error:', err);
      alert(`Failed to decline offer: ${err.message}`);
    } finally {
      setWorking(false);
    }
  };

  // ── Loading skeleton ──────────────────────────────────────────
  if (loading) return (
    <div className={styles.card}>
      <div className={styles.imageWrapper} style={{ ...shimmerStyle, opacity: 0.6 }} />
      <div className={styles.details}>
        <div style={{ ...shimmerStyle, height: 14, width: '60%', marginBottom: 10 }} />
        <div style={{ ...shimmerStyle, height: 11, width: '40%', marginBottom: 6 }} />
        <div style={{ ...shimmerStyle, height: 11, width: '50%' }} />
      </div>
    </div>
  );

  if (done) return null;

  const imageUrl  = listing?.photos?.[0] || listing?.imageUrl || null;
  const buyerName = buyer
    ? `${buyer.firstName || ''} ${buyer.lastName || ''}`.trim() || buyer.email || 'Unknown Buyer'
    : 'Unknown Buyer';

  const TYPE_COLORS = {
    'For Sale':  '#e07b3a', sale:   '#e07b3a',
    'For Trade': '#3a7be0', trade:  '#3a7be0',
    Both:        '#7b3ae0', Either: '#7b3ae0', either: '#7b3ae0',
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
          <span className={styles.metaValue}>R {Number(listing?.price || 0).toLocaleString('en-ZA')}</span>

          <span className={styles.metaLabel}>Condition</span>
          <span className={styles.metaValue}>{listing?.condition || 'N/A'}</span>

          <span className={styles.metaLabel}>Offer type</span>
          <span>
            <span className={styles.typeBadge} style={{ background: TYPE_COLORS[offerType] || '#6b7280' }}>
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
                  : new Date(offer.createdAt).toLocaleDateString('en-ZA')}
              </span>
            </>
          )}
        </div>

        {listing?.description && (
          <p className={styles.description}>{listing.description}</p>
        )}

        {/* ── Buyer's Offer Details ── */}
        {(() => {
          const PAYMENT_LABELS = {
            full_online: 'Fully Online',
            partial:     'Partial Online / Partial Cash',
            cash:        'Full Cash on Delivery',
            online:      'Fully Online',
            cod:         'Full Cash on Delivery',
          };

          const hasPriceChange = offer.agreedPrice != null && Number(offer.agreedPrice) !== Number(listing?.price);
          const hasPayment     = (offer.paymentType || offer.paymentMethod) && offer.type !== 'trade';
          const hasTrade       = !!offer.tradeItem;
          const hasTerms       = !!offer.terms;
          const hasPartial     = offer.paymentType === 'partial' && offer.partialAmount != null;

          const showPanel = hasPriceChange || hasPayment || hasTrade || hasTerms || offer.agreedPrice != null;
          if (!showPanel) return null;

          // Safely extract trade item display string
          const tradeItemLabel = hasTrade
            ? typeof offer.tradeItem === 'string'
              ? offer.tradeItem
              : offer.tradeItem?.name || 'Trade item'
            : null;

          return (
            <div style={odStyles.box}>
              <p style={odStyles.heading}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2.5" strokeLinecap="round" style={{ flexShrink: 0 }}>
                  <path d="M9 12l2 2 4-4"/><path d="M21 12A9 9 0 1 1 3 12a9 9 0 0 1 18 0z"/>
                </svg>
                Buyer's Offer Details
              </p>
              <div style={odStyles.grid}>

                {offer.agreedPrice != null && (
                  <>
                    <span style={odStyles.label}>Offered price</span>
                    <span style={{ ...odStyles.value, color: hasPriceChange ? '#16a34a' : '#1a1a1a', fontWeight: 600 }}>
                      R {Number(offer.agreedPrice).toLocaleString('en-ZA')}
                      {hasPriceChange && (
                        <span style={odStyles.original}> (listed: R {Number(listing.price).toLocaleString('en-ZA')})</span>
                      )}
                    </span>
                  </>
                )}

                {hasPayment && (
                  <>
                    <span style={odStyles.label}>Payment method</span>
                    <span style={odStyles.value}>
                      {PAYMENT_LABELS[offer.paymentType] || PAYMENT_LABELS[offer.paymentMethod] || offer.paymentType || offer.paymentMethod}
                    </span>
                  </>
                )}

                {hasPartial && (
                  <>
                    <span style={odStyles.label}>Online portion</span>
                    <span style={{ ...odStyles.value, color: '#2563eb' }}>R {Number(offer.partialAmount).toLocaleString('en-ZA')}</span>
                    <span style={odStyles.label}>Cash portion</span>
                    <span style={{ ...odStyles.value, color: '#b45309' }}>
                      R {Math.max(0, Number(offer.agreedPrice ?? listing?.price ?? 0) - Number(offer.partialAmount)).toLocaleString('en-ZA')}
                    </span>
                  </>
                )}

                {hasTrade && tradeItemLabel && (
                  <>
                    <span style={odStyles.label}>Trade offer</span>
                    <span style={odStyles.value}>{tradeItemLabel}</span>
                  </>
                )}

                {hasTerms && (
                  <>
                    <span style={odStyles.label}>Terms note</span>
                    <span style={{ ...odStyles.value, fontStyle: 'italic', color: '#555' }}>{offer.terms}</span>
                  </>
                )}

              </div>
            </div>
          );
        })()}
      </div>

      {/* Actions */}
      <div className={styles.actions}>
        <button className={styles.acceptBtn} onClick={handleAccept} disabled={working}>
          {working ? <span className={styles.spinner} /> : (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
              Accept
            </>
          )}
        </button>
        <button className={styles.declineBtn} onClick={handleDecline} disabled={working}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
          Decline
        </button>
      </div>
    </div>
  );
}