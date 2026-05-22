// src/tests/ListingDetail.test.jsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { ListingDetailView as ListingDetail } from '../components/ListingDetail';
import { getDocs, addDoc, updateDoc, setDoc, getDoc, deleteDoc } from 'firebase/firestore';
import { createTransaction } from '../services/transactionService';
import { notifySellerOfOffer, deleteNewOfferNotification } from '../services/notificationService';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../firebase', () => ({
  auth: {},
  db: {},
  storage: {},
  googleProvider: {},
  isValidWitsEmail: vi.fn(),
  getUserType: vi.fn(),
}));

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
    getDoc: vi.fn(() => Promise.resolve({ exists: () => false, data: () => ({}) })),
    setDoc: vi.fn(() => Promise.resolve()),
    updateDoc: vi.fn(() => Promise.resolve()),
    deleteDoc: vi.fn(() => Promise.resolve()),
    arrayUnion: vi.fn(v => v),
    arrayRemove: vi.fn(v => v),
  };
});

vi.mock('../services/transactionService', () => ({
  createTransaction: vi.fn(() => Promise.resolve('mock-transaction-id')),
}));

vi.mock('../services/notificationService', () => ({
  notifySellerOfOffer: vi.fn(() => Promise.resolve('mock-notification-id')),
  deleteNewOfferNotification: vi.fn(() => Promise.resolve()),
}));

vi.mock('../components/ReportModal', () => ({
  default: ({ open, reportedName }) => {
    if (!open) return null;
    return <div data-testid="report-modal">Reporting: {reportedName}</div>;
  },
}));

vi.mock('../components/PromoteListingModal', () => ({
  default: () => null,
}));

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

// ─── Shared fixtures ──────────────────────────────────────────────────────────

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

const tradeListing = {
  ...saleListing,
  id: 'listing-124',
  type: 'For Trade',
  listingType: 'For Trade',
  title: 'Scientific Calculator',
  price: 80,
};

const eitherListing = {
  ...saleListing,
  id: 'listing-125',
  type: 'For Sale or Trade',
  listingType: 'For Sale or Trade',
  title: 'Physics Textbook',
  price: 200,
};

const noPhotoListing    = { ...saleListing, photos: [] };
const singlePhotoListing = { ...saleListing, photos: ['photo1.jpg'] };

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
  vi.useRealTimers();
  getDocs.mockResolvedValue({ docs: [] });
  addDoc.mockResolvedValue({ id: 'new-chat-id' });
  createTransaction.mockResolvedValue('mock-transaction-id');
  notifySellerOfOffer.mockResolvedValue('mock-notification-id');
  getDoc.mockResolvedValue({ exists: () => false, data: () => ({}) });
});

// ─── Helper ───────────────────────────────────────────────────────────────────

const renderWithAct = async (component) => {
  let result;
  await act(async () => {
    result = render(component);
  });
  await new Promise(resolve => setTimeout(resolve, 0));
  return result;
};

// ─── Action buttons ───────────────────────────────────────────────────────────

describe('ListingDetail - action buttons', () => {
  it('Test No.1 - shows Buy Now button when listing type is For Sale', async () => {
    await renderWithAct(<ListingDetail listing={saleListing} currentUser={mockBuyer} navigate={mockNavigate} />);
    expect(screen.getByRole('button', { name: /buy now/i })).toBeInTheDocument();
  });

  it('Test No.2 - shows Make Trade Offer button when listing type is For Trade', async () => {
    await renderWithAct(<ListingDetail listing={tradeListing} currentUser={mockBuyer} navigate={mockNavigate} />);
    expect(screen.getByRole('button', { name: /make trade offer/i })).toBeInTheDocument();
  });

  it('Test No.3 - shows combined Buy Now / Make Trade Offer button when listing type is For Sale or Trade', async () => {
    await renderWithAct(<ListingDetail listing={eitherListing} currentUser={mockBuyer} navigate={mockNavigate} />);
    expect(screen.getByRole('button', { name: /buy now \/ make trade offer/i })).toBeInTheDocument();
  });

  it('Test No.4 - shows pending offer banner instead of buy button when buyer already has an active offer', async () => {
    await renderWithAct(<ListingDetail listing={saleListing} currentUser={mockBuyer} existingTransaction={pendingTransaction} navigate={mockNavigate} />);
    expect(screen.queryByRole('button', { name: /buy now/i })).not.toBeInTheDocument();
    expect(screen.getByTestId('pending-offer-banner')).toBeInTheDocument();
  });

  it('Test No.4b - pending banner does not appear when there is no existing transaction', async () => {
    await renderWithAct(<ListingDetail listing={saleListing} currentUser={mockBuyer} existingTransaction={null} navigate={mockNavigate} />);
    expect(screen.queryByTestId('pending-offer-banner')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /buy now/i })).toBeInTheDocument();
  });

  it('Test No.4c - pending banner does not appear when an existing transaction is declined', async () => {
    const declinedTransaction = { ...pendingTransaction, status: 'declined' };
    await renderWithAct(<ListingDetail listing={saleListing} currentUser={mockBuyer} existingTransaction={declinedTransaction} navigate={mockNavigate} />);
    expect(screen.queryByTestId('pending-offer-banner')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /buy now/i })).toBeInTheDocument();
  });

  it('Test No.4d - pending banner shows "Offer Already Initiated" title', async () => {
    await renderWithAct(<ListingDetail listing={saleListing} currentUser={mockBuyer} existingTransaction={pendingTransaction} navigate={mockNavigate} />);
    expect(screen.getByText('Offer Already Initiated')).toBeInTheDocument();
  });

  it('Test No.4e - pending banner shows "Withdraw offer" button', async () => {
    await renderWithAct(<ListingDetail listing={saleListing} currentUser={mockBuyer} existingTransaction={pendingTransaction} navigate={mockNavigate} />);
    expect(screen.getByRole('button', { name: /withdraw offer/i })).toBeInTheDocument();
  });

  it('Test No.8 - calls createTransaction and notifySellerOfOffer when purchase is confirmed', async () => {
    await renderWithAct(<ListingDetail listing={saleListing} currentUser={mockBuyer} navigate={mockNavigate} />);

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /buy now/i })); });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /confirm & send offer/i })); });

    await waitFor(() => {
      expect(createTransaction).toHaveBeenCalledTimes(1);
      expect(notifySellerOfOffer).toHaveBeenCalledTimes(1);
    });
  });

  it('Test No.8b - createTransaction is called with correct buyerId and listingId', async () => {
    await renderWithAct(<ListingDetail listing={saleListing} currentUser={mockBuyer} navigate={mockNavigate} />);

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /buy now/i })); });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /confirm & send offer/i })); });

    await waitFor(() =>
      expect(createTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          buyerId:   'buyer-uid',
          listingId: 'listing-123',
          sellerId:  'seller-uid',
        })
      )
    );
  });

  it('Test No.8c - notifySellerOfOffer is called with the transactionId returned by createTransaction', async () => {
    createTransaction.mockResolvedValueOnce('tx-specific-id');
    await renderWithAct(<ListingDetail listing={saleListing} currentUser={mockBuyer} navigate={mockNavigate} />);

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /buy now/i })); });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /confirm & send offer/i })); });

    await waitFor(() =>
      expect(notifySellerOfOffer).toHaveBeenCalledWith(
        expect.objectContaining({ transactionId: 'tx-specific-id' })
      )
    );
  });

  it('Test No.12 - does not show action buttons when the current user is the seller', async () => {
    await renderWithAct(<ListingDetail listing={saleListing} currentUser={mockSeller} navigate={mockNavigate} />);
    expect(screen.queryByRole('button', { name: /buy now/i })).not.toBeInTheDocument();
    expect(screen.getByTestId('owner-listing-banner')).toBeInTheDocument();
  });

  it('Test No.13 - does not show action buttons when no user is logged in', async () => {
    await renderWithAct(<ListingDetail listing={saleListing} currentUser={null} navigate={mockNavigate} />);
    expect(screen.queryByRole('button', { name: /buy now/i })).not.toBeInTheDocument();
  });
});

