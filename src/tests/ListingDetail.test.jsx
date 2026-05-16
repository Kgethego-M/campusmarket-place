// src/tests/ListingDetail.test.jsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ListingDetailView as ListingDetail } from '../components/ListingDetail';
import { getDocs, addDoc, collection, query, where, doc, getDoc, setDoc, updateDoc, arrayUnion, arrayRemove, serverTimestamp } from 'firebase/firestore';
import { createTransaction } from '../services/transactionService';
import { notifySellerOfOffer } from '../services/notificationService';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../firebase', () => ({
  auth: {},
  db: {},
  storage: {},
  googleProvider: {},
  isValidWitsEmail: vi.fn(),
  getUserType: vi.fn(),
}));

// Mock the entire firebase/firestore module with proper implementations
vi.mock('firebase/firestore', async () => {
  const actual = await vi.importActual('firebase/firestore');
  return {
    ...actual,
    collection: vi.fn(),
    query: vi.fn(),
    where: vi.fn(),
    getDocs: vi.fn(),
    addDoc: vi.fn(() => Promise.resolve({ id: 'new-chat-id' })),
    serverTimestamp: vi.fn(() => new Date()),
    doc: vi.fn(),
    getDoc: vi.fn(),
    setDoc: vi.fn(),
    updateDoc: vi.fn(),
    arrayUnion: vi.fn(),
    arrayRemove: vi.fn(),
  };
});

vi.mock('../services/transactionService', () => ({
  createTransaction: vi.fn(() => Promise.resolve('mock-transaction-id')),
}));

vi.mock('../services/notificationService', () => ({
  notifySellerOfOffer: vi.fn(() => Promise.resolve('mock-notification-id')),
}));

// Mock ReportModal to avoid its own Firebase/routing dependencies
vi.mock('../components/ReportModal', () => ({
  default: () => null,
}));

// Mock AlertModal to make testing easier
vi.mock('../components/AlertModal', () => ({
  default: ({ open, onClose, title, message }) => {
    if (!open) return null;
    return (
      <div data-testid="alert-modal" role="dialog">
        <h3 data-testid="alert-title">{title}</h3>
        <p data-testid="alert-message">{message}</p>
        <button onClick={onClose} data-testid="alert-close-btn">OK</button>
      </div>
    );
  },
}));

// ─── Shared mock data ─────────────────────────────────────────────────────────

const mockNavigate = vi.fn();
const mockBuyer    = { uid: 'buyer-uid',  displayName: 'Test Buyer'  };
const mockSeller   = { uid: 'seller-uid', displayName: 'Test Seller' };

const saleListing = {
  id: 'listing-123',
  title: 'Calculus Textbook',
  price: 150,
  type: 'For Sale',
  listingType: 'For Sale',
  sellerId: 'seller-uid',
  sellerName: 'Test Seller',
  description: 'A great textbook',
  specification: '3rd Edition',
  condition: 'Good',
  category: 'Textbooks',
  photos: ['photo1.jpg', 'photo2.jpg'],
};

const tradeListing  = { ...saleListing, id: 'listing-124', type: 'For Trade', listingType: 'For Trade', title: 'Scientific Calculator', price: 80  };
const eitherListing = { ...saleListing, id: 'listing-125', type: 'For Sale or Trade', listingType: 'For Sale or Trade', title: 'Physics Textbook',      price: 200 };
const noPhotoListing = { ...saleListing, photos: [] };

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
  
  // Default mock implementations
  getDocs.mockResolvedValue({ docs: [] });
  addDoc.mockResolvedValue({ id: 'new-chat-id' });
});

// ─── Action buttons ───────────────────────────────────────────────────────────

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
    render(<ListingDetail listing={saleListing} currentUser={mockBuyer} existingTransaction={pendingTransaction} navigate={mockNavigate} />);
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
    render(<ListingDetail listing={saleListing} currentUser={mockBuyer} existingTransaction={declinedTransaction} navigate={mockNavigate} />);
    expect(screen.queryByTestId('pending-offer-banner')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /buy now/i })).toBeInTheDocument();
  });

  it('Test No.8 - calls createTransaction and notifySellerOfOffer when purchase is confirmed', async () => {
    render(<ListingDetail listing={saleListing} currentUser={mockBuyer} navigate={mockNavigate} />);
    fireEvent.click(screen.getByRole('button', { name: /buy now/i }));
    fireEvent.click(screen.getByRole('button', { name: /confirm & send offer/i }));
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

// ─── Purchase modal ───────────────────────────────────────────────────────────

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
    expect(screen.getByLabelText(/agreed price/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/payment method/i)).toBeInTheDocument();
  });

  it("Test No.18 - shows trade fields after choosing Trade Item on a 'For Sale or Trade' listing", () => {
    render(<ListingDetail listing={eitherListing} currentUser={mockBuyer} navigate={mockNavigate} />);
    fireEvent.click(screen.getByRole('button', { name: /buy now \/ make trade offer/i }));
    fireEvent.click(screen.getByRole('button', { name: /trade item/i }));
    expect(screen.getByPlaceholderText(/describe your trade item/i)).toBeInTheDocument();
  });
});

