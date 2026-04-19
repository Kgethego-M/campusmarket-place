// src/tests/ListingDetail.test.jsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ListingDetailView as ListingDetail } from '../components/ListingDetail';

// ─── Mocks ────────────────────────────────────────────────────────────────────

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
  getDocs: vi.fn(() => Promise.resolve({ empty: true, docs: [] })),
  addDoc: vi.fn(() => Promise.resolve({ id: 'new-chat-id' })),
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
import { getDocs, addDoc } from 'firebase/firestore';

// ─── Mock Data ────────────────────────────────────────────────────────────────

const mockBuyer = { uid: 'buyer-uid', displayName: 'Test Buyer' };
const mockSeller = { uid: 'seller-uid', displayName: 'Test Seller' };

const saleListing = {
  id: 'listing-123',
  title: 'Calculus Textbook',
  price: 150,
  type: 'For Sale',
  sellerId: 'seller-uid',
  sellerName: 'Test Seller',
};

const tradeListing = {
  id: 'listing-124',
  title: 'Scientific Calculator',
  price: 80,
  type: 'For Trade',
  sellerId: 'seller-uid',
  sellerName: 'Test Seller',
};

const eitherListing = {
  id: 'listing-125',
  title: 'Physics Textbook',
  price: 200,
  type: 'For Sale or Trade',
  sellerId: 'seller-uid',
  sellerName: 'Test Seller',
};

const pendingTransaction = {
  id: 'tx-existing',
  listingId: 'listing-123',
  buyerId: 'buyer-uid',
  sellerId: 'seller-uid',
  status: 'pending',
};

const mockNavigate = vi.fn();

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(window, 'alert').mockImplementation(() => {});
});

// ─── Test Suites ──────────────────────────────────────────────────────────────

describe('ListingDetail - action buttons', () => {

  it('Test No.1 - shows Buy Now button when listing type is For Sale', () => {
    render(<ListingDetail listing={saleListing} currentUser={mockBuyer} navigate={mockNavigate} />);
    expect(screen.getByRole('button', { name: /buy now/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /make trade offer/i })).not.toBeInTheDocument();
  });

  it('Test No.2 - shows Make Trade Offer button when listing type is For Trade', () => {
    render(<ListingDetail listing={tradeListing} currentUser={mockBuyer} navigate={mockNavigate} />);
    expect(screen.getByRole('button', { name: /make trade offer/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /buy now/i })).not.toBeInTheDocument();
  });

  it('Test No.3 - shows combined Buy Now / Make Trade Offer button when listing type is For Sale or Trade', () => {
    render(<ListingDetail listing={eitherListing} currentUser={mockBuyer} navigate={mockNavigate} />);
    expect(screen.getByRole('button', { name: /buy now \/ make trade offer/i })).toBeInTheDocument();
  });

  it('Test No.4 - shows pending offer banner instead of buy button when buyer already has an active offer', () => {
    render(
      <ListingDetail listing={saleListing} currentUser={mockBuyer} existingTransaction={pendingTransaction} navigate={mockNavigate} />
    );
    expect(screen.queryByRole('button', { name: /buy now/i })).not.toBeInTheDocument();
    const banner = screen.getByTestId('pending-offer-banner');
    expect(banner).toBeInTheDocument();
    expect(banner).toHaveTextContent(/offer already initiated/i);
    expect(banner).toHaveTextContent(/waiting for the seller to approve/i);
  });

  it('Test No.4b - pending banner does not appear when there is no existing transaction', () => {
    render(<ListingDetail listing={saleListing} currentUser={mockBuyer} existingTransaction={null} navigate={mockNavigate} />);
    expect(screen.queryByTestId('pending-offer-banner')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /buy now/i })).toBeInTheDocument();
  });

  it('Test No.4c - pending banner does not appear when an existing transaction is declined', () => {
    const declinedTransaction = { ...pendingTransaction, status: 'declined' };
    render(
      <ListingDetail listing={saleListing} currentUser={mockBuyer} existingTransaction={declinedTransaction} navigate={mockNavigate} />
    );
    expect(screen.queryByTestId('pending-offer-banner')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /buy now/i })).toBeInTheDocument();
  });

  it('Test No.8 - calls createTransaction and notifySellerOfOffer when purchase is confirmed', async () => {
    render(<ListingDetail listing={saleListing} currentUser={mockBuyer} navigate={mockNavigate} />);
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
    render(<ListingDetail listing={saleListing} currentUser={mockSeller} navigate={mockNavigate} />);
    expect(screen.queryByRole('button', { name: /buy now/i })).not.toBeInTheDocument();
    expect(screen.queryByTestId('pending-offer-banner')).not.toBeInTheDocument();
    expect(screen.getByText(/this is your listing/i)).toBeInTheDocument();
  });

  it('Test No.13 - does not show action buttons when no user is logged in', () => {
    render(<ListingDetail listing={saleListing} currentUser={null} navigate={mockNavigate} />);
    expect(screen.queryByRole('button', { name: /buy now/i })).not.toBeInTheDocument();
    expect(screen.queryByTestId('pending-offer-banner')).not.toBeInTheDocument();
  });

});

