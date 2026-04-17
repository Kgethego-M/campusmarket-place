// src/tests/ListingDetail.test.jsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ListingDetailView as ListingDetail } from '../components/ListingDetail';

// 1. Setup Mocks
vi.mock('../services/transactionService', () => ({
  createTransaction: vi.fn(() => Promise.resolve('mock-transaction-id')),
}));

vi.mock('../services/notificationService', () => ({
  notifySellerOfOffer: vi.fn(() => Promise.resolve('mock-notification-id')),
}));

// 2. Import mocked functions for use in assertions
import { createTransaction } from '../services/transactionService';
import { notifySellerOfOffer } from '../services/notificationService';

// 3. Define Mock Data
const mockBuyer = {
  uid: 'buyer-uid',
  displayName: 'Test Buyer',
};

const mockSeller = {
  uid: 'seller-uid',
  displayName: 'Test Seller',
};

// 4. Setup Test Hooks
beforeEach(() => {
  vi.clearAllMocks();
});

// 5. Test Suites
describe('ListingDetail - action buttons', () => {

  it('Test No.1 - shows Buy Now button when listing type is sale', () => {
    const listing = {
      id: 'listing-123',
      title: 'Calculus Textbook',
      price: 150,
      type: 'For Sale',
      sellerId: 'seller-uid',
    };

    render(<ListingDetail listing={listing} currentUser={mockBuyer} />);

    expect(screen.getByRole('button', { name: /buy now/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /make trade offer/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /buy now \/ make trade offer/i })).not.toBeInTheDocument();
  });

  it('Test No.2 - shows Make Trade Offer button when listing type is trade', () => {
    const listing = {
      id: 'listing-124',
      title: 'Scientific Calculator',
      price: 80,
      type: 'For Trade',
      sellerId: 'seller-uid',
    };

    render(<ListingDetail listing={listing} currentUser={mockBuyer} />);

    expect(screen.getByRole('button', { name: /make trade offer/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /buy now/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /buy now \/ make trade offer/i })).not.toBeInTheDocument();
  });

  it('Test No.3 - shows Buy Now / Make Trade Offer button when listing type is both', () => {
    const listing = {
      id: 'listing-125',
      title: 'Physics Textbook',
      price: 200,
      type: 'Either',
      sellerId: 'seller-uid',
    };

    render(<ListingDetail listing={listing} currentUser={mockBuyer} />);

    expect(screen.getByRole('button', { name: /buy now \/ make trade offer/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^buy now$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^make trade offer$/i })).not.toBeInTheDocument();
  });

  it('Test No.4 - shows no action buttons when the current user is the listing owner', () => {
    const listing = {
      id: 'listing-126',
      title: 'Biology Textbook',
      price: 120,
      type: 'Either',
      sellerId: 'seller-uid',
    };

    render(<ListingDetail listing={listing} currentUser={mockSeller} />);

    expect(screen.queryByRole('button', { name: /buy now/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /make trade offer/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /buy now \/ make trade offer/i })).not.toBeInTheDocument();
  });

  it('Test No.8 - calls createTransaction and notifySellerOfOffer when Buy Now is clicked', async () => {
    const listing = {
      id: 'listing-123',
      title: 'Calculus Textbook',
      price: 150,
      type: 'For Sale',
      sellerId: 'seller-uid',
    };

    render(<ListingDetail listing={listing} currentUser={mockBuyer} />);

    fireEvent.click(screen.getByRole('button', { name: /buy now/i }));

    await waitFor(() => {
      expect(createTransaction).toHaveBeenCalledTimes(1);
      expect(createTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'For Sale',
          listingId: 'listing-123',
          buyerId: 'buyer-uid',
          sellerId: 'seller-uid',
        })
      );
      expect(notifySellerOfOffer).toHaveBeenCalledTimes(1);
      expect(notifySellerOfOffer).toHaveBeenCalledWith(
        expect.objectContaining({
          transactionId: 'mock-transaction-id',
          sellerId: 'seller-uid',
          buyerId: 'buyer-uid',
        })
      );
    });
  });
});