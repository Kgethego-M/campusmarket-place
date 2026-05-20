// src/tests/ListingDetail.test.jsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { ListingDetailView as ListingDetail } from '../components/ListingDetail';
import { getDocs, addDoc } from 'firebase/firestore';
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

vi.mock('../components/ReportModal', () => ({
  default: () => null,
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

const tradeListing = { 
  ...saleListing, 
  id: 'listing-124', 
  type: 'For Trade', 
  listingType: 'For Trade', 
  title: 'Scientific Calculator', 
  price: 80 
};

const eitherListing = { 
  ...saleListing, 
  id: 'listing-125', 
  type: 'For Sale or Trade', 
  listingType: 'For Sale or Trade', 
  title: 'Physics Textbook', 
  price: 200 
};

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
  vi.useRealTimers();
  
  getDocs.mockResolvedValue({ docs: [] });
  addDoc.mockResolvedValue({ id: 'new-chat-id' });
  createTransaction.mockResolvedValue('mock-transaction-id');
  notifySellerOfOffer.mockResolvedValue('mock-notification-id');
});

// ─── Helper to wait for component to settle ───────────────────────────────────

const renderWithAct = async (component) => {
  let result;
  await act(async () => {
    result = render(component);
  });
  // Wait for any pending promises
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

  it('Test No.8 - calls createTransaction and notifySellerOfOffer when purchase is confirmed', async () => {
    await renderWithAct(<ListingDetail listing={saleListing} currentUser={mockBuyer} navigate={mockNavigate} />);
    
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /buy now/i }));
    });
    
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /confirm & send offer/i }));
    });
    
    await waitFor(() => {
      expect(createTransaction).toHaveBeenCalledTimes(1);
      expect(notifySellerOfOffer).toHaveBeenCalledTimes(1);
    });
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
    
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /buy now/i }));
    });
    
    expect(screen.getByText(/initiate purchase/i)).toBeInTheDocument();
  });

  it('Test No.15 - closes the modal when the × button is clicked', async () => {
    await renderWithAct(<ListingDetail listing={saleListing} currentUser={mockBuyer} navigate={mockNavigate} />);
    
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /buy now/i }));
    });
    expect(screen.getByText(/initiate purchase/i)).toBeInTheDocument();
    
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /close modal/i }));
    });
    expect(screen.queryByText(/initiate purchase/i)).not.toBeInTheDocument();
  });

  it("Test No.16 - shows type selector for 'For Sale or Trade' listings before a type is chosen", async () => {
    await renderWithAct(<ListingDetail listing={eitherListing} currentUser={mockBuyer} navigate={mockNavigate} />);
    
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /buy now \/ make trade offer/i }));
    });
    
    expect(screen.getByRole('button', { name: /cash purchase/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /trade item/i })).toBeInTheDocument();
  });

  it("Test No.17 - shows sale fields after choosing Cash Purchase on a 'For Sale or Trade' listing", async () => {
    await renderWithAct(<ListingDetail listing={eitherListing} currentUser={mockBuyer} navigate={mockNavigate} />);
    
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /buy now \/ make trade offer/i }));
    });
    
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /cash purchase/i }));
    });
    
    expect(screen.getByLabelText(/agreed price/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/payment method/i)).toBeInTheDocument();
  });

  it("Test No.18 - shows trade fields after choosing Trade Item on a 'For Sale or Trade' listing", async () => {
    await renderWithAct(<ListingDetail listing={eitherListing} currentUser={mockBuyer} navigate={mockNavigate} />);
    
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /buy now \/ make trade offer/i }));
    });
    
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /trade item/i }));
    });
    
    expect(screen.getByLabelText(/trade item name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/category/i)).toBeInTheDocument();
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
    await act(async () => {
      fireEvent.click(thumbs[1]);
    });
    expect(thumbs[1]).toHaveStyle('border: 2px solid #6AA6DA');
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
});

// ─── Seller card navigation ───────────────────────────────────────────────────

