import React, { useState, useEffect, useRef } from 'react';
import styles from './ViewRating.module.css';
import {
  calculateAverageRating,
  formatRatingCount,
  getRatingPercentage,
  getRatingDistribution,
} from '../utils/view-rating.utils.js';
import NavBar from "./NavBarTemp.jsx";
import ListingCard from "./ListingCard.jsx";

// ── Mock listings for this seller ──────────────────────────────
const MOCK_LISTINGS = [
  { id: 'l1', title: 'Calculus Textbook 3rd Ed.', price: 350, condition: 'Good', listingType: 'For Sale', sellerName: 'John Doe', imageUrl: null },
  { id: 'l2', title: 'Mechanical Keyboard', price: 480, condition: 'Like New', listingType: 'Either', sellerName: 'John Doe', imageUrl: null },
  { id: 'l3', title: 'Study Desk Lamp', price: 120, condition: 'Good', listingType: 'For Sale', sellerName: 'John Doe', imageUrl: null },
  { id: 'l4', title: 'Physics Notes Bundle', price: 80, condition: 'Good', listingType: 'For Trade', sellerName: 'John Doe', imageUrl: null },
  { id: 'l5', title: 'Scientific Calculator', price: 200, condition: 'Like New', listingType: 'For Sale', sellerName: 'John Doe', imageUrl: null },
  { id: 'l6', title: 'Laptop Stand', price: 150, condition: 'New', listingType: 'For Sale', sellerName: 'John Doe', imageUrl: null },
  { id: 'l7', title: 'Wireless Mouse', price: 180, condition: 'Like New', listingType: 'For Sale', sellerName: 'John Doe', imageUrl: null },
  { id: 'l8', title: 'Programming Notes (CS)', price: 60, condition: 'Good', listingType: 'For Trade', sellerName: 'John Doe', imageUrl: null },
  { id: 'l9', title: 'External Hard Drive 1TB', price: 550, condition: 'Good', listingType: 'For Sale', sellerName: 'John Doe', imageUrl: null },
  { id: 'l10', title: 'Noise Cancelling Headphones', price: 650, condition: 'Like New', listingType: 'For Sale', sellerName: 'John Doe', imageUrl: null },
  { id: 'l11', title: 'Coffee Mug - Campus Edition', price: 45, condition: 'New', listingType: 'For Sale', sellerName: 'John Doe', imageUrl: null },
  { id: 'l12', title: 'Backpack (Used)', price: 200, condition: 'Fair', listingType: 'For Sale', sellerName: 'John Doe', imageUrl: null },
];

const PREVIEW_REVIEWS = 3;
const PREVIEW_LISTINGS = 7;

// ── Drawer component ───────────────────────────────────────────
function Drawer({ open, onClose, title, children }) {
  const overlayRef = useRef(null);

  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  useEffect(() => {
    const handleKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
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
        <div className={styles.drawerBody}>
          {children}
        </div>
      </div>
    </div>
  );
}

// ── Star display ───────────────────────────────────────────────
function Stars({ rating, size = 13 }) {
  return (
    <span className={styles.reviewStars} style={{ fontSize: size }}>
      {'★'.repeat(rating)}{'☆'.repeat(5 - rating)}
    </span>
  );
}

// ── Review card (reused in page + drawer) ──────────────────────
function ReviewCard({ review, activeTab, animate = false, delay = 0 }) {
  const meta = activeTab === 'seller'
    ? (review.tradedFor ? `Trade: ${review.tradedFor}` : `Sale: ${review.price}`)
    : `Purchase: ${review.price}`;
  const formattedDate = review.date
    ? new Date(review.date).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })
    : null;

  return (
    <div
      className={`${styles.txCard} ${animate ? styles.txCardAnimate : ''}`}
      style={animate ? { animationDelay: `${delay}ms` } : {}}
    >
      <div className={styles.txImage}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={styles.imgIcon}>
          <rect x="3" y="3" width="18" height="18" rx="2"/>
          <path d="M3 9l4-4 4 4 4-4 4 4"/>
          <circle cx="8" cy="15" r="2"/>
        </svg>
      </div>
      <div className={styles.txBody}>
        <div className={styles.txProduct}>{review.productName}</div>
        <div className={styles.txMeta}>{meta}</div>
        <div className={styles.reviewerRow}>
          <span className={styles.reviewerName}>{review.reviewerName}</span>
          <Stars rating={review.rating} />
        </div>
        <p className={styles.reviewComment}>{review.comment}</p>
        {formattedDate && <div className={styles.reviewDate}>{formattedDate}</div>}
      </div>
    </div>
  );
}

// ── Back Button Component ──────────────────────────────────────
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

