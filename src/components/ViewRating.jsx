// src/components/ViewRating.jsx
import React, { useState, useEffect, useRef } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { db } from '../firebase.js';
import { auth } from '../firebase.js';
import ReportModal from './ReportModal.jsx';
import {
  doc, getDoc, collection, query,
  where, getDocs, orderBy, updateDoc, arrayUnion,
} from 'firebase/firestore';
import styles from './ViewRating.module.css';
import {
  calculateAverageRating,
  getRatingPercentage,
  getRatingDistribution,
} from '../utils/view-rating.utils.js';
import NavBar from './NavBarTemp.jsx';
import ListingCard from './ListingCard.jsx';

const PREVIEW_REVIEWS  = 3;
const PREVIEW_LISTINGS = 3;
const PREVIEW_REPORTS  = 3;

function Drawer({ open, onClose, title, children }) {
  const overlayRef = useRef(null);
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);
  return (
    <div
      ref={overlayRef}
      className={`${styles.drawerOverlay} ${open ? styles.drawerOverlayOpen : ''}`}
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
    >
      <div className={`${styles.drawer} ${open ? styles.drawerOpen : ''}`}>
        <div className={styles.drawerHeader}>
          <h3 className={styles.drawerTitle}>{title}</h3>
          <button className={styles.drawerClose} onClick={onClose} aria-label="Close">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <div className={styles.drawerBody}>{children}</div>
      </div>
    </div>
  );
}

function Stars({ rating, size = 13 }) {
  const r = Math.max(0, Math.min(5, Math.round(rating || 0)));
  return (
    <span className={styles.reviewStars} style={{ fontSize: size }}>
      {'★'.repeat(r)}{'☆'.repeat(5 - r)}
    </span>
  );
}

