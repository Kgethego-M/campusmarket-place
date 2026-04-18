// src/tests/ListingDetail.test.jsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ListingDetailView as ListingDetail } from '../components/ListingDetail';

// ─── Mocks ────────────────────────────────────────────────────────────────────

// Prevents Firebase from crashing during import (no real credentials in CI).
// The ListingDetailView component only uses `db` inside the chat handler,
// which none of these tests exercise.
vi.mock('../firebase', () => ({
  auth: {},
  db: {},
  storage: {},
  googleProvider: {},
  isValidWitsEmail: vi.fn(),
  getUserType: vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  getDocs: vi.fn(),
  addDoc: vi.fn(),
  serverTimestamp: vi.fn(),
  doc: vi.fn(),
  getDoc: vi.fn(),
}));

vi.mock('../services/transactionService', () => ({
  createTransaction: vi.fn(() => Promise.resolve('mock-transaction-id')),
}));

vi.mock('../services/notificationService', () => ({
  notifySellerOfOffer: vi.fn(() => Promise.resolve('mock-notification-id')),
}));

import { createTransaction } from '../services/transactionService';
import { notifySellerOfOffer } from '../services/notificationService';

// ─── Mock Data ────────────────────────────────────────────────────────────────

const mockBuyer = {
  uid: 'buyer-uid',
  displayName: 'Test Buyer',
};

const mockSeller = {
  uid: 'seller-uid',
  displayName: 'Test Seller',
};

const saleListing = {
  id: 'listing-123',
  title: 'Calculus Textbook',
  price: 150,
  type: 'For Sale',
  sellerId: 'seller-uid',
};

const tradeListing = {
  id: 'listing-124',
  title: 'Scientific Calculator',
  price: 80,
  type: 'For Trade',
  sellerId: 'seller-uid',
};

const eitherListing = {
  id: 'listing-125',
  title: 'Physics Textbook',
  price: 200,
  type: 'For Sale or Trade',
  sellerId: 'seller-uid',
};

const pendingTransaction = {
  id: 'tx-existing',
  listingId: 'listing-123',
  buyerId: 'buyer-uid',
  sellerId: 'seller-uid',
  status: 'pending',
};

// ─── Hooks ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── Test Suites ──────────────────────────────────────────────────────────────

describe('ListingDetail - action buttons', () => {

  it('Test No.1 - shows Buy Now button when listing type is For Sale', () => {
    render(<ListingDetail listing={saleListing} currentUser={mockBuyer} />);
    expect(screen.getByRole('button', { name: /buy now/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /make trade offer/i })).not.toBeInTheDocument();
  });

  it('Test No.2 - shows Make Trade Offer button when listing type is For Trade', () => {
    render(<ListingDetail listing={tradeListing} currentUser={mockBuyer} />);
    expect(screen.getByRole('button', { name: /make trade offer/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /buy now/i })).not.toBeInTheDocument();
  });

  it('Test No.3 - shows combined Buy Now / Make Trade Offer button when listing type is For Sale or Trade', () => {
    render(<ListingDetail listing={eitherListing} currentUser={mockBuyer} />);
    expect(screen.getByRole('button', { name: /buy now \/ make trade offer/i })).toBeInTheDocument();
  });

  it('Test No.4 - shows pending offer banner instead of buy button when buyer already has an active offer', () => {
    render(
      <ListingDetail
        listing={saleListing}
        currentUser={mockBuyer}
        existingTransaction={pendingTransaction}
      />
    );

    // Buy button should NOT be visible
    expect(screen.queryByRole('button', { name: /buy now/i })).not.toBeInTheDocument();

    // Pending banner should be visible
    const banner = screen.getByTestId('pending-offer-banner');
    expect(banner).toBeInTheDocument();
    expect(banner).toHaveTextContent(/offer already initiated/i);
    expect(banner).toHaveTextContent(/waiting for the seller to approve/i);
  });

  it('Test No.4b - pending banner does not appear when there is no existing transaction', () => {
    render(<ListingDetail listing={saleListing} currentUser={mockBuyer} existingTransaction={null} />);
    expect(screen.queryByTestId('pending-offer-banner')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /buy now/i })).toBeInTheDocument();
  });

  it('Test No.4c - pending banner does not appear when an existing transaction is declined', () => {
    const declinedTransaction = { ...pendingTransaction, status: 'declined' };
    render(
      <ListingDetail
        listing={saleListing}
        currentUser={mockBuyer}
        existingTransaction={declinedTransaction}
      />
    );
    // Declined offer — buyer can try again, so show the buy button
    expect(screen.queryByTestId('pending-offer-banner')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /buy now/i })).toBeInTheDocument();
  });

  it('Test No.8 - calls createTransaction and notifySellerOfOffer when purchase is confirmed', async () => {
    render(<ListingDetail listing={saleListing} currentUser={mockBuyer} />);

    fireEvent.click(screen.getByRole('button', { name: /buy now/i }));
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }));

    await waitFor(() => {
      expect(createTransaction).toHaveBeenCalledTimes(1);
      expect(createTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          listingId: 'listing-123',
          listingTitle: 'Calculus Textbook',
          buyerId: 'buyer-uid',
          sellerId: 'seller-uid',
          agreedPrice: 150,
          paymentType: 'full_online',
          terms: null,
        })
      );
      expect(notifySellerOfOffer).toHaveBeenCalledTimes(1);
    });
  });

  it('Test No.12 - does not show action buttons when the current user is the seller', () => {
    render(<ListingDetail listing={saleListing} currentUser={mockSeller} />);
    expect(screen.queryByRole('button', { name: /buy now/i })).not.toBeInTheDocument();
    expect(screen.queryByTestId('pending-offer-banner')).not.toBeInTheDocument();
    expect(screen.getByText(/this is your listing/i)).toBeInTheDocument();
  });

  it('Test No.13 - does not show action buttons when no user is logged in', () => {
    render(<ListingDetail listing={saleListing} currentUser={null} />);
    expect(screen.queryByRole('button', { name: /buy now/i })).not.toBeInTheDocument();
    expect(screen.queryByTestId('pending-offer-banner')).not.toBeInTheDocument();
  });

});