describe('ListingDetail - purchase modal', () => {

  it('Test No.14 - opens the modal when Buy Now button is clicked', () => {
    render(<ListingDetail listing={saleListing} currentUser={mockBuyer} navigate={mockNavigate} />);
    fireEvent.click(screen.getByRole('button', { name: /buy now/i }));
    expect(screen.getByText(/initiate purchase/i)).toBeInTheDocument();
  });

  it('Test No.15 - closes the modal when the × button is clicked', () => {
    render(<ListingDetail listing={saleListing} currentUser={mockBuyer} navigate={mockNavigate} />);
    fireEvent.click(screen.getByRole('button', { name: /buy now/i }));
    expect(screen.getByText(/initiate purchase/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /close modal/i }));
    expect(screen.queryByText(/initiate purchase/i)).not.toBeInTheDocument();
  });

  it("Test No.16 - shows type selector for 'For Sale or Trade' listings before a type is chosen", () => {
    render(<ListingDetail listing={eitherListing} currentUser={mockBuyer} navigate={mockNavigate} />);
    fireEvent.click(screen.getByRole('button', { name: /buy now \/ make trade offer/i }));
    expect(screen.getByRole('button', { name: /cash purchase/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /trade item/i })).toBeInTheDocument();
  });

  it("Test No.17 - shows sale fields after choosing Cash Purchase on a 'For Sale or Trade' listing", () => {
    render(<ListingDetail listing={eitherListing} currentUser={mockBuyer} navigate={mockNavigate} />);
    fireEvent.click(screen.getByRole('button', { name: /buy now \/ make trade offer/i }));
    fireEvent.click(screen.getByRole('button', { name: /cash purchase/i }));
    expect(screen.getByRole('spinbutton', { name: /agreed price/i })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /payment method/i })).toBeInTheDocument();
  });

  it("Test No.18 - shows trade fields after choosing Trade Item on a 'For Sale or Trade' listing", () => {
    render(<ListingDetail listing={eitherListing} currentUser={mockBuyer} navigate={mockNavigate} />);
    fireEvent.click(screen.getByRole('button', { name: /buy now \/ make trade offer/i }));
    fireEvent.click(screen.getByRole('button', { name: /trade item/i }));
    expect(screen.getByPlaceholderText(/describe your trade item/i)).toBeInTheDocument();
  });

  it('Test No.21 - shows partial amount input when Partial Online payment method is selected', () => {
    render(<ListingDetail listing={saleListing} currentUser={mockBuyer} navigate={mockNavigate} />);
    fireEvent.click(screen.getByRole('button', { name: /buy now/i }));
    fireEvent.change(screen.getByRole('combobox', { name: /payment method/i }), {
      target: { value: 'partial' },
    });
    expect(screen.getByPlaceholderText(/enter online payment amount/i)).toBeInTheDocument();
  });

  it('Test No.22 - hides partial amount input when payment method is not partial', () => {
    render(<ListingDetail listing={saleListing} currentUser={mockBuyer} navigate={mockNavigate} />);
    fireEvent.click(screen.getByRole('button', { name: /buy now/i }));
    fireEvent.change(screen.getByRole('combobox', { name: /payment method/i }), {
      target: { value: 'cash' },
    });
    expect(screen.queryByPlaceholderText(/enter online payment amount/i)).not.toBeInTheDocument();
  });

  it('Test No.23 - calls createTransaction with trade type when trade offer is confirmed', async () => {
    render(<ListingDetail listing={tradeListing} currentUser={mockBuyer} navigate={mockNavigate} />);
    fireEvent.click(screen.getByRole('button', { name: /make trade offer/i }));
    fireEvent.change(screen.getByPlaceholderText(/describe your trade item/i), {
      target: { value: 'My old laptop' },
    });
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }));

    await waitFor(() => {
      expect(createTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'trade',
          tradeItem: 'My old laptop',
          paymentType: null,
        })
      );
    });
  });

  it('Test No.24 - shows pending banner after offer is successfully sent', async () => {
    render(<ListingDetail listing={saleListing} currentUser={mockBuyer} navigate={mockNavigate} />);
    fireEvent.click(screen.getByRole('button', { name: /buy now/i }));
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }));

    await waitFor(() => {
      expect(screen.getByTestId('pending-offer-banner')).toBeInTheDocument();
    });
  });

  it('Test No.25 - shows alert when createTransaction fails', async () => {
    createTransaction.mockRejectedValueOnce(new Error('Network error'));
    render(<ListingDetail listing={saleListing} currentUser={mockBuyer} navigate={mockNavigate} />);
    fireEvent.click(screen.getByRole('button', { name: /buy now/i }));
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }));

    await waitFor(() => {
      expect(window.alert).toHaveBeenCalledWith('Failed to create offer. Please try again.');
    });
  });

  it('Test No.26 - modal title says Initiate Trade for trade listings', () => {
    render(<ListingDetail listing={tradeListing} currentUser={mockBuyer} navigate={mockNavigate} />);
    fireEvent.click(screen.getByRole('button', { name: /make trade offer/i }));
    expect(screen.getByText('Initiate Trade')).toBeInTheDocument();
  });

  it('Test No.27 - modal title says Initiate Purchase for sale listings', () => {
    render(<ListingDetail listing={saleListing} currentUser={mockBuyer} navigate={mockNavigate} />);
    fireEvent.click(screen.getByRole('button', { name: /buy now/i }));
    expect(screen.getByText('Initiate Purchase')).toBeInTheDocument();
  });

});