describe('ListingDetailView - seller card navigation', () => {
  it('navigates to seller profile when buyer clicks seller card', async () => {
    await renderWithAct(<ListingDetail listing={saleListing} currentUser={mockBuyer} navigate={mockNavigate} />);
    await act(async () => {
      fireEvent.click(screen.getByTitle('View seller profile'));
    });
    expect(mockNavigate).toHaveBeenCalledWith('/profile/seller-uid');
  });

  it('navigates to own profile when seller clicks seller card', async () => {
    await renderWithAct(<ListingDetail listing={saleListing} currentUser={mockSeller} navigate={mockNavigate} />);
    await act(async () => {
      fireEvent.click(screen.getByTitle('Go to your profile'));
    });
    expect(mockNavigate).toHaveBeenCalledWith('/profile');
  });

  it('navigates via Enter key on seller card', async () => {
    await renderWithAct(<ListingDetail listing={saleListing} currentUser={mockBuyer} navigate={mockNavigate} />);
    const card = screen.getByTitle('View seller profile');
    await act(async () => {
      fireEvent.keyDown(card, { key: 'Enter' });
    });
    expect(mockNavigate).toHaveBeenCalledWith('/profile/seller-uid');
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
    const mockChatDoc = {
      id: 'existing-chat',
      data: () => ({ participants: ['buyer-uid', 'seller-uid'] }),
    };
    getDocs.mockResolvedValueOnce({ docs: [mockChatDoc] });

    await renderWithAct(<ListingDetail listing={saleListing} currentUser={mockBuyer} navigate={mockNavigate} />);

    await act(async () => {
      fireEvent.click(screen.getByTestId('message-seller-btn'));
    });

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/chat?open=existing-chat');
    }, { timeout: 3000 });
  });

  it('creates new chat when no existing chat found', async () => {
    getDocs.mockResolvedValueOnce({ docs: [] });
    addDoc.mockResolvedValueOnce({ id: 'new-chat-id' });

    await renderWithAct(<ListingDetail listing={saleListing} currentUser={mockBuyer} navigate={mockNavigate} />);

    await act(async () => {
      fireEvent.click(screen.getByTestId('message-seller-btn'));
    });

    await waitFor(() => {
      expect(addDoc).toHaveBeenCalled();
      expect(mockNavigate).toHaveBeenCalledWith('/chat?open=new-chat-id');
    }, { timeout: 3000 });
  });

  it('shows Opening chat text while loading', async () => {
    // Never-resolving promise keeps chatLoading = true
    getDocs.mockImplementationOnce(() => new Promise(() => {}));

    await renderWithAct(<ListingDetail listing={saleListing} currentUser={mockBuyer} navigate={mockNavigate} />);

    await act(async () => {
      fireEvent.click(screen.getByTestId('message-seller-btn'));
      // Yield to let setChatLoading(true) flush
      await new Promise(r => setTimeout(r, 10));
    });

    expect(screen.getByTestId('chat-loading-text')).toBeInTheDocument();
    expect(screen.getByTestId('chat-loading-text')).toHaveTextContent('Opening chat…');
  });
});

// ─── Trade transaction ────────────────────────────────────────────────────────

describe('ListingDetailView - trade transaction', () => {
  it('calls createTransaction with trade type when trade offer confirmed', async () => {
    await renderWithAct(<ListingDetail listing={tradeListing} currentUser={mockBuyer} navigate={mockNavigate} />);
    
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /make trade offer/i }));
    });
    
    await act(async () => {
      const nameInput = screen.getByLabelText(/trade item name/i);
      fireEvent.change(nameInput, { target: { value: 'My old laptop' } });
    });
    
    await act(async () => {
      const categorySelect = screen.getByLabelText(/category/i);
      fireEvent.change(categorySelect, { target: { value: 'Electronics' } });
    });
    
    await act(async () => {
      const conditionButton = screen.getByRole('button', { name: /condition good/i });
      fireEvent.click(conditionButton);
    });
    
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /confirm & send offer/i }));
    });
    
    await waitFor(() => {
      expect(createTransaction).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'trade', tradeItem: 'My old laptop' })
      );
    });
  });

  it('shows alert modal when trade item is empty', async () => {
    await renderWithAct(<ListingDetail listing={tradeListing} currentUser={mockBuyer} navigate={mockNavigate} />);
    
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /make trade offer/i }));
    });
    
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /confirm & send offer/i }));
    });
    
    await waitFor(() => {
      expect(screen.getByTestId('alert-modal')).toBeInTheDocument();
      expect(screen.getByTestId('alert-message')).toHaveTextContent('Please describe what you want to trade');
    });
  });
});

// ─── Partial payment ──────────────────────────────────────────────────────────