describe('ListingDetail - purchase modal', () => {

  it('Test No.14 - opens the modal when Buy Now button is clicked', () => {
    render(<ListingDetail listing={saleListing} currentUser={mockBuyer} />);
    fireEvent.click(screen.getByRole('button', { name: /buy now/i }));
    expect(screen.getByText(/initiate purchase/i)).toBeInTheDocument();
  });

  it('Test No.15 - closes the modal when the × button is clicked', () => {
    render(<ListingDetail listing={saleListing} currentUser={mockBuyer} />);
    fireEvent.click(screen.getByRole('button', { name: /buy now/i }));
    expect(screen.getByText(/initiate purchase/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /×/i }));
    expect(screen.queryByText(/initiate purchase/i)).not.toBeInTheDocument();
  });

  it("Test No.16 - shows type selector for 'For Sale or Trade' listings before a type is chosen", () => {
    render(<ListingDetail listing={eitherListing} currentUser={mockBuyer} />);
    fireEvent.click(screen.getByRole('button', { name: /buy now \/ make trade offer/i }));
    expect(screen.getByRole('button', { name: /cash purchase/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /trade item/i })).toBeInTheDocument();
  });

  it("Test No.17 - shows sale fields after choosing Cash Purchase on a 'For Sale or Trade' listing", () => {
    render(<ListingDetail listing={eitherListing} currentUser={mockBuyer} />);
    fireEvent.click(screen.getByRole('button', { name: /buy now \/ make trade offer/i }));
    fireEvent.click(screen.getByRole('button', { name: /cash purchase/i }));
    expect(screen.getByRole('spinbutton', { name: /agreed price/i })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /payment method/i })).toBeInTheDocument();
  });

  it("Test No.18 - shows trade fields after choosing Trade Item on a 'For Sale or Trade' listing", () => {
    render(<ListingDetail listing={eitherListing} currentUser={mockBuyer} />);
    fireEvent.click(screen.getByRole('button', { name: /buy now \/ make trade offer/i }));
    fireEvent.click(screen.getByRole('button', { name: /trade item/i }));
    expect(screen.getByPlaceholderText(/describe your trade item/i)).toBeInTheDocument();
  });

});

describe('ListingDetail - owner banner', () => {

  it('Test No.19 - shows the owner banner when the seller views their own listing', () => {
    render(<ListingDetail listing={saleListing} currentUser={mockSeller} />);
    const banner = screen.getByTestId('owner-listing-banner');
    expect(banner).toBeInTheDocument();
    expect(banner).toHaveTextContent(/this is your listing/i);
    expect(banner).toHaveTextContent(/edit it from your profile/i);
  });

  it('Test No.20 - does not show the owner banner when a buyer views the listing', () => {
    render(<ListingDetail listing={saleListing} currentUser={mockBuyer} />);
    expect(screen.queryByTestId('owner-listing-banner')).not.toBeInTheDocument();
  });

});
 