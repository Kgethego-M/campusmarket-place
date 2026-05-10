import { onAuthStateChanged } from 'firebase/auth';
import React, { useState, useEffect, useRef } from 'react';
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

const toRawListingType = (displayType) => {
  if (!displayType) return displayType;
  const t = displayType.toString().toLowerCase().trim();
  if (t === 'for sale')          return 'sale';
  if (t === 'for trade')         return 'trade';
  if (t === 'for sale or trade') return 'either';
  if (t === 'sale' || t === 'trade' || t === 'either') return t;
  return displayType;
};

const HISTORY_STATUSES  = new Set(['sold', 'completed', 'traded']);
const READONLY_STATUSES = new Set(['accepted']);

// Any transaction in one of these statuses means the listing is "spoken for"
// and should NOT also appear as a standalone history entry via fetchUserListings.
// This prevents a listing appearing in both the History and Offers tabs.
const ACTIVE_TX_STATUSES = ['completed', 'accepted', 'sold', 'traded'];

function Profile() {
  const navigate     = useNavigate();
  const location     = useLocation();
  const fileInputRef = useRef(null);

  const [loading, setLoading]               = useState(true);
  const [showRatings, setShowRatings]       = useState(false);
  const [isEditing, setIsEditing]           = useState(false);
  const [incomingOffers, setIncomingOffers] = useState([]);
  const [highlightedOfferId, setHighlightedOfferId] = useState(null);

  const [profileData, setProfileData] = useState({
    firstName: '', lastName: '', email: '', bio: '',
    photoURL: '', memberSince: '',
    totalSales: 0, totalTrades: 0, rating: 0, totalRatings: 0,
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
    if (tab && ['history', 'listings', 'offers'].includes(tab)) setActiveTab(tab);
    if (highlight) {
      setHighlightedOfferId(highlight);
      setTimeout(() => setHighlightedOfferId(null), 3000);
    }
  }, [location.search]);

  const safeNumber = (v) => { const n = Number(v); return isNaN(n) ? 0 : n; };

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user) { navigate('/login'); return; }
      fetchUserData(user);

      const unsubOffers = onSnapshot(
        query(collection(db, 'transactions'), where('sellerId', '==', user.uid), where('status', '==', 'pending')),
        (snap) => setIncomingOffers(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      );
      return () => unsubOffers();
    });
    return () => unsub();
  }, [navigate]);

  const fetchUserData = async (user) => {
    try {
      const docSnap = await getDoc(doc(db, 'users', user.uid));
      if (!docSnap.exists()) return;

      const d = docSnap.data();
      setHistory(d.history || []);

      const [, , reviewSnap, allUserListingsSnap, completedTxAsSellerSnap] = await Promise.all([
        fetchUserListings(user.uid),
        fetchUserPurchases(user.uid),
        getDocs(query(collection(db, 'reviews'), where('reviewedUserId', '==', user.uid))),
        getDocs(query(collection(db, 'listings'), where('sellerUID', '==', user.uid))),
        getDocs(query(
          collection(db, 'transactions'),
          where('sellerId', '==', user.uid),
          where('status', 'in', ['completed', 'accepted', 'traded', 'sold'])
        )),
      ]);

      // ── Rating aggregation ──
      let liveRating = 0;
      let liveTotalRatings = 0;
      if (!reviewSnap.empty) {
        const ratings = reviewSnap.docs
          .map(r => safeNumber(r.data().rating))
          .filter(r => r > 0);
        liveTotalRatings = ratings.length;
        liveRating = liveTotalRatings > 0
          ? Math.round((ratings.reduce((a, b) => a + b, 0) / liveTotalRatings) * 10) / 10
          : 0;
      }

      // ── Sales aggregation ──
      const SOLD_STATUSES = new Set(['sold', 'completed', 'traded']);
      const soldListings = allUserListingsSnap.docs.filter(doc => {
        const status = doc.data().status?.toLowerCase?.() ?? '';
        return SOLD_STATUSES.has(status);
      });

      const liveTotalSales = soldListings.filter(doc => {
        const lt = doc.data().listingType?.toLowerCase?.() ?? '';
        return lt !== 'trade';
      }).length;

      const tradedFromListings = soldListings.filter(doc => {
        const lt = doc.data().listingType?.toLowerCase?.() ?? '';
        return lt === 'trade' || doc.data().status?.toLowerCase?.() === 'traded';
      }).length;

      const tradedFromTransactions = completedTxAsSellerSnap.docs.filter(doc => {
        const type = doc.data().type?.toLowerCase?.() ?? '';
        const lt   = doc.data().listingType?.toLowerCase?.() ?? '';
        return type === 'trade' || lt === 'trade';
      }).length;

      const liveTotalTrades = Math.max(tradedFromListings, tradedFromTransactions);

      // ── Sync to Firestore if changed ──
      const updates = {};
      if (liveRating       !== safeNumber(d.rating))       updates.rating       = liveRating;
      if (liveTotalRatings !== safeNumber(d.totalRatings)) updates.totalRatings = liveTotalRatings;
      if (liveTotalSales   !== safeNumber(d.totalSales))   updates.totalSales   = liveTotalSales;
      if (liveTotalTrades  !== safeNumber(d.totalTrades))  updates.totalTrades  = liveTotalTrades;

      if (Object.keys(updates).length > 0) {
        updateDoc(doc(db, 'users', user.uid), updates).catch(() => {});
      }

      setProfileData({
        ...d,
        email:        d.email    || user.email,
        photoURL:     d.photoURL || user.photoURL || '',
        memberSince:  user.metadata.creationTime
          ? new Date(user.metadata.creationTime).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
          : 'Unknown',
        totalSales:   liveTotalSales,
        totalTrades:  liveTotalTrades,
        rating:       liveRating,
        totalRatings: liveTotalRatings,
      });
      setEditFormData({ firstName: d.firstName || '', lastName: d.lastName || '', bio: d.bio || '' });
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

      setListings(all);

      const doneItems = all.filter(l => {
        const s = l.status?.toLowerCase();
        return HISTORY_STATUSES.has(s);
      });

      if (doneItems.length) {
        // FIX: Check for ANY active/completed transaction (not just 'completed') so that
        // listings with 'accepted', 'sold', or 'traded' transactions are also excluded
        // from appearing as standalone history entries. Without this, a listing with an
        // 'accepted' transaction would appear in History even though fetchUserPurchases
        // only pulls 'completed' transactions — causing potential double-display.
        const coveredByTx = await Promise.all(
          doneItems.map(async (l) => {
            try {
              const txSnap = await getDocs(query(
                collection(db, 'transactions'),
                where('listingId', '==', l.id),
                where('status', 'in', ACTIVE_TX_STATUSES),
              ));
              return txSnap.empty ? null : l.id; // null = not covered, id = covered by tx
            } catch { return null; }
          })
        );
        const coveredIds = new Set(coveredByTx.filter(Boolean));

        setHistory(prev => {
          const existingIds = new Set(prev.map(h => h.id));
          const newItems = doneItems
            .filter(l => !existingIds.has(l.id) && !coveredIds.has(l.id))
            .map(l => ({
              id:           l.id,
              item:         l.title,
              type:         'sale',
              side:         'seller',
              date:         l.date,
              price:        l.price != null ? `R${Number(l.price).toLocaleString()}` : null,
              buyer:        null,
              status:       'sold',
              listingImage: l.photos?.[0] || l.imageUrl || null,
            }));
          return newItems.length ? [...prev, ...newItems] : prev;
        });

        Promise.all(doneItems.map(async (l) => {
          let buyerName = null;
          let date = l.date;
          try {
            const txSnap = await getDocs(
              query(collection(db, 'Purchases'), where('listingId', '==', l.id))
            );
            if (!txSnap.empty) {
              const tx = txSnap.docs[0].data();
              buyerName = tx.buyerName || null;
              if (!buyerName && tx.buyerId) {
                buyerName = await getUserName(tx.buyerId);
              }
              const rawDate = tx.updatedAt || tx.createdAt;
              if (rawDate) date = rawDate?.toDate ? rawDate.toDate() : new Date(rawDate);
            }
          } catch { /* non-fatal */ }
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
      const [asBuyerSnap, asSellerSnap] = await Promise.all([
        getDocs(query(
          collection(db, 'transactions'),
          where('buyerId',  '==', uid),
          where('status',   '==', 'completed'),
        )),
        getDocs(query(
          collection(db, 'transactions'),
          where('sellerId', '==', uid),
          where('status',   '==', 'completed'),
        )),
      ]);

      // Deduplicate — a trade doc can appear in both queries
      const seen = new Set();
      const allDocs = [
        ...asBuyerSnap.docs.map(d  => ({ d, side: 'buyer'  })),
        ...asSellerSnap.docs.map(d => ({ d, side: 'seller' })),
      ].filter(({ d }) => {
        if (seen.has(d.id)) return false;
        seen.add(d.id);
        return true;
      });

      if (allDocs.length === 0) return;

      const enriched = await Promise.all(
        allDocs.map(async ({ d: txDoc, side }) => {
          const p      = txDoc.data();
          const type   = p.type?.toLowerCase?.() ?? 'sale'; // 'sale' | 'trade'
          const isTrade = type === 'trade';

          // ── Resolve listing title + image ──
          let itemTitle    = p.listingTitle || null;
          let listingImage = p.listingImage || p.productImage || null;
          let price        = p.price ?? p.amount ?? p.agreedPrice ?? null;

          if (p.listingId && (!itemTitle || !listingImage)) {
            try {
              const ls = await getDoc(doc(db, 'listings', p.listingId));
              if (ls.exists()) {
                const ld  = ls.data();
                itemTitle    = itemTitle    || ld.title            || null;
                listingImage = listingImage || ld.photos?.[0]      || ld.imageUrl || null;
                price        = price        ?? ld.price;
              }
            } catch { /* non-fatal */ }
          }
          itemTitle = itemTitle || (side === 'buyer' ? 'Purchase' : 'Sale');

          // ── Resolve other party name ──
          let otherName = null;
          if (side === 'buyer') {
            otherName = p.sellerName || await getUserName(p.sellerId);
          } else {
            otherName = p.buyerName  || await getUserName(p.buyerId);
          }

          // ── Date ──
          const rawDate = p.completedAt || p.updatedAt || p.createdAt;
          const date    = rawDate?.toDate ? rawDate.toDate() : rawDate ? new Date(rawDate) : new Date();

          // ── tradeItem — what was offered in exchange ──
          const tradeItem = p.tradeItem ?? null;

          // ── History type logic ──
          // Buyer:  type=sale  → 'purchase' (badge: Bought)
          //         type=trade → 'trade'    (badge: Traded) + tradeItem if present
          // Seller: type=sale  → 'sale'     (badge: Sold)
          //         type=trade → 'trade'    (badge: Traded) + tradeItem if present
          const historyType = isTrade ? 'trade' : side === 'buyer' ? 'purchase' : 'sale';

          return {
            id:           txDoc.id,
            item:         itemTitle,
            type:         historyType,
            side,
            date,
            price:        price != null ? `R${Number(price).toLocaleString()}` : null,
            seller:       side === 'buyer'  ? otherName : null,
            buyer:        side === 'seller' ? otherName : null,
            tradeItem,
            listingImage,
          };
        })
      );

      setHistory(prev => {
        const existingIds = new Set(prev.map(h => h.id));
        const newItems    = enriched.filter(e => !existingIds.has(e.id));
        return newItems.length ? [...prev, ...newItems] : prev;
      });
    } catch (err) {
      console.warn('fetchUserPurchases:', err);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setEditFormData(prev => ({ ...prev, [name]: value }));
  };

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

  const renderStars = (rating) => {
    const full = Math.floor(rating);
    const half = rating % 1 >= 0.5;
    return Array.from({ length: 5 }, (_, i) => {
      if (i < full)           return <i key={i} className="fas fa-star" />;
      if (i === full && half) return <i key={i} className="fas fa-star-half-alt" />;
      return                         <i key={i} className="far fa-star" />;
    });
  };

  if (loading) return (
    <div className={styles.loadingContainer}>
      <div className={styles.loader}>
        <i className="fas fa-spinner fa-spin" /><p>Loading Profile...</p>
      </div>
    </div>
  );

  if (showRatings) {
    return <ProfileRating onClose={() => setShowRatings(false)} />;
  }

  const totalSales        = safeNumber(profileData.totalSales);
  const totalTrades       = safeNumber(profileData.totalTrades);
  const totalTransactions = totalSales + totalTrades;

  const activeListings   = listings.filter(l => !HISTORY_STATUSES.has(l.status?.toLowerCase?.()) && !READONLY_STATUSES.has(l.status?.toLowerCase?.()));
  const acceptedListings = listings.filter(l => READONLY_STATUSES.has(l.status?.toLowerCase?.()));

  const sortedHistory = [...history].sort((a, b) => new Date(b.date) - new Date(a.date));

  return (
    <div className={styles.profileContainer}>
      <div className={styles.header}>
        <button className={styles.backButton} onClick={() => navigate(-1)}><i className="fas fa-arrow-left" /></button>
        <h1>My Profile</h1>
      </div>

      <div className={styles.profileCard}>
        <div className={styles.profileLeft}>
          <div className={styles.profilePictureSection}>
            <div className={styles.profilePictureWrapper}>
              <img src={profileData.photoURL || '/default-avatar.png'} alt="Profile" className={styles.profilePicture} onError={e => { e.target.src = '/default-avatar.png'; }} />
              {isEditing && <button className={styles.editPhotoButton} onClick={() => fileInputRef.current?.click()}><i className="fas fa-camera" /></button>}
              <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handlePhotoUpload} />
            </div>
          </div>
          <div className={styles.userInfo}>
            {isEditing ? (
              <div className={styles.editForm}>
                <div className={styles.formGroup}><label>First Name</label><input type="text" name="firstName" value={editFormData.firstName} disabled className={styles.disabledInput} /></div>
                <div className={styles.formGroup}><label>Surname</label><input type="text" name="lastName" value={editFormData.lastName} disabled className={styles.disabledInput} /></div>
                <div className={styles.formGroup}><label>Email</label><input type="email" value={profileData.email} disabled className={styles.disabledInput} /></div>
                <div className={styles.formGroup}><label>Bio</label><textarea name="bio" value={editFormData.bio} onChange={handleInputChange} placeholder="Tell us about yourself..." rows="3" /></div>
              </div>
            ) : (
              <>
                <h2>{profileData.firstName} {profileData.lastName}</h2>
                <p className={styles.email}>{profileData.email}</p>
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
            <button
              className={styles.viewRatingsLink}
              onClick={() => setShowRatings(true)}
              title="View all your ratings and reviews"
            >
              <i className="fas fa-chevron-right" /> View reviews
            </button>
          </div>

          <div className={styles.statsGrid}>
            <div className={styles.statItem}><i className="fas fa-tag" /><div className={styles.statInfo}><span className={styles.statValue}>{totalSales}</span><span className={styles.statLabel}>Sales</span></div></div>
            <div className={styles.statItem}><i className="fas fa-exchange-alt" /><div className={styles.statInfo}><span className={styles.statValue}>{totalTrades}</span><span className={styles.statLabel}>Trades</span></div></div>
            <div className={styles.statItem}><i className="fas fa-chart-line" /><div className={styles.statInfo}><span className={styles.statValue}>{totalTransactions}</span><span className={styles.statLabel}>Total</span></div></div>
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

      <div className={styles.tabsSection}>
        <div className={styles.tabs}>
          <button className={`${styles.tab} ${activeTab === 'history'  ? styles.activeTab : ''}`} onClick={() => setActiveTab('history')}><i className="fas fa-history" /> History</button>
          <button className={`${styles.tab} ${activeTab === 'listings' ? styles.activeTab : ''}`} onClick={() => setActiveTab('listings')}><i className="fas fa-list" /> My Listings ({activeListings.length + acceptedListings.length})</button>
          <button className={`${styles.tab} ${activeTab === 'offers'   ? styles.activeTab : ''}`} onClick={() => setActiveTab('offers')}><i className="fas fa-hand-holding-usd" /> Offers ({incomingOffers.length})</button>
        </div>

        {/* ── History Tab ── */}
        {activeTab === 'history' && (
          <div className={styles.tabContent}>
            {sortedHistory.length === 0 ? (
              <div className={styles.emptyState}><i className="fas fa-shopping-bag" /><p>No transaction history yet</p></div>
            ) : (
              <div className={styles.historyList}>
                {sortedHistory.map(item => {
                  const isBuyer    = item.side === 'buyer' || item.type === 'purchase';
                  const isTrade    = item.type === 'trade';
                  const otherParty = isBuyer ? item.seller : item.buyer;
                  const dateStr    = item.date
                    ? new Date(item.date).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })
                    : null;

                  return (
                    <div key={item.id} className={styles.historyItem}>

                      {/* ── Listing image ── */}
                      <div className={styles.historyImg}>
                        {item.listingImage
                          ? <img src={item.listingImage} alt={item.item} />
                          : <div className={styles.historyImgPlaceholder}><i className="fas fa-image" /></div>
                        }
                        <span className={`${styles.historyTypeDot} ${
                          item.type === 'purchase' ? styles.historyTypeDotBought
                          : isTrade               ? styles.historyTypeDotTrade
                          : styles.historyTypeDotSold
                        }`}>
                          {item.type === 'purchase' && <i className="fas fa-shopping-cart" />}
                          {item.type === 'sale'     && <i className="fas fa-tag" />}
                          {isTrade                  && <i className="fas fa-exchange-alt" />}
                        </span>
                      </div>

                      {/* ── Details ── */}
                      <div className={styles.historyDetails}>
                        <h4 className={styles.historyItemTitle}>{item.item}</h4>
                        <div className={styles.historyMeta}>
                          {dateStr && (
                            <span className={styles.historyMetaChip}>
                              <i className="fas fa-calendar-alt" /> {dateStr}
                            </span>
                          )}
                          {otherParty && (
                            <span className={styles.historyMetaChip}>
                              <i className={`fas ${isBuyer ? 'fa-store' : 'fa-user'}`} />
                              {isBuyer ? `From: ${otherParty}` : `To: ${otherParty}`}
                            </span>
                          )}
                          {/* Price only shown for sales, not trades */}
                          {item.price && !isTrade && (
                            <span className={styles.historyMetaPrice}>{item.price}</span>
                          )}
                          {/* tradeItem shown only when present and it was a trade */}
                          {isTrade && item.tradeItem && (
                            <span className={styles.historyMetaChip}>
                              <i className="fas fa-exchange-alt" /> Traded for: {item.tradeItem}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* ── Badge ── */}
                      <div className={styles.historyBadgeWrap}>
                        <span className={`${styles.historyBadge} ${
                          item.type === 'purchase' ? styles.historyBadgeBought
                          : isTrade               ? styles.historyBadgeTrade
                          : styles.historyBadgeSold
                        }`}>
                          {item.type === 'purchase' && 'Bought'}
                          {item.type === 'sale'     && 'Sold'}
                          {isTrade                  && 'Traded'}
                        </span>
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
                      listing={listing}
                      isEditing={editingListingId === listing.id}
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
                      listing={listing}
                      isEditing={false}
                      editData={{}}
                      onEdit={null}
                      onDelete={() => handleDeleteListing(listing.id)}
                      onEditChange={() => {}}
                      onSave={() => {}}
                      onCancel={() => {}}
                      compact={true}
                      readOnly={true}
                    />
                    <div className={styles.acceptedBanner}>
                      <i className="fas fa-handshake" />
                      <span>Sale in progress</span>
                    </div>
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
                  <div
                    key={offer.id}
                    className={`${styles.offerCard} ${highlightedOfferId === offer.id ? styles.highlightedOffer : ''}`}
                    style={{ animationDelay: `${i * 60}ms` }}
                  >
                    <OfferItem offer={offer} />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default Profile;