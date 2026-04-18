import {
  calculateAverageRating,
  formatRatingCount,
  getRatingPercentage,
  getRatingDistribution,
  groupReviewsByRating,
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

  describe('groupReviewsByRating', () => {
    test('returns empty object with empty arrays for null reviews', () => {
      const grouped = groupReviewsByRating(null);
      expect(grouped).toEqual({ 1: [], 2: [], 3: [], 4: [], 5: [] });
    });

    test('returns empty object with empty arrays for undefined reviews', () => {
      const grouped = groupReviewsByRating(undefined);
      expect(grouped).toEqual({ 1: [], 2: [], 3: [], 4: [], 5: [] });
    });

    test('returns empty object with empty arrays for empty reviews array', () => {
      const grouped = groupReviewsByRating([]);
      expect(grouped).toEqual({ 1: [], 2: [], 3: [], 4: [], 5: [] });
    });

    test('groups reviews correctly by rating', () => {
      const reviews = [
        { id: 1, rating: 5, comment: 'Excellent!' },
        { id: 2, rating: 5, comment: 'Amazing!' },
        { id: 3, rating: 4, comment: 'Good' },
        { id: 4, rating: 3, comment: 'Average' },
        { id: 5, rating: 2, comment: 'Okay' },
        { id: 6, rating: 1, comment: 'Poor' }
      ];
      const grouped = groupReviewsByRating(reviews);
      
      expect(grouped[5]).toHaveLength(2);
      expect(grouped[4]).toHaveLength(1);
      expect(grouped[3]).toHaveLength(1);
      expect(grouped[2]).toHaveLength(1);
      expect(grouped[1]).toHaveLength(1);
    });

    test('handles decimal ratings by flooring to nearest integer', () => {
      const reviews = [
        { id: 1, rating: 4.8, comment: 'Almost perfect' },
        { id: 2, rating: 4.2, comment: 'Very good' },
        { id: 3, rating: 3.9, comment: 'Good' }
      ];
      const grouped = groupReviewsByRating(reviews);
      
      expect(grouped[4]).toHaveLength(2);
      expect(grouped[3]).toHaveLength(1);
      expect(grouped[5]).toHaveLength(0);
    });

    test('ignores ratings outside 1-5 range', () => {
      const reviews = [
        { id: 1, rating: 5, comment: 'Good' },
        { id: 2, rating: 0, comment: 'Invalid' },
        { id: 3, rating: 6, comment: 'Invalid' },
        { id: 4, rating: -1, comment: 'Invalid' }
      ];
      const grouped = groupReviewsByRating(reviews);
      
      expect(grouped[5]).toHaveLength(1);
      expect(grouped[1]).toHaveLength(0);
      expect(grouped[2]).toHaveLength(0);
      expect(grouped[3]).toHaveLength(0);
      expect(grouped[4]).toHaveLength(0);
    });

    test('preserves review objects with all properties when grouping', () => {
      const reviews = [
        { id: 1, rating: 5, comment: 'Great!', reviewerName: 'John', date: '2024-01-01' }
      ];
      const grouped = groupReviewsByRating(reviews);
      
      expect(grouped[5][0]).toEqual({
        id: 1,
        rating: 5,
        comment: 'Great!',
        reviewerName: 'John',
        date: '2024-01-01'
      });
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

    test('returns error for rating below 1', () => {
      const review = { ...validReview, rating: 0 };
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

    test('returns error for comment with only whitespace', () => {
      const review = { ...validReview, comment: '   ' };
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

    test('returns error for empty productId string', () => {
      const review = { ...validReview, productId: '' };
      const result = validateReview(review);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Product ID is required');
    });

    test('returns error for missing revieweeId', () => {
      const review = { ...validReview, revieweeId: undefined };
      const result = validateReview(review);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Reviewee ID is required');
    });

    test('returns error for empty revieweeId string', () => {
      const review = { ...validReview, revieweeId: '' };
      const result = validateReview(review);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Reviewee ID is required');
    });

    test('returns multiple errors when multiple fields are invalid', () => {
      const review = {
        rating: 6,
        comment: '',
        productId: undefined,
        revieweeId: undefined
      };
      const result = validateReview(review);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Rating must be between 1 and 5');
      expect(result.errors).toContain('Comment is required');
      expect(result.errors).toContain('Product ID is required');
      expect(result.errors).toContain('Reviewee ID is required');
      expect(result.errors).toHaveLength(4);
    });
  });

  describe('canLeaveReview', () => {
    const completedTransaction = {
      status: 'completed',
      buyerId: 'buyer123',
      sellerId: 'seller456',
      reviewGiven: false
    };

    test('returns true for buyer in completed transaction', () => {
      expect(canLeaveReview(completedTransaction, 'buyer123')).toBe(true);
    });

    test('returns true for seller in completed transaction', () => {
      expect(canLeaveReview(completedTransaction, 'seller456')).toBe(true);
    });

    test('returns false if transaction not completed', () => {
      const pendingTransaction = { ...completedTransaction, status: 'pending' };
      expect(canLeaveReview(pendingTransaction, 'buyer123')).toBe(false);
    });

    test('returns false if transaction status is accepted', () => {
      const acceptedTransaction = { ...completedTransaction, status: 'accepted' };
      expect(canLeaveReview(acceptedTransaction, 'buyer123')).toBe(false);
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

    test('handles Date objects correctly', () => {
      const reviews = [
        { createdAt: new Date('2024-01-15') },
        { createdAt: new Date('2024-01-20') },
        { createdAt: new Date('2024-01-10') }
      ];
      const sorted = sortReviewsByDate(reviews);
      expect(sorted[0].createdAt).toEqual(new Date('2024-01-20'));
    });
  });

  describe('filterReviewsByRating', () => {
    const reviews = [
      { rating: 5, comment: 'Great!' },
      { rating: 4, comment: 'Good' },
      { rating: 5, comment: 'Excellent' },
      { rating: 3, comment: 'Average' }
    ];

    test('filters reviews by specific rating', () => {
      const filtered = filterReviewsByRating(reviews, 5);
      expect(filtered).toHaveLength(2);
      expect(filtered.every(r => r.rating === 5)).toBe(true);
    });

    test('filters reviews by rating 4', () => {
      const filtered = filterReviewsByRating(reviews, 4);
      expect(filtered).toHaveLength(1);
      expect(filtered[0].rating).toBe(4);
    });

    test('returns all reviews when no rating specified', () => {
      const filtered = filterReviewsByRating(reviews, null);
      expect(filtered).toHaveLength(4);
    });

    test('returns empty array when no reviews match rating', () => {
      const filtered = filterReviewsByRating(reviews, 2);
      expect(filtered).toHaveLength(0);
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

    test('returns correct rating distribution', () => {
      const summary = getReviewSummary(reviews);
      expect(summary.ratingDistribution[5]).toBe(2);
      expect(summary.ratingDistribution[4]).toBe(1);
      expect(summary.ratingDistribution[3]).toBe(1);
      expect(summary.ratingDistribution[2]).toBe(1);
      expect(summary.ratingDistribution[1]).toBe(0);
    });

    test('handles empty reviews', () => {
      const summary = getReviewSummary([]);
      expect(summary.totalReviews).toBe(0);
      expect(summary.averageRating).toBe(0);
      expect(summary.fiveStarPercentage).toBe(0);
      expect(summary.hasReviews).toBe(false);
    });

    test('handles null reviews', () => {
      const summary = getReviewSummary(null);
      expect(summary.totalReviews).toBe(0);
      expect(summary.averageRating).toBe(0);
      expect(summary.fiveStarPercentage).toBe(0);
      expect(summary.hasReviews).toBe(false);
    });

    test('handles single review', () => {
      const singleReview = [{ rating: 5 }];
      const summary = getReviewSummary(singleReview);
      expect(summary.totalReviews).toBe(1);
      expect(summary.averageRating).toBe(5);
      expect(summary.fiveStarPercentage).toBe(100);
      expect(summary.hasReviews).toBe(true);
    });
  });
});