// ── Main component ─────────────────────────────────────────────
const ViewSellerRatings = ({ userId, userType = 'seller', onBack }) => {
  const [activeTab, setActiveTab] = useState('seller');
  const [pendingTab, setPendingTab] = useState(null);
  const [tabTransitioning, setTabTransitioning] = useState(false);
  const [profileData, setProfileData] = useState(null);
  const [sellerReviews, setSellerReviews] = useState([]);
  const [buyerReviews, setBuyerReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [listings, setListings] = useState([]);

  // Drawer states
  const [reviewDrawerOpen, setReviewDrawerOpen] = useState(false);
  const [listingDrawerOpen, setListingDrawerOpen] = useState(false);

  useEffect(() => { fetchProfileData(); }, [userId]);

  const fetchProfileData = async () => {
    setLoading(true);
    try {
      await new Promise(resolve => setTimeout(resolve, 400));
      const mockData = {
        profile: {
          name: "John Doe",
          avatarInitials: "JD",
          totalSalesTrades: 42,
          totalPurchases: 18,
          joinedDate: '2023-08-01',
        },
        sellerReviews: [
          { id: 1, productName: "Calculus Textbook", price: "R350", tradedFor: "Physics Book", reviewerName: "Kgethie", rating: 5, comment: "Trade was fair, description of product was accurate", date: "2024-03-15" },
          { id: 2, productName: "Gaming Mouse", price: "R250", tradedFor: null, reviewerName: "Micky", rating: 4, comment: "Condition was worse than I thought, could have negotiated for a lower price", date: "2024-03-10" },
          { id: 3, productName: "Desk Lamp", price: "R120", tradedFor: null, reviewerName: "Sarah", rating: 5, comment: "Great condition, works perfectly!", date: "2024-03-05" },
          { id: 6, productName: "Python Textbook", price: "R180", tradedFor: null, reviewerName: "Lerato", rating: 5, comment: "Exactly as described, very helpful seller!", date: "2024-02-28" },
          { id: 7, productName: "USB Hub", price: "R90", tradedFor: null, reviewerName: "Amos", rating: 3, comment: "Took a while to respond but item was fine.", date: "2024-02-20" },
          { id: 11, productName: "Mechanical Keyboard", price: "R480", tradedFor: null, reviewerName: "Tshepo", rating: 5, comment: "Amazing keyboard, exactly as described!", date: "2024-02-15" },
        ],
        buyerReviews: [
          { id: 4, productName: "JavaScript Textbook", price: "R200", tradedFor: null, reviewerName: "Thabo", rating: 4, comment: "Buyer was responsive and picked up on time", date: "2024-02-20" },
          { id: 5, productName: "Headphones", price: "R450", tradedFor: null, reviewerName: "Lena", rating: 5, comment: "Great buyer, smooth transaction!", date: "2024-02-10" },
          { id: 8, productName: "Study Chair", price: "R600", tradedFor: null, reviewerName: "Priya", rating: 5, comment: "Super punctual, no hassle at all.", date: "2024-01-30" },
          { id: 12, productName: "Graphics Tablet", price: "R800", tradedFor: null, reviewerName: "Neo", rating: 5, comment: "Quick payment, would trade with again!", date: "2024-01-25" },
        ],
      };
      setProfileData(mockData.profile);
      setSellerReviews(mockData.sellerReviews);
      setBuyerReviews(mockData.buyerReviews);
      setListings(MOCK_LISTINGS);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const getActiveTabCount = () => {
    if (activeTab === 'seller') {
      return profileData?.totalSalesTrades || 0;
    } else {
      return profileData?.totalPurchases || 0;
    }
  };

  const getActiveTabLabel = () => {
    if (activeTab === 'seller') {
      return 'total sales/trades';
    } else {
      return 'total purchases';
    }
  };

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      window.history.back();
    }
  };

  const handleTabSwitch = (tab) => {
    if (tab === activeTab || tabTransitioning) return;
    setPendingTab(tab);
    setTabTransitioning(true);
    setTimeout(() => {
      setActiveTab(tab);
      setTabTransitioning(false);
      setPendingTab(null);
    }, 220);
  };

  if (loading) return (
    <div className={styles.loaderWrap}>
      <div className={styles.loaderDots}>
        <span /><span /><span />
      </div>
      <p className={styles.loaderText}>Loading profile...</p>
    </div>
  );
  if (error) return <div className={styles.error}>Error: {error}</div>;
  if (!profileData) return <div className={styles.error}>No profile data found</div>;

  const reviews = activeTab === 'seller' ? sellerReviews : buyerReviews;
  const previewReviews = reviews.slice(0, PREVIEW_REVIEWS);
  const hasMore = reviews.length > PREVIEW_REVIEWS;
  const totalReviews = reviews.length;
  const averageRating = calculateAverageRating(reviews);
  const ratingDistribution = getRatingDistribution(reviews);
  const hasReviews = totalReviews > 0;

  const previewListings = listings.slice(0, PREVIEW_LISTINGS);
  const hasMoreListings = listings.length > PREVIEW_LISTINGS;

  const activeCount = getActiveTabCount();
  const activeLabel = getActiveTabLabel();

  return (
    <>
      <NavBar />
      <div className={styles.page}>

        {/* ── Decorative background accent ── */}
        <div className={styles.bgAccent} />

        {/* ── Back Button Row ── */}
        <div className={styles.backRow}>
          <BackButton onClick={handleBack} />
        </div>

        {/* ── Profile Card ── */}
        <div className={styles.profileCard}>
          <div className={styles.avatarWrap}>
            <div className={styles.avatarCircle}>
              {profileData.avatarInitials || profileData.name?.charAt(0)}
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
                    <span className={styles.ratingCount}>
                      ({activeCount} {activeLabel})
                    </span>
                  </>
                ) : (
                  <span className={styles.noRating}>No reviews yet</span>
                )}
              </div>

              <span className={styles.metaDivider}>·</span>

              <span className={styles.metaItem}>
                <svg className={styles.metaIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4" width="18" height="18" rx="2"/>
                  <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/>
                  <line x1="3" y1="10" x2="21" y2="10"/>
                </svg>
                Joined {new Date(profileData.joinedDate || '2023-08-01').toLocaleDateString('en-ZA', { month: 'short', year: 'numeric' })}
              </span>
            </div>

            <div className={styles.tabGroup}>
              <button
                className={`${styles.tabBtn} ${activeTab === 'seller' ? styles.tabActive : ''}`}
                onClick={() => handleTabSwitch('seller')}
              >
                As Seller
                <span className={styles.tabCount}>({sellerReviews.length})</span>
              </button>
              <button
                className={`${styles.tabBtn} ${activeTab === 'buyer' ? styles.tabActive : ''}`}
                onClick={() => handleTabSwitch('buyer')}
              >
                As Buyer
                <span className={styles.tabCount}>({buyerReviews.length})</span>
              </button>
            </div>
          </div>
        </div>

        {/* ── Animated content area ── */}
        <div className={`${styles.contentArea} ${tabTransitioning ? styles.contentFading : styles.contentVisible}`}>

          {/* ── Rating Distribution ── */}
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
                  {[5, 4, 3, 2, 1].map(rating => {
                    const count = ratingDistribution[rating] || 0;
                    const percentage = getRatingPercentage(count, totalReviews);
                    return (
                      <div key={rating} className={styles.distRow}>
                        <span className={styles.distStar}>{rating} ★</span>
                        <div className={styles.barTrack}>
                          <div className={styles.barFill} style={{ width: `${percentage}%` }} />
                        </div>
                        <span className={styles.distPct}>{percentage}%</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ── Reviews Section ── */}
          <div className={styles.transactionsSection}>
            <div className={styles.sectionTitleRow}>
              <h3 className={styles.sectionHeader}>
                {activeTab === 'seller' ? "Seller reviews" : "Buyer reviews"}
              </h3>
              {hasReviews && (
                <span className={styles.reviewCountChip}>{totalReviews} total</span>
              )}
            </div>

            {!hasReviews ? (
              <div className={styles.empty}>
                <svg className={styles.emptyIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8"/>
                  <line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
                <p className={styles.emptyTitle}>No {activeTab === 'seller' ? 'seller' : 'buyer'} reviews yet</p>
                <p className={styles.emptySubtitle}>Reviews will appear here after completed transactions.</p>
              </div>
            ) : (
              <>
                <div className={styles.transactionsList}>
                  {previewReviews.map((review, i) => (
                    <ReviewCard
                      key={review.id}
                      review={review}
                      activeTab={activeTab}
                      animate
                      delay={i * 60}
                    />
                  ))}
                </div>

                {hasMore && (
                  <button className={styles.seeMoreBtn} onClick={() => setReviewDrawerOpen(true)}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
                    See all {totalReviews} reviews
                  </button>
                )}
              </>
            )}
          </div>

          {/* ── Active Listings Section ── */}
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
                    <div
                      key={listing.id}
                      className={styles.listingCardWrap}
                      style={{ animationDelay: `${i * 70}ms` }}
                    >
                      <ListingCard listing={listing} visible />
                    </div>
                  ))}
                </div>

                {hasMoreListings && (
                  <button className={styles.seeMoreBtn} onClick={() => setListingDrawerOpen(true)}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
                    See all {listings.length} listings
                  </button>
                )}
              </>
            )}
          </div>

        </div>{/* end contentArea */}
      </div>

      {/* ── Reviews Drawer ── */}
      <Drawer
        open={reviewDrawerOpen}
        onClose={() => setReviewDrawerOpen(false)}
        title={`All ${activeTab === 'seller' ? 'seller' : 'buyer'} reviews (${totalReviews})`}
      >
        <div className={styles.drawerReviewList}>
          {reviews.map((review, i) => (
            <ReviewCard key={review.id} review={review} activeTab={activeTab} animate delay={i * 40} />
          ))}
        </div>
      </Drawer>

      {/* ── Listings Drawer ── */}
      <Drawer
        open={listingDrawerOpen}
        onClose={() => setListingDrawerOpen(false)}
        title={`All active listings (${listings.length})`}
      >
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
};

export default ViewSellerRatings;