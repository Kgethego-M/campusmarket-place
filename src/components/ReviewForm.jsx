import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { auth, db } from '../firebase';
import { doc, getDoc } from 'firebase/firestore';
import { submitReview } from '../utils/review.utils';
import styles from "../pages/ReviewForm.module.css";

const LABELS = ['', 'Poor', 'Fair', 'Good', 'Very Good', 'Excellent'];

const ReviewForm = () => {
  const { transactionId } = useParams();
  const navigate = useNavigate();

  const [rating, setRating]           = useState(0);
  const [hovered, setHovered]         = useState(0);
  const [comment, setComment]         = useState('');
  const [submitting, setSubmitting]   = useState(false);
  const [submitted, setSubmitted]     = useState(false);
  const [error, setError]             = useState('');
  const [purchase, setPurchase]       = useState(null);
  const [loading, setLoading]         = useState(true);

  const currentUser = auth.currentUser;

  useEffect(() => {
    const fetchPurchase = async () => {
      try {
        const purchaseDoc = await getDoc(doc(db, 'Purchases', transactionId));
        if (!purchaseDoc.exists()) {
          setError('Purchase not found.');
          return;
        }
        setPurchase({ id: purchaseDoc.id, ...purchaseDoc.data() });
      } catch (err) {
        console.error(err);
        setError('Failed to load purchase.');
      } finally {
        setLoading(false);
      }
    };

    if (transactionId) fetchPurchase();
  }, [transactionId]);

  const getReviewTarget = () => {
    if (!purchase || !currentUser) return null;

    const isBuyer  = currentUser.uid === purchase.buyerId;
    const isSeller = currentUser.uid === purchase.sellerId;

    if (isBuyer) {
      return { reviewedUserId: purchase.sellerId, role: 'seller' };
    } else if (isSeller) {
      return { reviewedUserId: purchase.buyerId, role: 'buyer' };
    }
    return null;
  };

  const handleSubmit = async () => {
    if (rating === 0) {
      setError('Please select a star rating before submitting.');
      return;
    }

    const target = getReviewTarget();
    if (!target) {
      setError('You are not part of this purchase.');
      return;
    }

    setError('');
    setSubmitting(true);

    try {
      await submitReview({
        reviewedUserId: target.reviewedUserId,
        reviewerUserId: currentUser.uid,
        reviewerName:   currentUser.displayName || 'Anonymous',
        listingId:      purchase.listingId || '',
        purchaseId:     transactionId,
        rating,
        comment,
        role:           target.role,
      });
      setSubmitted(true);
    } catch (err) {
      console.error(err);
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return (
    <div className={styles.page}>
      <div className={styles.card}>
        <p style={{ textAlign: 'center' }}>Loading...</p>
      </div>
    </div>
  );

  if (submitted) return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.successIcon}>✓</div>
        <h2 className={styles.successTitle}>Review Submitted!</h2>
        <p className={styles.successSub}>
          Thanks for helping the campus community make informed decisions.
        </p>
        <button className={styles.doneBtn} onClick={() => navigate('/view-listing')}>
          Back to Listings
        </button>
      </div>
    </div>
  );

  const target = getReviewTarget();

  if (!target) return (
    <div className={styles.page}>
      <div className={styles.card}>
        <p style={{ textAlign: 'center', color: 'red' }}>
          You are not part of this purchase or it no longer exists.
        </p>
        <button className={styles.doneBtn} onClick={() => navigate(-1)}>Go Back</button>
      </div>
    </div>
  );

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <button className={styles.backBtn} onClick={() => navigate(-1)}>← Back</button>

        <div className={styles.heading}>
          <div className={styles.avatar}>
            {target.role === 'seller' ? 'S' : 'B'}
          </div>
          <div>
            <h2 className={styles.title}>Rate your experience</h2>
            <p className={styles.sub}>
              You are reviewing the <strong>{target.role}</strong> of this purchase
            </p>
          </div>
        </div>

        <div className={styles.section}>
          <label className={styles.label}>Star Rating</label>
          <div className={styles.stars}>
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                className={`${styles.star} ${star <= (hovered || rating) ? styles.starFilled : ''}`}
                onMouseEnter={() => setHovered(star)}
                onMouseLeave={() => setHovered(0)}
                onClick={() => setRating(star)}
                aria-label={`${star} star`}
              >
                ★
              </button>
            ))}
          </div>
          {(hovered || rating) > 0 && (
            <p className={styles.ratingLabel}>{LABELS[hovered || rating]}</p>
          )}
        </div>

        <div className={styles.section}>
          <label className={styles.label} htmlFor="comment">
            Written Review <span className={styles.optional}>(optional)</span>
          </label>
          <textarea
            id="comment"
            className={styles.textarea}
            placeholder="Describe your experience — was the item as described? Was communication smooth?"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={4}
            maxLength={500}
          />
          <p className={styles.charCount}>{comment.length}/500</p>
        </div>

        {error && <p className={styles.error}>{error}</p>}

        <button
          className={styles.submitBtn}
          onClick={handleSubmit}
          disabled={submitting}
        >
          {submitting ? 'Submitting…' : 'Submit Review'}
        </button>
      </div>
    </div>
  );
};

export default ReviewForm;