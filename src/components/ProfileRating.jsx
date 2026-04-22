import React, { useState, useEffect, useRef } from 'react';
import { auth, db } from '../firebase';
import { onAuthStateChanged } from 'firebase/auth';
import {
  doc, getDoc, collection, query,
  where, getDocs,
} from 'firebase/firestore';
import styles from './ProfileRating.module.css';
import {
  calculateAverageRating,
  getRatingPercentage,
  getRatingDistribution,
} from '../utils/view-rating.utils.js';

const PREVIEW_REVIEWS = 3;

// ─── Drawer ───────────────────────────────────────────────────────────────────

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
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className={styles.drawerBody}>{children}</div>
      </div>
    </div>
  );
}

// ─── Stars ────────────────────────────────────────────────────────────────────

function Stars({ rating, size = 13 }) {
  const r = Math.max(0, Math.min(5, Math.round(rating || 0)));
  return (
    <span className={styles.reviewStars} style={{ fontSize: size }}>
      {'★'.repeat(r)}{'☆'.repeat(5 - r)}
    </span>
  );
}

// ─── Review Card ──────────────────────────────────────────────────────────────

function ReviewCard({ review, animate = false, delay = 0 }) {
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
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <path d="M3 9l4-4 4 4 4-4 4 4" />
            <circle cx="8" cy="15" r="2" />
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
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ProfileRating({ onClose }) {
  const [activeTab, setActiveTab]               = useState('seller');
  const [tabTransitioning, setTabTransitioning] = useState(false);
  const [profileData, setProfileData]           = useState(null);
  const [sellerReviews, setSellerReviews]       = useState([]);
  const [buyerReviews, setBuyerReviews]         = useState([]);
  const [loading, setLoading]                   = useState(true);
  const [error, setError]                       = useState(null);
  const [reviewDrawerOpen, setReviewDrawerOpen] = useState(false);

  // ── Get current user then fetch ───────────────────────────────────────────

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) { setError('Not logged in.'); setLoading(false); return; }
      try {
        await Promise.all([fetchProfile(user), fetchReviews(user.uid)]);
      } catch (err) {
        console.error('ProfileRating fetch error:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    });
    return () => unsub();
  }, []);

  // ── Fetch profile ─────────────────────────────────────────────────────────

  async function fetchProfile(user) {
    const snap = await getDoc(doc(db, 'users', user.uid));
    if (!snap.exists()) throw new Error('User not found.');
    const d = snap.data();
    setProfileData({
      name:           `${d.firstName || ''} ${d.lastName || ''}`.trim() || user.displayName || 'You',
      avatarInitials: ((d.firstName?.[0] || '') + (d.lastName?.[0] || '')).toUpperCase() || '?',
      photoURL:       d.photoURL || user.photoURL || null,
      joinedDate:     d.createdAt?.toDate?.()?.toISOString() || d.createdAt || null,
      bio:            d.bio || '',
    });
  }

  // ── Fetch reviews ─────────────────────────────────────────────────────────

  async function fetchReviews(uid) {
    const snap = await getDocs(
      query(collection(db, 'reviews'), where('reviewedUserId', '==', uid))
    );

    const enriched = await Promise.all(
      snap.docs.map(async (reviewDoc) => {
        const r = { id: reviewDoc.id, ...reviewDoc.data() };

        // Resolve reviewer name
        if (r.reviewerUserId) {
          try {
            const userSnap = await getDoc(doc(db, 'users', r.reviewerUserId));
            if (userSnap.exists()) {
              const d = userSnap.data();
              r.reviewerName = `${d.firstName || ''} ${d.lastName || ''}`.trim()
                || d.displayName || 'Anonymous';
            } else {
              r.reviewerName = 'Anonymous';
            }
          } catch (_) {
            r.reviewerName = 'Anonymous';
          }
        } else {
          r.reviewerName = r.reviewerName || 'Anonymous';
        }

        // Resolve listing title + image
        if (r.listingId) {
          try {
            const listingSnap = await getDoc(doc(db, 'listings', r.listingId));
            if (listingSnap.exists()) {
              const ld = listingSnap.data();
              r.listingTitle = ld.title || 'Listing';
              r.productImage = ld.photos?.[0] || ld.imageUrl || null;
              r.listingImage = r.productImage;
            }
          } catch (_) {}
        }

        return r;
      })
    );

    setSellerReviews(enriched.filter(r => r.role === 'seller'));
    setBuyerReviews(enriched.filter(r => r.role === 'buyer'));
  }

  // ── Tab switch ────────────────────────────────────────────────────────────

  const handleTabSwitch = (tab) => {
    if (tab === activeTab || tabTransitioning) return;
    setTabTransitioning(true);
    setTimeout(() => { setActiveTab(tab); setTabTransitioning(false); }, 220);
  };

  // ── Derived ───────────────────────────────────────────────────────────────

  const reviews        = activeTab === 'seller' ? sellerReviews : buyerReviews;
  const previewReviews = reviews.slice(0, PREVIEW_REVIEWS);
  const hasMore        = reviews.length > PREVIEW_REVIEWS;
  const totalReviews   = reviews.length;
  const averageRating  = calculateAverageRating(reviews);
  const ratingDist     = getRatingDistribution(reviews);
  const hasReviews     = totalReviews > 0;
  const activeLabel    = activeTab === 'seller' ? 'reviews as seller' : 'reviews as buyer';

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) return (
    <div className={styles.page}>
      <div className={styles.loaderWrap}>
        <div className={styles.loaderDots}><span /><span /><span /></div>
        <p className={styles.loaderText}>Loading your ratings...</p>
      </div>
    </div>
  );

  if (error) return (
    <div className={styles.page}>
      <div className={styles.error}>Error: {error}</div>
    </div>
  );

  return (
    <div className={styles.page}>
      <div className={styles.bgAccent} />

      {/* ── Header row ── */}
      <div className={styles.headerRow}>
        <button className={styles.backButton} onClick={onClose}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
          <span>Back to profile</span>
        </button>
        <h2 className={styles.pageTitle}>My Ratings &amp; Reviews</h2>
      </div>

      {/* ── Profile summary card ── */}
      {profileData && (
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
            </div>

            <div className={styles.profileMeta}>
              <div className={styles.ratingRow}>
                {(sellerReviews.length + buyerReviews.length) > 0 ? (
                  <>
                    <span className={styles.starGold}>★</span>
                    <span className={styles.ratingValue}>{calculateAverageRating([...sellerReviews, ...buyerReviews]).toFixed(1)}</span>
                    <span className={styles.ratingCount}>({sellerReviews.length + buyerReviews.length} total reviews)</span>
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
                      <rect x="3" y="4" width="18" height="18" rx="2" />
                      <line x1="16" y1="2" x2="16" y2="6" />
                      <line x1="8" y1="2" x2="8" y2="6" />
                      <line x1="3" y1="10" x2="21" y2="10" />
                    </svg>
                    Joined {new Date(profileData.joinedDate).toLocaleDateString('en-ZA', { month: 'short', year: 'numeric' })}
                  </span>
                </>
              )}
            </div>

            {profileData.bio ? <p className={styles.profileBio}>{profileData.bio}</p> : null}

            {/* ── Tabs ── */}
            <div className={styles.tabGroup}>
              <button
                className={`${styles.tabBtn} ${activeTab === 'seller' ? styles.tabActive : ''}`}
                onClick={() => handleTabSwitch('seller')}
              >
                As Seller <span className={styles.tabCount}>({sellerReviews.length})</span>
              </button>
              <button
                className={`${styles.tabBtn} ${activeTab === 'buyer' ? styles.tabActive : ''}`}
                onClick={() => handleTabSwitch('buyer')}
              >
                As Buyer <span className={styles.tabCount}>({buyerReviews.length})</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Content ── */}
      <div className={`${styles.contentArea} ${tabTransitioning ? styles.contentFading : styles.contentVisible}`}>

        {/* ── Rating distribution ── */}
        {hasReviews && (
          <div className={styles.distributionCard}>
            <div className={styles.distHeader}>
              <div className={styles.distBigRating}>
                <span className={styles.distBigNumber}>{averageRating.toFixed(1)}</span>
                <div className={styles.distBigStars}>
                  {'★'.repeat(Math.round(averageRating))}{'☆'.repeat(5 - Math.round(averageRating))}
                </div>
                <span className={styles.distBigLabel}>{totalReviews} reviews</span>
              </div>
              <div className={styles.distBars}>
                {[5, 4, 3, 2, 1].map(r => {
                  const count = ratingDist[r] || 0;
                  const pct   = getRatingPercentage(count, totalReviews);
                  return (
                    <div key={r} className={styles.distRow}>
                      <span className={styles.distStar}>{r} ★</span>
                      <div className={styles.barTrack}>
                        <div className={styles.barFill} style={{ width: `${pct}%` }} />
                      </div>
                      <span className={styles.distPct}>{pct}%</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ── Reviews section ── */}
        <div className={styles.transactionsSection}>
          <div className={styles.sectionTitleRow}>
            <h3 className={styles.sectionHeader}>
              {activeTab === 'seller' ? 'Reviews as seller' : 'Reviews as buyer'}
            </h3>
            {hasReviews && (
              <span className={styles.reviewCountChip}>{totalReviews} total</span>
            )}
          </div>

          {!hasReviews ? (
            <div className={styles.empty}>
              <svg className={styles.emptyIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <p className={styles.emptyTitle}>No {activeTab} reviews yet</p>
              <p className={styles.emptySubtitle}>Reviews will appear here after completed transactions.</p>
            </div>
          ) : (
            <>
              <div className={styles.transactionsList}>
                {previewReviews.map((review, i) => (
                  <ReviewCard key={review.id} review={review} animate delay={i * 60} />
                ))}
              </div>
              {hasMore && (
                <button className={styles.seeMoreBtn} onClick={() => setReviewDrawerOpen(true)}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="16" />
                    <line x1="8" y1="12" x2="16" y2="12" />
                  </svg>
                  See all {totalReviews} reviews
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── All reviews drawer ── */}
      <Drawer
        open={reviewDrawerOpen}
        onClose={() => setReviewDrawerOpen(false)}
        title={`All ${activeTab} reviews (${totalReviews})`}
      >
        <div className={styles.drawerReviewList}>
          {reviews.map((review, i) => (
            <ReviewCard key={review.id} review={review} animate delay={i * 40} />
          ))}
        </div>
      </Drawer>
    </div>
  );
}