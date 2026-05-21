import { onAuthStateChanged } from 'firebase/auth';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { auth, db } from '../firebase';
import {
  doc, getDoc, updateDoc, collection, query,
  where, getDocs, deleteDoc, onSnapshot,
} from 'firebase/firestore';
import { updateProfile } from 'firebase/auth';
import ProfileListingCard from './ProfileListingCard';
import OfferItem from './OfferItem';
import styles from './Profile.module.css';
import ProfileRating from './ProfileRating';
import WalletTab from './WalletTab';

const toRawListingType = (displayType) => {
  if (!displayType) return displayType;
  const t = displayType.toString().toLowerCase().trim();
  if (t === 'for sale')          return 'sale';
  if (t === 'for trade')         return 'trade';
  if (t === 'for sale or trade') return 'either';
  if (t === 'sale' || t === 'trade' || t === 'either') return t;
  return displayType;
};

const HISTORY_STATUSES   = new Set(['sold', 'completed', 'traded']);
const READONLY_STATUSES  = new Set(['accepted']);
const ACTIVE_TX_STATUSES = ['completed', 'accepted', 'sold', 'traded'];

const safeNumber = (v) => { const n = Number(v); return isNaN(n) ? 0 : n; };

// ── Trade item detail card (shown in Offers tab) ──────────────────────────────
function TradeItemCard({ tradeItem }) {
  if (!tradeItem) return null;

  if (typeof tradeItem === 'string') {
    return (
      <div className={styles.tradeItemCard}>
        <div className={styles.tradeItemHeader}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/>
            <path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>
          </svg>
          <span>Buyer's Trade Item</span>
        </div>
        <p className={styles.tradeItemLegacyText}>{tradeItem}</p>
      </div>
    );
  }

  const conditionColors = {
    'New':      { color: '#0369a1', bg: '#e0f2fe' },
    'Like New': { color: '#0284c7', bg: '#f0f9ff' },
    'Good':     { color: '#0e7490', bg: '#ecfeff' },
    'Fair':     { color: '#d97706', bg: '#fffbeb' },
    'Poor':     { color: '#dc2626', bg: '#fef2f2' },
  };
  const condStyle = conditionColors[tradeItem.condition] || { color: '#6b7280', bg: '#f3f4f6' };

  return (
    <div className={styles.tradeItemCard}>
      <div className={styles.tradeItemHeader}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/>
          <path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>
        </svg>
        <span>Buyer's Trade Item</span>
      </div>
      <div className={styles.tradeItemBody}>
        {tradeItem.imageUrl && (
          <img src={tradeItem.imageUrl} alt={tradeItem.name} className={styles.tradeItemImage} />
        )}
        <div className={styles.tradeItemInfo}>
          <p className={styles.tradeItemName}>{tradeItem.name}</p>
          <div className={styles.tradeItemMeta}>
            {tradeItem.category && (
              <span className={styles.tradeItemChip} style={{ background: '#f0f9ff', color: '#0369a1' }}>
                {tradeItem.category}
              </span>
            )}
            {tradeItem.condition && (
              <span className={styles.tradeItemChip} style={{ background: condStyle.bg, color: condStyle.color }}>
                {tradeItem.condition}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Offer card wrapper ────────────────────────────────────────────────────────
function EnrichedOfferCard({ offer, highlighted }) {
  const isTrade = offer.type === 'trade';
  return (
    <div className={`${styles.offerCard} ${highlighted ? styles.highlightedOffer : ''}`}>
      <OfferItem offer={offer} />
      {isTrade && offer.tradeItem && (
        <div style={{ padding: '0 14px 14px' }}>
          <TradeItemCard tradeItem={offer.tradeItem} />
        </div>
      )}
    </div>
  );
}

// ── Main Profile component ────────────────────────────────────────────────────
function Profile() {
  const navigate     = useNavigate();
  const location     = useLocation();
  const fileInputRef = useRef(null);
  const historyItemRefs = useRef({});

  const [loading, setLoading]               = useState(true);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [showRatings, setShowRatings]       = useState(false);
  const [isEditing, setIsEditing]           = useState(false);
  const [incomingOffers, setIncomingOffers] = useState([]);
  const [highlightedOfferId, setHighlightedOfferId]   = useState(null);
  const [highlightedHistoryId, setHighlightedHistoryId] = useState(null);
  const [currentUserId, setCurrentUserId]   = useState(null);

  // Track which completed history items already have a review from this user
  const [reviewedListingIds, setReviewedListingIds] = useState(new Set());

  const [profileData, setProfileData] = useState({
    firstName: '', lastName: '', email: '', bio: '',
    photoURL: '', memberSince: '',
    totalSales: 0, totalTrades: 0, totalBought: 0, rating: 0, totalRatings: 0,
    walletBalance: 0,
  });
  const [editFormData, setEditFormData] = useState({ firstName: '', lastName: '', bio: '' });
  const [history, setHistory]   = useState([]);
  const [listings, setListings] = useState([]);
  const [activeTab, setActiveTab] = useState('history');
  const [editingListingId, setEditingListingId] = useState(null);
  const [editListingData, setEditListingData]   = useState({});

  useEffect(() => {
    const params    = new URLSearchParams(location.search);
    const tab       = params.get('tab');
    const highlight = params.get('highlight');
    if (tab && ['history', 'listings', 'offers', 'wallet'].includes(tab)) setActiveTab(tab);
    if (highlight) {
      if (tab === 'history') {
        setHighlightedHistoryId(highlight);
        // Scroll to the item once it renders — retry a few times in case data is still loading
        let attempts = 0;
        const tryScroll = () => {
          const el = historyItemRefs.current[highlight];
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          } else if (attempts < 10) {
            attempts++;
            setTimeout(tryScroll, 400);
          }
        };
        setTimeout(tryScroll, 300);
        setTimeout(() => setHighlightedHistoryId(null), 4000);
      } else {
        setHighlightedOfferId(highlight);
        setTimeout(() => setHighlightedOfferId(null), 3000);
      }
    }
  }, [location.search]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user) { navigate('/login'); return; }
      setCurrentUserId(user.uid);
      fetchUserData(user);

      const unsubOffers = onSnapshot(
        query(collection(db, 'transactions'), where('sellerId', '==', user.uid), where('status', '==', 'pending')),
        (snap) => setIncomingOffers(snap.docs.map(d => {
          const data = d.data();
          return { id: d.id, ...data, tradeItem: data.tradeItemDetails ?? data.tradeItem ?? null };
        }))
      );
      return () => unsubOffers();
    });
    return () => unsub();
  }, [navigate]);

  // ── Fetch which listings the current user has already reviewed ────────────
  const fetchReviewedListings = async (uid) => {
    try {
      const snap = await getDocs(query(
        collection(db, 'reviews'),
        where('reviewerUserId', '==', uid),
      ));
      const ids = new Set(snap.docs.map(d => d.data().listingId).filter(Boolean));
      setReviewedListingIds(ids);
    } catch (err) {
      console.warn('fetchReviewedListings:', err);
    }
  };

  const fetchUserData = async (user) => {
    try {
      const docSnap = await getDoc(doc(db, 'users', user.uid));
      if (!docSnap.exists()) return;

      const d = docSnap.data();
      setHistory(d.history || []);

      const COMPLETED_STATUSES = ['completed', 'sold', 'traded'];
      const [reviewSnap, completedAsSellerSnap, completedAsBuyerSnap] = await Promise.all([
        getDocs(query(collection(db, 'reviews'), where('reviewedUserId', '==', user.uid))),
        getDocs(query(collection(db, 'transactions'), where('sellerId', '==', user.uid), where('status', 'in', COMPLETED_STATUSES))),
        getDocs(query(collection(db, 'transactions'), where('buyerId',  '==', user.uid), where('status', 'in', COMPLETED_STATUSES))),
      ]);

      let liveRating = 0, liveTotalRatings = 0;
      if (!reviewSnap.empty) {
        const ratings = reviewSnap.docs.map(r => safeNumber(r.data().rating)).filter(r => r > 0);
        liveTotalRatings = ratings.length;
        liveRating = liveTotalRatings > 0
          ? Math.round((ratings.reduce((a, b) => a + b, 0) / liveTotalRatings) * 10) / 10
          : 0;
      }

      const liveTotalSales  = completedAsSellerSnap.docs.filter(tx => (tx.data().type ?? '').toLowerCase() !== 'trade').length;
      const liveTotalTrades = completedAsSellerSnap.docs.filter(tx => (tx.data().type ?? '').toLowerCase() === 'trade').length;
      const liveTotalBought = completedAsBuyerSnap.docs.length;

      const updates = {};
      if (liveRating       !== safeNumber(d.rating))       updates.rating       = liveRating;
      if (liveTotalRatings !== safeNumber(d.totalRatings)) updates.totalRatings = liveTotalRatings;
      if (liveTotalSales   !== safeNumber(d.totalSales))   updates.totalSales   = liveTotalSales;
      if (liveTotalTrades  !== safeNumber(d.totalTrades))  updates.totalTrades  = liveTotalTrades;
      if (liveTotalBought  !== safeNumber(d.totalBought))  updates.totalBought  = liveTotalBought;
      if (Object.keys(updates).length > 0) updateDoc(doc(db, 'users', user.uid), updates).catch(() => {});

      setProfileData({
        ...d,
        email:        d.email    || user.email,
        photoURL:     d.photoURL || user.photoURL || '',
        memberSince:  user.metadata.creationTime
          ? new Date(user.metadata.creationTime).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
          : 'Unknown',
        totalSales:   liveTotalSales,
        totalTrades:  liveTotalTrades,
        totalBought:  liveTotalBought,
        rating:       liveRating,
        totalRatings: liveTotalRatings,
        walletBalance: safeNumber(d.walletBalance ?? 0),
      });
      setEditFormData({ firstName: d.firstName || '', lastName: d.lastName || '', bio: d.bio || '' });
      fetchUserListings(user.uid);
      fetchUserPurchases(user.uid);
      fetchReviewedListings(user.uid);
    } catch (err) {
      console.error('fetchUserData error:', err);
    } finally {
      setLoading(false);
    }
  };

  async function getUserName(uid) {
    if (!uid) return null;
    try {
      const s = await getDoc(doc(db, 'users', uid));
      if (!s.exists()) return null;
      const sd = s.data();
      return `${sd.firstName || ''} ${sd.lastName || ''}`.trim() || sd.displayName || null;
    } catch { return null; }
  }

  const fetchUserListings = async (uid) => {
    try {
      const snap = await getDocs(query(collection(db, 'listings'), where('sellerUID', '==', uid)));
      const all = snap.docs.map(d => ({
        id: d.id, ...d.data(),
        specification: d.data().specification || '',
        date:  d.data().timestamp?.toDate?.() || new Date(d.data().timestamp),
        views: d.data().views || 0,
        likes: d.data().likes || 0,
      }));
      // Resolve listing visibility based on cancellation reason:
      // - buyer_no_collection → listing should disappear (mark cancelled locally)
      // - seller_no_dropoff   → listing should go back up (mark available locally)
      const acceptedItems = all.filter(l => l.status?.toLowerCase() === 'accepted');
      const cancelledItems = all.filter(l => l.status?.toLowerCase() === 'cancelled');
      const needsCheck = [...acceptedItems, ...cancelledItems];

      let noCollectionIds = new Set();   // buyer didn't collect  → hide
      let noDropoffIds    = new Set();   // seller didn't dropoff → show as active

      if (needsCheck.length) {
        await Promise.all(needsCheck.map(async (l) => {
          try {
            const txSnap = await getDocs(query(
              collection(db, 'transactions'),
              where('listingId', '==', l.id),
              where('status', '==', 'overdue_cancelled'),
            ));
            if (txSnap.empty) return;
            const reason = txSnap.docs[0].data().cancelReason;
            if (reason === 'buyer_no_collection') noCollectionIds.add(l.id);
            if (reason === 'seller_no_dropoff')   noDropoffIds.add(l.id);
          } catch { }
        }));
      }

      const resolved = all.map(l => {
        if (noCollectionIds.has(l.id)) return { ...l, status: 'cancelled' };
        if (noDropoffIds.has(l.id))    return { ...l, status: 'available' };
        return l;
      });
      setListings(resolved);

      const doneItems = resolved.filter(l => HISTORY_STATUSES.has(l.status?.toLowerCase()));
      if (doneItems.length) {
        const coveredByTx = await Promise.all(
          doneItems.map(async (l) => {
            try {
              const txSnap = await getDocs(query(
                collection(db, 'transactions'),
                where('listingId', '==', l.id),
                where('status', 'in', ACTIVE_TX_STATUSES),
              ));
              return txSnap.empty ? null : l.id;
            } catch { return null; }
          })
        );
        const coveredIds = new Set(coveredByTx.filter(Boolean));

        setHistory(prev => {
          const existingIds = new Set(prev.map(h => h.id));
          const newItems = doneItems
            .filter(l => !existingIds.has(l.id) && !coveredIds.has(l.id))
            .map(l => ({
              id: l.id, item: l.title, type: 'sale', side: 'seller',
              date: l.date, price: l.price != null ? `R${Number(l.price).toLocaleString()}` : null,
              buyer: null, status: 'sold', listingImage: l.photos?.[0] || l.imageUrl || null,
            }));
          return newItems.length ? [...prev, ...newItems] : prev;
        });

        Promise.all(doneItems.map(async (l) => {
          let buyerName = null, date = l.date;
          try {
            const txSnap = await getDocs(query(collection(db, 'Purchases'), where('listingId', '==', l.id)));
            if (!txSnap.empty) {
              const tx = txSnap.docs[0].data();
              buyerName = tx.buyerName || null;
              if (!buyerName && tx.buyerId) buyerName = await getUserName(tx.buyerId);
              const rawDate = tx.updatedAt || tx.createdAt;
              if (rawDate) date = rawDate?.toDate ? rawDate.toDate() : new Date(rawDate);
            }
          } catch { }
          return { id: l.id, buyerName, date };
        })).then(enriched => {
          setHistory(prev => prev.map(h => {
            const match = enriched.find(e => e.id === h.id);
            if (!match) return h;
            return { ...h, buyer: match.buyerName || h.buyer, date: match.date || h.date };
          }));
        });
      }
    } catch (err) { console.error('fetchUserListings:', err); }
  };

  const fetchUserPurchases = async (uid) => {
    try {
      const [asBuyerSnap, asSellerSnap, asSellerCancelledSnap] = await Promise.all([
        getDocs(query(collection(db, 'transactions'), where('buyerId',  '==', uid), where('status', 'in', ['completed', 'overdue_cancelled']))),
        getDocs(query(collection(db, 'transactions'), where('sellerId', '==', uid), where('status', '==', 'completed'))),
        getDocs(query(collection(db, 'transactions'), where('sellerId', '==', uid), where('status', '==', 'overdue_cancelled'))),
      ]);

      const seen = new Set();
      const allDocs = [
        ...asBuyerSnap.docs.map(d  => ({ d, side: 'buyer' })),
        ...asSellerSnap.docs.map(d => ({ d, side: 'seller' })),
        ...asSellerCancelledSnap.docs.map(d => ({ d, side: 'seller' })),
      ].filter(({ d }) => {
        if (seen.has(d.id)) return false;
        seen.add(d.id);
        return true;
      });
      if (allDocs.length === 0) return;

      const enriched = await Promise.all(
        allDocs.map(async ({ d: txDoc, side }) => {
          const p      = txDoc.data();
          const type   = p.type?.toLowerCase?.() ?? 'sale';
          const isTrade = type === 'trade';
          let itemTitle = p.listingTitle || null, listingImage = p.listingImage || p.productImage || null;
          let price = p.price ?? p.amount ?? p.agreedPrice ?? null;

          if (p.listingId && (!itemTitle || !listingImage)) {
            try {
              const ls = await getDoc(doc(db, 'listings', p.listingId));
              if (ls.exists()) {
                const ld = ls.data();
                itemTitle    = itemTitle    || ld.title       || null;
                listingImage = listingImage || ld.photos?.[0] || ld.imageUrl || null;
                price        = price        ?? ld.price;
              }
            } catch { }
          }
          itemTitle = itemTitle || (side === 'buyer' ? 'Purchase' : 'Sale');

          let otherName = null, otherUserId = null;
          if (side === 'buyer') {
            otherUserId = p.sellerId || null;
            otherName   = p.sellerName || await getUserName(p.sellerId);
          } else {
            otherUserId = p.buyerId || null;
            otherName   = p.buyerName  || await getUserName(p.buyerId);
          }

          const rawDate = p.completedAt || p.updatedAt || p.createdAt;
          const date    = rawDate?.toDate ? rawDate.toDate() : rawDate ? new Date(rawDate) : new Date();
          const tradeItem = p.tradeItemDetails ?? p.tradeItem ?? null;

          return {
            id:           txDoc.id,
            listingId:    p.listingId || null,
            item:         itemTitle,
            type:         isTrade ? 'trade' : side === 'buyer' ? 'purchase' : 'sale',
            side,
            date,
            price:        price != null ? `R${Number(price).toLocaleString()}` : null,
            seller:       side === 'buyer'  ? otherName   : null,
            sellerId:     side === 'buyer'  ? otherUserId : null,
            sellerName:   side === 'buyer'  ? otherName   : null,
            buyer:        side === 'seller' ? otherName   : null,
            buyerId:      side === 'seller' ? otherUserId : null,
            buyerName:    side === 'seller' ? otherName   : null,
            tradeItem,
            listingImage,
            status:       p.status       || null,
            cancelReason: p.cancelReason || null,
          };
        })
      );

      setHistory(prev => {
        const existingIds = new Set(prev.map(h => h.id));
        const newItems    = enriched.filter(e => !existingIds.has(e.id));
        return newItems.length ? [...prev, ...newItems] : prev;
      });
    } catch (err) { console.warn('fetchUserPurchases:', err); }
    finally { setHistoryLoading(false); }
  };

  const handleInputChange  = (e) => { const { name, value } = e.target; setEditFormData(prev => ({ ...prev, [name]: value })); };

  const handlePhotoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const user = auth.currentUser;
      if (!user) return;
      const formData = new FormData();
      formData.append('file', file);
      formData.append('upload_preset', import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET);
      const res  = await fetch(`https://api.cloudinary.com/v1_1/${import.meta.env.VITE_CLOUDINARY_CLOUD_NAME}/image/upload`, { method: 'POST', body: formData });
      if (!res.ok) throw new Error('Upload failed');
      const data = await res.json();
      const photoURL = data.secure_url;
      await updateProfile(user, { photoURL });
      await updateDoc(doc(db, 'users', user.uid), { photoURL });
      setProfileData(prev => ({ ...prev, photoURL }));
    } catch (err) { console.error(err); alert('Failed to upload photo.'); }
  };

  const handleSave = async () => {
    try {
      const user = auth.currentUser;
      if (!user) return;
      await updateProfile(user, { displayName: `${editFormData.firstName} ${editFormData.lastName}` });
      await updateDoc(doc(db, 'users', user.uid), { ...editFormData, updatedAt: new Date() });
      setProfileData(prev => ({ ...prev, ...editFormData }));
      setIsEditing(false);
    } catch (err) { console.error(err); alert('Failed to save.'); }
  };

  const handleCancel = () => {
    setEditFormData({ firstName: profileData.firstName, lastName: profileData.lastName, bio: profileData.bio });
    setIsEditing(false);
  };

  const handleDeleteListing = async (listingId) => {
    if (!window.confirm('Delete this listing? This cannot be undone.')) return;
    try {
      await deleteDoc(doc(db, 'listings', listingId));
      setListings(prev => prev.filter(l => l.id !== listingId));
    } catch { alert('Failed to delete.'); }
  };

  const handleEditListing = (listing) => {
    setEditingListingId(listing.id);
    setEditListingData({
      title: listing.title || '', price: listing.price || '',
      condition: listing.condition || '', listingType: listing.listingType || '',
      specification: listing.specification || '', description: listing.description || '',
    });
  };

  const handleSaveListing = async (listingId) => {
    try {
      const rawListingType = toRawListingType(editListingData.listingType);
      await updateDoc(doc(db, 'listings', listingId), {
        title: editListingData.title, price: parseFloat(editListingData.price),
        condition: editListingData.condition, listingType: rawListingType,
        specification: editListingData.specification, description: editListingData.description,
        updatedAt: new Date(),
      });
      setListings(prev => prev.map(l =>
        l.id === listingId ? { ...l, ...editListingData, listingType: rawListingType, price: parseFloat(editListingData.price) } : l
      ));
      setEditingListingId(null);
      setEditListingData({});
    } catch { alert('Failed to update.'); }
  };

  // ── Navigate to ReviewForm ────────────────────────────────────────────────
  const handleRate = (item) => {
    // The current user is reviewing the OTHER party.
    // If I'm the buyer → I review the seller. If I'm the seller → I review the buyer.
    const isBuyer       = item.side === 'buyer' || item.type === 'purchase';
    const reviewedId    = isBuyer ? item.sellerId   : item.buyerId;
    const reviewedName  = isBuyer ? item.sellerName : item.buyerName;
    const role          = isBuyer ? 'seller' : 'buyer';

    if (!reviewedId || !item.listingId) return;

    const params = new URLSearchParams({
      reviewedUserId: reviewedId,
      name:           reviewedName || '',
      role,
      purchaseId:     item.id,
    });
    navigate(`/review/${item.listingId}?${params.toString()}`);
  };

  const renderStars = (rating) => {
    const full = Math.floor(rating);
    const half = rating % 1 >= 0.5;
    return Array.from({ length: 5 }, (_, i) => {
      if (i < full)           return <i key={i} className="fas fa-star" />;
      if (i === full && half) return <i key={i} className="fas fa-star-half-alt" />;
      return                         <i key={i} className="far fa-star" />;
    });
  };
  const handleBalanceUpdate = useCallback((newBalance) => {
    setProfileData(prev => ({ ...prev, walletBalance: newBalance }));
    updateDoc(doc(db, 'users', currentUserId), { walletBalance: newBalance })
      .catch(console.error);
  }, [currentUserId]);


  if (loading) return (
    <div className={styles.loadingContainer}>
      <div className={styles.loader}>
        <i className="fas fa-spinner fa-spin" /><p>Loading Profile...</p>
      </div>
    </div>
  );

  if (showRatings) return <ProfileRating onClose={() => setShowRatings(false)} />;

  const totalSales   = safeNumber(profileData.totalSales);
  const totalTrades  = safeNumber(profileData.totalTrades);
  const totalBought  = safeNumber(profileData.totalBought);
  const walletBal    = safeNumber(profileData.walletBalance);

  const activeListings   = listings.filter(l => !HISTORY_STATUSES.has(l.status?.toLowerCase?.()) && !READONLY_STATUSES.has(l.status?.toLowerCase?.()) && l.status?.toLowerCase?.() !== 'cancelled');
  const acceptedListings = listings.filter(l => READONLY_STATUSES.has(l.status?.toLowerCase?.()));
  const sortedHistory    = [...history].sort((a, b) => new Date(b.date) - new Date(a.date));

  return (
    <div className={styles.profileContainer}>
      <div className={styles.header}>
        <button className={styles.backButton} onClick={() => navigate(-1)}><i className="fas fa-arrow-left" /></button>
        <h1>My Profile</h1>
      </div>

      {profileData.warnings && profileData.warnings.length > 0 && (
        <div style={{ margin: '0 0 16px', padding: '14px 18px', background: '#fffbeb', border: '1.5px solid #fcd34d', borderRadius: 10, display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <i className="fas fa-exclamation-triangle" style={{ color: '#d97706', marginTop: 2, flexShrink: 0 }} />
          <div>
            <p style={{ margin: '0 0 4px', fontWeight: 700, fontSize: '0.9rem', color: '#92400e' }}>
              Account Warning{profileData.warnings.length > 1 ? `s (${profileData.warnings.length})` : ''}
            </p>
            {profileData.warnings.map((w, i) => (
              <p key={i} style={{ margin: '2px 0', fontSize: '0.82rem', color: '#78350f' }}>
                {profileData.warnings.length > 1 ? `${i + 1}. ` : ''}{w.reason}
                {w.warnedAt && (
                  <span style={{ color: '#a16207', marginLeft: 6, fontSize: '0.75rem' }}>
                    · {new Date(w.warnedAt?.toDate ? w.warnedAt.toDate() : w.warnedAt).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </span>
                )}
              </p>
            ))}
          </div>
        </div>
      )}

      <div className={styles.profileCard}>
        <div className={styles.profileLeft}>
          <div className={styles.profilePictureSection}>
            <div className={styles.profilePictureWrapper}>
              <img src={profileData.photoURL || '/default-avatar.png'} alt="Profile" className={styles.profilePicture}
                onError={e => { e.target.src = '/default-avatar.png'; }} />
              {isEditing && <button className={styles.editPhotoButton} onClick={() => fileInputRef.current?.click()}><i className="fas fa-camera" /></button>}
              <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handlePhotoUpload} />
            </div>
          </div>
          <div className={styles.userInfo}>
            {isEditing ? (
              <div className={styles.editForm}>
                <div className={styles.formGroup}><label>First Name</label><input type="text" name="firstName" value={editFormData.firstName} disabled className={styles.disabledInput} /></div>
                <div className={styles.formGroup}><label>Surname</label><input type="text" name="lastName" value={editFormData.lastName} disabled className={styles.disabledInput} /></div>
                <div className={styles.formGroup}><label>Bio</label><textarea name="bio" value={editFormData.bio} onChange={handleInputChange} placeholder="Tell us about yourself..." rows="3" /></div>
              </div>
            ) : (
              <>
                <h2>{profileData.firstName} {profileData.lastName}</h2>
                <p className={styles.bio}>{profileData.bio || 'No bio yet. Click edit to add one!'}</p>
                <div className={styles.memberSince}><i className="fas fa-calendar-alt" /><span>Member since {profileData.memberSince}</span></div>
              </>
            )}
          </div>
        </div>

        <div className={styles.statsSection}>
          <div className={styles.rating}>
            <div className={styles.ratingStars}>{renderStars(profileData.rating)}</div>
            <span className={styles.ratingValue}>{safeNumber(profileData.rating).toFixed(1)}</span>
            <span className={styles.totalRatings}>({safeNumber(profileData.totalRatings)} ratings)</span>
            <button className={styles.viewRatingsLink} onClick={() => setShowRatings(true)} title="View all your ratings and reviews">
              <i className="fas fa-chevron-right" /> View reviews
            </button>
          </div>
          <div className={styles.statsGrid}>
            <div className={styles.statItem}><i className="fas fa-tag" /><div className={styles.statInfo}><span className={styles.statValue}>{totalSales}</span><span className={styles.statLabel}>Sales</span></div></div>
            <div className={styles.statItem}><i className="fas fa-exchange-alt" /><div className={styles.statInfo}><span className={styles.statValue}>{totalTrades}</span><span className={styles.statLabel}>Trades</span></div></div>
            <div className={styles.statItem}><i className="fas fa-shopping-bag" /><div className={styles.statInfo}><span className={styles.statValue}>{totalBought}</span><span className={styles.statLabel}>Bought</span></div></div>

            {/* ── Wallet balance mini-card ── */}
            <div className={styles.statItem} style={{ gridColumn: 'span 3' }}>
              <div className={styles.walletStatCard}>
                <div className={styles.walletStatLeft}>
                  <i className="fas fa-wallet" />
                  <div className={styles.statInfo}>
                    <span className={styles.statValue}>
                      R{walletBal.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                    <span className={styles.statLabel}>Wallet Balance</span>
                  </div>
                </div>
                <button
                  className={styles.walletStatHint}
                  onClick={() => setActiveTab('wallet')}
                >
                  Top up or withdraw in the <strong>Wallet</strong> tab
                  <i className="fas fa-arrow-right" />
                </button>
              </div>
            </div>
          </div>
          {isEditing ? (
            <div className={styles.editActions}>
              <button className={styles.saveButton} onClick={handleSave}><i className="fas fa-save" /> Save</button>
              <button className={styles.cancelButton} onClick={handleCancel}>Cancel</button>
            </div>
          ) : (
            <button className={styles.editButton} onClick={() => setIsEditing(true)}><i className="fas fa-pen" /> Edit Profile</button>
          )}
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className={styles.tabsSection}>
        <div className={styles.tabs}>
          <button className={`${styles.tab} ${activeTab === 'history'  ? styles.activeTab : ''}`} onClick={() => setActiveTab('history')}><i className="fas fa-history" /> History</button>
          <button className={`${styles.tab} ${activeTab === 'listings' ? styles.activeTab : ''}`} onClick={() => setActiveTab('listings')}><i className="fas fa-list" /> My Listings ({activeListings.length + acceptedListings.length})</button>
          <button className={`${styles.tab} ${activeTab === 'offers'   ? styles.activeTab : ''}`} onClick={() => setActiveTab('offers')}><i className="fas fa-hand-holding-usd" /> Offers ({incomingOffers.length})</button>
          <button className={`${styles.tab} ${activeTab === 'wallet'   ? styles.activeTab : ''}`} onClick={() => setActiveTab('wallet')}><i className="fas fa-wallet" /> Wallet</button>
        </div>

        {/* ── History Tab ── */}
        {activeTab === 'history' && (
          <div className={styles.tabContent}>
            {historyLoading ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px 0', gap: 12, color: '#6b7280' }}>
                <i className="fas fa-spinner fa-spin" style={{ fontSize: '1.6rem' }} />
                <p style={{ margin: 0, fontSize: '0.9rem' }}>Loading history...</p>
              </div>
            ) : sortedHistory.length === 0 ? (
              <div className={styles.emptyState}><i className="fas fa-shopping-bag" /><p>No transaction history yet</p></div>
            ) : (
              <div className={styles.historyList}>
                {sortedHistory.map(item => {
                  const isBuyer    = item.side === 'buyer' || item.type === 'purchase';
                  const isTrade    = item.type === 'trade';
                  const isCompleted = item.status === 'completed' || item.status === 'sold' || item.status === 'traded';
                  const isCancelled = item.status === 'overdue_cancelled';
                  const isHighlighted = item.id === highlightedHistoryId;

                  // Derive a human-readable cancel reason
                  let cancelReasonLabel = 'Transaction cancelled';
                  let cancelReasonIcon  = 'fa-ban';
                  let badgeLabel        = 'Cancelled';
                  if (isCancelled) {
                    if (item.cancelReason === 'buyer_no_collection') {
                      cancelReasonLabel = isBuyer
                        ? 'Cancelled — you did not collect in time'
                        : 'Cancelled — buyer did not collect · item held at facility for your return';
                      cancelReasonIcon = 'fa-clock-rotate-left';
                      badgeLabel       = 'Non-Collection';
                    } else if (item.cancelReason === 'seller_no_dropoff') {
                      cancelReasonLabel = isBuyer
                        ? 'Cancelled — seller did not drop off in time'
                        : 'Cancelled — you did not drop off in time';
                      cancelReasonIcon = 'fa-clock-rotate-left';
                      badgeLabel       = 'No Drop-off';
                    }
                  }

                  // Show Rate button only for completed (non-cancelled, non-trade) transactions
                  const canRate = isCompleted
                    && !isCancelled
                    && !isTrade
                    && item.listingId
                    && !reviewedListingIds.has(item.listingId)
                    && (isBuyer ? !!item.sellerId : !!item.buyerId);

                  const otherParty = isBuyer ? item.seller : item.buyer;
                  const dateStr    = item.date
                    ? new Date(item.date).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })
                    : null;

                  let tradeItemDisplay = null;
                  if (isTrade && item.tradeItem) {
                    tradeItemDisplay = typeof item.tradeItem === 'string' ? item.tradeItem : item.tradeItem?.name || null;
                  }

                  return (
                    <div
                      key={item.id}
                      ref={el => { historyItemRefs.current[item.id] = el; }}
                      className={styles.historyItem}
                      style={{
                        ...(isCancelled ? { filter: 'grayscale(1)', opacity: 0.75 } : {}),
                        ...(isHighlighted ? {
                          outline: '2.5px solid #6366f1',
                          boxShadow: '0 0 0 4px rgba(99,102,241,0.15)',
                          borderRadius: 10,
                          filter: 'none',
                          opacity: 1,
                          transition: 'box-shadow 0.3s',
                        } : {}),
                      }}
                    >
                      <div className={styles.historyImg}>
                        {item.listingImage
                          ? <img src={item.listingImage} alt={item.item} />
                          : <div className={styles.historyImgPlaceholder}><i className="fas fa-image" /></div>}
                        <span className={`${styles.historyTypeDot} ${
                          isCancelled              ? styles.historyTypeDotCancelled
                          : item.type === 'purchase' ? styles.historyTypeDotBought
                          : isTrade                  ? styles.historyTypeDotTrade
                          : styles.historyTypeDotSold}`}>
                          {isCancelled                                            && <i className="fas fa-clock-rotate-left" />}
                          {!isCancelled && item.type === 'purchase'               && <i className="fas fa-shopping-cart" />}
                          {!isCancelled && item.type === 'sale'                   && <i className="fas fa-tag" />}
                          {!isCancelled && isTrade                                && <i className="fas fa-exchange-alt" />}
                        </span>
                      </div>
                      <div className={styles.historyDetails}>
                        <h4 className={styles.historyItemTitle}>{item.item}</h4>
                        <div className={styles.historyMeta}>
                          {dateStr && <span className={styles.historyMetaChip}><i className="fas fa-calendar-alt" /> {dateStr}</span>}
                          {otherParty && <span className={styles.historyMetaChip}><i className={`fas ${isBuyer ? 'fa-store' : 'fa-user'}`} />{isBuyer ? `From: ${otherParty}` : `To: ${otherParty}`}</span>}
                          {item.price && !isTrade && !isCancelled && <span className={styles.historyMetaPrice}>{item.price}</span>}
                          {tradeItemDisplay && <span className={styles.historyMetaChip}><i className="fas fa-exchange-alt" /> {isCancelled ? 'Buyer offered:' : 'Traded for:'} {tradeItemDisplay}</span>}
                          {isCancelled && <span className={styles.historyMetaChip} style={{ color: '#6b7280' }}><i className={`fas ${cancelReasonIcon}`} /> {cancelReasonLabel}</span>}
                        </div>

                        {/* ── Rate button ── */}
                        {canRate && (
                          <button
                            className={styles.rateBtn}
                            onClick={() => handleRate(item)}
                          >
                            <i className="fas fa-star" />
                            Rate {isBuyer ? 'seller' : 'buyer'}
                          </button>
                        )}
                      </div>
                      <div className={styles.historyBadgeWrap}>
                        {isCancelled ? (
                          <span className={styles.historyBadge} style={{ background: '#e5e7eb', color: '#6b7280', border: '1px solid #d1d5db' }}>
                            {badgeLabel}
                          </span>
                        ) : (
                          <span className={`${styles.historyBadge} ${item.type === 'purchase' ? styles.historyBadgeBought : isTrade ? styles.historyBadgeTrade : styles.historyBadgeSold}`}>
                            {item.type === 'purchase' && 'Bought'}
                            {item.type === 'sale'     && 'Sold'}
                            {isTrade                  && 'Traded'}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── Listings Tab ── */}
        {activeTab === 'listings' && (
          <div className={styles.tabContent}>
            {activeListings.length === 0 && acceptedListings.length === 0 ? (
              <div className={styles.emptyState}>
                <i className="fas fa-box-open" /><p>No listings yet</p>
                <button className={styles.createListingButton} onClick={() => navigate('/create-listing')}><i className="fas fa-plus" /> Create Your First Listing</button>
              </div>
            ) : (
              <div className={styles.listingsGridCompact}>
                {activeListings.map(listing => (
                  <div key={listing.id} className={styles.listingCardCompact}>
                    <ProfileListingCard
                      listing={listing} isEditing={editingListingId === listing.id}
                      editData={editListingData}
                      onEdit={() => handleEditListing(listing)}
                      onDelete={() => handleDeleteListing(listing.id)}
                      onEditChange={(field, value) => setEditListingData(prev => ({ ...prev, [field]: value }))}
                      onSave={() => handleSaveListing(listing.id)}
                      onCancel={() => { setEditingListingId(null); setEditListingData({}); }}
                      compact={true}
                    />
                  </div>
                ))}
                {acceptedListings.map(listing => (
                  <div key={listing.id} className={`${styles.listingCardCompact} ${styles.listingCardAccepted}`}>
                    <ProfileListingCard
                      listing={listing} isEditing={false} editData={{}}
                      onEdit={null} onDelete={() => handleDeleteListing(listing.id)}
                      onEditChange={() => {}} onSave={() => {}} onCancel={() => {}}
                      compact={true} readOnly={true}
                    />
                    <div className={styles.acceptedBanner}><i className="fas fa-handshake" /><span>Sale in progress</span></div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Offers Tab ── */}
        {activeTab === 'offers' && (
          <div className={styles.tabContent}>
            {incomingOffers.length === 0 ? (
              <div className={styles.emptyState}><i className="fas fa-inbox" /><p>No pending offers</p></div>
            ) : (
              <div className={styles.offersGrid}>
                {incomingOffers.map((offer, i) => (
                  <div key={offer.id} style={{ animationDelay: `${i * 60}ms` }}>
                    <EnrichedOfferCard offer={offer} highlighted={highlightedOfferId === offer.id} />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Wallet Tab ── */}
        {activeTab === 'wallet' && currentUserId && (
          <div className={styles.tabContent}>
          <WalletTab
            userId={currentUserId}
            onBalanceUpdate={handleBalanceUpdate}
          />
          </div>
        )}
      </div>
    </div>
  );
}

export default Profile;