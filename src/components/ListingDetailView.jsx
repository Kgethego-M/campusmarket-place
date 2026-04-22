// src/components/ListingDetailView.jsx
import { useState } from 'react';
import {
  collection, query, where, getDocs, addDoc, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase';
import { createTransaction } from '../services/transactionService';
import { notifySellerOfOffer } from '../services/notificationService';
import ReportModal from './ReportModal';
import ConfirmModal from './ConfirmModal';

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

const IconFlag = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/>
    <line x1="4" y1="22" x2="4" y2="15"/>
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
  const [submitting, setSubmitting]     = useState(false);

  // Report listing modal
  const [reportOpen, setReportOpen]     = useState(false);

  // Custom confirm/alert modal (replaces window.alert / window.confirm)
  const [alert, setAlert] = useState({ open: false, title: '', message: '', variant: 'info' });
  const showAlert = (title, message, variant = 'info') =>
    setAlert({ open: true, title, message, variant, onConfirm: () => setAlert(a => ({ ...a, open: false })) });

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
    if (!currentUser)                    { showAlert('Login required', 'Please log in to message the seller.'); return; }
    if (!sellerId)                       { showAlert('Error', 'Seller information is missing.', 'warning'); return; }
    if (currentUser.uid === sellerId)    { showAlert('Error', 'You cannot message yourself.', 'warning'); return; }

    setChatLoading(true);
    try {
      const chatId = await findOrCreateChat();
      navigate(`/chat?open=${chatId}`);
    } catch (err) {
      showAlert('Error', `Could not open chat: ${err.message || 'Please try again.'}`, 'warning');
    } finally {
      setChatLoading(false);
    }
  }

  function handleSellerCardClick() {
    navigate(isOwnListing ? '/profile' : `/profile/${sellerId}`);
  }

  const handleTransaction = async () => {
    if (submitting) return;
    if (!purchaseType)                           { showAlert('Missing info', 'Please select a transaction type.', 'warning'); return; }
    if (purchaseType === 'sale' && !agreedPrice) { showAlert('Missing info', 'Please enter an agreed price.', 'warning'); return; }
    if (purchaseType === 'trade' && !tradeItem)  { showAlert('Missing info', 'Please describe what you want to trade.', 'warning'); return; }

    setSubmitting(true);

    const transactionData = {
      type:          purchaseType,
      listingId:     listing.id,
      listingTitle:  listing.title || '',
      buyerId:       currentUser.uid,
      buyerName:     currentUser.displayName || 'Student',
      sellerId:      sellerId,
      status:        'pending',
      agreedPrice:   Number(agreedPrice),
      paymentType:   purchaseType === 'sale' ? paymentType : null,
      paymentMethod: purchaseType === 'sale'
        ? (paymentType === 'full_online' ? 'online' : paymentType === 'cash' ? 'cod' : 'partial')
        : null,
      partialAmount: paymentType === 'partial' ? Number(partialAmount) : null,
      tradeItem:     purchaseType === 'trade' ? tradeItem : null,
      terms:         terms || null,
      createdAt:     new Date().toISOString(),
    };

    try {
      const transactionId = await createTransaction(transactionData);
      await notifySellerOfOffer({
        transactionId,
        sellerId,
        buyerId:    currentUser.uid,
        buyerName:  currentUser.displayName || 'Student',
        listingTitle: listing.title,
      });
      setIsModalOpen(false);
      setOfferSent(true);
      showAlert('Offer Sent! 🎉', 'Your offer has been sent. The seller will review it shortly.', 'info');
    } catch (error) {
      console.error('Transaction error:', error);
      showAlert('Error', 'Failed to create offer. Please try again.', 'warning');
    } finally {
      setSubmitting(false);
    }
  };

  const openPurchaseModal = () => {
    const lt = listing.listingType || listing.type;
    setPurchaseType(
      lt === 'For Sale or Trade' ? '' : lt.toLowerCase().includes('sale') ? 'sale' : 'trade'
    );
    setIsModalOpen(true);
  };

  const renderButton = () => {
    if (!currentUser || isOwnListing) return null;
    if ((existingTransaction?.status === 'pending') || offerSent) {
      return (
        <div style={css.pendingBanner} data-testid="pending-offer-banner">
          <IconClock />
          <div>
            <p style={css.pendingTitle}>Offer Already Initiated</p>
            <p style={css.pendingSubtitle}>We're waiting for the seller to approve your offer.</p>
          </div>
        </div>
      );
    }
    const type = listing.listingType || listing.type;
    let label = '';
    if (type === 'For Sale' || type === 'sale') label = 'Buy Now';
    else if (type === 'For Trade' || type === 'trade') label = 'Make Trade Offer';
    else if (type === 'For Sale or Trade') label = 'Buy Now / Make Trade Offer';
    else return null;
    return (
      <button onClick={openPurchaseModal} style={css.buyBtn}>
        {label} — R {Number(listing.price).toLocaleString()}
      </button>
    );
  };

  const photos = listing.photos?.length > 0 ? listing.photos : [];
  const type   = listing.listingType || listing.type || '';

  return (
    <div style={css.page}>

      {/* ── Custom alert/confirm modal ── */}
      <ConfirmModal
        open={alert.open}
        title={alert.title}
        message={alert.message}
        variant={alert.variant}
        confirmLabel="OK"
        onConfirm={alert.onConfirm}
        onCancel={null}
      />

      {/* ── Report listing modal ── */}
      <ReportModal
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        reportType="listing"
        reportedId={listing.id}
        reportedName={listing.title}
      />

      {/* ── Image section ── */}
      <div style={css.imageSection}>
        <div style={css.mainImageWrapper}>
          {photos.length > 0 ? (
            <img src={photos[mainImage]} alt={listing.title} style={css.mainImage} />
          ) : (
            <div style={css.imagePlaceholder}>
              <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#c0c8d4" strokeWidth="1.5" strokeLinecap="round">
                <rect x="3" y="3" width="18" height="18" rx="2"/>
                <path d="M3 9l4-4 4 4 4-4 4 4"/>
                <circle cx="8.5" cy="15" r="1.5"/>
              </svg>
              <p style={{ color: '#aab', marginTop: 10, fontSize: 14 }}>No images available</p>
            </div>
          )}
        </div>
        {photos.length > 1 && (
          <div style={css.thumbnailRow}>
            {photos.map((photo, i) => (
              <img
                key={i} src={photo} alt={`${listing.title} ${i + 1}`}
                style={{ ...css.thumbnail, opacity: i === mainImage ? 1 : 0.65, border: i === mainImage ? '2px solid #6AA6DA' : '2px solid transparent' }}
                onClick={() => setMainImage(i)}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Detail section ── */}
      <div style={css.detailSection}>
        <div style={css.badgeRow}>
          {type && (
            <span style={{ ...css.badge, background: type.toLowerCase().includes('trade') ? '#fdf3e7' : '#e8f4fd', color: type.toLowerCase().includes('trade') ? '#c05a00' : '#166bc0' }}>
              {type}
            </span>
          )}
          {listing.condition && (
            <span style={{ ...css.badge, background: '#f0fdf4', color: '#15803d' }}>
              {listing.condition}
            </span>
          )}
          {listing.category && (
            <span style={{ ...css.badge, background: '#f5f5f5', color: '#555' }}>
              {listing.category}
            </span>
          )}
        </div>

        <h1 style={css.title}>{listing.title}</h1>
        <p style={css.price}>R {Number(listing.price).toLocaleString()}</p>

        {listing.specs && (
          <div style={css.specBox}>
            <p style={css.specLabel}>📋 Specifications</p>
            <p style={css.specText}>{listing.specs}</p>
          </div>
        )}

        {listing.description && (
          <div style={css.descBox}>
            <p style={css.specLabel}>📝 Description</p>
            <p style={css.specText}>{listing.description}</p>
          </div>
        )}

        {renderButton()}

        {currentUser && !isOwnListing && (
          <button style={css.messageBtn} onClick={handleMessageSeller} disabled={chatLoading}>
            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <IconMessage />
              {chatLoading ? 'Opening chat…' : 'Message Seller'}
            </span>
          </button>
        )}

        {/* ── Report Listing button (only visible to non-owners) ── */}
        {currentUser && !isOwnListing && (
          <button
            style={css.reportBtn}
            onClick={() => setReportOpen(true)}
            title="Report this listing"
          >
            <IconFlag />
            Report Listing
          </button>
        )}

        {isOwnListing && (
          <div style={css.ownerBanner} data-testid="owner-listing-banner">
            <span style={css.bannerIcon}><IconTag /></span>
            <div>
              <p style={css.ownerBannerTitle}>This is your listing</p>
              <p style={css.ownerBannerSubtitle}>You are viewing your own listing. Edit it from your profile.</p>
            </div>
          </div>
        )}

        {/* ── Seller card ── */}
        <div
          onClick={handleSellerCardClick}
          onKeyDown={(e) => e.key === 'Enter' && handleSellerCardClick()}
          style={css.sellerCard}
          role="button"
          tabIndex={0}
          title={isOwnListing ? 'Go to your profile' : 'View seller profile'}
        >
          <div style={css.sellerAvatar}>
            {listing.sellerAvatar
              ? <img src={listing.sellerAvatar} alt={listing.sellerName}
                     style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
              : <span style={css.sellerInitial}>{listing.sellerName?.[0]?.toUpperCase() ?? '?'}</span>
            }
          </div>
          <div style={{ flex: 1 }}>
            <p style={css.sellerName}>{listing.sellerName ?? 'Student'}</p>
            <p style={css.sellerSub}>{isOwnListing ? 'View your profile' : 'View profile & ratings'}</p>
          </div>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#bbb" strokeWidth="2.5" strokeLinecap="round">
            <polyline points="9 18 15 12 9 6"/>
          </svg>
        </div>
      </div>

      {/* ── Purchase modal ── */}
      {isModalOpen && (
        <div style={modalCss.overlay}>
          <div style={modalCss.modal}>
            <div style={modalCss.header}>
              <h2 style={{ margin: 0, fontSize: '1.1rem' }}>
                {purchaseType === 'trade' ? 'Initiate Trade' : 'Initiate Purchase'}
              </h2>
              <button onClick={() => setIsModalOpen(false)} style={modalCss.closeBtn} aria-label="Close modal">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>

            <p style={{ color: '#666', fontSize: 14, marginBottom: 20 }}>
              Review and confirm your details for "{listing.title}"
            </p>

            {(() => {
              const lt = listing.listingType || listing.type;
              return lt === 'For Sale or Trade' && !purchaseType;
            })() && (
              <div style={modalCss.section}>
                <label style={modalCss.label}>Choose Transaction Type</label>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button onClick={() => setPurchaseType('sale')}  style={modalCss.choiceBtn}>Cash Purchase</button>
                  <button onClick={() => setPurchaseType('trade')} style={modalCss.choiceBtn}>Trade Item</button>
                </div>
              </div>
            )}

            {purchaseType === 'sale' && (
              <div style={modalCss.section}>
                <label htmlFor="agreed-price" style={modalCss.label}>Agreed Price (R)</label>
                <input id="agreed-price" type="number" value={agreedPrice}
                  onChange={(e) => setAgreedPrice(e.target.value)} style={modalCss.input} />
                <label htmlFor="payment-method" style={modalCss.label}>Payment Method</label>
                <select id="payment-method" value={paymentType}
                  onChange={(e) => setPaymentType(e.target.value)} style={modalCss.input}>
                  <option value="full_online">Fully Online</option>
                  <option value="partial">Partial Online / Partial Cash</option>
                  <option value="cash">Full Cash on Delivery</option>
                </select>
                {paymentType === 'partial' && (
                  <input type="number" placeholder="Enter online payment amount"
                    value={partialAmount} onChange={(e) => setPartialAmount(e.target.value)} style={modalCss.input} />
                )}
              </div>
            )}

            {purchaseType === 'trade' && (
              <div style={modalCss.section}>
                <label style={modalCss.label}>What are you offering to trade?</label>
                <input type="text" placeholder="Describe your trade item..."
                  value={tradeItem} onChange={(e) => setTradeItem(e.target.value)} style={modalCss.input} />
              </div>
            )}

            <div style={modalCss.section}>
              <label style={modalCss.label}>Changes to terms (optional)</label>
              <textarea placeholder="E.g. Seller agreed to include charger..."
                value={terms} onChange={(e) => setTerms(e.target.value)} style={modalCss.textarea} />
            </div>

            <button
              onClick={handleTransaction}
              disabled={submitting}
              style={{
                ...css.buyBtn,
                opacity: submitting ? 0.6 : 1,
                cursor:  submitting ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}
            >
              {submitting && (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
                  style={{ animation: 'spin 0.8s linear infinite', flexShrink: 0 }}>
                  <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                </svg>
              )}
              {submitting ? 'Sending offer…' : 'Confirm & Send Offer'}
            </button>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Inline styles
// ─────────────────────────────────────────────────────────────────────────────
const css = {
  page:             { display: 'flex', gap: 48, padding: '40px 32px 48px', width: '100%', margin: '0 auto', flexWrap: 'wrap', backgroundColor: '#fbfbfb', minHeight: '100vh', borderRadius: 24 },
  imageSection:     { flex: '1 1 400px', minWidth: 300 },
  mainImageWrapper: { width: '100%', aspectRatio: '4/3', borderRadius: 12, overflow: 'hidden', backgroundColor: '#f0f2f5' },
  mainImage:        { width: '100%', height: '100%', objectFit: 'cover' },
  imagePlaceholder: { width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #f0f2f5, #e8ecf0)' },
  thumbnailRow:     { display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' },
  thumbnail:        { width: 72, height: 72, objectFit: 'cover', borderRadius: 8, cursor: 'pointer', transition: 'opacity 0.15s' },
  detailSection:    { flex: '1 1 340px', minWidth: 280, display: 'flex', flexDirection: 'column', gap: 12 },
  badgeRow:         { display: 'flex', gap: 8, flexWrap: 'wrap' },
  badge:            { padding: '4px 12px', borderRadius: 20, fontSize: '0.75rem', fontWeight: 600, fontFamily: 'Segoe UI, system-ui, sans-serif' },
  title:            { fontSize: '1.8rem', fontWeight: 700, color: '#1a1a1a', margin: 0, fontFamily: 'Segoe UI, system-ui, sans-serif' },
  price:            { fontSize: '1.6rem', fontWeight: 700, color: '#6AA6DA', margin: 0, fontFamily: 'Segoe UI, system-ui, sans-serif' },
  buyBtn:           { width: '100%', padding: 16, backgroundColor: '#6AA6DA', color: '#fff', border: 'none', borderRadius: 10, fontSize: '1rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'Segoe UI, system-ui, sans-serif' },
  messageBtn:       { width: '100%', padding: 12, backgroundColor: 'transparent', color: '#444', border: '1.5px solid #6aa6da57', borderRadius: 10, fontSize: '0.95rem', fontWeight: 500, cursor: 'pointer', fontFamily: 'Segoe UI, system-ui, sans-serif' },
  reportBtn:        { width: '100%', padding: '10px 12px', backgroundColor: 'transparent', color: '#dc2626', border: '1.5px solid #fca5a5', borderRadius: 10, fontSize: '0.82rem', fontWeight: 500, cursor: 'pointer', fontFamily: 'Segoe UI, system-ui, sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 },
  pendingBanner:    { display: 'flex', alignItems: 'center', gap: 12, padding: 16, backgroundColor: '#fff8e1', border: '1px solid #ffe082', borderRadius: 10, fontFamily: 'Segoe UI, system-ui, sans-serif' },
  ownerBanner:      { display: 'flex', alignItems: 'center', gap: 12, padding: 16, backgroundColor: '#e8f4fd', border: '1px solid #90caf9', borderRadius: 10, fontFamily: 'Segoe UI, system-ui, sans-serif' },
  bannerIcon:       { display: 'flex', alignItems: 'center', flexShrink: 0 },
  pendingTitle:     { margin: '0 0 4px', fontWeight: 700, fontSize: '0.95rem', color: '#b45309' },
  pendingSubtitle:  { margin: 0, fontSize: '0.85rem', color: '#92400e' },
  ownerBannerTitle: { margin: '0 0 4px', fontWeight: 700, fontSize: '0.95rem', color: '#0d47a1' },
  ownerBannerSubtitle: { margin: 0, fontSize: '0.85rem', color: '#1565c0' },
  sellerCard:       { display: 'flex', alignItems: 'center', gap: 14, padding: 16, border: '1px solid #dde3ea', borderRadius: 14, marginTop: 8, cursor: 'pointer', backgroundColor: '#fff', outline: 'none', userSelect: 'none', transition: 'box-shadow 0.15s' },
  sellerAvatar:     { width: 52, height: 52, borderRadius: '50%', backgroundColor: '#166bc0', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 },
  sellerInitial:    { fontSize: '1.2rem', fontWeight: 700, color: '#fff' },
  sellerName:       { margin: '0 0 2px', fontWeight: 600, fontSize: '0.95rem', color: '#1a1a1a', fontFamily: 'Segoe UI, system-ui, sans-serif' },
  sellerSub:        { margin: 0, fontSize: '0.8rem', color: '#6AA6DA', fontFamily: 'Segoe UI, system-ui, sans-serif' },
  specBox:          { backgroundColor: '#f0f6ff', border: '1px solid #d0e4f7', borderLeft: '3px solid #6AA6DA', borderRadius: 10, padding: '14px 16px', margin: 0 },
  descBox:          { backgroundColor: '#fafafa', border: '1px solid #ebebeb', borderLeft: '3px solid #c8d6e3', borderRadius: 10, padding: '14px 16px', margin: 0 },
  specLabel:        { fontSize: '0.72rem', fontWeight: 700, color: '#6AA6DA', textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 8px', display: 'flex', alignItems: 'center', fontFamily: 'Segoe UI, system-ui, sans-serif' },
  specText:         { fontSize: '0.88rem', color: '#2d3748', lineHeight: 1.65, fontFamily: 'Segoe UI, system-ui, sans-serif', margin: 0, whiteSpace: 'pre-wrap' },
};

const modalCss = {
  overlay:   { position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 },
  modal:     { backgroundColor: 'white', padding: 28, borderRadius: 16, width: '90%', maxWidth: 500, boxShadow: '0 10px 30px rgba(0,0,0,0.2)', fontFamily: 'Segoe UI, system-ui, sans-serif' },
  header:    { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  closeBtn:  { background: '#f3f4f6', border: 'none', cursor: 'pointer', color: '#555', width: 32, height: 32, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.15s' },
  section:   { marginBottom: 18 },
  label:     { display: 'block', fontWeight: 600, marginBottom: 8, fontSize: 13, color: '#333' },
  input:     { width: '100%', padding: '11px 13px', borderRadius: 8, border: '1.5px solid #e2e8f0', marginBottom: 10, boxSizing: 'border-box', fontSize: 14, fontFamily: 'inherit', outline: 'none' },
  textarea:  { width: '100%', padding: '11px 13px', borderRadius: 8, border: '1.5px solid #e2e8f0', height: 80, boxSizing: 'border-box', fontFamily: 'inherit', fontSize: 14, outline: 'none' },
  choiceBtn: { flex: 1, padding: 12, borderRadius: 8, border: '1.5px solid #6AA6DA', cursor: 'pointer', backgroundColor: '#f0f7ff', color: '#166bc0', fontWeight: 600, fontFamily: 'inherit' },
};