// ListingDetails.jsx
import { useEffect, useState, useRef, useCallback } from 'react';

const CLOUDINARY_CLOUD_NAME    = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
const CLOUDINARY_UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET;

async function uploadTradeImageToCloudinary(file) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`,
    { method: 'POST', body: formData }
  );
  if (!res.ok) throw new Error(`Image upload failed: ${res.statusText}`);
  const data = await res.json();
  return data.secure_url;
}
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  doc, getDoc, collection, query, where,
  getDocs, addDoc, serverTimestamp, setDoc, updateDoc, arrayUnion, arrayRemove,
} from 'firebase/firestore';
import { auth, db } from '../firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { createTransaction } from '../services/transactionService';
import { notifySellerOfOffer } from '../services/notificationService';
import NavBarTemp from './NavBarTemp';
import ReportModal from './ReportModal';
import PromoteListingModal from './PromoteListingModal';
import AlertModal from './AlertModal';

// ── Toast ─────────────────────────────────────────────────────────────────────
function Toast({ toast }) {
  if (!toast) return null;
  const bg = toast.type === 'error' ? '#dc2626' : toast.type === 'warn' ? '#d97706' : '#1f2937';
  return (
    <div style={{
      position: 'fixed', top: 80, left: '50%', transform: 'translateX(-50%)',
      background: bg, color: 'white', padding: '10px 20px', borderRadius: 10,
      fontFamily: 'Segoe UI, system-ui, sans-serif', fontSize: '0.875rem', fontWeight: 600,
      display: 'flex', alignItems: 'center', gap: 8, zIndex: 9999,
      boxShadow: '0 4px 20px rgba(0,0,0,0.15)', pointerEvents: 'none',
      animation: 'toastSlide 0.25s ease',
    }}>
      <style>{`@keyframes toastSlide { from { opacity:0; transform:translateX(-50%) translateY(-8px); } to { opacity:1; transform:translateX(-50%) translateY(0); } }`}</style>
      <span>{toast.type === 'error' ? '✕' : toast.type === 'warn' ? '⚠' : '✓'}</span>
      {toast.msg}
    </div>
  );
}

// ── Image Scroller (Shein-style) ──────────────────────────────────────────────
function ImageScroller({ photos, title }) {
  const [active, setActive] = useState(0);
  const trackRef            = useRef(null);
  const startX              = useRef(null);
  const isDragging          = useRef(false);

  const goTo = useCallback((i) => {
    const clamped = Math.max(0, Math.min(i, photos.length - 1));
    setActive(clamped);
    const track = trackRef.current;
    if (track) {
      const slide = track.children[clamped];
      if (slide && typeof slide.scrollIntoView === 'function') {
        slide.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      }
    }
  }, [photos.length]);

  const onTouchStart = (e) => { startX.current = e.touches[0].clientX; };
  const onTouchEnd   = (e) => {
    if (startX.current === null) return;
    const delta = startX.current - e.changedTouches[0].clientX;
    if (Math.abs(delta) > 40) goTo(active + (delta > 0 ? 1 : -1));
    startX.current = null;
  };
  const onMouseDown = (e) => { startX.current = e.clientX; isDragging.current = false; };
  const onMouseMove = (e) => { if (startX.current !== null && Math.abs(e.clientX - startX.current) > 5) isDragging.current = true; };
  const onMouseUp   = (e) => {
    if (startX.current === null) return;
    const delta = startX.current - e.clientX;
    if (Math.abs(delta) > 40) goTo(active + (delta > 0 ? 1 : -1));
    startX.current = null;
  };

  if (photos.length === 0) {
    return (
      <div style={imgStyles.wrapper}>
        <div style={imgStyles.placeholder}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#ccc" strokeWidth="1.5" strokeLinecap="round">
            <rect x="3" y="3" width="18" height="18" rx="2"/>
            <circle cx="8.5" cy="8.5" r="1.5"/>
            <path d="M21 15l-5-5L5 21"/>
          </svg>
          <p style={{ color: '#bbb', fontSize: '0.85rem', margin: '10px 0 0' }}>No Image Available</p>
        </div>
      </div>
    );
  }

  return (
    <div style={imgStyles.root}>
      <div
        style={imgStyles.wrapper}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
      >
        <div ref={trackRef} style={imgStyles.track}>
          <div style={{ position: 'relative', width: '100%', height: '100%' }}>
            {photos.map((src, i) => (
              <img
                key={`overlay-${i}`}
                src={src}
                alt={i === 0 ? title : `${title} ${i + 1}`}
                style={{
                  position: 'absolute',
                  inset: 0,
                  width: '100%',
                  height: '100%',
                  objectFit: 'contain',
                  opacity: i === active ? 1 : 0,
                  transition: 'opacity 0.38s cubic-bezier(0.4, 0, 0.2, 1)',
                  pointerEvents: 'none',
                  userSelect: 'none',
                  WebkitUserDrag: 'none',
                }}
                draggable={false}
              />
            ))}
          </div>
        </div>
        {photos.length > 1 && (
          <>
            <button onClick={() => goTo(active - 1)} disabled={active === 0} style={{ ...imgStyles.arrow, left: 10, opacity: active === 0 ? 0.3 : 1 }}>‹</button>
            <button onClick={() => goTo(active + 1)} disabled={active === photos.length - 1} style={{ ...imgStyles.arrow, right: 10, opacity: active === photos.length - 1 ? 0.3 : 1 }}>›</button>
          </>
        )}
        {photos.length > 1 && <div style={imgStyles.counter}>{active + 1} / {photos.length}</div>}
      </div>
      {photos.length > 1 && (
        <div style={imgStyles.dots}>
          {photos.map((_, i) => (
            <button key={i} onClick={() => goTo(i)} style={{ ...imgStyles.dot, background: i === active ? '#6AA6DA' : '#d1d5db', width: i === active ? 20 : 8 }} />
          ))}
        </div>
      )}
      {photos.length > 1 && (
        <div style={imgStyles.thumbRow}>
          {photos.map((src, i) => (
            <button key={i} onClick={() => goTo(i)} style={{ ...imgStyles.thumb, opacity: i === active ? 1 : 0.6 }}>
              <img src={src} alt={`thumb-${i}`} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 5, border: i === active ? '2px solid #6AA6DA' : '2px solid transparent' }} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const imgStyles = {
  root: { display: 'flex', flexDirection: 'column', gap: 10 },
  wrapper: {
    width: '100%', aspectRatio: '4/3', borderRadius: 12, overflow: 'hidden',
    backgroundColor: '#f0f2f5', position: 'relative', cursor: 'grab', userSelect: 'none',
  },
  track: { position: 'absolute', inset: 0 },
  placeholder: {
    width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center', backgroundColor: '#f0f2f5',
  },
  arrow: {
    position: 'absolute', top: '50%', transform: 'translateY(-50%)',
    background: 'rgba(255,255,255,0.9)', border: 'none', width: 34, height: 34,
    borderRadius: '50%', fontSize: '1.4rem', lineHeight: '1', cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    boxShadow: '0 2px 8px rgba(0,0,0,0.15)', transition: 'opacity 0.15s, transform 0.15s',
    zIndex: 2, fontFamily: 'serif',
  },
  counter: {
    position: 'absolute', bottom: 10, right: 12, background: 'rgba(0,0,0,0.45)', color: 'white',
    fontSize: '0.72rem', fontWeight: 600, padding: '2px 9px', borderRadius: 99,
    fontFamily: 'Segoe UI, system-ui, sans-serif',
  },
  dots: { display: 'flex', justifyContent: 'center', gap: 6, padding: '2px 0' },
  dot: { height: 8, borderRadius: 99, border: 'none', cursor: 'pointer', transition: 'width 0.25s ease, background 0.25s ease', padding: 0 },
  thumbRow: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  thumb: { width: 58, height: 58, borderRadius: 6, overflow: 'hidden', cursor: 'pointer', transition: 'border 0.15s, opacity 0.15s', padding: 0, background: 'none', flexShrink: 0 },
};

// ── Icons ─────────────────────────────────────────────────────────────────────
const IconMessage = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
  </svg>
);

const IconTag = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
    <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/>
    <line x1="7" y1="7" x2="7.01" y2="7"/>
  </svg>
);

const IconClock = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
    <circle cx="12" cy="12" r="10"/>
    <polyline points="12 6 12 12 16 14"/>
  </svg>
);

const IconLoader = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, animation: 'spin 1s linear infinite' }}>
    <line x1="12" y1="2"   x2="12" y2="6"/>
    <line x1="12" y1="18"  x2="12" y2="22"/>
    <line x1="4.93" y1="4.93"   x2="7.76"  y2="7.76"/>
    <line x1="16.24" y1="16.24" x2="19.07" y2="19.07"/>
    <line x1="2"  y1="12"  x2="6"  y2="12"/>
    <line x1="18" y1="12"  x2="22" y2="12"/>
    <line x1="4.93" y1="19.07"  x2="7.76"  y2="16.24"/>
    <line x1="16.24" y1="7.76"  x2="19.07" y2="4.93"/>
  </svg>
);

// ── Trade item categories ─────────────────────────────────────────────────────
const TRADE_CATEGORIES = [
  'Electronics', 'Books & Study Materials', 'Clothing & Accessories',
  'Furniture & Decor', 'Sports & Fitness', 'Gaming', 'Music & Instruments',
  'Art & Crafts', 'Kitchen & Appliances', 'Stationery', 'Other',
];

const TRADE_CONDITIONS = [
  { label: 'New',      color: '#4CAF50', bg: '#f0fdf4', border: '#86efac' },
  { label: 'Like New', color: '#8BC34A', bg: '#f7fee7', border: '#bef264' },
  { label: 'Good',     color: '#d97706', bg: '#fffbeb', border: '#fcd34d' },
  { label: 'Fair',     color: '#ea580c', bg: '#fff7ed', border: '#fdba74' },
  { label: 'Poor',     color: '#dc2626', bg: '#fef2f2', border: '#fca5a5' },
];

// ── Inner view ────────────────────────────────────────────────────────────────
export function ListingDetailView({ listing, currentUser, existingTransaction = null, navigate, isAdminPreview = false }) {
  const [isModalOpen, setIsModalOpen]     = useState(false);
  const [purchaseType, setPurchaseType]   = useState('');
  const [agreedPrice, setAgreedPrice]     = useState(listing.price);
  const [paymentType, setPaymentType]     = useState('full_online');
  const [partialAmount, setPartialAmount] = useState('');
  const [terms, setTerms]                 = useState('');
  const [offerSent, setOfferSent]         = useState(false);
  const [chatLoading, setChatLoading]     = useState(false);
  const [submitting, setSubmitting]       = useState(false);
  const [reportOpen, setReportOpen]       = useState(false);
  const [inCart, setInCart]               = useState(false);
  const [cartLoading, setCartLoading]     = useState(false);
  const [toast, setToast]                 = useState(null);
  const [showPromoteModal, setShowPromoteModal] = useState(false);
  
  // Alert Modal states
  const [showPriceAlert, setShowPriceAlert] = useState(false);
  const [showPartialAlert, setShowPartialAlert] = useState(false);
  const [showPartialExceedAlert, setShowPartialExceedAlert] = useState(false);
  const [alertMessage, setAlertMessage] = useState('');

  // ── Trade item structured state ────────────────────────────────────────────
  const [tradeItemName,      setTradeItemName]      = useState('');
  const [tradeItemCategory,  setTradeItemCategory]  = useState('');
  const [tradeItemCondition, setTradeItemCondition] = useState('');
  const [tradeItemDesc,      setTradeItemDesc]      = useState('');
  const [tradeImageFile,     setTradeImageFile]      = useState(null);
  const [tradeImagePreview,  setTradeImagePreview]  = useState(null);
  const [tradeImageUploading, setTradeImageUploading] = useState(false);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2800);
  };

  const sellerId     = listing.sellerUID || listing.sellerId;
  const isOwnListing = currentUser && currentUser.uid === sellerId;

  // ── Reset trade fields when modal closes ──────────────────────────────────
  const closeModal = () => {
    setIsModalOpen(false);
    setTradeItemName('');
    setTradeItemCategory('');
    setTradeItemCondition('');
    setTradeItemDesc('');
    setTradeImageFile(null);
    setTradeImagePreview(null);
  };

  // ── Check if already in cart ───────────────────────────────────────────────
  useEffect(() => {
    if (!currentUser || !listing.id) return;
    const checkCart = async () => {
      try {
        const snap = await getDoc(doc(db, 'carts', currentUser.uid));
        if (snap.exists()) {
          const items = snap.data().items || [];
          setInCart(items.includes(listing.id));
        }
      } catch (_) {}
    };
    checkCart();
  }, [currentUser, listing.id]);

  // ── Cart toggle ────────────────────────────────────────────────────────────
  const handleCartToggle = async () => {
    if (!currentUser) { showToast('Please log in to save items', 'warn'); return; }
    if (isOwnListing)  { showToast('You cannot add your own listing to cart', 'warn'); return; }
    setCartLoading(true);
    try {
      const cartRef = doc(db, 'carts', currentUser.uid);
      const snap    = await getDoc(cartRef);

      if (inCart) {
        await updateDoc(cartRef, { items: arrayRemove(listing.id) });
        setInCart(false);
        showToast('Removed from cart');
      } else {
        const items = snap.exists() ? (snap.data().items || []) : [];
        if (items.length >= 50) { showToast('Cart is full (max 50 items)', 'warn'); return; }
        if (snap.exists()) {
          await updateDoc(cartRef, { items: arrayUnion(listing.id) });
        } else {
          await setDoc(cartRef, { items: [listing.id], createdAt: serverTimestamp() });
        }
        setInCart(true);
        showToast('Added to cart');
      }
    } catch (err) {
      console.error('Cart error:', err);
      showToast('Something went wrong', 'error');
    } finally {
      setCartLoading(false);
    }
  };

  // ── Chat ───────────────────────────────────────────────────────────────────
  async function findOrCreateChat() {
    const buyerId = currentUser.uid;
    if (!sellerId) throw new Error('Seller information is missing from this listing');
    if (buyerId === sellerId) throw new Error('Cannot message yourself');
    const q = query(collection(db, 'chats'), where('participants', 'array-contains', buyerId));
    const snap = await getDocs(q);
    const existing = snap.docs.find((d) => d.data().participants?.includes(sellerId));
    if (existing) return existing.id;
    const ref = await addDoc(collection(db, 'chats'), {
      participants:          [buyerId, sellerId],
      listingTitle:          listing.title || '',
      listingId:             listing.id,
      lastMessage:           '',
      createdAt:             serverTimestamp(),
      updatedAt:             serverTimestamp(),
      [`unread_${buyerId}`]:  0,
      [`unread_${sellerId}`]: 0,
    });
    return ref.id;
  }

  async function handleMessageSeller() {
    if (!currentUser) { showToast('Please log in to message the seller', 'warn'); return; }
    if (!sellerId)    { showToast('Seller information is missing', 'error'); return; }
    if (currentUser.uid === sellerId) { showToast('You cannot message yourself', 'warn'); return; }
    setChatLoading(true);
    try {
      const chatId = await findOrCreateChat();
      navigate(`/chat?open=${chatId}`);
    } catch (err) {
      showToast(`Could not open chat: ${err.message || 'Please try again.'}`, 'error');
    } finally {
      setChatLoading(false);
    }
  }

  function handleSellerCardClick() {
    navigate(isOwnListing ? '/profile' : `/profile/${sellerId}`);
  }

  // ── Partial payment validation (must be LESS THAN agreed price) ───────────
  const validatePartialAmount = (amount, totalPrice) => {
    if (!amount) return true;
    const amountNum = Number(amount);
    const totalNum = Number(totalPrice);
    if (isNaN(amountNum) || isNaN(totalNum)) return true;
    return amountNum < totalNum; // Must be strictly less than
  };

  const handlePartialAmountChange = (e) => {
    const value = e.target.value;
    const amountNum = Number(value);
    const totalNum = Number(agreedPrice);
    
    if (!validatePartialAmount(value, agreedPrice)) {
      showToast(`Partial online payment must be less than the total agreed price of R${totalNum.toLocaleString()}`, 'warn');
      // Auto-correct to agreedPrice - 1 if total > 0 and amount >= total
      if (amountNum >= totalNum && totalNum > 0) {
        setPartialAmount((totalNum - 1).toString());
      } else {
        setPartialAmount('');
      }
    } else {
      setPartialAmount(value);
    }
  };

  // ── Offer with payment validation ──────────────────────────────────────────
  const handleTransaction = async () => {
    if (submitting) return;
    if (!purchaseType) {
      showToast('Please select a transaction type', 'warn');
      return;
    }
    
    // SALE VALIDATIONS
    if (purchaseType === 'sale') {
      if (!agreedPrice) {
        showToast('Please enter an agreed price', 'warn');
        return;
      }
      
      const agreedPriceNum = Number(agreedPrice);
      if (isNaN(agreedPriceNum) || agreedPriceNum < 10) {
        showToast('Agreed price must be at least R10', 'warn');
        return;
      }
      
      if (paymentType === 'partial') {
        const partialAmountNum = Number(partialAmount);
        if (!partialAmount || isNaN(partialAmountNum) || partialAmountNum < 10) {
          showToast('Partial online payment amount must be at least R10', 'warn');
          return;
        }
        if (partialAmountNum >= agreedPriceNum) { // Must be less than, not less than or equal
          showToast('Partial online payment must be less than the total agreed price', 'warn');
          return;
        }
      }
    }
    
    // Trade item validation
    if (purchaseType === 'trade') {
      if (!tradeItemName) {
        showToast('Please describe what you want to trade', 'warn');
        return;
      }
      if (!tradeItemCategory) showToast('Tip: Adding a category helps the seller understand your offer', 'warn');
      if (!tradeItemCondition) showToast('Tip: Selecting a condition helps the seller evaluate your offer', 'warn');
    }

    setSubmitting(true);

    let paymentMethod = null;
    if (purchaseType === 'sale') {
      if (paymentType === 'full_online') paymentMethod = 'online';
      else if (paymentType === 'cash')   paymentMethod = 'cod';
      else if (paymentType === 'partial') paymentMethod = 'partial';
    }

    // Upload trade item image to Cloudinary
    let tradeImageUrl = null;
    if (purchaseType === 'trade' && tradeImageFile) {
      setTradeImageUploading(true);
      try {
        tradeImageUrl = await uploadTradeImageToCloudinary(tradeImageFile);
      } catch (uploadErr) {
        console.error('Trade image upload failed:', uploadErr);
        showToast('Failed to upload trade item photo. Please try again.', 'error');
        setSubmitting(false);
        setTradeImageUploading(false);
        return;
      } finally {
        setTradeImageUploading(false);
      }
    }

    // Build the structured tradeItem object
    const tradeItemPayload = purchaseType === 'trade' ? {
      name:        tradeItemName,
      category:    tradeItemCategory,
      condition:   tradeItemCondition,
      description: tradeItemDesc || null,
      imageUrl:    tradeImageUrl,
    } : null;

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
      paymentMethod,
      partialAmount: paymentType === 'partial' ? Number(partialAmount) : null,
      tradeItem:     purchaseType === 'trade' ? tradeItemName : null,
      tradeItemDetails: tradeItemPayload,
      terms:         terms || null,
      createdAt:     new Date().toISOString(),
    };

    try {
      const transactionId = await createTransaction(transactionData);
      await notifySellerOfOffer({
        transactionId, sellerId,
        buyerId:      currentUser.uid,
        buyerName:    currentUser.displayName || 'Student',
        listingTitle: listing.title,
      });
      closeModal();
      setOfferSent(true);
      showToast('Offer sent! The seller will review it shortly.');
    } catch (err) {
      console.error('Transaction error:', err);
      showToast('Failed to create offer. Please try again.', 'error');
      setSubmitting(false);
    }
  };

  const openPurchaseModal = () => {
    const lt = listing.listingType || listing.type;
    const isEither   = lt === 'For Sale or Trade' || lt === 'either';
    const isSaleOnly = lt === 'For Sale' || lt === 'sale';
    const isTradeOnly = lt === 'For Trade' || lt === 'trade';
    setPurchaseType(isEither ? '' : isSaleOnly ? 'sale' : isTradeOnly ? 'trade' : '');
    setIsModalOpen(true);
  };

  const renderButton = () => {
    if (!currentUser || isOwnListing) return null;
    if (existingTransaction?.status === 'pending' || offerSent) {
      return (
        <div style={styles.pendingBanner} data-testid="pending-offer-banner">
          <IconClock />
          <div>
            <p style={styles.pendingTitle}>Offer Already Initiated</p>
            <p style={styles.pendingSubtitle}>We're waiting for the seller to approve your offer.</p>
          </div>
        </div>
      );
    }
    const lt = listing.listingType || listing.type;
    const isTradeOnly = lt === 'For Trade' || lt === 'trade';
    const isSaleOnly  = lt === 'For Sale'  || lt === 'sale';
    const isEither    = lt === 'For Sale or Trade' || lt === 'either';

    let label = '';
    if (isSaleOnly)  label = 'Buy Now';
    else if (isTradeOnly) label = 'Make Trade Offer';
    else if (isEither)    label = 'Buy Now / Make Trade Offer';
    else return null;

    return (
      <button onClick={openPurchaseModal} style={styles.buyBtn}>
        {label}{!isTradeOnly && listing.price ? ` — R ${Number(listing.price).toLocaleString()}` : ''}
      </button>
    );
  };

  const photos    = listing.photos?.length > 0 ? listing.photos : [];
  const type      = listing.listingType || listing.type || '';
  const condition = listing.condition || '';
  const conditionColor = { New: '#4CAF50', 'Like New': '#8BC34A', Good: '#FFC107', Fair: '#FF9800', Poor: '#F44336' };
  const typeColor      = { 'For Sale': '#e07b3a', 'For Trade': '#3a7be0', 'For Sale or Trade': '#7b3ae0', sale: '#e07b3a', trade: '#3a7be0', either: '#7b3ae0' };

  // Normalise "either" → human-readable label for the badge
  const typeBadgeLabel = {
    'For Sale':         'For Sale',
    'For Trade':        'For Trade',
    'For Sale or Trade':'For Sale or Trade',
    sale:               'For Sale',
    trade:              'For Trade',
    either:             'For Sale or Trade',
  }[type] || type;

  return (
    <>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      <Toast toast={toast} />

      <ReportModal
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        reportType="listing"
        reportedId={listing.id}
        reportedName={listing.title}
      />

      {showPromoteModal && (
        <PromoteListingModal
          listing={listing}
          onClose={() => setShowPromoteModal(false)}
        />
      )}

      <div style={styles.page}>

        {/* ── Images ── */}
        <div style={styles.imageSection}>
          <ImageScroller photos={photos} title={listing.title} />
        </div>

        {/* ── Details ── */}
        <div style={styles.detailSection}>

          <div style={styles.badgeRow}>
            {condition && <span style={{ ...styles.badge, backgroundColor: conditionColor[condition] || '#999', color: '#fff' }}>{condition}</span>}
            {type      && <span style={{ ...styles.badge, backgroundColor: typeColor[type] || '#555', color: '#fff' }}>{typeBadgeLabel}</span>}
            {listing.category && <span style={{ ...styles.badge, backgroundColor: '#E1E5AC', color: '#5a5a00' }}>{listing.category}</span>}
          </div>

          <h1 style={styles.title}>{listing.title}</h1>
          {/* Hide price for trade-only listings */}
          {type !== 'For Trade' && type !== 'trade' && (
            <p style={styles.price}>R {Number(listing.price).toLocaleString()}</p>
          )}

          {listing.description && (
            <div style={styles.descBox}>
              <p style={styles.descLabel}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#c07a10" strokeWidth="2.5" strokeLinecap="round" style={{ marginRight: 6, flexShrink: 0 }}>
                  <line x1="8" y1="6"  x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/>
                  <line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6"  x2="3.01" y2="6"/>
                  <line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
                </svg>
                Description
              </p>
              <p style={styles.descText}>{listing.description}</p>
            </div>
          )}

          {listing.specification && (
            <div style={styles.specBox}>
              <p style={styles.specLabel}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#6AA6DA" strokeWidth="2.5" strokeLinecap="round" style={{ marginRight: 6, flexShrink: 0 }}>
                  <path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>
                </svg>
                Specifications
              </p>
              <p style={styles.specText}>{listing.specification}</p>
            </div>
          )}

          {/* ── Admin preview banner ── */}
          {isAdminPreview && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 14px', backgroundColor: '#a9cff3',
              border: '1px solid hsl(226, 51%, 62%)', borderRadius: 10,
              fontSize: '0.82rem', fontWeight: 600, color: '#0e3892',
              fontFamily: 'Segoe UI, system-ui, sans-serif',
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
              Admin preview
              <button
                onClick={() => navigate(-1)}
                style={{ marginLeft: 'auto', background: 'none', border: '1px solid hsl(226, 51%, 62%)', borderRadius: 6, padding: '3px 10px', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.78rem', fontWeight: 700, color: '#0e3892' }}
              >
                ← Back to reports
              </button>
            </div>
          )}

          {!isAdminPreview && renderButton()}

          {/* ── Add to Cart ── */}
          {!isAdminPreview && currentUser && !isOwnListing && (
            <button
              style={{
                ...styles.cartBtn,
                backgroundColor: inCart ? '#f0fdf4' : '#f8fafc',
                borderColor:     inCart ? '#86efac' : '#d1d5db',
                color:           inCart ? '#15803d' : '#374151',
              }}
              onClick={handleCartToggle}
              disabled={cartLoading}
            >
              {cartLoading
                ? <IconLoader />
                : <svg
  width="16"
  height="16"
  viewBox="0 0 24 24"
  fill={inCart ? "currentColor" : "none"}
  stroke="currentColor"
  strokeWidth="2"
  strokeLinecap="round"
  strokeLinejoin="round"
  style={{ flexShrink: 0 }}
>
  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
</svg>
              }
              <span>{inCart ? 'Remove from cart' : 'Add to favorites'}</span>
            </button>
          )}

          {/* ── Message Seller ── */}
          {!isAdminPreview && currentUser && !isOwnListing && (
            <button style={styles.messageBtn} onClick={handleMessageSeller} disabled={chatLoading}>
              {chatLoading
                ? <><IconLoader /><span>Opening chat…</span></>
                : <><IconMessage /><span>Message Seller</span></>
              }
            </button>
          )}

          {/* ── Report Listing ── */}
          {!isAdminPreview && currentUser && !isOwnListing && (
            <button style={styles.reportBtn} onClick={() => setReportOpen(true)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/>
                <line x1="4" y1="22" x2="4" y2="15"/>
              </svg>
              <span>Report Listing</span>
            </button>
          )}

          {/* ── Owner banner ── */}
          {!isAdminPreview && isOwnListing && (
            <div style={styles.ownerBanner} data-testid="owner-listing-banner">
              <IconTag />
              <div>
                <p style={styles.ownerBannerTitle}>This is your listing</p>
                <p style={styles.ownerBannerSubtitle}>You are viewing your own listing. Edit it from your profile.</p>
              </div>
            </div>
          )}

          {/* ── Promote listing (owner only) ── */}
          {!isAdminPreview && isOwnListing && (
            <button
              onClick={() => setShowPromoteModal(true)}
              style={{ ...styles.buyBtn, backgroundColor: '#ff9800', marginTop: '8px' }}
            >
              ✦ Promote listing
            </button>
          )}

          {/* ── Seller card ── */}
          {!isAdminPreview && (
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
                  ? <img src={listing.sellerAvatar} alt={listing.sellerName} style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }}/>
                  : <span style={styles.sellerInitial}>{listing.sellerName?.[0]?.toUpperCase() ?? '?'}</span>
                }
              </div>
              <div style={{ flex: 1 }}>
                <p style={styles.sellerName}>{listing.sellerName ?? 'Student'}</p>
                <p style={styles.sellerSub}>{isOwnListing ? 'View your profile →' : 'View profile & ratings →'}</p>
              </div>
              <span style={styles.sellerChevron}>›</span>
            </div>
          )}
          </div>
          

        {/* ── Purchase modal ── */}
        {isModalOpen && (
          <div style={modalStyles.overlay}>
            <div style={modalStyles.modal}>
              <div style={modalStyles.header}>
                <h2 style={{ margin: 0, fontSize: '1.1rem' }}>
                  {purchaseType === 'trade' ? 'Initiate Trade' : purchaseType === 'sale' ? 'Initiate Purchase' : 'Make an Offer'}
                </h2>
                <button onClick={closeModal} style={modalStyles.closeBtn} aria-label="Close modal">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </div>

              <p style={{ color: '#666', fontSize: '14px', marginBottom: '20px' }}>
                Review and confirm your details for "{listing.title}"
              </p>

              {/* ── Choose type (For Sale or Trade / either listings) ── */}
              {(() => {
                const lt = listing.listingType || listing.type;
                return (lt === 'For Sale or Trade' || lt === 'either') && !purchaseType;
              })() && (
                <div style={modalStyles.section}>
                  <label style={modalStyles.label}>How would you like to proceed?</label>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button onClick={() => setPurchaseType('sale')}  style={modalStyles.choiceBtn}>
                      Cash Purchase
                    </button>
                    <button onClick={() => setPurchaseType('trade')} style={modalStyles.choiceBtn}>
                      Trade Item
                    </button>
                  </div>
                </div>
              )}

              {/* ── Sale fields ── */}
              {purchaseType === 'sale' && (
                <div style={modalStyles.section}>
                  <label htmlFor="agreed-price" style={modalStyles.label}>
                    Agreed Price (R) <span style={{ color: '#dc2626' }}>* (Minimum R10)</span>
                  </label>
                  <input id="agreed-price" type="number" value={agreedPrice}
                    onChange={(e) => setAgreedPrice(e.target.value)} style={modalStyles.input}/>
                  <label htmlFor="payment-method" style={modalStyles.label}>Payment Method</label>
                  <select id="payment-method" value={paymentType}
                    onChange={(e) => setPaymentType(e.target.value)} style={modalStyles.input}>
                    <option value="full_online">Fully Online</option>
                    <option value="partial">Partial Online / Partial Cash</option>
                    <option value="cash">Full Cash on Delivery</option>
                  </select>
                  {paymentType === 'partial' && (
                    <>
                      <label htmlFor="partial-amount" style={modalStyles.label}>
                        Online Payment Amount (R) <span style={{ color: '#dc2626' }}>* (Minimum R10, Must be less than total)</span>
                      </label>
                      <input 
                        id="partial-amount"
                        type="number" 
                        placeholder="Enter online payment amount"
                        value={partialAmount} 
                        onChange={handlePartialAmountChange}
                        style={modalStyles.input}
                      />
                      <p style={{ fontSize: '0.72rem', color: '#6b7280', marginTop: '-5px', marginBottom: '5px' }}>
                        Cash amount to pay on delivery: R {(Math.max(0, Number(agreedPrice) - Number(partialAmount || 0))).toLocaleString()}
                      </p>
                    </>
                  )}
                </div>
              )}

              {/* ── Trade fields (structured) ── */}
              {purchaseType === 'trade' && (
                <div style={modalStyles.section}>

                  {/* Info banner */}
                  <div style={{
                    display: 'flex', gap: 10, padding: '10px 13px', marginBottom: 16,
                    backgroundColor: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8,
                    fontSize: '0.78rem', color: '#1e40af', fontFamily: 'Segoe UI, system-ui, sans-serif', lineHeight: '1.5',
                  }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0, marginTop: 1 }}>
                      <circle cx="12" cy="12" r="10"/>
                      <line x1="12" y1="8" x2="12" y2="12"/>
                      <line x1="12" y1="16" x2="12.01" y2="16"/>
                    </svg>
                    <span>
                      This information will be used to <strong>verify your item at the trade faculty</strong>.
                      Please be accurate and upload a clear photo.
                    </span>
                  </div>

                  {/* Item name */}
                  <label style={modalStyles.label}>
                    Item Name <span style={{ color: '#dc2626' }}>*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="Describe your trade item (e.g. Sony WH-1000XM4 Headphones)"
                    value={tradeItemName}
                    onChange={(e) => setTradeItemName(e.target.value)}
                    style={modalStyles.input}
                  />

                  {/* Category */}
                  <label style={modalStyles.label}>
                    Category <span style={{ color: '#dc2626' }}>*</span>
                  </label>
                  <select
                    value={tradeItemCategory}
                    onChange={(e) => setTradeItemCategory(e.target.value)}
                    style={{ ...modalStyles.input, color: tradeItemCategory ? '#1a1a1a' : '#9ca3af' }}
                  >
                    <option value="" disabled>Select a category…</option>
                    {TRADE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>

                  {/* Condition */}
                  <label style={modalStyles.label}>
                    Condition <span style={{ color: '#dc2626' }}>*</span>
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6, marginBottom: 14 }}>
                    {TRADE_CONDITIONS.map(({ label, color, bg, border }) => (
                      <button
                        key={label}
                        type="button"
                        onClick={() => setTradeItemCondition(label)}
                        style={{
                          padding: '8px 4px',
                          borderRadius: 8,
                          border: `2px solid ${tradeItemCondition === label ? color : '#e5e7eb'}`,
                          backgroundColor: tradeItemCondition === label ? bg : '#fff',
                          color: tradeItemCondition === label ? color : '#6b7280',
                          fontWeight: tradeItemCondition === label ? '700' : '500',
                          fontSize: '0.7rem',
                          cursor: 'pointer',
                          fontFamily: 'Segoe UI, system-ui, sans-serif',
                          transition: 'all 0.15s',
                          lineHeight: '1.3',
                        }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  {/* Description */}
                  <label style={modalStyles.label}>
                    Description{' '}
                    <span style={{ color: '#6b7280', fontWeight: '400' }}>(optional)</span>
                  </label>
                  <textarea
                    placeholder="Brand, model, age, included accessories, any defects…"
                    value={tradeItemDesc}
                    onChange={(e) => setTradeItemDesc(e.target.value)}
                    style={{ ...modalStyles.textarea, marginBottom: 14 }}
                  />

                  {/* Image upload */}
                  <label style={modalStyles.label}>
                    Photo of your item <span style={{ color: '#dc2626' }}>*</span>
                    <span style={{ color: '#6b7280', fontWeight: '400', marginLeft: 4 }}>(for verification)</span>
                  </label>

                  {tradeImagePreview ? (
                    <div style={{ position: 'relative', marginBottom: 4 }}>
                      <img
                        src={tradeImagePreview}
                        alt="Trade item preview"
                        style={{
                          width: '100%', maxHeight: 200, objectFit: 'cover',
                          borderRadius: 10, border: '2px solid #86efac', display: 'block',
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (tradeImagePreview) URL.revokeObjectURL(tradeImagePreview);
                          setTradeImageFile(null);
                          setTradeImagePreview(null);
                        }}
                        style={{
                          position: 'absolute', top: 8, right: 8,
                          background: 'rgba(0,0,0,0.55)', border: 'none', color: '#fff',
                          width: 28, height: 28, borderRadius: '50%', cursor: 'pointer',
                          fontSize: '0.85rem', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}
                        aria-label="Remove image"
                      >✕</button>
                      <p style={{ fontSize: '0.72rem', color: '#16a34a', margin: '6px 0 0', fontFamily: 'Segoe UI, system-ui, sans-serif' }}>
                        ✓ Photo ready
                      </p>
                    </div>
                  ) : (
                    <label
                      htmlFor="trade-image-upload"
                      style={{
                        display: 'flex', flexDirection: 'column', alignItems: 'center',
                        justifyContent: 'center', gap: 8, padding: '20px 16px',
                        border: '2px dashed #d1d5db', borderRadius: 10, cursor: 'pointer',
                        backgroundColor: '#f9fafb', marginBottom: 4, transition: 'border-color 0.15s',
                      }}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        const file = e.dataTransfer.files[0];
                        if (!file || !file.type.startsWith('image/')) return;
                        if (file.size > 5 * 1024 * 1024) { showToast('Image must be under 5 MB', 'warn'); return; }
                        if (tradeImagePreview) URL.revokeObjectURL(tradeImagePreview);
                        setTradeImageFile(file);
                        setTradeImagePreview(URL.createObjectURL(file));
                      }}
                    >
                      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round">
                        <rect x="3" y="3" width="18" height="18" rx="2"/>
                        <circle cx="8.5" cy="8.5" r="1.5"/>
                        <path d="M21 15l-5-5L5 21"/>
                      </svg>
                      <span style={{ fontSize: '0.82rem', color: '#6b7280', textAlign: 'center', fontFamily: 'Segoe UI, system-ui, sans-serif' }}>
                        Click to upload or drag & drop<br/>
                        <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>JPG, PNG or WEBP · max 5 MB</span>
                      </span>
                      <input
                        id="trade-image-upload"
                        type="file"
                        accept="image/*"
                        style={{ display: 'none' }}
                        onChange={(e) => {
                          const file = e.target.files[0];
                          if (!file) return;
                          if (file.size > 5 * 1024 * 1024) { showToast('Image must be under 5 MB', 'warn'); return; }
                          if (tradeImagePreview) URL.revokeObjectURL(tradeImagePreview);
                          setTradeImageFile(file);
                          setTradeImagePreview(URL.createObjectURL(file));
                          e.target.value = '';
                        }}
                      />
                    </label>
                  )}
                </div>
              )}

              {/* ── Optional terms ── */}
              <div style={modalStyles.section}>
                <label style={modalStyles.label}>Changes to terms (optional)</label>
                <textarea
                  placeholder="E.g. Seller agreed to include charger..."
                  value={terms}
                  onChange={(e) => setTerms(e.target.value)}
                  style={modalStyles.textarea}
                />
              </div>

              <button
                onClick={handleTransaction}
                disabled={submitting || tradeImageUploading}
                style={{
                  ...styles.buyBtn,
                  opacity:         (submitting || tradeImageUploading) ? 0.6 : 1,
                  cursor:          (submitting || tradeImageUploading) ? 'not-allowed' : 'pointer',
                  backgroundColor: (submitting || tradeImageUploading) ? '#a0c4e8' : '#6AA6DA',
                  display:         'flex',
                  alignItems:      'center',
                  justifyContent:  'center',
                  gap:             '8px',
                }}
              >
                {(submitting || tradeImageUploading) && (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
                    style={{ animation: 'spin 0.8s linear infinite', flexShrink: 0 }}>
                    <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                  </svg>
                )}
                {tradeImageUploading ? 'Uploading photo…' : submitting ? 'Sending offer…' : 'Confirm & Send Offer'}
              </button>
            </div>
          </div>
        )}

        {/* Alert Modals */}
        <AlertModal
          open={showPriceAlert}
          onClose={() => setShowPriceAlert(false)}
          title="Validation Error"
          message={alertMessage}
          type="error"
        />

        <AlertModal
          open={showPartialAlert}
          onClose={() => setShowPartialAlert(false)}
          title="Minimum Payment Amount"
          message={alertMessage || "Online payment amount must be at least R10. Please enter a valid amount of R10 or more."}
          type="error"
        />

        <AlertModal
          open={showPartialExceedAlert}
          onClose={() => setShowPartialExceedAlert(false)}
          title="Invalid Amount"
          message={alertMessage || "Partial payment amount cannot exceed the total agreed price."}
          type="error"
        />
      </div>
    </>
  );
}

// ── Route wrapper ─────────────────────────────────────────────────────────────
export default function ListingDetail() {
  const { id }       = useParams();
  const navigate     = useNavigate();
  const [searchParams]                                = useSearchParams();
  const isAdminPreview                                = searchParams.get('preview') === 'true';
  const [listing, setListing]                         = useState(null);
  const [currentUser, setCurrentUser]                 = useState(null);
  const [loading, setLoading]                         = useState(true);
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
          where('buyerId',   '==', currentUser.uid),
          where('status',    '==', 'pending'),
        ));
        if (!snap.empty) setExistingTransaction({ id: snap.docs[0].id, ...snap.docs[0].data() });
      } catch (err) {
        console.error('Failed to check existing transaction:', err);
      }
    }
    checkExisting();
  }, [currentUser, id]);

  if (loading)  return <div style={{ padding: '40px', textAlign: 'center' }}>Loading...</div>;
  if (!listing) return <div style={{ padding: '40px', textAlign: 'center' }}>Listing not found.</div>;

  return (
    <>
      {!isAdminPreview && <NavBarTemp />}
      {!isAdminPreview && (
        <div style={{ padding: '16px 32px' }}>
          <button onClick={() => navigate(-1)} style={styles.backBtn}>← Back to listings</button>
        </div>
      )}
      <ListingDetailView
        listing={listing}
        currentUser={currentUser}
        existingTransaction={existingTransaction}
        navigate={navigate}
        isAdminPreview={isAdminPreview}
      />
    </>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = {
  page:             { display: 'flex', gap: '40px', padding: '24px 32px 48px', width: '100%', margin: '0 auto', flexWrap: 'wrap', backgroundColor: '#fbfbfb', minHeight: '100vh' },
  imageSection:     { flex: '1 1 420px', minWidth: '300px', maxWidth: 600 },
  detailSection:    { flex: '1 1 300px', minWidth: '260px', display: 'flex', flexDirection: 'column', gap: '12px' },
  badgeRow:         { display: 'flex', gap: '8px', flexWrap: 'wrap' },
  badge:            { padding: '4px 12px', borderRadius: '20px', fontSize: '0.75rem', fontWeight: '600', fontFamily: 'Segoe UI, system-ui, sans-serif' },
  title:            { fontSize: '1.5rem', fontWeight: '700', color: '#1a1a1a', margin: '0', fontFamily: 'Segoe UI, system-ui, sans-serif' },
  price:            { fontSize: '1.4rem', fontWeight: '700', color: '#6AA6DA', margin: '0', fontFamily: 'Segoe UI, system-ui, sans-serif' },
  buyBtn:           { width: '100%', padding: '14px', backgroundColor: '#6AA6DA', color: '#fff', border: 'none', borderRadius: '10px', fontSize: '0.95rem', fontWeight: '700', cursor: 'pointer', fontFamily: 'Segoe UI, system-ui, sans-serif' },
  cartBtn:          { width: '100%', padding: '12px', border: '1.5px solid', borderRadius: '10px', fontSize: '0.9rem', fontWeight: '600', cursor: 'pointer', fontFamily: 'Segoe UI, system-ui, sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', transition: 'all 0.18s' },
  messageBtn:       { width: '100%', padding: '11px', backgroundColor: 'transparent', color: '#444', border: '1px solid #6aa6da57', borderRadius: '10px', fontSize: '0.875rem', fontWeight: '500', cursor: 'pointer', fontFamily: 'Segoe UI, system-ui, sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' },
  reportBtn:        { width: '100%', padding: '10px', backgroundColor: 'transparent', color: '#dc2626', border: '1.5px solid #fca5a5', borderRadius: '10px', fontSize: '0.82rem', fontWeight: '500', cursor: 'pointer', fontFamily: 'Segoe UI, system-ui, sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px' },
  pendingBanner:       { display: 'flex', alignItems: 'center', gap: '12px', padding: '16px', backgroundColor: '#fff8e1', border: '1px solid #ffe082', borderRadius: '10px', fontFamily: 'Segoe UI, system-ui, sans-serif' },
  pendingTitle:        { margin: '0 0 4px', fontWeight: '700', fontSize: '0.95rem', color: '#b45309' },
  pendingSubtitle:     { margin: '0', fontSize: '0.85rem', color: '#92400e' },
  ownerBanner:         { display: 'flex', alignItems: 'center', gap: '12px', padding: '16px', backgroundColor: '#e8f4fd', border: '1px solid #90caf9', borderRadius: '10px', fontFamily: 'Segoe UI, system-ui, sans-serif' },
  ownerBannerTitle:    { margin: '0 0 4px', fontWeight: '700', fontSize: '0.95rem', color: '#0d47a1' },
  ownerBannerSubtitle: { margin: '0', fontSize: '0.85rem', color: '#1565c0' },
  sellerCard:    { display: 'flex', alignItems: 'center', gap: '14px', padding: '14px', border: '1px solid #dde3ea', borderRadius: '12px', marginTop: '4px', cursor: 'pointer', backgroundColor: '#fff', transition: 'box-shadow 0.15s', outline: 'none', userSelect: 'none' },
  sellerAvatar:  { width: '46px', height: '46px', borderRadius: '50%', backgroundColor: '#166bc0', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 },
  sellerInitial: { fontSize: '1.1rem', fontWeight: '700', color: '#fff' },
  sellerName:    { margin: '0 0 2px', fontWeight: '600', fontSize: '0.9rem', color: '#1a1a1a', fontFamily: 'Segoe UI, system-ui, sans-serif' },
  sellerSub:     { margin: '0', fontSize: '0.78rem', color: '#6AA6DA', fontFamily: 'Segoe UI, system-ui, sans-serif' },
  sellerChevron: { fontSize: '1.5rem', color: '#bbb', flexShrink: 0 },
  backBtn:       { background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.9rem', color: '#555', padding: '0', fontFamily: 'Segoe UI, system-ui, sans-serif' },
  specBox:   { backgroundColor: '#f0f6ff', border: '1px solid #bdd6f0', borderLeft: '4px solid #6AA6DA', borderRadius: '10px', padding: '12px 14px' },
  specLabel: { fontSize: '0.7rem', fontWeight: '700', color: '#6AA6DA', textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 6px', display: 'flex', alignItems: 'center', fontFamily: 'Segoe UI, system-ui, sans-serif' },
  specText:  { fontSize: '0.85rem', color: '#1e3a5f', lineHeight: '1.6', fontFamily: 'Segoe UI, system-ui, sans-serif', margin: '0', whiteSpace: 'pre-wrap' },
  descBox:   { backgroundColor: '#fdf6ee', border: '1px solid #f0dfc0', borderLeft: '4px solid #e8a838', borderRadius: '10px', padding: '12px 14px' },
  descLabel: { fontSize: '0.7rem', fontWeight: '700', color: '#c07a10', textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 6px', display: 'flex', alignItems: 'center', fontFamily: 'Segoe UI, system-ui, sans-serif' },
  descText:  { fontSize: '0.85rem', color: '#4a3000', lineHeight: '1.6', fontFamily: 'Segoe UI, system-ui, sans-serif', margin: '0', whiteSpace: 'pre-wrap' },
};

const modalStyles = {
  overlay:   { position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 },
  modal:     { backgroundColor: 'white', padding: '28px', borderRadius: '16px', width: '90%', maxWidth: '500px', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 10px 30px rgba(0,0,0,0.2)', fontFamily: 'Segoe UI, system-ui, sans-serif' },
  header:    { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' },
  closeBtn:  { background: '#f3f4f6', border: 'none', cursor: 'pointer', color: '#555', width: '32px', height: '32px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  section:   { marginBottom: '18px' },
  label:     { display: 'block', fontWeight: '600', marginBottom: '8px', fontSize: '13px', color: '#333' },
  input:     { width: '100%', padding: '11px 13px', borderRadius: '8px', border: '1.5px solid #e2e8f0', marginBottom: '10px', boxSizing: 'border-box', fontSize: '14px', fontFamily: 'inherit', outline: 'none' },
  textarea:  { width: '100%', padding: '11px 13px', borderRadius: '8px', border: '1.5px solid #e2e8f0', height: '80px', boxSizing: 'border-box', fontFamily: 'inherit', fontSize: '14px', outline: 'none', resize: 'vertical' },
  choiceBtn: { flex: 1, padding: '12px', borderRadius: '8px', border: '1.5px solid #6AA6DA', cursor: 'pointer', backgroundColor: '#f0f7ff', color: '#166bc0', fontWeight: '600', fontFamily: 'inherit' },
};