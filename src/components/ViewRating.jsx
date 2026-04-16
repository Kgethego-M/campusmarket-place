import React, { useState, useEffect } from 'react';
import styles from './ViewRating.module.css';
import {
  calculateAverageRating,
  formatRatingCount,
  getRatingPercentage,
  getRatingDistribution,
} from '../utils/view-rating.utils.js';
import NavBar from "./NavBarTemp.jsx";

const ViewSellerRatings = ({ userId, userType = 'seller' }) => {
  const [activeTab, setActiveTab] = useState('seller');
  const [profileData, setProfileData] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // Add state for review counts
  const [sellerReviewCount, setSellerReviewCount] = useState(0);
  const [buyerReviewCount, setBuyerReviewCount] = useState(0);

  useEffect(() => {
    fetchProfileData();
  }, [userId, activeTab]);

  const fetchProfileData = async () => {
    setLoading(true);
    try {
      await new Promise(resolve => setTimeout(resolve, 500));

      const mockData = {
        profile: {
          name: "John Doe",
          avatarInitials: "JD",
          completedSales: 42,
          completedPurchases: 18,
          joinedDate: '2023-08-01',
        },
        sellerReviews: [
          {
            id: 1,
            productName: "Calculus Textbook",
            price: "R350",
            tradedFor: "Physics Book",
            reviewerName: "Kgethie",
            rating: 5,
            comment: "Trade was fair, description of product was accurate",
            date: "2024-03-15",
          },
          {
            id: 2,
            productName: "Gaming Mouse",
            price: "R250",
            tradedFor: null,
            reviewerName: "Micky",
            rating: 4,
            comment: "Condition was worse than I thought, could have negotiated for a lower price",
            date: "2024-03-10",
          },
          {
            id: 3,
            productName: "Desk Lamp",
            price: "R120",
            tradedFor: null,
            reviewerName: "Sarah",
            rating: 5,
            comment: "Great condition, works perfectly!",
            date: "2024-03-05",
          },
        ],
        buyerReviews: [
          {
            id: 4,
            productName: "JavaScript Textbook",
            price: "R200",
            tradedFor: null,
            reviewerName: "Thabo",
            rating: 4,
            comment: "Buyer was responsive and picked up on time",
            date: "2024-02-20",
          },
          {
            id: 5,
            productName: "Headphones",
            price: "R450",
            tradedFor: null,
            reviewerName: "Lena",
            rating: 5,
            comment: "Great buyer, smooth transaction!",
            date: "2024-02-10",
          },
        ],
      };

      setProfileData(mockData.profile);
      setReviews(activeTab === 'seller' ? mockData.sellerReviews : mockData.buyerReviews);
      // Store the review counts in state
      setSellerReviewCount(mockData.sellerReviews.length);
      setBuyerReviewCount(mockData.buyerReviews.length);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className={styles.loader}>Loading profile...</div>;
  if (error) return <div className={styles.error}>Error: {error}</div>;
  if (!profileData) return <div className={styles.error}>No profile data found</div>;

  // Get the current reviews based on active tab
  const currentReviews = reviews;
  const totalReviews = currentReviews.length;
  const averageRating = calculateAverageRating(currentReviews);
  
  // Get completed transactions based on active tab (for the rating display)
  const completedTransactions = activeTab === 'seller'
    ? profileData.completedSales
    : profileData.completedPurchases;
  
  const ratingDistribution = getRatingDistribution(currentReviews);
  const hasReviews = totalReviews > 0;

  return (
    <>
      <NavBar />
      <div className={styles.page}>

        {/* Profile Card */}
        <div className={styles.profileCard}>
          <div className={styles.avatarCircle}>
            {profileData.avatarInitials || profileData.name?.charAt(0)}
          </div>

          <div className={styles.profileInfo}>
            <div className={styles.profileTopRow}>
              <h2 className={styles.userName}>{profileData.name}</h2>
            </div>

            <div className={styles.profileMeta}>
              <div className={styles.ratingRow}>
                {hasReviews ? (
                  <>
                    <span className={styles.starGold}>★</span>
                    <span className={styles.ratingValue}>{averageRating.toFixed(1)}</span>
                    <span className={styles.ratingCount}>
                      ({formatRatingCount(completedTransactions)} {activeTab === 'seller' ? 'trades' : 'purchases'})
                    </span>
                  </>
                ) : (
                  <span className={styles.noRating}>No reviews yet</span>
                )}
              </div>

              <span className={styles.metaItem}>
                <svg className={styles.metaIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
                </svg>
                Joined {new Date(profileData.joinedDate || '2023-08-01').toLocaleDateString('en-ZA', { month: 'short', year: 'numeric' })}
              </span>
            </div>

            {/* Tab Toggle - Now shows REVIEW counts, not completed transactions */}
            <div className={styles.tabGroup}>
              <button
                className={`${styles.tabBtn} ${activeTab === 'seller' ? styles.tabActive : ''}`}
                onClick={() => setActiveTab('seller')}
              >
                As Seller
                <span className={styles.tabCount}>({sellerReviewCount} reviews)</span>
              </button>
              <button
                className={`${styles.tabBtn} ${activeTab === 'buyer' ? styles.tabActive : ''}`}
                onClick={() => setActiveTab('buyer')}
              >
                As Buyer
                <span className={styles.tabCount}>({buyerReviewCount} reviews)</span>
              </button>
            </div>
          </div>
        </div>

        {/* Rating Distribution - Only shows if there are reviews for current tab */}
        {hasReviews && (
          <div className={styles.distributionCard}>
            <p className={styles.sectionLabel}>Rating distribution</p>
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
                  <span className={styles.distCount}>({count})</span>
                </div>
              );
            })}
          </div>
        )}

        {/* Transactions List */}
        <div className={styles.transactionsSection}>
          <h3 className={styles.sectionHeader}>
            {activeTab === 'seller' ? "Seller's previous sales/trades" : "Buyer's previous purchases"}
          </h3>

          {currentReviews.length === 0 ? (
            <div className={styles.empty}>
              <svg
                className={styles.emptyIcon}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <p className={styles.emptyTitle}>
                No {activeTab === 'seller' ? 'sales or trades' : 'purchases'} yet
              </p>
              <p className={styles.emptySubtitle}>
                {activeTab === 'seller'
                  ? 'Completed sales and trades will appear here.'
                  : 'Completed purchases will appear here.'}
              </p>
            </div>
          ) : (
            <div className={styles.transactionsList}>
              {currentReviews.map((review, index) => {
                const meta = activeTab === 'seller'
                  ? (review.tradedFor ? `Trade: ${review.tradedFor}` : `Sale: ${review.price}`)
                  : `Purchase: ${review.price}`;
                const formattedDate = review.date
                  ? new Date(review.date).toLocaleDateString('en-ZA', {
                      day: 'numeric', month: 'short', year: 'numeric'
                    })
                  : null;

                return (
                  <div key={review.id || index} className={styles.txCard}>
                    {/* Product image placeholder */}
                    <div className={styles.txImage}>
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={styles.imgIcon}>
                        <rect x="3" y="3" width="18" height="18" rx="2" />
                        <path d="M3 9l4-4 4 4 4-4 4 4" />
                        <circle cx="8" cy="15" r="2" />
                      </svg>
                    </div>

                    <div className={styles.txBody}>
                      <div className={styles.txProduct}>{review.productName}</div>
                      <div className={styles.txMeta}>{meta}</div>

                      <div className={styles.reviewerRow}>
                        <span className={styles.reviewerName}>{review.reviewerName}</span>
                        <span className={styles.reviewStars}>
                          {'★'.repeat(review.rating)}{'☆'.repeat(5 - review.rating)}
                        </span>
                      </div>

                      <p className={styles.reviewComment}>{review.comment}</p>

                      {formattedDate && (
                        <div className={styles.reviewDate}>{formattedDate}</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </div>
    </>
  );
};

export default ViewSellerRatings;