// ─── Purchase modal ───────────────────────────────────────────────────────────

describe('ListingDetail - purchase modal', () => {
  it('Test No.14 - opens the modal when Buy Now button is clicked', async () => {
    await renderWithAct(<ListingDetail listing={saleListing} currentUser={mockBuyer} navigate={mockNavigate} />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /buy now/i })); });
    expect(screen.getByText(/initiate purchase/i)).toBeInTheDocument();
  });

  it('Test No.15 - closes the modal when the × button is clicked', async () => {
    await renderWithAct(<ListingDetail listing={saleListing} currentUser={mockBuyer} navigate={mockNavigate} />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /buy now/i })); });
    expect(screen.getByText(/initiate purchase/i)).toBeInTheDocument();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /close modal/i })); });
    expect(screen.queryByText(/initiate purchase/i)).not.toBeInTheDocument();
  });

  it("Test No.16 - shows type selector for 'For Sale or Trade' listings before a type is chosen", async () => {
    await renderWithAct(<ListingDetail listing={eitherListing} currentUser={mockBuyer} navigate={mockNavigate} />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /buy now \/ make trade offer/i })); });
    expect(screen.getByRole('button', { name: /cash purchase/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /trade item/i })).toBeInTheDocument();
  });

  it("Test No.17 - shows sale fields after choosing Cash Purchase on a 'For Sale or Trade' listing", async () => {
    await renderWithAct(<ListingDetail listing={eitherListing} currentUser={mockBuyer} navigate={mockNavigate} />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /buy now \/ make trade offer/i })); });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /cash purchase/i })); });
    expect(screen.getByLabelText(/agreed price/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/payment method/i)).toBeInTheDocument();
  });

  it("Test No.18 - shows trade fields after choosing Trade Item on a 'For Sale or Trade' listing", async () => {
    await renderWithAct(<ListingDetail listing={eitherListing} currentUser={mockBuyer} navigate={mockNavigate} />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /buy now \/ make trade offer/i })); });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /trade item/i })); });
    expect(screen.getByLabelText(/trade item name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/category/i)).toBeInTheDocument();
  });

  it('Test No.18a - modal header says "Initiate Trade" when trade offer is open', async () => {
    await renderWithAct(<ListingDetail listing={tradeListing} currentUser={mockBuyer} navigate={mockNavigate} />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /make trade offer/i })); });
    expect(screen.getByText('Initiate Trade')).toBeInTheDocument();
  });

  it('Test No.18b - modal header says "Initiate Purchase" when sale offer is open', async () => {
    await renderWithAct(<ListingDetail listing={saleListing} currentUser={mockBuyer} navigate={mockNavigate} />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /buy now/i })); });
    expect(screen.getByText('Initiate Purchase')).toBeInTheDocument();
  });

  it('Test No.18c - modal header says "Make an Offer" when no type chosen yet on either listing', async () => {
    await renderWithAct(<ListingDetail listing={eitherListing} currentUser={mockBuyer} navigate={mockNavigate} />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /buy now \/ make trade offer/i })); });
    expect(screen.getByText('Make an Offer')).toBeInTheDocument();
  });

  it('Test No.18d - closing modal resets purchaseType so type selector reappears on reopen', async () => {
    await renderWithAct(<ListingDetail listing={eitherListing} currentUser={mockBuyer} navigate={mockNavigate} />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /buy now \/ make trade offer/i })); });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /cash purchase/i })); });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /close modal/i })); });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /buy now \/ make trade offer/i })); });
    expect(screen.getByRole('button', { name: /cash purchase/i })).toBeInTheDocument();
  });
});

// ─── Owner banner ─────────────────────────────────────────────────────────────

