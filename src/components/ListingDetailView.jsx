// src/components/ListingDetailView.jsx
import { useState } from 'react';
import {
  collection, query, where, getDocs, addDoc, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase';
import { createTransaction } from '../services/transactionService';
import { notifySellerOfOffer } from '../services/notificationService';

// ── Reusable SVG icons ────────────────────────────────────────────────────────
const IconClock = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#b45309" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
  </svg>
);

const IconTag = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0d47a1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/>
    <line x1="7" y1="7" x2="7.01" y2="7"/>
  </svg>
);

const IconMessage = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
  </svg>
);

export function ListingDetailView({ listing, currentUser, existingTransaction = null, navigate }) {
  const [mainImage, setMainImage]       = useState(0);
  const [isModalOpen, setIsModalOpen]   = useState(false);
  const [purchaseType, setPurchaseType] = useState('');
  const [agreedPrice, setAgreedPrice]   = useState(listing.price);
  const [tradeItem, setTradeItem]       = useState('');
  const [paymentType, setPaymentType]   = useState('full_online');
  const [partialAmount, setPartialAmount] = useState('');
  const [terms, setTerms]               = useState('');
  const [offerSent, setOfferSent]       = useState(false);
  const [chatLoading, setChatLoading]   = useState(false);

  const sellerId    = listing.sellerUID || listing.sellerId;
  const isOwnListing = currentUser && currentUser.uid === sellerId;

  // ── Find or create chat ───────────────────────────────────────────────────
  async function findOrCreateChat() {
    const buyerId = currentUser.uid;
    if (!sellerId) throw new Error('Seller information is missing from this listing');
    if (buyerId === sellerId) throw new Error('Cannot message yourself');

    const q = query(collection(db, 'chats'), where('participants', 'array-contains', buyerId));
    const snap = await getDocs(q);
    const existing = snap.docs.find((d) => d.data().participants?.includes(sellerId));
    if (existing) return existing.id;

    const ref = await addDoc(collection(db, 'chats'), {
      participants: [buyerId, sellerId],
      listingTitle: listing.title || '',
      listingId:    listing.id,
      lastMessage:  '',
      createdAt:    serverTimestamp(),
      updatedAt:    serverTimestamp(),
      [`unread_${buyerId}`]: 0,
      [`unread_${sellerId}`]: 0,
    });
    return ref.id;
  }

  async function handleMessageSeller() {
    if (!currentUser) { alert('Please log in to message the seller'); return; }
    if (!sellerId)    { alert('Seller information is missing.'); return; }
    if (currentUser.uid === sellerId) { alert('You cannot message yourself'); return; }

    setChatLoading(true);
    try {
      const chatId = await findOrCreateChat();
      navigate(`/chat?open=${chatId}`);
    } catch (err) {
      alert(`Could not open chat: ${err.message || 'Please try again.'}`);
    } finally {
      setChatLoading(false);
    }
  }

  function handleSellerCardClick() {
    navigate(isOwnListing ? '/profile' : `/profile/${sellerId}`);
  }

  // ── Transaction ───────────────────────────────────────────────────────────
  const handleTransaction = async () => {
    if (!purchaseType)                        { alert('Please select a transaction type'); return; }
    if (purchaseType === 'sale' && !agreedPrice) { alert('Please enter an agreed price'); return; }
    if (purchaseType === 'trade' && !tradeItem)  { alert('Please describe what you want to trade'); return; }

    const transactionData = {
      type:          purchaseType,
      listingId:     listing.id,
      listingTitle:  listing.title || '',
      buyerId:       currentUser.uid,
      buyerName:     currentUser.displayName || 'Student',
      sellerId,
      status:        'pending',
      agreedPrice:   Number(agreedPrice),
      paymentType:   purchaseType === 'sale' ? paymentType : null,
      partialAmount: paymentType === 'partial' ? Number(partialAmount) : null,
      tradeItem:     purchaseType === 'trade' ? tradeItem : null,
      terms:         terms || null,
      createdAt:     new Date().toISOString(),
    };

    try {
      const transactionId = await createTransaction(transactionData);
      await notifySellerOfOffer({
        transactionId, sellerId,
        buyerId:   currentUser.uid,
        buyerName: currentUser.displayName || 'Student',
        listingTitle: listing.title,
      });
      setIsModalOpen(false);
      setOfferSent(true);
      alert('Offer initiated! The seller will review your offer.');
    } catch (err) {
      console.error(err);
      alert('Failed to create offer. Please try again.');
    }
  };

  const openPurchaseModal = () => {
    const lt = listing.listingType || listing.type;
    setPurchaseType(
      lt === 'For Sale or Trade' ? '' : lt.toLowerCase().includes('sale') ? 'sale' : 'trade'
    );
    setIsModalOpen(true);
  };

  // ── Buy / pending button ──────────────────────────────────────────────────
  const renderButton = () => {
    if (!currentUser || isOwnListing) return null;

    if (existingTransaction?.status === 'pending' || offerSent) {
      return (
        <div style={styles.pendingBanner} data-testid="pending-offer-banner">
          <span style={styles.bannerIcon}><IconClock /></span>
          <div>
            <p style={styles.pendingTitle}>Offer Already Initiated</p>
            <p style={styles.pendingSubtitle}>We're waiting for the seller to approve your offer.</p>
          </div>
        </div>
      );
    }

    const type = listing.listingType || listing.type;
    let label = '';
    if (type === 'For Sale' || type === 'sale')           label = 'Buy Now';
    else if (type === 'For Trade' || type === 'trade')    label = 'Make Trade Offer';
    else if (type === 'For Sale or Trade')                label = 'Buy Now / Make Trade Offer';
    else return null;

    return (
      <button onClick={openPurchaseModal} style={styles.buyBtn}>
        {label} — R {Number(listing.price).toLocaleString()}
      </button>
    );
  };

  const photos    = listing.photos?.length > 0 ? listing.photos : [];
  const type      = listing.listingType || listing.type || '';
  const condition = listing.condition || '';

  const conditionColor = { New: '#4CAF50', 'Like New': '#8BC34A', Good: '#FFC107', Fair: '#FF9800', Poor: '#F44336' };
  const typeColor      = { 'For Sale': '#e07b3a', 'For Trade': '#3a7be0', 'For Sale or Trade': '#7b3ae0', sale: '#e07b3a', trade: '#3a7be0' };

  return (
    <div style={styles.page}>

      {/* ── Images ── */}
      <div style={styles.imageSection}>
        <div style={styles.mainImageWrapper}>
          {photos.length > 0
            ? <img src={photos[mainImage]} alt={listing.title} style={styles.mainImage} />
            : (
              <div style={styles.imagePlaceholder}>
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#ccc" strokeWidth="1.5" strokeLinecap="round">
                  <rect x="3" y="3" width="18" height="18" rx="2"/>
                  <circle cx="8.5" cy="8.5" r="1.5"/>
                  <path d="M21 15l-5-5L5 21"/>
                </svg>
                <p style={{ color: '#bbb', fontSize: '0.85rem', margin: '10px 0 0' }}>No Image Available</p>
              </div>
            )
          }
        </div>
        {photos.length > 1 && (
          <div style={styles.thumbnailRow}>
            {photos.map((photo, i) => (
              <img key={i} src={photo} alt={`thumb-${i}`} onClick={() => setMainImage(i)}
                style={{ ...styles.thumbnail, border: mainImage === i ? '2px solid #6AA6DA' : '2px solid transparent' }}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Details ── */}
      <div style={styles.detailSection}>

        <div style={styles.badgeRow}>
          {condition && <span style={{ ...styles.badge, backgroundColor: conditionColor[condition] || '#999', color: '#fff' }}>{condition}</span>}
          {type && <span style={{ ...styles.badge, backgroundColor: typeColor[type] || '#555', color: '#fff' }}>{type}</span>}
          {listing.category && <span style={{ ...styles.badge, backgroundColor: '#E1E5AC', color: '#5a5a00' }}>{listing.category}</span>}
        </div>

        <h1 style={styles.title}>{listing.title}</h1>
        <p style={styles.price}>R {Number(listing.price).toLocaleString()}</p>

        {/* Specification */}
        {listing.specification && (
          <div style={styles.specBox}>
            <p style={styles.specLabel}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ marginRight: 6, verticalAlign: 'middle', flexShrink: 0 }}>
                <path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>
              </svg>
              Specifications
            </p>
            <p style={styles.specText}>{listing.specification}</p>
          </div>
        )}

        {/* Description */}
        {listing.description && (
          <div style={styles.descBox}>
            <p style={styles.specLabel}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ marginRight: 6, verticalAlign: 'middle', flexShrink: 0 }}>
                <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/>
                <line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
              </svg>
              Description
            </p>
            <p style={styles.description}>{listing.description}</p>
          </div>
        )}

        {renderButton()}

        {/* Message Seller */}
        {currentUser && !isOwnListing && (
          <button style={styles.messageBtn} onClick={handleMessageSeller} disabled={chatLoading}>
            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
              <IconMessage />
              {chatLoading ? 'Opening chat…' : 'Message Seller'}
            </span>
          </button>
        )}

        {/* Owner banner */}
        {isOwnListing && (
          <div style={styles.ownerBanner} data-testid="owner-listing-banner">
            <span style={styles.bannerIcon}><IconTag /></span>
            <div>
              <p style={styles.ownerBannerTitle}>This is your listing</p>
              <p style={styles.ownerBannerSubtitle}>You are viewing your own listing. Edit it from your profile.</p>
            </div>
          </div>
        )}

        {/* ── Seller card ── */}
        <div
          onClick={handleSellerCardClick}
          onKeyDown={(e) => e.key === 'Enter' && handleSellerCardClick()}
          style={styles.sellerCard}
          role="button"
          tabIndex={0}
          title={isOwnListing ? 'Go to your profile' : 'View seller profile'}
        >
          <div style={styles.sellerAvatar}>
            {listing.sellerAvatar
              ? <img src={listing.sellerAvatar} alt={listing.sellerName}
                     style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
              : <span style={styles.sellerInitial}>{listing.sellerName?.[0]?.toUpperCase() ?? '?'}</span>
            }
          </div>
          <div style={{ flex: 1 }}>
            <p style={styles.sellerName}>{listing.sellerName ?? 'Student'}</p>
            <p style={styles.sellerSub}>
              {isOwnListing ? 'View your profile' : 'View profile & ratings'}
            </p>
          </div>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#bbb" strokeWidth="2.5" strokeLinecap="round">
            <polyline points="9 18 15 12 9 6"/>
          </svg>
        </div>

      </div>

      {/* ── Purchase modal ── */}
      {isModalOpen && (
        <div style={modalStyles.overlay}>
          <div style={modalStyles.modal}>
            <div style={modalStyles.header}>
              <h2 style={{ margin: 0, fontSize: '1.1rem' }}>
                {purchaseType === 'trade' ? 'Initiate Trade' : 'Initiate Purchase'}
              </h2>
              <button onClick={() => setIsModalOpen(false)} style={modalStyles.closeBtn}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>

            <p style={{ color: '#666', fontSize: '14px', marginBottom: '20px' }}>
              Review and confirm your details for "{listing.title}"
            </p>

            {/* Sale or Trade choice */}
            {(() => {
              const lt = listing.listingType || listing.type;
              return lt === 'For Sale or Trade' && !purchaseType;
            })() && (
              <div style={modalStyles.section}>
                <label style={modalStyles.label}>Choose Transaction Type</label>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button onClick={() => setPurchaseType('sale')}  style={modalStyles.choiceBtn}>Cash Purchase</button>
                  <button onClick={() => setPurchaseType('trade')} style={modalStyles.choiceBtn}>Trade Item</button>
                </div>
              </div>
            )}

            {purchaseType === 'sale' && (
              <div style={modalStyles.section}>
                <label htmlFor="agreed-price" style={modalStyles.label}>Agreed Price (R)</label>
                <input id="agreed-price" type="number" value={agreedPrice}
                  onChange={(e) => setAgreedPrice(e.target.value)} style={modalStyles.input} />
                <label htmlFor="payment-method" style={modalStyles.label}>Payment Method</label>
                <select id="payment-method" value={paymentType}
                  onChange={(e) => setPaymentType(e.target.value)} style={modalStyles.input}>
                  <option value="full_online">Fully Online</option>
                  <option value="partial">Partial Online / Partial Cash</option>
                  <option value="cash">Full Cash on Delivery</option>
                </select>
                {paymentType === 'partial' && (
                  <input type="number" placeholder="Enter online payment amount"
                    value={partialAmount} onChange={(e) => setPartialAmount(e.target.value)} style={modalStyles.input} />
                )}
              </div>
            )}

            {purchaseType === 'trade' && (
              <div style={modalStyles.section}>
                <label style={modalStyles.label}>What are you offering to trade?</label>
                <input type="text" placeholder="Describe your trade item..."
                  value={tradeItem} onChange={(e) => setTradeItem(e.target.value)} style={modalStyles.input} />
              </div>
            )}

            <div style={modalStyles.section}>
              <label style={modalStyles.label}>Changes to terms (optional)</label>
              <textarea placeholder="E.g. Seller agreed to include charger..."
                value={terms} onChange={(e) => setTerms(e.target.value)} style={modalStyles.textarea} />
            </div>

            <button onClick={handleTransaction} style={styles.buyBtn}>
              Confirm & Send Offer
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────
const styles = {
  page:             { display: 'flex', gap: '48px', padding: '40px 32px 48px', width: '100%', margin: '0 auto', flexWrap: 'wrap', backgroundColor: '#fbfbfb', minHeight: '100vh', borderRadius: '24px' },
  imageSection:     { flex: '1 1 400px', minWidth: '300px' },
  mainImageWrapper: { width: '100%', aspectRatio: '4/3', borderRadius: '12px', overflow: 'hidden', backgroundColor: '#f0f2f5' },
  mainImage:        { width: '100%', height: '100%', objectFit: 'cover' },
  imagePlaceholder: { width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #f0f2f5, #e8ecf0)' },
  thumbnailRow:     { display: 'flex', gap: '8px', marginTop: '12px', flexWrap: 'wrap' },
  thumbnail:        { width: '72px', height: '72px', objectFit: 'cover', borderRadius: '8px', cursor: 'pointer', transition: 'opacity 0.15s' },
  detailSection:    { flex: '1 1 340px', minWidth: '280px', display: 'flex', flexDirection: 'column', gap: '12px' },
  badgeRow:         { display: 'flex', gap: '8px', flexWrap: 'wrap' },
  badge:            { padding: '4px 12px', borderRadius: '20px', fontSize: '0.75rem', fontWeight: '600', fontFamily: 'Segoe UI, system-ui, sans-serif' },
  title:            { fontSize: '1.8rem', fontWeight: '700', color: '#1a1a1a', margin: '0', fontFamily: 'Segoe UI, system-ui, sans-serif' },
  price:            { fontSize: '1.6rem', fontWeight: '700', color: '#6AA6DA', margin: '0', fontFamily: 'Segoe UI, system-ui, sans-serif' },
  description:      { fontSize: '0.95rem', color: '#444', lineHeight: '1.6', fontFamily: 'Segoe UI, system-ui, sans-serif', margin: '0' },
  buyBtn:           { width: '100%', padding: '16px', backgroundColor: '#6AA6DA', color: '#fff', border: 'none', borderRadius: '10px', fontSize: '1rem', fontWeight: '700', cursor: 'pointer', fontFamily: 'Segoe UI, system-ui, sans-serif' },
  messageBtn:       { width: '100%', padding: '12px', backgroundColor: 'transparent', color: '#444', border: '1.5px solid #6aa6da57', borderRadius: '10px', fontSize: '0.95rem', fontWeight: '500', cursor: 'pointer', fontFamily: 'Segoe UI, system-ui, sans-serif' },

  pendingBanner:    { display: 'flex', alignItems: 'center', gap: '12px', padding: '16px', backgroundColor: '#fff8e1', border: '1px solid #ffe082', borderRadius: '10px', fontFamily: 'Segoe UI, system-ui, sans-serif' },
  ownerBanner:      { display: 'flex', alignItems: 'center', gap: '12px', padding: '16px', backgroundColor: '#e8f4fd', border: '1px solid #90caf9', borderRadius: '10px', fontFamily: 'Segoe UI, system-ui, sans-serif' },
  bannerIcon:       { display: 'flex', alignItems: 'center', flexShrink: 0 },
  pendingTitle:     { margin: '0 0 4px', fontWeight: '700', fontSize: '0.95rem', color: '#b45309' },
  pendingSubtitle:  { margin: '0', fontSize: '0.85rem', color: '#92400e' },
  ownerBannerTitle: { margin: '0 0 4px', fontWeight: '700', fontSize: '0.95rem', color: '#0d47a1' },
  ownerBannerSubtitle: { margin: '0', fontSize: '0.85rem', color: '#1565c0' },

  sellerCard:    { display: 'flex', alignItems: 'center', gap: '14px', padding: '16px', border: '1px solid #dde3ea', borderRadius: '14px', marginTop: '8px', cursor: 'pointer', backgroundColor: '#fff', outline: 'none', userSelect: 'none', transition: 'box-shadow 0.15s' },
  sellerAvatar:  { width: '52px', height: '52px', borderRadius: '50%', backgroundColor: '#166bc0', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 },
  sellerInitial: { fontSize: '1.2rem', fontWeight: '700', color: '#fff' },
  sellerName:    { margin: '0 0 2px', fontWeight: '600', fontSize: '0.95rem', color: '#1a1a1a', fontFamily: 'Segoe UI, system-ui, sans-serif' },
  sellerSub:     { margin: '0', fontSize: '0.8rem', color: '#6AA6DA', fontFamily: 'Segoe UI, system-ui, sans-serif' },

  specBox: { backgroundColor: '#f0f6ff', border: '1px solid #d0e4f7', borderLeft: '3px solid #6AA6DA', borderRadius: '10px', padding: '14px 16px', margin: '0' },
  descBox: { backgroundColor: '#fafafa', border: '1px solid #ebebeb', borderLeft: '3px solid #c8d6e3', borderRadius: '10px', padding: '14px 16px', margin: '0' },
  specLabel: { fontSize: '0.72rem', fontWeight: '700', color: '#6AA6DA', textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 8px 0', display: 'flex', alignItems: 'center', fontFamily: 'Segoe UI, system-ui, sans-serif' },
  specText: { fontSize: '0.88rem', color: '#2d3748', lineHeight: '1.65', fontFamily: 'Segoe UI, system-ui, sans-serif', margin: '0', whiteSpace: 'pre-wrap' },
};

const modalStyles = {
  overlay:   { position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 },
  modal:     { backgroundColor: 'white', padding: '28px', borderRadius: '16px', width: '90%', maxWidth: '500px', boxShadow: '0 10px 30px rgba(0,0,0,0.2)', fontFamily: 'Segoe UI, system-ui, sans-serif' },
  header:    { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' },
  closeBtn:  { background: '#f3f4f6', border: 'none', cursor: 'pointer', color: '#555', width: '32px', height: '32px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.15s' },
  section:   { marginBottom: '18px' },
  label:     { display: 'block', fontWeight: '600', marginBottom: '8px', fontSize: '13px', color: '#333' },
  input:     { width: '100%', padding: '11px 13px', borderRadius: '8px', border: '1.5px solid #e2e8f0', marginBottom: '10px', boxSizing: 'border-box', fontSize: '14px', fontFamily: 'inherit', outline: 'none' },
  textarea:  { width: '100%', padding: '11px 13px', borderRadius: '8px', border: '1.5px solid #e2e8f0', height: '80px', boxSizing: 'border-box', fontFamily: 'inherit', fontSize: '14px', outline: 'none' },
  choiceBtn: { flex: 1, padding: '12px', borderRadius: '8px', border: '1.5px solid #6AA6DA', cursor: 'pointer', backgroundColor: '#f0f7ff', color: '#166bc0', fontWeight: '600', fontFamily: 'inherit' },
};