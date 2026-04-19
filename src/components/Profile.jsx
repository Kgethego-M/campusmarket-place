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

const toRawListingType = (displayType) => {
  if (!displayType) return displayType;
  const t = displayType.toString().toLowerCase().trim();
  if (t === 'for sale')          return 'sale';
  if (t === 'for trade')         return 'trade';
  if (t === 'for sale or trade') return 'either';
  if (t === 'sale' || t === 'trade' || t === 'either') return t;
  return displayType;
};

// Statuses that make a listing non-editable
const INACTIVE_STATUSES = new Set(['accepted', 'sold', 'traded', 'inactive']);

const Profile = () => {
  const navigate     = useNavigate();
  const location     = useLocation();
  const fileInputRef = useRef(null);

  const [loading, setLoading]               = useState(true);
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

      // Only pending offers — accepted/declined disappear automatically
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
      await fetchUserListings(user.uid);
      if (docSnap.exists()) {
        const d = docSnap.data();
        setProfileData({
          ...d,
          email:       d.email      || user.email,
          photoURL:    d.photoURL   || user.photoURL || '',
          memberSince: user.metadata.creationTime
            ? new Date(user.metadata.creationTime).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
            : 'Unknown',
          totalSales:   safeNumber(d.totalSales),
          totalTrades:  safeNumber(d.totalTrades),
          rating:       safeNumber(d.rating),
          totalRatings: safeNumber(d.totalRatings),
        });
        setEditFormData({ firstName: d.firstName || '', lastName: d.lastName || '', bio: d.bio || '' });
        setHistory(d.history || []);
      }
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

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

      // Auto-promote completed listings into history
      const completedItems = all.filter(l => l.status?.toLowerCase() === 'completed');
      if (completedItems.length) {
        setHistory(prev => {
          const existingIds = new Set(prev.map(h => h.id));
          const newItems = completedItems
            .filter(l => !existingIds.has(l.id))
            .map(l => ({ id: l.id, item: l.title, type: 'sale', date: l.date, price: l.price ? `R${l.price}` : null, status: 'completed' }));
          return [...prev, ...newItems];
        });
      }

      setListings(all);
    } catch (err) { console.error(err); }
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
    } catch (err) { alert('Failed to delete.'); }
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
    } catch (err) { alert('Failed to update.'); }
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

  const totalSales        = safeNumber(profileData.totalSales);
  const totalTrades       = safeNumber(profileData.totalTrades);
  const totalTransactions = totalSales + totalTrades;

  // Split listings by status
  const activeListings   = listings.filter(l => !INACTIVE_STATUSES.has(l.status?.toLowerCase?.()) && l.status?.toLowerCase() !== 'completed');
  const inactiveListings = listings.filter(l => INACTIVE_STATUSES.has(l.status?.toLowerCase?.()));
  // completed ones go to history; they don't render in the listings tab

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
          <button className={`${styles.tab} ${activeTab === 'listings' ? styles.activeTab : ''}`} onClick={() => setActiveTab('listings')}><i className="fas fa-list" /> My Listings ({listings.filter(l => l.status?.toLowerCase() !== 'completed').length})</button>
          <button className={`${styles.tab} ${activeTab === 'offers'   ? styles.activeTab : ''}`} onClick={() => setActiveTab('offers')}><i className="fas fa-hand-holding-usd" /> Offers ({incomingOffers.length})</button>
        </div>

        {activeTab === 'history' && (
          <div className={styles.tabContent}>
            {history.length === 0 ? (
              <div className={styles.emptyState}><i className="fas fa-shopping-bag" /><p>No transaction history yet</p></div>
            ) : (
              <div className={styles.historyList}>
                {history.map(item => (
                  <div key={item.id} className={styles.historyItem}>
                    <div className={styles.historyIcon}>
                      {item.type === 'purchase' && <i className="fas fa-shopping-cart" />}
                      {item.type === 'sale'     && <i className="fas fa-tag" />}
                      {item.type === 'trade'    && <i className="fas fa-exchange-alt" />}
                    </div>
                    <div className={styles.historyDetails}>
                      <h4>{item.item}</h4>
                      <div className={styles.historyMeta}>
                        <span><i className="fas fa-calendar" /> {new Date(item.date).toLocaleDateString()}</span>
                        {item.type === 'purchase' && <span>From: {item.seller}</span>}
                        {item.type === 'sale'     && <span>To: {item.buyer}</span>}
                        {item.type === 'trade'    && <span>With: {item.tradedWith}</span>}
                        {item.price && <span>{item.price}</span>}
                      </div>
                    </div>
                    <div className={`${styles.historyStatus} ${styles[item.status]}`}>{item.status}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'listings' && (
          <div className={styles.tabContent}>
            {listings.filter(l => l.status?.toLowerCase() !== 'completed').length === 0 ? (
              <div className={styles.emptyState}>
                <i className="fas fa-box-open" /><p>No listings yet</p>
                <button className={styles.createListingButton} onClick={() => navigate('/create-listing')}><i className="fas fa-plus" /> Create Your First Listing</button>
              </div>
            ) : (
              <div className={styles.listingsGridCompact}>
                {/* Active — fully editable */}
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
                {/* Inactive — read-only with badge */}
                {inactiveListings.map(listing => (
                  <div key={listing.id} className={`${styles.listingCardCompact} ${styles.listingCardInactive}`}>
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

                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'offers' && (
            <div className={styles.tabContent}>
                {incomingOffers.length === 0 ? (
                <div className={styles.emptyState}>
                    <i className="fas fa-inbox" />
                    <p>No pending offers</p>
                </div>
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
};

export default Profile;