// ─── Owner banner ─────────────────────────────────────────────────────────────

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

// ─── Images ───────────────────────────────────────────────────────────────────

describe('ListingDetailView - images', () => {
  it('renders main image when photos exist', () => {
    render(<ListingDetail listing={saleListing} currentUser={mockBuyer} navigate={mockNavigate} />);
    expect(screen.getByAltText('Calculus Textbook')).toBeInTheDocument();
  });

  it('renders no image placeholder when photos is empty', () => {
    render(<ListingDetail listing={noPhotoListing} currentUser={mockBuyer} navigate={mockNavigate} />);
    expect(screen.getByText('No Image Available')).toBeInTheDocument();
  });

  it('renders thumbnail row when multiple photos exist', () => {
    render(<ListingDetail listing={saleListing} currentUser={mockBuyer} navigate={mockNavigate} />);
    expect(screen.getAllByAltText(/thumb-/)).toHaveLength(2);
  });

  it('switches main image when thumbnail is clicked', () => {
    render(<ListingDetail listing={saleListing} currentUser={mockBuyer} navigate={mockNavigate} />);
    const thumbs = screen.getAllByAltText(/thumb-/);
    fireEvent.click(thumbs[1]);
    expect(thumbs[1]).toHaveStyle('border: 2px solid #6AA6DA');
  });
});

// ─── Listing details ──────────────────────────────────────────────────────────

describe('ListingDetailView - listing details', () => {
  it('renders title and price', () => {
    render(<ListingDetail listing={saleListing} currentUser={mockBuyer} navigate={mockNavigate} />);
    expect(screen.getByText('Calculus Textbook')).toBeInTheDocument();
    expect(screen.getByText('R 150')).toBeInTheDocument();
  });

  it('renders description when present', () => {
    render(<ListingDetail listing={saleListing} currentUser={mockBuyer} navigate={mockNavigate} />);
    expect(screen.getByText('A great textbook')).toBeInTheDocument();
  });

  it('renders specification when present', () => {
    render(<ListingDetail listing={saleListing} currentUser={mockBuyer} navigate={mockNavigate} />);
    expect(screen.getByText('3rd Edition')).toBeInTheDocument();
  });

  it('renders condition and category badges', () => {
    render(<ListingDetail listing={saleListing} currentUser={mockBuyer} navigate={mockNavigate} />);
    expect(screen.getByText('Good')).toBeInTheDocument();
    expect(screen.getByText('Textbooks')).toBeInTheDocument();
  });

  it('renders seller name on seller card', () => {
    render(<ListingDetail listing={saleListing} currentUser={mockBuyer} navigate={mockNavigate} />);
    expect(screen.getByText('Test Seller')).toBeInTheDocument();
  });

  it('renders seller initial when no avatar', () => {
    render(<ListingDetail listing={saleListing} currentUser={mockBuyer} navigate={mockNavigate} />);
    expect(screen.getByText('T')).toBeInTheDocument();
  });

  it('renders seller avatar image when provided', () => {
    const listingWithAvatar = { ...saleListing, sellerAvatar: 'avatar.jpg' };
    render(<ListingDetail listing={listingWithAvatar} currentUser={mockBuyer} navigate={mockNavigate} />);
    expect(screen.getByAltText('Test Seller')).toBeInTheDocument();
  });
});

// ─── Seller card navigation ───────────────────────────────────────────────────

describe('ListingDetailView - seller card navigation', () => {
  it('navigates to seller profile when buyer clicks seller card', () => {
    render(<ListingDetail listing={saleListing} currentUser={mockBuyer} navigate={mockNavigate} />);
    fireEvent.click(screen.getByTitle('View seller profile'));
    expect(mockNavigate).toHaveBeenCalledWith('/profile/seller-uid');
  });

  it('navigates to own profile when seller clicks seller card', () => {
    render(<ListingDetail listing={saleListing} currentUser={mockSeller} navigate={mockNavigate} />);
    fireEvent.click(screen.getByTitle('Go to your profile'));
    expect(mockNavigate).toHaveBeenCalledWith('/profile');
  });

  it('navigates via Enter key on seller card', () => {
    render(<ListingDetail listing={saleListing} currentUser={mockBuyer} navigate={mockNavigate} />);
    const card = screen.getByTitle('View seller profile');
    fireEvent.keyDown(card, { key: 'Enter' });
    expect(mockNavigate).toHaveBeenCalledWith('/profile/seller-uid');
  });
});