function ReviewCard({ review, animate = false, delay = 0, onReport = null }) {
  const formattedDate = review.createdAt
    ? (review.createdAt.toDate
        ? review.createdAt.toDate()
        : new Date(review.createdAt)
      ).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })
    : null;
  const productImage = review.productImage || review.listingImage || null;
  
  return (
    <div
      className={`${styles.txCard} ${animate ? styles.txCardAnimate : ''}`}
      style={animate ? { animationDelay: `${delay}ms` } : {}}
    >
      <div className={styles.txImage}>
        {productImage ? (
          <img src={productImage} alt={review.listingTitle || 'Product'} className={styles.txProductImage} />
        ) : (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={styles.imgIcon}>
            <rect x="3" y="3" width="18" height="18" rx="2"/>
            <path d="M3 9l4-4 4 4 4-4 4 4"/>
            <circle cx="8" cy="15" r="2"/>
          </svg>
        )}
      </div>
      <div className={styles.txBody}>
        <div className={styles.txProduct}>{review.listingTitle || 'Listing'}</div>
        <div className={styles.txMeta}>
          Reviewed by · <strong>{review.reviewerName}</strong>
        </div>
        <div className={styles.reviewerRow}>
          <Stars rating={review.rating} />
        </div>
        {review.comment && <p className={styles.reviewComment}>{review.comment}</p>}
        {formattedDate && <div className={styles.reviewDate}>{formattedDate}</div>}
        {onReport && (
          <button
            onClick={() => onReport(review)}
            style={{
              marginTop: 8,
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              fontSize: '0.75rem',
              color: '#94a3b8',
              padding: '2px 0',
              fontFamily: 'inherit',
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/>
              <line x1="4" y1="22" x2="4" y2="15"/>
            </svg>
            Report review
          </button>
        )}
      </div>
    </div>
  );
}

function BackButton({ onClick }) {
  return (
    <button className={styles.backButton} onClick={onClick} aria-label="Go back">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="19" y1="12" x2="5" y2="12"/>
        <polyline points="12 19 5 12 12 5"/>
      </svg>
      <span>Back</span>
    </button>
  );
}

export default function ViewSellerRatings({ userId: propUserId, onBack }) {
  const { userId: paramUserId } = useParams();
  const [searchParams]          = useSearchParams();
  const navigate                = useNavigate();
  const isAdminPreview          = searchParams.get('preview') === 'true';
  const userId = propUserId || paramUserId;

  const [activeTab, setActiveTab]               = useState('seller');
  const [tabTransitioning, setTabTransitioning] = useState(false);
  const [profileData, setProfileData]           = useState(null);
  const [sellerReviews, setSellerReviews]       = useState([]);
  const [buyerReviews, setBuyerReviews]         = useState([]);
  const [listings, setListings]                 = useState([]);
  const [loading, setLoading]                   = useState(true);
  const [error, setError]                       = useState(null);
  const [reportReview, setReportReview]         = useState(null);
  const [reportUserOpen, setReportUserOpen]     = useState(false);
  const [userReports, setUserReports]           = useState([]);
  const [suspending, setSuspending]             = useState(false);
  const [showAllReviews, setShowAllReviews]         = useState(false);
  const [showAllListings, setShowAllListings]       = useState(false);
  const [showAllPending, setShowAllPending]         = useState(false);
  const [showAllResolved, setShowAllResolved]       = useState(false);

  useEffect(() => {
    if (!userId) { setError('No user ID provided.'); setLoading(false); return; }
    fetchAll(userId);
    if (isAdminPreview) fetchUserReports(userId);
  }, [userId]);

  async function fetchUserReports(uid) {
    try {
      // 1. Reports filed directly against the user (reportType === 'user' or 'review')
      const userSnap = await getDocs(
        query(collection(db, 'reports'), where('reportedId', '==', uid))
      );
      const userReportDocs = userSnap.docs.map(d => ({ id: d.id, ...d.data() }));

      // 2. Reports filed against listings owned by this user
      //    reportedId on a listing report is the listing ID, not the user ID
      const listingsSnap = await getDocs(
        query(collection(db, 'listings'), where('sellerUID', '==', uid))
      );
      const listingIds = listingsSnap.docs.map(d => d.id);

      let listingReportDocs = [];
      if (listingIds.length > 0) {
        // Firestore 'in' supports up to 30 items; chunk if needed
        const chunks = [];
        for (let i = 0; i < listingIds.length; i += 30)
          chunks.push(listingIds.slice(i, i + 30));

        const chunkSnaps = await Promise.all(
          chunks.map(chunk =>
            getDocs(query(collection(db, 'reports'), where('reportedId', 'in', chunk)))
          )
        );
        chunkSnaps.forEach(snap =>
          snap.docs.forEach(d => listingReportDocs.push({ id: d.id, ...d.data() }))
        );
      }

      // Merge, deduplicate by report id
      const seen = new Set();
      const all = [...userReportDocs, ...listingReportDocs].filter(r => {
        if (seen.has(r.id)) return false;
        seen.add(r.id);
        return true;
      });

      setUserReports(all);
    } catch (err) { console.error('fetchUserReports:', err); }
  }

  async function handleSuspendUser() {
    if (!window.confirm(`Suspend ${profileData?.name}? This will block their access.`)) return;
    setSuspending(true);
    try {
      const adminUser = auth.currentUser;
      await updateDoc(doc(db, 'users', userId), {
        suspended:       true,
        suspendedBy:     adminUser?.uid || null,
        suspendedAt:     new Date(),
        suspendedByName: adminUser?.displayName || adminUser?.email || 'Admin',
      });
      alert(`${profileData?.name} has been suspended.`);
    } catch (err) {
      console.error(err);
      alert('Failed to suspend user.');
    } finally {
      setSuspending(false);
    }
  }

  async function fetchAll(uid) {
    setLoading(true);
    setError(null);
    try {
      await Promise.all([fetchProfile(uid), fetchReviews(uid), fetchListings(uid), fetchTransactionStats(uid)]);
    } catch (err) {
      console.error('ViewRating fetch error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function fetchProfile(uid) {
    const snap = await getDoc(doc(db, 'users', uid));
    if (!snap.exists()) throw new Error('User not found.');
    const d = snap.data();
    setProfileData({
      name:           `${d.firstName || ''} ${d.lastName || ''}`.trim() || d.displayName || 'Unknown User',
      avatarInitials: ((d.firstName?.[0] || '') + (d.lastName?.[0] || '')).toUpperCase() || '?',
      photoURL:       d.photoURL || null,
      joinedDate:     d.createdAt?.toDate?.()?.toISOString() || d.createdAt || null,
      totalSales:     d.totalSales || 0,
      totalTrades:    d.totalTrades || 0,
      totalPurchases: d.totalPurchases || 0,
      bio:            d.bio || '',
      warnings:       d.warnings || [],
      suspended:      d.suspended || false,
    });
  }

  async function fetchTransactionStats(uid) {
    try {
      const sellerSnap = await getDocs(query(collection(db, 'purchases'), where('sellerId', '==', uid)));
      let salesCount = 0, tradesCount = 0;
      sellerSnap.forEach(d => {
        const p = d.data();
        if (p.transactionType === 'trade' || p.listingType === 'trade') tradesCount++;
        else salesCount++;
      });
      const buyerSnap = await getDocs(query(collection(db, 'purchases'), where('buyerId', '==', uid)));
      setProfileData(prev => ({ ...prev, totalSales: salesCount, totalTrades: tradesCount, totalPurchases: buyerSnap.size }));
    } catch (err) {
      console.error('Error fetching transaction stats:', err);
    }
  }

  async function fetchReviews(uid) {
    const snap = await getDocs(
      query(collection(db, 'reviews'), where('reviewedUserId', '==', uid))
    );

    const reviewsWithDetails = await Promise.all(
      snap.docs.map(async (reviewDoc) => {
        const r = { id: reviewDoc.id, ...reviewDoc.data() };

        if (r.reviewerUserId) {
          try {
            const userSnap = await getDoc(doc(db, 'users', r.reviewerUserId));
            if (userSnap.exists()) {
              const d = userSnap.data();
              r.reviewerName = `${d.firstName || ''} ${d.lastName || ''}`.trim()
                || d.displayName
                || 'Anonymous';
            } else {
              r.reviewerName = 'Anonymous';
            }
          } catch (_) {
            r.reviewerName = 'Anonymous';
          }
        } else {
          r.reviewerName = r.reviewerName || 'Anonymous';
        }

        if (r.listingId) {
          try {
            const listingSnap = await getDoc(doc(db, 'listings', r.listingId));
            if (listingSnap.exists()) {
              const listingData = listingSnap.data();
              r.listingTitle = listingData.title || 'Listing';
              r.productImage = listingData.photos?.[0] || listingData.imageUrl || null;
              r.listingImage = r.productImage;
            }
          } catch (_) {}
        }

        return r;
      })
    );

    setSellerReviews(reviewsWithDetails.filter(r => r.role === 'seller'));
    setBuyerReviews(reviewsWithDetails.filter(r => r.role === 'buyer'));
  }

  async function fetchListings(uid) {
    const snap = await getDocs(
      query(collection(db, 'listings'), where('sellerUID', '==', uid), where('status', '==', 'active'))
    );
    const normaliseType = (t) => {
      if (!t) return t;
      const v = t.toString().toLowerCase().trim();
      if (v === 'either' || v === 'sale or trade') return 'Sale or Trade';
      if (v === 'sale'   || v === 'for sale')      return 'For Sale';
      if (v === 'trade'  || v === 'for trade')     return 'For Trade';
      return t;
    };
    setListings(snap.docs.map(d => ({
      id: d.id, ...d.data(),
      imageUrl:    d.data().photos?.[0] || null,
      listingType: normaliseType(d.data().listingType),
    })));
  }

  const handleTabSwitch = (tab) => {
    if (tab === activeTab || tabTransitioning) return;
    setTabTransitioning(true);
    setShowAllReviews(false);
    setTimeout(() => { setActiveTab(tab); setTabTransitioning(false); }, 220);
  };

  const handleBack = () => { 
    if (onBack) onBack(); 
    else window.history.back(); 
  };

  if (loading) return (
    <div className={styles.loaderWrap}>
      <div className={styles.loaderDots}><span /><span /><span /></div>
      <p className={styles.loaderText}>Loading profile...</p>
    </div>
  );
  if (error) return <div className={styles.error}>Error: {error}</div>;
  if (!profileData) return <div className={styles.error}>No profile data found</div>;

  const reviews        = activeTab === 'seller' ? sellerReviews : buyerReviews;
  const previewReviews = showAllReviews ? reviews : reviews.slice(0, PREVIEW_REVIEWS);
  const hasMore        = reviews.length > PREVIEW_REVIEWS;
  const totalReviews   = reviews.length;
  const averageRating  = calculateAverageRating(reviews);
  const ratingDist     = getRatingDistribution(reviews);
  const hasReviews     = totalReviews > 0;
  const previewListings = showAllListings ? listings : listings.slice(0, PREVIEW_LISTINGS);
  const hasMoreListings = listings.length > PREVIEW_LISTINGS;
  
  const pendingReports         = userReports.filter(r => r.status === 'pending');
  const resolvedReports        = userReports.filter(r => r.status !== 'pending');
  const listingReportCount     = userReports.filter(r => r.reportType === 'listing').length;
  const previewPending         = showAllPending  ? pendingReports  : pendingReports.slice(0, PREVIEW_REPORTS);
  const previewResolved        = showAllResolved ? resolvedReports : resolvedReports.slice(0, PREVIEW_REPORTS);
  
  const activeCount = totalReviews;
  const activeLabel = activeTab === 'seller' ? 'reviews as seller' : 'reviews as buyer';

  const currentUid = auth.currentUser?.uid;
  const canReportReview = (review) => !!currentUid && currentUid !== review.reviewerUserId;
  const handleReportReview = (review) => setReportReview(review);

  return (
    <>
      {/* Only show NavBar if NOT in admin preview mode */}
      {!isAdminPreview && <NavBar />}

      {/* Report review modal */}
      <ReportModal
        open={!!reportReview}
        onClose={() => setReportReview(null)}
        reportType="review"
        reportedId={reportReview?.id || ''}
        reportedName={`Review by ${reportReview?.reviewerName || 'user'} on "${reportReview?.listingTitle || 'listing'}"`}
      />

      {/* Report user modal */}
      <ReportModal
        open={reportUserOpen}
        onClose={() => setReportUserOpen(false)}
        reportType="user"
        reportedId={userId || ''}
        reportedName={profileData?.name || ''}
      />
      
      <div className={styles.page}>
        <div className={styles.bgAccent} />
        
        {/* Admin preview banner */}
        {isAdminPreview && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '10px 14px', backgroundColor: '#a9cff3',
            border: '1px solid hsl(226, 51%, 62%)', borderRadius: 10,
            marginBottom: '20px',
            fontSize: '0.82rem', fontWeight: 600, color: '#0e3892',
            fontFamily: 'Segoe UI, system-ui, sans-serif',
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
            Admin preview
            <button
              onClick={handleBack}  // ← Change this from navigate(-1) to handleBack
              style={{ marginLeft: 'auto', background: 'none', border: '1px solid hsl(226, 51%, 62%)', borderRadius: 6, padding: '3px 10px', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.78rem', fontWeight: 700, color: '#0e3892' }}
            >
              ← Back to reports
            </button>
          </div>
        )}
        
        {!isAdminPreview && (
          <div className={styles.backRow}>
            <BackButton onClick={handleBack} />
          </div>
        )}

        <div className={styles.profileCard}>
          <div className={styles.avatarWrap}>
            <div className={styles.avatarCircle}>
              {profileData.photoURL
                ? <img src={profileData.photoURL} alt={profileData.name} style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
                : profileData.avatarInitials
              }
            </div>
            <div className={styles.avatarRing} />
          </div>

          <div className={styles.profileInfo}>
            <div className={styles.profileTopRow} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <h2 className={styles.userName}>{profileData.name}</h2>
                <span className={styles.activeDot} title="Active user" />
              </div>
              {!isAdminPreview && currentUid && currentUid !== userId && (
                <button
                  onClick={() => setReportUserOpen(true)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                    background: 'none',
                    border: '1.5px solid #fca5a5',
                    borderRadius: 8,
                    padding: '5px 11px',
                    color: '#dc2626',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    flexShrink: 0,
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#fef2f2'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'none'; }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/>
                    <line x1="4" y1="22" x2="4" y2="15"/>
                  </svg>
                  Report user
                </button>
              )}
            </div>

            <div className={styles.profileMeta}>
              <div className={styles.ratingRow}>
                {hasReviews ? (
                  <>
                    <span className={styles.starGold}>★</span>
                    <span className={styles.ratingValue}>{averageRating.toFixed(1)}</span>
                    <span className={styles.ratingCount}>({activeCount} {activeLabel})</span>
                  </>
                ) : (
                  <span className={styles.noRating}>No reviews yet</span>
                )}
              </div>
              {profileData.joinedDate && (
                <>
                  <span className={styles.metaDivider}>·</span>
                  <span className={styles.metaItem}>
                    <svg className={styles.metaIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="4" width="18" height="18" rx="2"/>
                      <line x1="16" y1="2" x2="16" y2="6"/>
                      <line x1="8"  y1="2" x2="8"  y2="6"/>
                      <line x1="3"  y1="10" x2="21" y2="10"/>
                    </svg>
                    Joined {new Date(profileData.joinedDate).toLocaleDateString('en-ZA', { month: 'short', year: 'numeric' })}
                  </span>
                </>
              )}
            </div>

            {profileData.bio ? <p className={styles.profileBio}>{profileData.bio}</p> : null}

            <div className={styles.tabGroup}>
              <button className={`${styles.tabBtn} ${activeTab === 'seller' ? styles.tabActive : ''}`} onClick={() => handleTabSwitch('seller')}>
                As Seller <span className={styles.tabCount}>({sellerReviews.length})</span>
              </button>
              <button className={`${styles.tabBtn} ${activeTab === 'buyer' ? styles.tabActive : ''}`} onClick={() => handleTabSwitch('buyer')}>
                As Buyer <span className={styles.tabCount}>({buyerReviews.length})</span>
              </button>
            </div>
          </div>
        </div>

        <div className={`${styles.contentArea} ${tabTransitioning ? styles.contentFading : styles.contentVisible}`}>

          {hasReviews && (
            <div className={styles.distributionCard}>
              <div className={styles.distHeader}>
                <div className={styles.distBigRating}>
                  <span className={styles.distBigNumber}>{averageRating.toFixed(1)}</span>
                  <div className={styles.distBigStars}>{'★'.repeat(Math.round(averageRating))}{'☆'.repeat(5 - Math.round(averageRating))}</div>
                  <span className={styles.distBigLabel}>{totalReviews} reviews</span>
                </div>
                <div className={styles.distBars}>
                  {[5, 4, 3, 2, 1].map(r => {
                    const count = ratingDist[r] || 0;
                    const pct   = getRatingPercentage(count, totalReviews);
                    return (
                      <div key={r} className={styles.distRow}>
                        <span className={styles.distStar}>{r} ★</span>
                        <div className={styles.barTrack}><div className={styles.barFill} style={{ width: `${pct}%` }} /></div>
                        <span className={styles.distPct}>{pct}%</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ── Admin-only: report history — ABOVE seller reviews ── */}
          {isAdminPreview && userReports.length > 0 && (
            <div style={{ marginBottom: 24, background: '#fff', borderRadius: 14, border: '1px solid #e8eaed', overflow: 'hidden' }}>
              <div style={{ padding: '14px 18px 10px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 8 }}>
                <i className="fas fa-flag" style={{ color: '#dc2626', fontSize: '0.85rem' }} />
                <span style={{ fontWeight: 700, fontSize: '0.95rem', color: '#1a1a1a' }}>Report History</span>
                <span style={{ marginLeft: 'auto', fontSize: '0.72rem', fontWeight: 700, background: '#fef2f2', color: '#dc2626', padding: '2px 8px', borderRadius: 20 }}>
                  {userReports.length} total
                </span>
              </div>

              {/* Summary stats — now includes Listings Reported */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 0, borderBottom: '1px solid #f1f5f9' }}>
                {[
                  { label: 'Pending',           value: pendingReports.length,                                                                    color: '#d97706', bg: '#fffbeb' },
                  { label: 'Resolved',          value: resolvedReports.filter(r => r.resolution !== 'dismiss').length,                          color: '#16a34a', bg: '#f0fdf4' },
                  { label: 'Dismissed',         value: userReports.filter(r => r.resolution === 'dismiss').length,                              color: '#64748b', bg: '#f8fafc' },
                  { label: 'Warnings',          value: (profileData.warnings || []).length,                                                      color: '#d97706', bg: '#fffbeb' },
                  { label: 'Listings Reported', value: listingReportCount,                                                                       color: '#dc2626', bg: '#fef2f2' },
                ].map(({ label, value, color, bg }) => (
                  <div key={label} style={{ flex: '1 1 80px', padding: '12px 16px', borderRight: '1px solid #f1f5f9', background: bg }}>
                    <div style={{ fontSize: '1.4rem', fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
                    <div style={{ fontSize: '0.7rem', fontWeight: 600, color: '#64748b', marginTop: 2, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
                  </div>
                ))}
              </div>

              {/* Pending report rows — max 3 */}
              {pendingReports.length > 0 && (
                <>
                  <div style={{ padding: '10px 18px 4px', fontSize: '0.75rem', fontWeight: 700, color: '#d97706', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Pending ({pendingReports.length})
                  </div>
                  <div style={{ maxHeight: 240, overflowY: 'auto' }}>
                    {previewPending.map((r, i) => (
                      <div key={r.id} style={{
                        display: 'flex', alignItems: 'flex-start', gap: 12, padding: '11px 18px',
                        borderBottom: i < previewPending.length - 1 ? '1px solid #f8fafc' : 'none',
                        fontSize: '0.8rem',
                      }}>
                        <span style={{ flexShrink: 0, marginTop: 2, width: 8, height: 8, borderRadius: '50%', background: '#f59e0b', display: 'inline-block' }} />
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 2 }}>
                            <span style={{
                              fontSize: '0.65rem', fontWeight: 700, padding: '1px 7px', borderRadius: 20,
                              textTransform: 'uppercase', letterSpacing: '0.05em',
                              background: r.reportType === 'listing' ? '#eff6ff' : r.reportType === 'review' ? '#fef3c7' : '#f1f5f9',
                              color:      r.reportType === 'listing' ? '#2563eb' : r.reportType === 'review' ? '#d97706'  : '#475569',
                            }}>
                              {r.reportType || 'user'}
                            </span>
                            {r.reportType === 'listing' && r.reportedName && (
                              <span
                                onClick={() => navigate(`/listing/${r.reportedId}?preview=true`)}
                                style={{
                                  fontWeight: 600, color: '#2563eb',
                                  cursor: 'pointer',
                                  textDecoration: 'underline dotted',
                                  textUnderlineOffset: 3,
                                }}
                              >
                                {r.reportedName}
                              </span>
                            )}
                          </div>
                          <span style={{ fontWeight: 500, color: '#475569' }}>{r.reason}</span>
                          {r.details && <span style={{ color: '#64748b', marginLeft: 6 }}>— {r.details}</span>}
                          <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: 2 }}>
                            Reported by {r.reporterName} · {r.createdAt?.toDate ? r.createdAt.toDate().toLocaleDateString('en-ZA') : 'Recently'}
                          </div>
                        </div>
                        <span style={{ flexShrink: 0, fontSize: '0.68rem', fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: '#fef3c7', color: '#d97706', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Pending</span>
                      </div>
                    ))}
                  </div>
                  {pendingReports.length > PREVIEW_REPORTS && (
                    <div style={{ padding: '8px 18px 10px' }}>
                      <button onClick={() => setShowAllPending(p => !p)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600, color: '#2563eb', fontFamily: 'inherit', textDecoration: 'underline dotted', textUnderlineOffset: 3 }}>
                        {showAllPending ? 'View less' : `View more (${pendingReports.length - PREVIEW_REPORTS} more)`}
                      </button>
                    </div>
                  )}
                </>
              )}

              {/* Resolved report rows — max 3 */}
              {resolvedReports.length > 0 && (
                <>
                  <div style={{ padding: '10px 18px 4px', fontSize: '0.75rem', fontWeight: 700, color: '#16a34a', textTransform: 'uppercase', letterSpacing: '0.05em', borderTop: pendingReports.length > 0 ? '1px solid #f1f5f9' : 'none' }}>
                    Resolved ({resolvedReports.length})
                  </div>
                  <div>
                    {previewResolved.map((r, i) => (
                      <div key={r.id} style={{
                        display: 'flex', alignItems: 'flex-start', gap: 12, padding: '11px 18px',
                        borderBottom: i < previewResolved.length - 1 ? '1px solid #f8fafc' : 'none',
                        fontSize: '0.8rem',
                      }}>
                        <span style={{ flexShrink: 0, marginTop: 2, width: 8, height: 8, borderRadius: '50%', background: r.resolution === 'dismiss' ? '#94a3b8' : '#16a34a', display: 'inline-block' }} />
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 2 }}>
                            <span style={{
                              fontSize: '0.65rem', fontWeight: 700, padding: '1px 7px', borderRadius: 20,
                              textTransform: 'uppercase', letterSpacing: '0.05em',
                              background: r.reportType === 'listing' ? '#eff6ff' : r.reportType === 'review' ? '#fef3c7' : '#f1f5f9',
                              color:      r.reportType === 'listing' ? '#2563eb' : r.reportType === 'review' ? '#d97706'  : '#475569',
                            }}>
                              {r.reportType || 'user'}
                            </span>
                            {r.reportType === 'listing' && r.reportedName && (
                              <span
                                onClick={() => navigate(`/listing/${r.reportedId}?preview=true`)}
                                style={{
                                  fontWeight: 600, color: '#2563eb',
                                  cursor: 'pointer',
                                  textDecoration: 'underline dotted',
                                  textUnderlineOffset: 3,
                                }}
                              >
                                {r.reportedName}
                              </span>
                            )}
                          </div>
                          <span style={{ fontWeight: 500, color: '#475569' }}>{r.reason}</span>
                          {r.details && <span style={{ color: '#64748b', marginLeft: 6 }}>— {r.details}</span>}
                          <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: 2 }}>
                            Reported by {r.reporterName} · {r.createdAt?.toDate ? r.createdAt.toDate().toLocaleDateString('en-ZA') : 'Recently'}
                          </div>
                        </div>
                        <span style={{ flexShrink: 0, fontSize: '0.68rem', fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: r.resolution === 'dismiss' ? '#f1f5f9' : '#f0fdf4', color: r.resolution === 'dismiss' ? '#64748b' : '#16a34a', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                          {r.resolution === 'dismiss' ? 'Dismissed' : 'Resolved'}
                        </span>
                      </div>
                    ))}
                  </div>
                  {resolvedReports.length > PREVIEW_REPORTS && (
                    <div style={{ padding: '8px 18px 10px' }}>
                      <button onClick={() => setShowAllResolved(p => !p)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600, color: '#2563eb', fontFamily: 'inherit', textDecoration: 'underline dotted', textUnderlineOffset: 3 }}>
                        {showAllResolved ? 'View less' : `View more (${resolvedReports.length - PREVIEW_REPORTS} more)`}
                      </button>
                    </div>
                  )}
                </>
              )}

              {/* Suspend button */}
              <div style={{ padding: '14px 18px', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'flex-end' }}>
                {profileData.suspended ? (
                  <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#dc2626', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <i className="fas fa-ban" /> Account is suspended
                  </span>
                ) : (
                  <button
                    onClick={handleSuspendUser}
                    disabled={suspending}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 8,
                      padding: '9px 20px', borderRadius: 9, border: 'none',
                      background: suspending ? '#fca5a5' : '#dc2626', color: '#fff',
                      fontSize: '0.85rem', fontWeight: 700, cursor: suspending ? 'not-allowed' : 'pointer',
                      fontFamily: 'inherit', transition: 'background 0.15s',
                    }}
                    onMouseEnter={e => { if (!suspending) e.currentTarget.style.background = '#b91c1c'; }}
                    onMouseLeave={e => { if (!suspending) e.currentTarget.style.background = '#dc2626'; }}
                  >
                    <i className="fas fa-ban" />
                    {suspending ? 'Suspending…' : 'Suspend Account'}
                  </button>
                )}
              </div>

              {/* ── Account Warning — admin-only, shown after report table ── */}
              {profileData.warnings && profileData.warnings.length > 0 && (
                <div style={{
                  margin: '0 18px 16px',
                  padding: '14px 18px',
                  background: '#fffbeb',
                  border: '1.5px solid #fcd34d',
                  borderRadius: 12,
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 12,
                }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 2 }}>
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                    <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                  </svg>
                  <div>
                    <p style={{ margin: '0 0 4px', fontWeight: 700, fontSize: '0.88rem', color: '#92400e' }}>
                      Account Warning{profileData.warnings.length > 1 ? `s (${profileData.warnings.length})` : ''}
                    </p>
                    {profileData.warnings.map((w, i) => (
                      <p key={i} style={{ margin: '2px 0', fontSize: '0.81rem', color: '#78350f' }}>
                        {profileData.warnings.length > 1 ? `${i + 1}. ` : ''}{w.reason}
                        {w.warnedAt && (
                          <span style={{ color: '#a16207', marginLeft: 6, fontSize: '0.74rem' }}>
                            · {new Date(w.warnedAt?.toDate ? w.warnedAt.toDate() : w.warnedAt).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </span>
                        )}
                      </p>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Seller / Buyer Reviews — max 3 with View all link ── */}
          <div className={styles.transactionsSection}>
            <div className={styles.sectionTitleRow}>
              <h3 className={styles.sectionHeader}>{activeTab === 'seller' ? 'Seller reviews' : 'Buyer reviews'}</h3>
              {hasReviews && <span className={styles.reviewCountChip}>{totalReviews} total</span>}
            </div>
            {!hasReviews ? (
              <div className={styles.empty}>
                <svg className={styles.emptyIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
                <p className={styles.emptyTitle}>No {activeTab} reviews yet</p>
                <p className={styles.emptySubtitle}>Reviews will appear here after completed transactions.</p>
              </div>
            ) : (
              <>
                <div className={styles.transactionsList}>
                  {previewReviews.map((review, i) => (
                    <ReviewCard key={review.id} review={review} animate delay={i * 60} onReport={canReportReview(review) ? handleReportReview : null} />
                  ))}
                </div>
                {hasMore && (
                  <button className={styles.seeMoreBtn} onClick={() => setShowAllReviews(p => !p)}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                      <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/>
                    </svg>
                    {showAllReviews ? 'View less' : `View more (${totalReviews - PREVIEW_REVIEWS} more)`}
                  </button>
                )}
              </>
            )}
          </div>

          {/* ── Active Listings — max 3 with View all link ── */}
          <div className={styles.listingsSection}>
            <div className={styles.sectionTitleRow}>
              <h3 className={styles.sectionHeader}>Active listings</h3>
              <span className={styles.reviewCountChip}>{listings.length} items</span>
            </div>
            {listings.length === 0 ? (
              <div className={styles.empty}>
                <svg className={styles.emptyIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 10V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v3"/><path d="M3 10h18v11H3z"/><path d="M12 10v11"/>
                </svg>
                <p className={styles.emptyTitle}>No active listings</p>
                <p className={styles.emptySubtitle}>This seller has no items listed right now.</p>
              </div>
            ) : (
              <>
                <div className={styles.listingsGrid}>
                  {previewListings.map((listing, i) => (
                    <div key={listing.id} className={styles.listingCardWrap} style={{ animationDelay: `${i * 70}ms` }}>
                      <ListingCard listing={listing} visible />
                    </div>
                  ))}
                </div>
                {hasMoreListings && (
                  <button className={styles.seeMoreBtn} onClick={() => setShowAllListings(p => !p)}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                      <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/>
                    </svg>
                    {showAllListings ? 'View less' : `View more (${listings.length - PREVIEW_LISTINGS} more)`}
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>

    </>
  );
}