describe('ListingDetail - owner banner', () => {
  it('Test No.19 - shows the owner banner when the seller views their own listing', async () => {
    await renderWithAct(<ListingDetail listing={saleListing} currentUser={mockSeller} navigate={mockNavigate} />);
    expect(screen.getByTestId('owner-listing-banner')).toBeInTheDocument();
  });

  it('Test No.20 - does not show the owner banner when a buyer views the listing', async () => {
    await renderWithAct(<ListingDetail listing={saleListing} currentUser={mockBuyer} navigate={mockNavigate} />);
    expect(screen.queryByTestId('owner-listing-banner')).not.toBeInTheDocument();
  });

  it('Test No.20a - owner banner contains "This is your listing" text', async () => {
    await renderWithAct(<ListingDetail listing={saleListing} currentUser={mockSeller} navigate={mockNavigate} />);
    expect(screen.getByText('This is your listing')).toBeInTheDocument();
  });

  it('Test No.20b - owner banner does not appear when currentUser is null', async () => {
    await renderWithAct(<ListingDetail listing={saleListing} currentUser={null} navigate={mockNavigate} />);
    expect(screen.queryByTestId('owner-listing-banner')).not.toBeInTheDocument();
  });
});

// ─── Images ───────────────────────────────────────────────────────────────────

describe('ListingDetailView - images', () => {
  it('renders main image when photos exist', async () => {
    await renderWithAct(<ListingDetail listing={saleListing} currentUser={mockBuyer} navigate={mockNavigate} />);
    expect(screen.getByAltText('Calculus Textbook')).toBeInTheDocument();
  });

  it('renders no image placeholder when photos is empty', async () => {
    await renderWithAct(<ListingDetail listing={noPhotoListing} currentUser={mockBuyer} navigate={mockNavigate} />);
    expect(screen.getByText('No Image Available')).toBeInTheDocument();
  });

  it('renders thumbnail row when multiple photos exist', async () => {
    await renderWithAct(<ListingDetail listing={saleListing} currentUser={mockBuyer} navigate={mockNavigate} />);
    expect(screen.getAllByAltText(/thumb-/)).toHaveLength(2);
  });

  it('switches main image when thumbnail is clicked', async () => {
    await renderWithAct(<ListingDetail listing={saleListing} currentUser={mockBuyer} navigate={mockNavigate} />);
    const thumbs = screen.getAllByAltText(/thumb-/);
    await act(async () => { fireEvent.click(thumbs[1]); });
    expect(thumbs[1]).toHaveStyle('border: 2px solid #6AA6DA');
  });

  it('does not render thumbnail row when only one photo exists', async () => {
    await renderWithAct(<ListingDetail listing={singlePhotoListing} currentUser={mockBuyer} navigate={mockNavigate} />);
    expect(screen.queryAllByAltText(/thumb-/)).toHaveLength(0);
  });
});

// ─── Listing details ──────────────────────────────────────────────────────────

describe('ListingDetailView - listing details', () => {
  it('renders title and price', async () => {
    await renderWithAct(<ListingDetail listing={saleListing} currentUser={mockBuyer} navigate={mockNavigate} />);
    expect(screen.getByText('Calculus Textbook')).toBeInTheDocument();
    expect(screen.getByText('R 150')).toBeInTheDocument();
  });

  it('renders description when present', async () => {
    await renderWithAct(<ListingDetail listing={saleListing} currentUser={mockBuyer} navigate={mockNavigate} />);
    expect(screen.getByText('A great textbook')).toBeInTheDocument();
  });

  it('renders specification when present', async () => {
    await renderWithAct(<ListingDetail listing={saleListing} currentUser={mockBuyer} navigate={mockNavigate} />);
    expect(screen.getByText('3rd Edition')).toBeInTheDocument();
  });

  it('renders condition and category badges', async () => {
    await renderWithAct(<ListingDetail listing={saleListing} currentUser={mockBuyer} navigate={mockNavigate} />);
    expect(screen.getByText('Good')).toBeInTheDocument();
    expect(screen.getByText('Textbooks')).toBeInTheDocument();
  });

  it('renders seller name on seller card', async () => {
    await renderWithAct(<ListingDetail listing={saleListing} currentUser={mockBuyer} navigate={mockNavigate} />);
    expect(screen.getByText('Test Seller')).toBeInTheDocument();
  });

  it('renders seller initial when no avatar', async () => {
    await renderWithAct(<ListingDetail listing={saleListing} currentUser={mockBuyer} navigate={mockNavigate} />);
    expect(screen.getByText('T')).toBeInTheDocument();
  });

  it('renders seller avatar image when provided', async () => {
    const listingWithAvatar = { ...saleListing, sellerAvatar: 'avatar.jpg' };
    await renderWithAct(<ListingDetail listing={listingWithAvatar} currentUser={mockBuyer} navigate={mockNavigate} />);
    expect(screen.getByAltText('Test Seller')).toBeInTheDocument();
  });

  it('does not show price for a For Trade listing', async () => {
    await renderWithAct(<ListingDetail listing={tradeListing} currentUser={mockBuyer} navigate={mockNavigate} />);
    expect(screen.queryByText(/R 80/)).not.toBeInTheDocument();
  });

  it('does not render description section when description is absent', async () => {
    const noDescListing = { ...saleListing, description: undefined };
    await renderWithAct(<ListingDetail listing={noDescListing} currentUser={mockBuyer} navigate={mockNavigate} />);
    expect(screen.queryByText(/description/i)).not.toBeInTheDocument();
  });

  it('does not render specification section when specification is absent', async () => {
    const noSpecListing = { ...saleListing, specification: undefined };
    await renderWithAct(<ListingDetail listing={noSpecListing} currentUser={mockBuyer} navigate={mockNavigate} />);
    expect(screen.queryByText(/specifications/i)).not.toBeInTheDocument();
  });

  it('falls back to "?" initial when sellerName is absent', async () => {
    const noNameListing = { ...saleListing, sellerName: undefined };
    await renderWithAct(<ListingDetail listing={noNameListing} currentUser={mockBuyer} navigate={mockNavigate} />);
    expect(screen.getByText('?')).toBeInTheDocument();
  });
});