// ─── Message seller ───────────────────────────────────────────────────────────

describe('ListingDetailView - message seller', () => {
  it('renders Message Seller button for buyer', () => {
    render(<ListingDetail listing={saleListing} currentUser={mockBuyer} navigate={mockNavigate} />);
    expect(screen.getByText('Message Seller')).toBeInTheDocument();
  });

  it('does not render Message Seller button for seller', () => {
    render(<ListingDetail listing={saleListing} currentUser={mockSeller} navigate={mockNavigate} />);
    expect(screen.queryByText('Message Seller')).not.toBeInTheDocument();
  });

  it('does not render Message Seller button when not logged in', () => {
    render(<ListingDetail listing={saleListing} currentUser={null} navigate={mockNavigate} />);
    expect(screen.queryByText('Message Seller')).not.toBeInTheDocument();
  });

  it('finds existing chat and navigates when Message Seller clicked', async () => {
    // Mock getDocs to return an existing chat
    const mockChatDoc = {
      id: 'existing-chat',
      data: () => ({ participants: ['buyer-uid', 'seller-uid'] })
    };
    getDocs.mockResolvedValueOnce({ docs: [mockChatDoc] });
    
    render(<ListingDetail listing={saleListing} currentUser={mockBuyer} navigate={mockNavigate} />);
    fireEvent.click(screen.getByText('Message Seller'));
    
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/chat?open=existing-chat');
    });
  });

  it('creates new chat when no existing chat found', async () => {
    // Mock getDocs to return empty array (no existing chat)
    getDocs.mockResolvedValueOnce({ docs: [] });
    addDoc.mockResolvedValueOnce({ id: 'new-chat-id' });
    
    render(<ListingDetail listing={saleListing} currentUser={mockBuyer} navigate={mockNavigate} />);
    fireEvent.click(screen.getByText('Message Seller'));
    
    await waitFor(() => {
      expect(addDoc).toHaveBeenCalled();
      expect(mockNavigate).toHaveBeenCalledWith('/chat?open=new-chat-id');
    });
  });

  it('shows Opening chat text while loading', async () => {
    // Make getDocs return a promise that never resolves to simulate loading
    getDocs.mockImplementationOnce(() => new Promise(() => {}));
    
    render(<ListingDetail listing={saleListing} currentUser={mockBuyer} navigate={mockNavigate} />);
    fireEvent.click(screen.getByText('Message Seller'));
    
    expect(screen.getByText('Opening chat…')).toBeInTheDocument();
  });
});

// ─── Trade transaction ────────────────────────────────────────────────────────

describe('ListingDetailView - trade transaction', () => {
  it('calls createTransaction with trade type when trade offer confirmed', async () => {
    render(<ListingDetail listing={tradeListing} currentUser={mockBuyer} navigate={mockNavigate} />);
    fireEvent.click(screen.getByRole('button', { name: /make trade offer/i }));
    fireEvent.change(screen.getByPlaceholderText(/describe your trade item/i), { target: { value: 'My old laptop' } });
    // Select category to avoid warning
    const categorySelect = screen.getByLabelText(/category/i);
    fireEvent.change(categorySelect, { target: { value: 'Electronics' } });
    fireEvent.click(screen.getByRole('button', { name: /confirm & send offer/i }));
    
    await waitFor(() =>
      expect(createTransaction).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'trade', tradeItem: 'My old laptop' })
      )
    );
  });

  it('shows alert modal when trade item is empty', async () => {
    render(<ListingDetail listing={tradeListing} currentUser={mockBuyer} navigate={mockNavigate} />);
    fireEvent.click(screen.getByRole('button', { name: /make trade offer/i }));
    fireEvent.click(screen.getByRole('button', { name: /confirm & send offer/i }));
    
    await waitFor(() => {
      expect(screen.getByTestId('alert-modal')).toBeInTheDocument();
      expect(screen.getByTestId('alert-message')).toHaveTextContent('Please describe what you want to trade');
    });
    
    fireEvent.click(screen.getByTestId('alert-close-btn'));
    await waitFor(() => {
      expect(screen.queryByTestId('alert-modal')).not.toBeInTheDocument();
    });
  });
});

// ─── Partial payment ──────────────────────────────────────────────────────────