describe('ListingDetailView - partial payment', () => {
  it('shows partial amount input when Partial Online selected', async () => {
    await renderWithAct(<ListingDetail listing={saleListing} currentUser={mockBuyer} navigate={mockNavigate} />);
    
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /buy now/i }));
    });
    
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/payment method/i), { target: { value: 'partial' } });
    });
    
    expect(screen.getByLabelText(/online payment amount/i)).toBeInTheDocument();
  });

  it('calls createTransaction with partialAmount when partial payment used', async () => {
    await renderWithAct(<ListingDetail listing={saleListing} currentUser={mockBuyer} navigate={mockNavigate} />);
    
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /buy now/i }));
    });
    
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/payment method/i), { target: { value: 'partial' } });
      fireEvent.change(screen.getByLabelText(/online payment amount/i), { target: { value: '75' } });
    });
    
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /confirm & send offer/i }));
    });
    
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
    await renderWithAct(<ListingDetail listing={saleListing} currentUser={mockBuyer} navigate={mockNavigate} />);
    
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /buy now/i }));
    });
    
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /confirm & send offer/i }));
    });
    
    await waitFor(() =>
      expect(screen.getByTestId('pending-offer-banner')).toBeInTheDocument()
    );
  });

  it('shows error toast when createTransaction fails', async () => {
    createTransaction.mockRejectedValueOnce(new Error('Network error'));
    
    await renderWithAct(<ListingDetail listing={saleListing} currentUser={mockBuyer} navigate={mockNavigate} />);
    
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /buy now/i }));
    });
    
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /confirm & send offer/i }));
    });
    
    await waitFor(() => {
      expect(screen.getByText('Failed to create offer. Please try again.')).toBeInTheDocument();
    });
  });
});

// ─── Terms field ──────────────────────────────────────────────────────────────

describe('ListingDetailView - terms field', () => {
  it('renders terms textarea in modal', async () => {
    await renderWithAct(<ListingDetail listing={saleListing} currentUser={mockBuyer} navigate={mockNavigate} />);
    
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /buy now/i }));
    });
    
    expect(screen.getByPlaceholderText(/seller agreed to include charger/i)).toBeInTheDocument();
  });

  it('passes terms value to createTransaction', async () => {
    await renderWithAct(<ListingDetail listing={saleListing} currentUser={mockBuyer} navigate={mockNavigate} />);
    
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /buy now/i }));
    });
    
    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText(/seller agreed to include charger/i), { target: { value: 'Include charger' } });
    });
    
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /confirm & send offer/i }));
    });
    
    await waitFor(() =>
      expect(createTransaction).toHaveBeenCalledWith(
        expect.objectContaining({ terms: 'Include charger' })
      )
    );
  });
});

// ─── Final coverage gaps ──────────────────────────────────────────────────────

describe('ListingDetailView - edge cases', () => {
  it('line 79 — does not show Message Seller button when buyer is the seller', async () => {
    const selfListing = { ...saleListing, sellerId: 'buyer-uid' };
    await renderWithAct(<ListingDetail listing={selfListing} currentUser={mockBuyer} navigate={mockNavigate} />);
    expect(screen.queryByText('Message Seller')).not.toBeInTheDocument();
    expect(screen.getByTestId('owner-listing-banner')).toBeInTheDocument();
  });

  it('line 157 — shows alert modal when no purchase type selected and confirm clicked', async () => {
    await renderWithAct(<ListingDetail listing={eitherListing} currentUser={mockBuyer} navigate={mockNavigate} />);
    
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /buy now \/ make trade offer/i }));
    });
    
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /confirm & send offer/i }));
    });
    
    await waitFor(() => {
      expect(screen.getByTestId('alert-modal')).toBeInTheDocument();
      expect(screen.getByTestId('alert-message')).toHaveTextContent('Please select a transaction type');
    });
  });

  it('line 332 — renders nothing for unrecognised listing type', async () => {
    const unknownListing = { ...saleListing, type: 'Unknown Type', listingType: 'Unknown Type' };
    await renderWithAct(<ListingDetail listing={unknownListing} currentUser={mockBuyer} navigate={mockNavigate} />);
    expect(screen.queryByRole('button', { name: /buy now/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /make trade offer/i })).not.toBeInTheDocument();
    expect(screen.queryByTestId('pending-offer-banner')).not.toBeInTheDocument();
  });
});