// ─── Seller card navigation ───────────────────────────────────────────────────

describe('ListingDetailView - seller card navigation', () => {
  it('navigates to seller profile when buyer clicks seller card', async () => {
    await renderWithAct(<ListingDetail listing={saleListing} currentUser={mockBuyer} navigate={mockNavigate} />);
    await act(async () => { fireEvent.click(screen.getByTitle('View seller profile')); });
    expect(mockNavigate).toHaveBeenCalledWith('/profile/seller-uid');
  });

  it('navigates to own profile when seller clicks seller card', async () => {
    await renderWithAct(<ListingDetail listing={saleListing} currentUser={mockSeller} navigate={mockNavigate} />);
    await act(async () => { fireEvent.click(screen.getByTitle('Go to your profile')); });
    expect(mockNavigate).toHaveBeenCalledWith('/profile');
  });

  it('navigates via Enter key on seller card', async () => {
    await renderWithAct(<ListingDetail listing={saleListing} currentUser={mockBuyer} navigate={mockNavigate} />);
    const card = screen.getByTitle('View seller profile');
    await act(async () => { fireEvent.keyDown(card, { key: 'Enter' }); });
    expect(mockNavigate).toHaveBeenCalledWith('/profile/seller-uid');
  });

  it('seller card shows "View profile & ratings →" subtitle for buyer', async () => {
    await renderWithAct(<ListingDetail listing={saleListing} currentUser={mockBuyer} navigate={mockNavigate} />);
    expect(screen.getByText('View profile & ratings →')).toBeInTheDocument();
  });

  it('seller card shows "View your profile →" subtitle for seller', async () => {
    await renderWithAct(<ListingDetail listing={saleListing} currentUser={mockSeller} navigate={mockNavigate} />);
    expect(screen.getByText('View your profile →')).toBeInTheDocument();
  });
});

// ─── Message seller ───────────────────────────────────────────────────────────

describe('ListingDetailView - message seller', () => {
  it('renders Message Seller button for buyer', async () => {
    await renderWithAct(<ListingDetail listing={saleListing} currentUser={mockBuyer} navigate={mockNavigate} />);
    expect(screen.getByText('Message Seller')).toBeInTheDocument();
  });

  it('does not render Message Seller button for seller', async () => {
    await renderWithAct(<ListingDetail listing={saleListing} currentUser={mockSeller} navigate={mockNavigate} />);
    expect(screen.queryByText('Message Seller')).not.toBeInTheDocument();
  });

  it('does not render Message Seller button when not logged in', async () => {
    await renderWithAct(<ListingDetail listing={saleListing} currentUser={null} navigate={mockNavigate} />);
    expect(screen.queryByText('Message Seller')).not.toBeInTheDocument();
  });

  it('finds existing chat and navigates when Message Seller clicked', async () => {
    const mockChatDoc = { id: 'existing-chat', data: () => ({ participants: ['buyer-uid', 'seller-uid'] }) };
    getDocs.mockResolvedValueOnce({ docs: [mockChatDoc] });

    await renderWithAct(<ListingDetail listing={saleListing} currentUser={mockBuyer} navigate={mockNavigate} />);
    await act(async () => { fireEvent.click(screen.getByTestId('message-seller-btn')); });

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/chat?open=existing-chat');
    }, { timeout: 3000 });
  });

  it('creates new chat when no existing chat found', async () => {
    getDocs.mockResolvedValueOnce({ docs: [] });
    addDoc.mockResolvedValueOnce({ id: 'new-chat-id' });

    await renderWithAct(<ListingDetail listing={saleListing} currentUser={mockBuyer} navigate={mockNavigate} />);
    await act(async () => { fireEvent.click(screen.getByTestId('message-seller-btn')); });

    await waitFor(() => {
      expect(addDoc).toHaveBeenCalled();
      expect(mockNavigate).toHaveBeenCalledWith('/chat?open=new-chat-id');
    }, { timeout: 3000 });
  });

  it('shows Opening chat text while loading', async () => {
    getDocs.mockImplementationOnce(() => new Promise(() => {}));

    await renderWithAct(<ListingDetail listing={saleListing} currentUser={mockBuyer} navigate={mockNavigate} />);
    await act(async () => {
      fireEvent.click(screen.getByTestId('message-seller-btn'));
      await new Promise(r => setTimeout(r, 10));
    });

    expect(screen.getByTestId('chat-loading-text')).toBeInTheDocument();
    expect(screen.getByTestId('chat-loading-text')).toHaveTextContent('Opening chat…');
  });

  it('message-seller-btn is disabled while chat is loading', async () => {
    getDocs.mockImplementationOnce(() => new Promise(() => {}));

    await renderWithAct(<ListingDetail listing={saleListing} currentUser={mockBuyer} navigate={mockNavigate} />);
    await act(async () => {
      fireEvent.click(screen.getByTestId('message-seller-btn'));
      await new Promise(r => setTimeout(r, 10));
    });

    expect(screen.getByTestId('message-seller-btn')).toBeDisabled();
  });
});

// ─── Trade transaction ────────────────────────────────────────────────────────

