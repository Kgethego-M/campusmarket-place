import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { db } from '../firebase.js';
import { auth } from '../firebase.js';
import ReportModal from './ReportModal.jsx';
import {
  doc, getDoc, collection, query,
  where, getDocs, orderBy,
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
const PREVIEW_LISTINGS = 7;

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
  const userId = propUserId || paramUserId;

  const [activeTab, setActiveTab]               = useState('seller');
  const [tabTransitioning, setTabTransitioning] = useState(false);
  const [profileData, setProfileData]           = useState(null);
  const [sellerReviews, setSellerReviews]       = useState([]);
  const [buyerReviews, setBuyerReviews]         = useState([]);
  const [listings, setListings]                 = useState([]);
  const [loading, setLoading]                   = useState(true);
  const [error, setError]                       = useState(null);
  const [reviewDrawerOpen, setReviewDrawerOpen] = useState(false);
  const [listingDrawerOpen, setListingDrawerOpen] = useState(false);
  const [reportReview, setReportReview]         = useState(null); // review being reported

  useEffect(() => {
    if (!userId) { setError('No user ID provided.'); setLoading(false); return; }
    fetchAll(userId);
  }, [userId]);

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

        // Get reviewer's name from users collection using reviewerUserId
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

        // Listing details
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
    setTimeout(() => { setActiveTab(tab); setTabTransitioning(false); }, 220);
  };

  const handleBack = () => { if (onBack) onBack(); else window.history.back(); };

  if (loading) return (
    <div className={styles.loaderWrap}>
      <div className={styles.loaderDots}><span /><span /><span /></div>
      <p className={styles.loaderText}>Loading profile...</p>
    </div>
  );
  if (error) return <div className={styles.error}>Error: {error}</div>;
  if (!profileData) return <div className={styles.error}>No profile data found</div>;

  const reviews        = activeTab === 'seller' ? sellerReviews : buyerReviews;
  const previewReviews = reviews.slice(0, PREVIEW_REVIEWS);
  const hasMore        = reviews.length > PREVIEW_REVIEWS;
  const totalReviews   = reviews.length;
  const averageRating  = calculateAverageRating(reviews);
  const ratingDist     = getRatingDistribution(reviews);
  const hasReviews     = totalReviews > 0;
  const previewListings = listings.slice(0, PREVIEW_LISTINGS);
  const hasMoreListings = listings.length > PREVIEW_LISTINGS;
  
  // FIXED: Show total reviews count, not transaction count
  const activeCount = totalReviews;
  const activeLabel = activeTab === 'seller' ? 'reviews as seller' : 'reviews as buyer';

  const currentUid = auth.currentUser?.uid;
  // Owner of this profile page can report reviews left on them
  const isOwnProfile = currentUid === userId;
  const handleReportReview = (review) => setReportReview(review);

  return (
    <>
      <NavBar />

      {/* Report review modal */}
      <ReportModal
        open={!!reportReview}
        onClose={() => setReportReview(null)}
        reportType="review"
        reportedId={reportReview?.id || ''}
        reportedName={`Review by ${reportReview?.reviewerName || 'user'} on "${reportReview?.listingTitle || 'listing'}"`}
      />
      <div className={styles.page}>
        <div className={styles.bgAccent} />
        <div className={styles.backRow}><BackButton onClick={handleBack} /></div>

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
            <div className={styles.profileTopRow}>
              <h2 className={styles.userName}>{profileData.name}</h2>
              <span className={styles.activeDot} title="Active user" />
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
                    <ReviewCard key={review.id} review={review} animate delay={i * 60} onReport={isOwnProfile ? handleReportReview : null} />
                  ))}
                </div>
                {hasMore && (
                  <button className={styles.seeMoreBtn} onClick={() => setReviewDrawerOpen(true)}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                      <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/>
                    </svg>
                    See all {totalReviews} reviews
                  </button>
                )}
              </>
            )}
          </div>

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
                  <button className={styles.seeMoreBtn} onClick={() => setListingDrawerOpen(true)}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                      <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/>
                    </svg>
                    See all {listings.length} listings
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      <Drawer open={reviewDrawerOpen} onClose={() => setReviewDrawerOpen(false)} title={`All ${activeTab} reviews (${totalReviews})`}>
        <div className={styles.drawerReviewList}>
          {reviews.map((review, i) => <ReviewCard key={review.id} review={review} animate delay={i * 40} onReport={isOwnProfile ? handleReportReview : null} />)}
        </div>
      </Drawer>

      <Drawer open={listingDrawerOpen} onClose={() => setListingDrawerOpen(false)} title={`All active listings (${listings.length})`}>
        <div className={styles.drawerListingsGrid}>
          {listings.map((listing, i) => (
            <div key={listing.id} className={styles.listingCardWrap} style={{ animationDelay: `${i * 50}ms` }}>
              <ListingCard listing={listing} visible />
            </div>
          ))}
        </div>
      </Drawer>
    </>
  );
}