describe('ListingDetail - owner banner', () => {

  it('Test No.19 - shows the owner banner when the seller views their own listing', () => {
    render(<ListingDetail listing={saleListing} currentUser={mockSeller} navigate={mockNavigate} />);
    const banner = screen.getByTestId('owner-listing-banner');
    expect(banner).toBeInTheDocument();
    expect(banner).toHaveTextContent(/this is your listing/i);
    expect(banner).toHaveTextContent(/edit it from your profile/i);
  });

  it('Test No.20 - does not show the owner banner when a buyer views the listing', () => {
    render(<ListingDetail listing={saleListing} currentUser={mockBuyer} navigate={mockNavigate} />);
    expect(screen.queryByTestId('owner-listing-banner')).not.toBeInTheDocument();
  });

});

describe('ListingDetail - seller card navigation', () => {

  it('Test No.28 - buyer clicking seller card navigates to seller profile', () => {
    render(<ListingDetail listing={saleListing} currentUser={mockBuyer} navigate={mockNavigate} />);
    fireEvent.click(screen.getByTitle(/view seller profile/i));
    expect(mockNavigate).toHaveBeenCalledWith('/profile/seller-uid');
  });

  it('Test No.29 - seller clicking their own card navigates to their profile', () => {
    render(<ListingDetail listing={saleListing} currentUser={mockSeller} navigate={mockNavigate} />);
    fireEvent.click(screen.getByTitle(/go to your profile/i));
    expect(mockNavigate).toHaveBeenCalledWith('/profile');
  });

});