describe('ListingDetailView - trade transaction', () => {
  it('calls createTransaction with trade type when trade offer confirmed', async () => {
    await renderWithAct(<ListingDetail listing={tradeListing} currentUser={mockBuyer} navigate={mockNavigate} />);

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /make trade offer/i })); });
    await act(async () => { fireEvent.change(screen.getByLabelText(/trade item name/i), { target: { value: 'My old laptop' } }); });
    await act(async () => { fireEvent.change(screen.getByLabelText(/category/i), { target: { value: 'Electronics' } }); });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /condition good/i })); });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /confirm & send offer/i })); });

    await waitFor(() =>
      expect(createTransaction).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'trade', tradeItem: expect.objectContaining({ name: 'My old laptop' }) })
      )
    );
  });

  it('shows alert modal when trade item is empty', async () => {
    await renderWithAct(<ListingDetail listing={tradeListing} currentUser={mockBuyer} navigate={mockNavigate} />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /make trade offer/i })); });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /confirm & send offer/i })); });

    await waitFor(() => {
      expect(screen.getByTestId('alert-modal')).toBeInTheDocument();
      expect(screen.getByTestId('alert-message')).toHaveTextContent('Please describe what you want to trade');
    });
  });

  it('includes tradeItem.category in createTransaction payload', async () => {
    await renderWithAct(<ListingDetail listing={tradeListing} currentUser={mockBuyer} navigate={mockNavigate} />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /make trade offer/i })); });
    await act(async () => { fireEvent.change(screen.getByLabelText(/trade item name/i), { target: { value: 'Keyboard' } }); });
    await act(async () => { fireEvent.change(screen.getByLabelText(/category/i), { target: { value: 'Electronics' } }); });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /confirm & send offer/i })); });

    await waitFor(() =>
      expect(createTransaction).toHaveBeenCalledWith(
        expect.objectContaining({ tradeItem: expect.objectContaining({ category: 'Electronics' }) })
      )
    );
  });

  it('includes tradeItem.condition when a condition is selected', async () => {
    await renderWithAct(<ListingDetail listing={tradeListing} currentUser={mockBuyer} navigate={mockNavigate} />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /make trade offer/i })); });
    await act(async () => { fireEvent.change(screen.getByLabelText(/trade item name/i), { target: { value: 'Keyboard' } }); });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /condition like new/i })); });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /confirm & send offer/i })); });

    await waitFor(() =>
      expect(createTransaction).toHaveBeenCalledWith(
        expect.objectContaining({ tradeItem: expect.objectContaining({ condition: 'Like New' }) })
      )
    );
  });

  it('trade condition buttons render all five options', async () => {
    await renderWithAct(<ListingDetail listing={tradeListing} currentUser={mockBuyer} navigate={mockNavigate} />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /make trade offer/i })); });

    for (const label of ['Condition New', 'Condition Like New', 'Condition Good', 'Condition Fair', 'Condition Poor']) {
      expect(screen.getByRole('button', { name: new RegExp(label, 'i') })).toBeInTheDocument();
    }
  });

  it('tradeItem.imageUrl is null when no image is uploaded', async () => {
    await renderWithAct(<ListingDetail listing={tradeListing} currentUser={mockBuyer} navigate={mockNavigate} />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /make trade offer/i })); });
    await act(async () => { fireEvent.change(screen.getByLabelText(/trade item name/i), { target: { value: 'Keyboard' } }); });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /confirm & send offer/i })); });

    await waitFor(() =>
      expect(createTransaction).toHaveBeenCalledWith(
        expect.objectContaining({ tradeItem: expect.objectContaining({ imageUrl: null }) })
      )
    );
  });
});

// ─── Partial payment ──────────────────────────────────────────────────────────

describe('ListingDetailView - partial payment', () => {
  it('shows partial amount input when Partial Online selected', async () => {
    await renderWithAct(<ListingDetail listing={saleListing} currentUser={mockBuyer} navigate={mockNavigate} />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /buy now/i })); });
    await act(async () => { fireEvent.change(screen.getByLabelText(/payment method/i), { target: { value: 'partial' } }); });
    expect(screen.getByLabelText(/online payment amount/i)).toBeInTheDocument();
  });

  it('calls createTransaction with partialAmount when partial payment used', async () => {
    await renderWithAct(<ListingDetail listing={saleListing} currentUser={mockBuyer} navigate={mockNavigate} />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /buy now/i })); });
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/payment method/i), { target: { value: 'partial' } });
      fireEvent.change(screen.getByLabelText(/online payment amount/i), { target: { value: '75' } });
    });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /confirm & send offer/i })); });

    await waitFor(() =>
      expect(createTransaction).toHaveBeenCalledWith(
        expect.objectContaining({ paymentType: 'partial', partialAmount: 75 })
      )
    );
  });

  it('shows alert when partial amount is below R10', async () => {
    await renderWithAct(<ListingDetail listing={saleListing} currentUser={mockBuyer} navigate={mockNavigate} />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /buy now/i })); });
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/payment method/i), { target: { value: 'partial' } });
      fireEvent.change(screen.getByLabelText(/online payment amount/i), { target: { value: '5' } });
    });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /confirm & send offer/i })); });

    await waitFor(() => expect(screen.getByTestId('alert-modal')).toBeInTheDocument());
  });

  it('shows alert when partial amount equals total agreed price', async () => {
    await renderWithAct(<ListingDetail listing={saleListing} currentUser={mockBuyer} navigate={mockNavigate} />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /buy now/i })); });
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/payment method/i), { target: { value: 'partial' } });
    });

    // Type the full agreed price (150) directly into the partial amount field
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/online payment amount/i), { target: { value: '150' } });
    });

    await waitFor(() => expect(screen.getByTestId('alert-modal')).toBeInTheDocument());
  });

  it('shows cash remainder label when partial amount entered', async () => {
    await renderWithAct(<ListingDetail listing={saleListing} currentUser={mockBuyer} navigate={mockNavigate} />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /buy now/i })); });
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/payment method/i), { target: { value: 'partial' } });
      fireEvent.change(screen.getByLabelText(/online payment amount/i), { target: { value: '50' } });
    });
    expect(screen.getByText(/cash amount to pay on delivery/i)).toBeInTheDocument();
  });

  it('partial payment input is not shown when Full Cash is selected', async () => {
    await renderWithAct(<ListingDetail listing={saleListing} currentUser={mockBuyer} navigate={mockNavigate} />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /buy now/i })); });
    await act(async () => { fireEvent.change(screen.getByLabelText(/payment method/i), { target: { value: 'cash' } }); });
    expect(screen.queryByLabelText(/online payment amount/i)).not.toBeInTheDocument();
  });

  it('createTransaction paymentMethod is "cod" when Full Cash on Delivery is chosen', async () => {
    await renderWithAct(<ListingDetail listing={saleListing} currentUser={mockBuyer} navigate={mockNavigate} />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /buy now/i })); });
    await act(async () => { fireEvent.change(screen.getByLabelText(/payment method/i), { target: { value: 'cash' } }); });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /confirm & send offer/i })); });

    await waitFor(() =>
      expect(createTransaction).toHaveBeenCalledWith(
        expect.objectContaining({ paymentMethod: 'cod' })
      )
    );
  });

  it('createTransaction paymentMethod is "online" when Fully Online is chosen', async () => {
    await renderWithAct(<ListingDetail listing={saleListing} currentUser={mockBuyer} navigate={mockNavigate} />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /buy now/i })); });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /confirm & send offer/i })); });

    await waitFor(() =>
      expect(createTransaction).toHaveBeenCalledWith(
        expect.objectContaining({ paymentMethod: 'online' })
      )
    );
  });
});

