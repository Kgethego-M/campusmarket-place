import { useEffect, useState } from 'react';
import { getUserReviews, getAverageRating } from '../utils/review.utils';

const StarDisplay = ({ rating }) => (
  <span>
    {[1, 2, 3, 4, 5].map((star) => (
      <span
        key={star}
        style={{ color: star <= rating ? '#f5a623' : '#ccc', fontSize: '1.1rem' }}
      >
        ★
      </span>
    ))}
  </span>
);

const ReviewList = ({ reviews }) => {
  if (reviews.length === 0) {
    return <p style={{ textAlign: 'center', color: '#888' }}>No reviews yet.</p>;
  }

  return reviews.map((review) => (
    <div
      key={review.id}
      style={{ borderBottom: '1px solid #eee', padding: '1rem 0' }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <strong>{review.reviewerName}</strong>
        <span style={{ fontSize: '0.8rem', color: '#999' }}>
          {review.createdAt?.toDate
            ? review.createdAt.toDate().toLocaleDateString('en-ZA', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
              })
            : 'Date unavailable'}
        </span>
      </div>

      <div style={{ margin: '0.3rem 0' }}>
        <StarDisplay rating={review.rating} />
        <span style={{ marginLeft: '0.5rem', fontSize: '0.85rem', color: '#666' }}>
          ({review.rating}/5)
        </span>
      </div>

      <p style={{ margin: '0.5rem 0 0', color: '#333' }}>{review.comment}</p>
    </div>
  ));
};

const RatingSummary = ({ reviews, label }) => {
  const average = getAverageRating(reviews);
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '1rem',
        padding: '1rem',
        background: '#f9f9f9',
        borderRadius: '8px',
        marginBottom: '1rem',
      }}
    >
      <div style={{ fontSize: '2.5rem', fontWeight: 'bold', color: '#f5a623' }}>
        {average}
      </div>
      <div>
        <StarDisplay rating={Math.round(parseFloat(average))} />
        <p style={{ margin: '0.2rem 0 0', color: '#666', fontSize: '0.9rem' }}>
          {reviews.length} review{reviews.length !== 1 ? 's' : ''} as {label}
        </p>
      </div>
    </div>
  );
};

const UserReviews = ({ reviewedUserId }) => {
  const [sellerReviews, setSellerReviews] = useState([]);
  const [buyerReviews, setBuyerReviews] = useState([]);
  const [activeTab, setActiveTab] = useState('seller');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!reviewedUserId) return;

    const fetchReviews = async () => {
      try {
        setLoading(true);

        const [sellerData, buyerData] = await Promise.all([
          getUserReviews(reviewedUserId, 'seller'),
          getUserReviews(reviewedUserId, 'buyer'),
        ]);

        const sortByDate = (arr) =>
          arr.sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0));

        setSellerReviews(sortByDate(sellerData));
        setBuyerReviews(sortByDate(buyerData));
      } catch (err) {
        console.error('Failed to load reviews:', err);
        setError('Could not load reviews. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    fetchReviews();
  }, [reviewedUserId]);

  if (loading) return <p style={{ textAlign: 'center' }}>Loading reviews...</p>;
  if (error) return <p style={{ color: 'red', textAlign: 'center' }}>{error}</p>;

  const tabStyle = (tab) => ({
    padding: '0.6rem 1.5rem',
    border: 'none',
    borderBottom: activeTab === tab ? '2px solid #f5a623' : '2px solid transparent',
    background: 'none',
    fontWeight: activeTab === tab ? 'bold' : 'normal',
    cursor: 'pointer',
    fontSize: '1rem',
    color: activeTab === tab ? '#f5a623' : '#555',
  });

  return (
    <div style={{ maxWidth: '600px', margin: '0 auto', padding: '1rem' }}>
      <h3 style={{ marginBottom: '1rem' }}>Reviews</h3>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid #eee', marginBottom: '1rem' }}>
        <button style={tabStyle('seller')} onClick={() => setActiveTab('seller')}>
          As Seller ({sellerReviews.length})
        </button>
        <button style={tabStyle('buyer')} onClick={() => setActiveTab('buyer')}>
          As Buyer ({buyerReviews.length})
        </button>
      </div>

      {/* Seller Tab */}
      {activeTab === 'seller' && (
        <>
          <RatingSummary reviews={sellerReviews} label="a Seller" />
          <ReviewList reviews={sellerReviews} />
        </>
      )}

      {/* Buyer Tab */}
      {activeTab === 'buyer' && (
        <>
          <RatingSummary reviews={buyerReviews} label="a Buyer" />
          <ReviewList reviews={buyerReviews} />
        </>
      )}
    </div>
  );
};

export default UserReviews;