describe('ListingDetail - message seller', () => {

  it('Test No.30 - shows Message Seller button for a buyer', () => {
    render(<ListingDetail listing={saleListing} currentUser={mockBuyer} navigate={mockNavigate} />);
    expect(screen.getByText(/message seller/i)).toBeInTheDocument();
  });

  it('Test No.31 - does not show Message Seller button when seller views own listing', () => {
    render(<ListingDetail listing={saleListing} currentUser={mockSeller} navigate={mockNavigate} />);
    expect(screen.queryByText(/message seller/i)).not.toBeInTheDocument();
  });

  it('Test No.32 - does not show Message Seller button when no user is logged in', () => {
    render(<ListingDetail listing={saleListing} currentUser={null} navigate={mockNavigate} />);
    expect(screen.queryByText(/message seller/i)).not.toBeInTheDocument();
  });

  it('Test No.33 - navigates to chat when Message Seller is clicked and chat already exists', async () => {
    getDocs.mockResolvedValueOnce({
      docs: [{
        id: 'existing-chat-id',
        data: () => ({ participants: ['buyer-uid', 'seller-uid'] }),
      }],
    });

    render(<ListingDetail listing={saleListing} currentUser={mockBuyer} navigate={mockNavigate} />);
    fireEvent.click(screen.getByText(/message seller/i));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/chat?open=existing-chat-id');
    });
  });

  it('Test No.34 - creates a new chat and navigates when no existing chat is found', async () => {
    getDocs.mockResolvedValueOnce({ docs: [] });
    addDoc.mockResolvedValueOnce({ id: 'new-chat-id' });

    render(<ListingDetail listing={saleListing} currentUser={mockBuyer} navigate={mockNavigate} />);
    fireEvent.click(screen.getByText(/message seller/i));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/chat?open=new-chat-id');
    });
  });

  it('Test No.35 - shows alert when chat creation fails', async () => {
    getDocs.mockRejectedValueOnce(new Error('Firestore error'));

    render(<ListingDetail listing={saleListing} currentUser={mockBuyer} navigate={mockNavigate} />);
    fireEvent.click(screen.getByText(/message seller/i));

    await waitFor(() => {
      expect(window.alert).toHaveBeenCalledWith(
        expect.stringMatching(/could not open chat/i)
      );
    });
  });

});

describe('ListingDetail - listing display', () => {

  it('Test No.36 - renders listing title and price', () => {
    render(<ListingDetail listing={saleListing} currentUser={mockBuyer} navigate={mockNavigate} />);
    expect(screen.getByText('Calculus Textbook')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /calculus textbook/i })).toBeInTheDocument();
    expect(screen.getAllByText(/R 150/i).length).toBeGreaterThan(0);
  });

  it('Test No.37 - renders listing description when provided', () => {
    const listingWithDesc = { ...saleListing, description: 'Great condition textbook' };
    render(<ListingDetail listing={listingWithDesc} currentUser={mockBuyer} navigate={mockNavigate} />);
    expect(screen.getByText('Great condition textbook')).toBeInTheDocument();
  });

  it('Test No.38 - renders seller name on seller card', () => {
    render(<ListingDetail listing={saleListing} currentUser={mockBuyer} navigate={mockNavigate} />);
    expect(screen.getByText('Test Seller')).toBeInTheDocument();
  });

  it('Test No.39 - renders No Image Available when listing has no photos', () => {
    render(<ListingDetail listing={saleListing} currentUser={mockBuyer} navigate={mockNavigate} />);
    expect(screen.getByText(/no image available/i)).toBeInTheDocument();
  });

  it('Test No.40 - renders main image when listing has photos', () => {
    const listingWithPhotos = { ...saleListing, photos: ['photo1.jpg', 'photo2.jpg'] };
    render(<ListingDetail listing={listingWithPhotos} currentUser={mockBuyer} navigate={mockNavigate} />);
    const mainImg = screen.getByAltText('Calculus Textbook');
    expect(mainImg).toBeInTheDocument();
    expect(mainImg).toHaveAttribute('src', 'photo1.jpg');
  });

  it('Test No.41 - clicking a thumbnail changes the main image', () => {
    const listingWithPhotos = { ...saleListing, photos: ['photo1.jpg', 'photo2.jpg'] };
    render(<ListingDetail listing={listingWithPhotos} currentUser={mockBuyer} navigate={mockNavigate} />);
    fireEvent.click(screen.getByAltText('thumb-1'));
    const mainImg = screen.getByAltText('Calculus Textbook');
    expect(mainImg).toHaveAttribute('src', 'photo2.jpg');
  });

  it('Test No.42 - renders condition badge when condition is provided', () => {
    const listingWithCondition = { ...saleListing, condition: 'Good' };
    render(<ListingDetail listing={listingWithCondition} currentUser={mockBuyer} navigate={mockNavigate} />);
    expect(screen.getByText('Good')).toBeInTheDocument();
  });

  it('Test No.43 - renders category badge when category is provided', () => {
    const listingWithCategory = { ...saleListing, category: 'Textbooks' };
    render(<ListingDetail listing={listingWithCategory} currentUser={mockBuyer} navigate={mockNavigate} />);
    expect(screen.getByText('Textbooks')).toBeInTheDocument();
  });

});