// ─── Agreed price validation ──────────────────────────────────────────────────

describe('ListingDetailView - agreed price validation', () => {
  it('shows alert when agreed price is below R10', async () => {
    await renderWithAct(<ListingDetail listing={saleListing} currentUser={mockBuyer} navigate={mockNavigate} />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /buy now/i })); });
    await act(async () => { fireEvent.change(screen.getByLabelText(/agreed price/i), { target: { value: '5' } }); });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /confirm & send offer/i })); });

    await waitFor(() => {
      expect(screen.getByTestId('alert-modal')).toBeInTheDocument();
      expect(screen.getByTestId('alert-message')).toHaveTextContent('Agreed price must be at least R10');
    });
  });

  it('does not call createTransaction when price validation fails', async () => {
    await renderWithAct(<ListingDetail listing={saleListing} currentUser={mockBuyer} navigate={mockNavigate} />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /buy now/i })); });
    await act(async () => { fireEvent.change(screen.getByLabelText(/agreed price/i), { target: { value: '0' } }); });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /confirm & send offer/i })); });

    await waitFor(() => expect(screen.getByTestId('alert-modal')).toBeInTheDocument());
    expect(createTransaction).not.toHaveBeenCalled();
  });

  it('alert modal closes when OK button is clicked', async () => {
    await renderWithAct(<ListingDetail listing={saleListing} currentUser={mockBuyer} navigate={mockNavigate} />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /buy now/i })); });
    await act(async () => { fireEvent.change(screen.getByLabelText(/agreed price/i), { target: { value: '5' } }); });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /confirm & send offer/i })); });

    await waitFor(() => expect(screen.getByTestId('alert-modal')).toBeInTheDocument());
    await act(async () => { fireEvent.click(screen.getByTestId('alert-close-btn')); });
    expect(screen.queryByTestId('alert-modal')).not.toBeInTheDocument();
  });
});

// ─── Offer sent state ─────────────────────────────────────────────────────────

describe('ListingDetailView - offer sent', () => {
  it('shows pending banner after offer is successfully sent', async () => {
    await renderWithAct(<ListingDetail listing={saleListing} currentUser={mockBuyer} navigate={mockNavigate} />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /buy now/i })); });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /confirm & send offer/i })); });

    await waitFor(() => expect(screen.getByTestId('pending-offer-banner')).toBeInTheDocument());
  });

  it('shows error toast when createTransaction fails', async () => {
    createTransaction.mockRejectedValueOnce(new Error('Network error'));

    await renderWithAct(<ListingDetail listing={saleListing} currentUser={mockBuyer} navigate={mockNavigate} />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /buy now/i })); });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /confirm & send offer/i })); });

    await waitFor(() => {
      expect(screen.getByText('Failed to create offer. Please try again.')).toBeInTheDocument();
    });
  });

  it('does not show pending banner when createTransaction fails', async () => {
    createTransaction.mockRejectedValueOnce(new Error('Network error'));

    await renderWithAct(<ListingDetail listing={saleListing} currentUser={mockBuyer} navigate={mockNavigate} />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /buy now/i })); });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /confirm & send offer/i })); });

    await waitFor(() => expect(screen.getByText('Failed to create offer. Please try again.')).toBeInTheDocument());
    expect(screen.queryByTestId('pending-offer-banner')).not.toBeInTheDocument();
  });

  it('buy button re-enables after a failed submission', async () => {
    createTransaction.mockRejectedValueOnce(new Error('fail'));

    await renderWithAct(<ListingDetail listing={saleListing} currentUser={mockBuyer} navigate={mockNavigate} />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /buy now/i })); });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /confirm & send offer/i })); });

    await waitFor(() => expect(screen.queryByText(/sending offer/i)).not.toBeInTheDocument());

    // Confirm modal still open with enabled submit button after failure
    expect(screen.getByRole('button', { name: /confirm & send offer/i })).not.toBeDisabled();
  });
});

// ─── Terms field ──────────────────────────────────────────────────────────────

describe('ListingDetailView - terms field', () => {
  it('renders terms textarea in modal', async () => {
    await renderWithAct(<ListingDetail listing={saleListing} currentUser={mockBuyer} navigate={mockNavigate} />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /buy now/i })); });
    expect(screen.getByPlaceholderText(/seller agreed to include charger/i)).toBeInTheDocument();
  });

  it('passes terms value to createTransaction', async () => {
    await renderWithAct(<ListingDetail listing={saleListing} currentUser={mockBuyer} navigate={mockNavigate} />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /buy now/i })); });
    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText(/seller agreed to include charger/i), { target: { value: 'Include charger' } });
    });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /confirm & send offer/i })); });

    await waitFor(() =>
      expect(createTransaction).toHaveBeenCalledWith(
        expect.objectContaining({ terms: 'Include charger' })
      )
    );
  });

  it('passes null terms when field is left blank', async () => {
    await renderWithAct(<ListingDetail listing={saleListing} currentUser={mockBuyer} navigate={mockNavigate} />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /buy now/i })); });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /confirm & send offer/i })); });

    await waitFor(() =>
      expect(createTransaction).toHaveBeenCalledWith(
        expect.objectContaining({ terms: null })
      )
    );
  });
});

