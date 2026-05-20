// src/pages/ReviewForm.jsx
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { auth, db } from '../firebase';
import { doc, getDoc } from 'firebase/firestore';
import { submitReview } from '../utils/review.utils';
import styles from "./ReviewForm.module.css";

const LABELS = ['', 'Poor', 'Fair', 'Good', 'Very Good', 'Excellent'];

const ReviewForm = () => {
  const { transactionId: listingId } = useParams();
  const navigate = useNavigate();

  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const [listingTitle, setListingTitle] = useState('');
  const [listingPrice, setListingPrice] = useState('');

  const params = new URLSearchParams(window.location.search);
  const reviewedUserId   = params.get('reviewedUserId') || '';
  const reviewedUserName = params.get('name') || 'this user';
  const role             = params.get('role') || 'seller';
  const purchaseId       = params.get('purchaseId') || '';

  // Fetch listing details to show item info
  useEffect(() => {
    if (!listingId) return;
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'listings', listingId));
        if (snap.exists()) {
          const d = snap.data();
          setListingTitle(d.title || d.Title || '');
          const price = d.price || d.Price || null;
          if (price) setListingPrice(`R${Number(price).toLocaleString('en-ZA')}`);
        }
      } catch (err) {
        console.warn('ReviewForm: could not load listing', err);
      }
    })();
  }, [listingId]);

  const handleSubmit = async () => {
    if (rating === 0) {
      setError('Please select a star rating before submitting.');
      return;
    }
    if (!listingId) {
      setError('Missing listing information. Please go back and try again.');
      return;
    }
    setError('');
    setSubmitting(true);

    try {
      await submitReview({
        reviewedUserId,
        reviewerUserId: user?.uid || '',
        reviewerName:   user?.displayName || 'Anonymous',
        listingId,
        purchaseId,
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

  // Handle star click - just set the rating directly
  const handleStarClick = (starValue) => {
    setRating(starValue);
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
            {/* Item details */}
            {listingTitle && (
              <div className={styles.itemChip}>
                <i className="fa-solid fa-tag" style={{ fontSize: '0.75rem' }} />
                <span>{listingTitle}</span>
                {listingPrice && (
                  <span className={styles.itemPrice}>{listingPrice}</span>
                )}
              </div>
            )}
          </div>
        </div>

        <div className={styles.section}>
          <label className={styles.label}>Star Rating</label>
          <div className={styles.stars}>
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                className={`${styles.star} ${star <= rating ? styles.starFilled : ''}`}
                onClick={() => handleStarClick(star)}
                aria-label={`${star} star`}
              >
                ★
              </button>
            ))}
          </div>
          {rating > 0 && (
            <p className={styles.ratingLabel}>{LABELS[rating]}</p>
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