import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { auth } from '../firebase';
import { submitReview } from '../utils/review.utils';
import styles from "../pages/ReviewForm.module.css";

const LABELS = ['', 'Poor', 'Fair', 'Good', 'Very Good', 'Excellent'];

const ReviewForm = () => {
  const { transactionId: listingId } = useParams(); // route param is :transactionId but value is the listingId
  const navigate = useNavigate();

  const [rating, setRating] = useState(0);
  const [hovered, setHovered] = useState(0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  const params = new URLSearchParams(window.location.search);
  const reviewedUserId = params.get('reviewedUserId') || '';
  const reviewedUserName = params.get('name') || 'this user';
  const role = params.get('role') || 'seller';
  const purchaseId = params.get('purchaseId') || '';

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
      const user = auth.currentUser;
      await submitReview({
        reviewedUserId,
        reviewerUserId: user?.uid || '',
        reviewerName: user?.displayName || 'Anonymous',
        listingId,
        purchaseId, // stored in review so NotificationsPage can check it
        rating,
        comment,
        role,
      });
      setSubmitted(true);
    } catch (err) {
      console.error(err);
      setError('Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
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
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <button className={styles.backBtn} onClick={() => navigate(-1)}>
          ← Back
        </button>

        <div className={styles.heading}>
          <div className={styles.avatar}>
            {reviewedUserName.charAt(0).toUpperCase()}
          </div>
          <div>
            <h2 className={styles.title}>Rate your experience</h2>
            <p className={styles.sub}>
              with <strong>{reviewedUserName}</strong> as a {role}
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