// ─── Withdraw offer ───────────────────────────────────────────────────────────

describe('ListingDetailView - withdraw offer', () => {
  it('shows confirmation prompt when Withdraw offer is clicked', async () => {
    await renderWithAct(<ListingDetail listing={saleListing} currentUser={mockBuyer} existingTransaction={pendingTransaction} navigate={mockNavigate} />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /withdraw offer/i })); });
    expect(screen.getByText(/are you sure you want to withdraw/i)).toBeInTheDocument();
  });

  it('shows "Yes, withdraw" and "Keep offer" buttons in confirmation state', async () => {
    await renderWithAct(<ListingDetail listing={saleListing} currentUser={mockBuyer} existingTransaction={pendingTransaction} navigate={mockNavigate} />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /withdraw offer/i })); });
    expect(screen.getByRole('button', { name: /yes, withdraw/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /keep offer/i })).toBeInTheDocument();
  });

  it('"Keep offer" cancels the confirmation and reverts to Withdraw offer button', async () => {
    await renderWithAct(<ListingDetail listing={saleListing} currentUser={mockBuyer} existingTransaction={pendingTransaction} navigate={mockNavigate} />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /withdraw offer/i })); });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /keep offer/i })); });
    expect(screen.getByRole('button', { name: /withdraw offer/i })).toBeInTheDocument();
    expect(screen.queryByText(/are you sure/i)).not.toBeInTheDocument();
  });

  it('calls deleteDoc and deleteNewOfferNotification when withdrawal is confirmed', async () => {
    await renderWithAct(<ListingDetail listing={saleListing} currentUser={mockBuyer} existingTransaction={pendingTransaction} navigate={mockNavigate} />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /withdraw offer/i })); });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /yes, withdraw/i })); });

    await waitFor(() => {
      expect(deleteDoc).toHaveBeenCalledTimes(1);
      expect(deleteNewOfferNotification).toHaveBeenCalledWith('tx-existing');
    });
  });
});

// ─── Favourites ───────────────────────────────────────────────────────────────

describe('ListingDetailView - favourites', () => {
  it('renders Add to favourites button for a logged-in buyer', async () => {
    await renderWithAct(<ListingDetail listing={saleListing} currentUser={mockBuyer} navigate={mockNavigate} />);
    expect(screen.getByText('Add to favourites')).toBeInTheDocument();
  });

  it('does not render favourites button when not logged in', async () => {
    await renderWithAct(<ListingDetail listing={saleListing} currentUser={null} navigate={mockNavigate} />);
    expect(screen.queryByText('Add to favourites')).not.toBeInTheDocument();
  });

  it('does not render favourites button for the seller', async () => {
    await renderWithAct(<ListingDetail listing={saleListing} currentUser={mockSeller} navigate={mockNavigate} />);
    expect(screen.queryByText('Add to favourites')).not.toBeInTheDocument();
  });

  it('shows Remove from favourites when listing is already favourited', async () => {
    getDoc.mockResolvedValueOnce({
      exists: () => true,
      data:   () => ({ items: ['listing-123'] }),
    });

    await renderWithAct(<ListingDetail listing={saleListing} currentUser={mockBuyer} navigate={mockNavigate} />);
    await waitFor(() => expect(screen.getByText('Remove from favourites')).toBeInTheDocument());
  });

  it('calls setDoc when a new favourites cart does not exist yet', async () => {
    getDoc
      .mockResolvedValueOnce({ exists: () => false, data: () => ({}) }) // initial check
      .mockResolvedValueOnce({ exists: () => false, data: () => ({}) }); // toggle click

    await renderWithAct(<ListingDetail listing={saleListing} currentUser={mockBuyer} navigate={mockNavigate} />);
    await act(async () => { fireEvent.click(screen.getByText('Add to favourites')); });

    await waitFor(() => expect(setDoc).toHaveBeenCalledTimes(1));
  });

  it('calls updateDoc with arrayRemove when unfavouriting', async () => {
    getDoc
      .mockResolvedValueOnce({ exists: () => true, data: () => ({ items: ['listing-123'] }) })
      .mockResolvedValueOnce({ exists: () => true, data: () => ({ items: ['listing-123'] }) });

    await renderWithAct(<ListingDetail listing={saleListing} currentUser={mockBuyer} navigate={mockNavigate} />);
    await waitFor(() => expect(screen.getByText('Remove from favourites')).toBeInTheDocument());

    await act(async () => { fireEvent.click(screen.getByText('Remove from favourites')); });

    await waitFor(() => expect(updateDoc).toHaveBeenCalledTimes(1));
  });
});

// ─── Report listing ───────────────────────────────────────────────────────────

describe('ListingDetailView - report listing', () => {
  it('renders Report Listing button for a logged-in buyer', async () => {
    await renderWithAct(<ListingDetail listing={saleListing} currentUser={mockBuyer} navigate={mockNavigate} />);
    expect(screen.getByText('Report Listing')).toBeInTheDocument();
  });

  it('does not render Report Listing button when not logged in', async () => {
    await renderWithAct(<ListingDetail listing={saleListing} currentUser={null} navigate={mockNavigate} />);
    expect(screen.queryByText('Report Listing')).not.toBeInTheDocument();
  });

  it('does not render Report Listing button for the seller', async () => {
    await renderWithAct(<ListingDetail listing={saleListing} currentUser={mockSeller} navigate={mockNavigate} />);
    expect(screen.queryByText('Report Listing')).not.toBeInTheDocument();
  });

  it('opens ReportModal when Report Listing is clicked', async () => {
    await renderWithAct(<ListingDetail listing={saleListing} currentUser={mockBuyer} navigate={mockNavigate} />);
    await act(async () => { fireEvent.click(screen.getByText('Report Listing')); });
    expect(screen.getByTestId('report-modal')).toBeInTheDocument();
  });

  it('report modal shows the listing title', async () => {
    await renderWithAct(<ListingDetail listing={saleListing} currentUser={mockBuyer} navigate={mockNavigate} />);
    await act(async () => { fireEvent.click(screen.getByText('Report Listing')); });
    expect(screen.getByTestId('report-modal')).toHaveTextContent('Calculus Textbook');
  });
});