describe('ListingDetailView - partial payment', () => {
  it('shows partial amount input when Partial Online selected', () => {
    render(<ListingDetail listing={saleListing} currentUser={mockBuyer} navigate={mockNavigate} />);
    fireEvent.click(screen.getByRole('button', { name: /buy now/i }));
    fireEvent.change(screen.getByLabelText(/payment method/i), { target: { value: 'partial' } });
    expect(screen.getByPlaceholderText(/enter online payment amount/i)).toBeInTheDocument();
  });

  it('calls createTransaction with partialAmount when partial payment used', async () => {
    render(<ListingDetail listing={saleListing} currentUser={mockBuyer} navigate={mockNavigate} />);
    fireEvent.click(screen.getByRole('button', { name: /buy now/i }));
    fireEvent.change(screen.getByLabelText(/payment method/i), { target: { value: 'partial' } });
    fireEvent.change(screen.getByPlaceholderText(/enter online payment amount/i), { target: { value: '75' } });
    fireEvent.click(screen.getByRole('button', { name: /confirm & send offer/i }));
    
    await waitFor(() =>
      expect(createTransaction).toHaveBeenCalledWith(
        expect.objectContaining({ paymentType: 'partial', partialAmount: 75 })
      )
    );
  });
});

// ─── Offer sent state ─────────────────────────────────────────────────────────

describe('ListingDetailView - offer sent', () => {
  it('shows pending banner after offer is successfully sent', async () => {
    render(<ListingDetail listing={saleListing} currentUser={mockBuyer} navigate={mockNavigate} />);
    fireEvent.click(screen.getByRole('button', { name: /buy now/i }));
    fireEvent.click(screen.getByRole('button', { name: /confirm & send offer/i }));
    
    await waitFor(() =>
      expect(screen.getByTestId('pending-offer-banner')).toBeInTheDocument()
    );
  });

  it('shows error toast when createTransaction fails', async () => {
    createTransaction.mockRejectedValueOnce(new Error('Network error'));
    render(<ListingDetail listing={saleListing} currentUser={mockBuyer} navigate={mockNavigate} />);
    fireEvent.click(screen.getByRole('button', { name: /buy now/i }));
    fireEvent.click(screen.getByRole('button', { name: /confirm & send offer/i }));
    
    await waitFor(() => {
      expect(screen.getByText('Failed to create offer. Please try again.')).toBeInTheDocument();
    });
  });
});

// ─── Terms field ──────────────────────────────────────────────────────────────

describe('ListingDetailView - terms field', () => {
  it('renders terms textarea in modal', () => {
    render(<ListingDetail listing={saleListing} currentUser={mockBuyer} navigate={mockNavigate} />);
    fireEvent.click(screen.getByRole('button', { name: /buy now/i }));
    expect(screen.getByPlaceholderText(/seller agreed to include charger/i)).toBeInTheDocument();
  });

  it('passes terms value to createTransaction', async () => {
    render(<ListingDetail listing={saleListing} currentUser={mockBuyer} navigate={mockNavigate} />);
    fireEvent.click(screen.getByRole('button', { name: /buy now/i }));
    fireEvent.change(screen.getByPlaceholderText(/seller agreed to include charger/i), { target: { value: 'Include charger' } });
    fireEvent.click(screen.getByRole('button', { name: /confirm & send offer/i }));
    
    await waitFor(() =>
      expect(createTransaction).toHaveBeenCalledWith(
        expect.objectContaining({ terms: 'Include charger' })
      )
    );
  });
});

// ─── Final coverage gaps ──────────────────────────────────────────────────────

describe('ListingDetailView - edge cases', () => {
  it('line 79 — does not show Message Seller button when buyer is the seller', () => {
    const selfListing = { ...saleListing, sellerId: 'buyer-uid' };
    render(<ListingDetail listing={selfListing} currentUser={mockBuyer} navigate={mockNavigate} />);
    expect(screen.queryByText('Message Seller')).not.toBeInTheDocument();
    expect(screen.getByTestId('owner-listing-banner')).toBeInTheDocument();
  });

  it('line 157 — shows alert modal when no purchase type selected and confirm clicked', async () => {
    render(<ListingDetail listing={eitherListing} currentUser={mockBuyer} navigate={mockNavigate} />);
    fireEvent.click(screen.getByRole('button', { name: /buy now \/ make trade offer/i }));
    fireEvent.click(screen.getByRole('button', { name: /confirm & send offer/i }));
    
    await waitFor(() => {
      expect(screen.getByTestId('alert-modal')).toBeInTheDocument();
      expect(screen.getByTestId('alert-message')).toHaveTextContent('Please select a transaction type');
    });
    
    fireEvent.click(screen.getByTestId('alert-close-btn'));
    await waitFor(() => {
      expect(screen.queryByTestId('alert-modal')).not.toBeInTheDocument();
    });
  });

  it('line 332 — renders nothing for unrecognised listing type', () => {
    const unknownListing = { ...saleListing, type: 'Unknown Type', listingType: 'Unknown Type' };
    render(<ListingDetail listing={unknownListing} currentUser={mockBuyer} navigate={mockNavigate} />);
    expect(screen.queryByRole('button', { name: /buy now/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /make trade offer/i })).not.toBeInTheDocument();
    expect(screen.queryByTestId('pending-offer-banner')).not.toBeInTheDocument();
  });
});