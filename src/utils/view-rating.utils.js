/**
 * Calculate average rating from an array of reviews
 * @param {Array} reviews - Array of review objects with rating property
 * @returns {number} - Average rating (0-5), defaults to 0 if no reviews
 */
export const calculateAverageRating = (reviews) => {
  if (!reviews || reviews.length === 0) return 0;
  
  const sum = reviews.reduce((total, review) => total + (review.rating || 0), 0);
  const average = sum / reviews.length;
  
  // Round to 1 decimal place
  return Math.round(average * 10) / 10;
};

/**
 * Format rating count for display
 * @param {number} count - Number of reviews
 * @returns {string} - Formatted count (e.g., "25" or "1.2k")
 */
export const formatRatingCount = (count) => {
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}k`;
  }
  return count.toString();
};

/**
 * Calculate percentage of total reviews for a given rating
 * @param {number} count - Number of reviews at this rating
 * @param {number} total - Total number of reviews
 * @returns {number} - Percentage (0-100)
 */
export const getRatingPercentage = (count, total) => {
  if (total === 0) return 0;
  return Math.round((count / total) * 100);
};

/**
 * Get distribution of ratings (count per star rating)
 * @param {Array} reviews - Array of review objects with rating property
 * @returns {Object} - Object with keys 1-5 and count values
 */
export const getRatingDistribution = (reviews) => {
  const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  
  if (!reviews || reviews.length === 0) return distribution;
  
  reviews.forEach(review => {
    const rating = Math.floor(review.rating);
    if (rating >= 1 && rating <= 5) {
      distribution[rating]++;
    }
  });
  
  return distribution;
};

/**
 * Group reviews by rating value
 * @param {Array} reviews - Array of review objects
 * @returns {Object} - Object with rating as key and array of reviews as value
 */
export const groupReviewsByRating = (reviews) => {
  const grouped = { 1: [], 2: [], 3: [], 4: [], 5: [] };
  
  if (!reviews || reviews.length === 0) return grouped;
  
  reviews.forEach(review => {
    const rating = Math.floor(review.rating);
    if (rating >= 1 && rating <= 5) {
      grouped[rating].push(review);
    }
  });
  
  return grouped;
};

/**
 * Validate review data before submission
 * @param {Object} reviewData - Review object to validate
 * @returns {Object} - { isValid: boolean, errors: Array }
 */
export const validateReview = (reviewData) => {
  const errors = [];
  
  if (!reviewData.rating || reviewData.rating < 1 || reviewData.rating > 5) {
    errors.push('Rating must be between 1 and 5');
  }
  
  if (!reviewData.comment || reviewData.comment.trim().length === 0) {
    errors.push('Comment is required');
  }
  
  if (reviewData.comment && reviewData.comment.length > 500) {
    errors.push('Comment cannot exceed 500 characters');
  }
  
  if (!reviewData.productId) {
    errors.push('Product ID is required');
  }
  
  if (!reviewData.revieweeId) {
    errors.push('Reviewee ID is required');
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
};

/**
 * Check if a user can leave a review for a transaction
 * @param {Object} transaction - Transaction object
 * @param {string} userId - Current user ID
 * @returns {boolean} - Whether user can leave a review
 */
export const canLeaveReview = (transaction, userId) => {
  // Check if transaction is completed
  if (transaction.status !== 'completed') return false;
  
  // Check if user is part of the transaction
  const isParticipant = transaction.buyerId === userId || transaction.sellerId === userId;
  if (!isParticipant) return false;
  
  // Check if review already exists
  if (transaction.reviewGiven) return false;
  
  return true;
};

/**
 * Get review type (buyer or seller) based on user role in transaction
 * @param {Object} transaction - Transaction object
 * @param {string} userId - Current user ID
 * @returns {string} - 'buyer' or 'seller'
 */
export const getReviewType = (transaction, userId) => {
  if (transaction.buyerId === userId) {
    return 'seller'; // Buyer reviews seller
  }
  if (transaction.sellerId === userId) {
    return 'buyer'; // Seller reviews buyer
  }
  return null;
};

/**
 * Sort reviews by date (newest first)
 * @param {Array} reviews - Array of review objects
 * @returns {Array} - Sorted reviews
 */
export const sortReviewsByDate = (reviews) => {
  return [...reviews].sort((a, b) => {
    return new Date(b.createdAt) - new Date(a.createdAt);
  });
};

/**
 * Filter reviews by rating
 * @param {Array} reviews - Array of review objects
 * @param {number} rating - Rating to filter by (1-5)
 * @returns {Array} - Filtered reviews
 */
export const filterReviewsByRating = (reviews, rating) => {
  if (!rating) return reviews;
  return reviews.filter(review => Math.floor(review.rating) === rating);
};

/**
 * Get summary statistics for reviews
 * @param {Array} reviews - Array of review objects
 * @returns {Object} - Summary statistics
 */
export const getReviewSummary = (reviews) => {
  const total = reviews.length;
  const average = calculateAverageRating(reviews);
  const distribution = getRatingDistribution(reviews);
  const fiveStarRate = total > 0 ? (distribution[5] / total) * 100 : 0;
  
  return {
    totalReviews: total,
    averageRating: average,
    ratingDistribution: distribution,
    fiveStarPercentage: fiveStarRate,
    hasReviews: total > 0
  };
};