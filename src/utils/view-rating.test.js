import {
  calculateAverageRating,
  formatRatingCount,
  getRatingPercentage,
  getRatingDistribution,
  validateReview,
  canLeaveReview,
  getReviewType,
  sortReviewsByDate,
  filterReviewsByRating,
  getReviewSummary
} from './view-rating.utils';

describe('View Ratings Utilities', () => {
  describe('calculateAverageRating', () => {
    test('returns 0 for empty reviews array', () => {
      expect(calculateAverageRating([])).toBe(0);
    });

    test('returns 0 for null or undefined', () => {
      expect(calculateAverageRating(null)).toBe(0);
      expect(calculateAverageRating(undefined)).toBe(0);
    });

    test('calculates average correctly for valid reviews', () => {
      const reviews = [
        { rating: 5 },
        { rating: 4 },
        { rating: 3 }
      ];
      expect(calculateAverageRating(reviews)).toBe(4.0);
    });

    test('rounds to 1 decimal place', () => {
      const reviews = [
        { rating: 5 },
        { rating: 4 },
        { rating: 4 }
      ];
      expect(calculateAverageRating(reviews)).toBe(4.3);
    });
  });

  describe('formatRatingCount', () => {
    test('returns string number for counts under 1000', () => {
      expect(formatRatingCount(25)).toBe('25');
      expect(formatRatingCount(999)).toBe('999');
    });

    test('returns formatted thousands for counts >= 1000', () => {
      expect(formatRatingCount(1000)).toBe('1.0k');
      expect(formatRatingCount(1500)).toBe('1.5k');
      expect(formatRatingCount(2500)).toBe('2.5k');
    });
  });

  describe('getRatingPercentage', () => {
    test('returns 0 when total is 0', () => {
      expect(getRatingPercentage(5, 0)).toBe(0);
    });

    test('calculates percentage correctly', () => {
      expect(getRatingPercentage(25, 100)).toBe(25);
      expect(getRatingPercentage(50, 200)).toBe(25);
      expect(getRatingPercentage(3, 10)).toBe(30);
    });

    test('rounds to nearest integer', () => {
      expect(getRatingPercentage(1, 3)).toBe(33);
      expect(getRatingPercentage(2, 3)).toBe(67);
    });
  });

  describe('getRatingDistribution', () => {
    test('returns zero counts for empty reviews', () => {
      const distribution = getRatingDistribution([]);
      expect(distribution[1]).toBe(0);
      expect(distribution[2]).toBe(0);
      expect(distribution[3]).toBe(0);
      expect(distribution[4]).toBe(0);
      expect(distribution[5]).toBe(0);
    });

    test('counts reviews correctly by rating', () => {
      const reviews = [
        { rating: 5 },
        { rating: 5 },
        { rating: 4 },
        { rating: 3 },
        { rating: 1 }
      ];
      const distribution = getRatingDistribution(reviews);
      expect(distribution[5]).toBe(2);
      expect(distribution[4]).toBe(1);
      expect(distribution[3]).toBe(1);
      expect(distribution[2]).toBe(0);
      expect(distribution[1]).toBe(1);
    });

    test('handles decimal ratings by flooring', () => {
      const reviews = [
        { rating: 4.8 },
        { rating: 4.2 }
      ];
      const distribution = getRatingDistribution(reviews);
      expect(distribution[4]).toBe(2);
    });
  });

  describe('validateReview', () => {
    const validReview = {
      rating: 5,
      comment: 'Great product!',
      productId: 'prod123',
      revieweeId: 'user456'
    };

    test('returns isValid true for valid review', () => {
      const result = validateReview(validReview);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('returns error for invalid rating', () => {
      const review = { ...validReview, rating: 6 };
      const result = validateReview(review);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Rating must be between 1 and 5');
    });

    test('returns error for missing comment', () => {
      const review = { ...validReview, comment: '' };
      const result = validateReview(review);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Comment is required');
    });

    test('returns error for comment exceeding 500 chars', () => {
      const review = { ...validReview, comment: 'a'.repeat(501) };
      const result = validateReview(review);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Comment cannot exceed 500 characters');
    });

    test('returns error for missing productId', () => {
      const review = { ...validReview, productId: undefined };
      const result = validateReview(review);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Product ID is required');
    });
  });

  describe('canLeaveReview', () => {
    const completedTransaction = {
      status: 'completed',
      buyerId: 'buyer123',
      sellerId: 'seller456',
      reviewGiven: false
    };

    test('returns true for valid participant in completed transaction', () => {
      expect(canLeaveReview(completedTransaction, 'buyer123')).toBe(true);
      expect(canLeaveReview(completedTransaction, 'seller456')).toBe(true);
    });

    test('returns false if transaction not completed', () => {
      const pendingTransaction = { ...completedTransaction, status: 'pending' };
      expect(canLeaveReview(pendingTransaction, 'buyer123')).toBe(false);
    });

    test('returns false if user not participant', () => {
      expect(canLeaveReview(completedTransaction, 'otherUser')).toBe(false);
    });

    test('returns false if review already given', () => {
      const reviewedTransaction = { ...completedTransaction, reviewGiven: true };
      expect(canLeaveReview(reviewedTransaction, 'buyer123')).toBe(false);
    });
  });

  describe('getReviewType', () => {
    const transaction = {
      buyerId: 'buyer123',
      sellerId: 'seller456'
    };

    test('returns "seller" when user is buyer', () => {
      expect(getReviewType(transaction, 'buyer123')).toBe('seller');
    });

    test('returns "buyer" when user is seller', () => {
      expect(getReviewType(transaction, 'seller456')).toBe('buyer');
    });

    test('returns null when user not in transaction', () => {
      expect(getReviewType(transaction, 'otherUser')).toBe(null);
    });
  });

  describe('sortReviewsByDate', () => {
    test('sorts reviews with newest first', () => {
      const reviews = [
        { createdAt: '2024-01-15' },
        { createdAt: '2024-01-20' },
        { createdAt: '2024-01-10' }
      ];
      const sorted = sortReviewsByDate(reviews);
      expect(sorted[0].createdAt).toBe('2024-01-20');
      expect(sorted[1].createdAt).toBe('2024-01-15');
      expect(sorted[2].createdAt).toBe('2024-01-10');
    });

    test('returns new array without mutating original', () => {
      const reviews = [{ createdAt: '2024-01-15' }, { createdAt: '2024-01-10' }];
      const sorted = sortReviewsByDate(reviews);
      expect(sorted).not.toBe(reviews);
    });
  });

  describe('filterReviewsByRating', () => {
    const reviews = [
      { rating: 5, comment: 'Great!' },
      { rating: 4, comment: 'Good' },
      { rating: 5, comment: 'Excellent' }
    ];

    test('filters reviews by specific rating', () => {
      const filtered = filterReviewsByRating(reviews, 5);
      expect(filtered).toHaveLength(2);
      expect(filtered.every(r => r.rating === 5)).toBe(true);
    });

    test('returns all reviews when no rating specified', () => {
      const filtered = filterReviewsByRating(reviews, null);
      expect(filtered).toHaveLength(3);
    });
  });

  describe('getReviewSummary', () => {
    const reviews = [
      { rating: 5 },
      { rating: 5 },
      { rating: 4 },
      { rating: 3 },
      { rating: 2 }
    ];

    test('returns correct summary statistics', () => {
      const summary = getReviewSummary(reviews);
      expect(summary.totalReviews).toBe(5);
      expect(summary.averageRating).toBe(3.8);
      expect(summary.fiveStarPercentage).toBe(40);
      expect(summary.hasReviews).toBe(true);
    });

    test('handles empty reviews', () => {
      const summary = getReviewSummary([]);
      expect(summary.totalReviews).toBe(0);
      expect(summary.averageRating).toBe(0);
      expect(summary.fiveStarPercentage).toBe(0);
      expect(summary.hasReviews).toBe(false);
    });
  });
});