// ─── Admin preview ────────────────────────────────────────────────────────────

describe('ListingDetailView - admin preview', () => {
  it('shows "Admin preview" banner when isAdminPreview is true', async () => {
    await renderWithAct(<ListingDetail listing={saleListing} currentUser={mockBuyer} navigate={mockNavigate} isAdminPreview={true} />);
    expect(screen.getByText('Admin preview')).toBeInTheDocument();
  });

  it('hides buy button in admin preview mode', async () => {
    await renderWithAct(<ListingDetail listing={saleListing} currentUser={mockBuyer} navigate={mockNavigate} isAdminPreview={true} />);
    expect(screen.queryByRole('button', { name: /buy now/i })).not.toBeInTheDocument();
  });

  it('hides Message Seller button in admin preview mode', async () => {
    await renderWithAct(<ListingDetail listing={saleListing} currentUser={mockBuyer} navigate={mockNavigate} isAdminPreview={true} />);
    expect(screen.queryByTestId('message-seller-btn')).not.toBeInTheDocument();
  });

  it('hides Report Listing button in admin preview mode', async () => {
    await renderWithAct(<ListingDetail listing={saleListing} currentUser={mockBuyer} navigate={mockNavigate} isAdminPreview={true} />);
    expect(screen.queryByText('Report Listing')).not.toBeInTheDocument();
  });

  it('hides owner banner in admin preview mode even when seller views it', async () => {
    await renderWithAct(<ListingDetail listing={saleListing} currentUser={mockSeller} navigate={mockNavigate} isAdminPreview={true} />);
    expect(screen.queryByTestId('owner-listing-banner')).not.toBeInTheDocument();
  });

  it('hides seller card in admin preview mode', async () => {
    await renderWithAct(<ListingDetail listing={saleListing} currentUser={mockBuyer} navigate={mockNavigate} isAdminPreview={true} />);
    expect(screen.queryByTitle('View seller profile')).not.toBeInTheDocument();
  });

  it('shows "Back to reports" button in admin preview mode', async () => {
    await renderWithAct(<ListingDetail listing={saleListing} currentUser={mockBuyer} navigate={mockNavigate} isAdminPreview={true} />);
    expect(screen.getByRole('button', { name: /back to reports/i })).toBeInTheDocument();
  });

  it('calls navigate(-1) when Back to reports is clicked in admin preview', async () => {
    await renderWithAct(<ListingDetail listing={saleListing} currentUser={mockBuyer} navigate={mockNavigate} isAdminPreview={true} />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /back to reports/i })); });
    expect(mockNavigate).toHaveBeenCalledWith(-1);
  });
});

// ─── Edge cases ───────────────────────────────────────────────────────────────

describe('ListingDetailView - edge cases', () => {
  it('does not show Message Seller button when buyer is the seller', async () => {
    const selfListing = { ...saleListing, sellerId: 'buyer-uid' };
    await renderWithAct(<ListingDetail listing={selfListing} currentUser={mockBuyer} navigate={mockNavigate} />);
    expect(screen.queryByText('Message Seller')).not.toBeInTheDocument();
    expect(screen.getByTestId('owner-listing-banner')).toBeInTheDocument();
  });

  it('shows alert modal when no purchase type selected and confirm clicked', async () => {
    await renderWithAct(<ListingDetail listing={eitherListing} currentUser={mockBuyer} navigate={mockNavigate} />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /buy now \/ make trade offer/i })); });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /confirm & send offer/i })); });

    await waitFor(() => {
      expect(screen.getByTestId('alert-modal')).toBeInTheDocument();
      expect(screen.getByTestId('alert-message')).toHaveTextContent('Please select a transaction type');
    });
  });

  it('renders nothing for unrecognised listing type', async () => {
    const unknownListing = { ...saleListing, type: 'Unknown Type', listingType: 'Unknown Type' };
    await renderWithAct(<ListingDetail listing={unknownListing} currentUser={mockBuyer} navigate={mockNavigate} />);
    expect(screen.queryByRole('button', { name: /buy now/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /make trade offer/i })).not.toBeInTheDocument();
    expect(screen.queryByTestId('pending-offer-banner')).not.toBeInTheDocument();
  });

  it('uses sellerUID field as fallback when sellerId is absent', async () => {
    const uidListing = { ...saleListing, sellerId: undefined, sellerUID: 'seller-uid' };
    await renderWithAct(<ListingDetail listing={uidListing} currentUser={mockSeller} navigate={mockNavigate} />);
    expect(screen.getByTestId('owner-listing-banner')).toBeInTheDocument();
  });

  it('createTransaction payload has status "pending"', async () => {
    await renderWithAct(<ListingDetail listing={saleListing} currentUser={mockBuyer} navigate={mockNavigate} />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /buy now/i })); });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /confirm & send offer/i })); });

    await waitFor(() =>
      expect(createTransaction).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'pending' })
      )
    );
  });

  it('createTransaction buyerName falls back to "Student" when displayName is absent', async () => {
    const noNameUser = { uid: 'buyer-uid', displayName: undefined };
    await renderWithAct(<ListingDetail listing={saleListing} currentUser={noNameUser} navigate={mockNavigate} />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /buy now/i })); });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /confirm & send offer/i })); });

    await waitFor(() =>
      expect(createTransaction).toHaveBeenCalledWith(
        expect.objectContaining({ buyerName: 'Student' })
      )
    );
  });
});