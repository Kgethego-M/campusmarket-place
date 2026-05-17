// src/tests/notificationService.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { 
  notifySellerOfOffer, 
  notifyOfferAccepted,
  notifyOfferDeclined,
  notifyTradeAccepted,
  notifySellerBuyerPaid,
  notifyDropOffBooked,
  notifyDropOffConfirmed,
  notifyItemReadyForCollection,
  notifyTransactionComplete,
  notifyOverdueDropOff,
  notifyOverdueCollection,
  notifyCancelledDropOff,
  notifyCancelledCollection,
  markNotificationAsRead,
  markRatingAsRead,
  isRatingNotificationDismissed
} from '../services/notificationService';
import { collection, addDoc, getDocs, doc, updateDoc } from 'firebase/firestore';

// Mock Firestore
vi.mock('firebase/firestore', () => ({
  getFirestore: vi.fn(),
  collection: vi.fn(() => ({})),
  addDoc: vi.fn(() => Promise.resolve({ id: 'mock-notification-id' })),
  getDocs: vi.fn(() => Promise.resolve({ empty: true, docs: [] })),
  query: vi.fn(() => ({})),
  where: vi.fn(() => ({})),
  doc: vi.fn(() => ({})),
  updateDoc: vi.fn(() => Promise.resolve()),
  deleteDoc: vi.fn(() => Promise.resolve()),
  serverTimestamp: vi.fn(() => new Date()),
}));

vi.mock('../firebase', () => ({
  db: {},
}));

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe('notificationService', () => {

  it('Test No.7 - creates a notification document for the seller when an offer is initiated', async () => {
    await notifySellerOfOffer({
      transactionId: 'tx-123',
      sellerId: 'seller-uid',
      buyerId: 'buyer-uid',
      buyerName: 'Test Buyer',
      listingId: 'listing-123',
      listingTitle: 'Test Item',
      agreedPrice: 100,
    });

    expect(addDoc).toHaveBeenCalledTimes(1);
    expect(addDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        type: 'new_offer',
        userId: 'seller-uid',
        transactionId: 'tx-123',
        read: false,
        redirectPath: `/profile?tab=offers&highlight=tx-123`,
      })
    );
  });

  it('Test No.10 - creates a notification document for the buyer when seller accepts the offer', async () => {
    await notifyOfferAccepted({
      transactionId: 'tx-123',
      buyerId: 'buyer-uid',
      sellerId: 'seller-uid',
      listingId: 'listing-123',
      listingTitle: 'Test Item',
      agreedPrice: 100,
    });

    expect(addDoc).toHaveBeenCalledTimes(1);
    expect(addDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        type: 'offer_accepted',
        userId: 'buyer-uid',
        transactionId: 'tx-123',
        read: false,
        redirectPath: `/payment/tx-123`,
      })
    );
  });

  it('Test No.11 - creates notification for buyer when seller declines offer', async () => {
    await notifyOfferDeclined({
      transactionId: 'tx-123',
      buyerId: 'buyer-uid',
      listingId: 'listing-123',
      listingTitle: 'Test Item',
    });

    expect(addDoc).toHaveBeenCalledTimes(1);
    expect(addDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        type: 'offer_declined',
        userId: 'buyer-uid',
        transactionId: 'tx-123',
        redirectPath: '/view-listing',
      })
    );
  });

  it('Test No.12 - creates trade waiting notifications for both parties', async () => {
    await notifyTradeAccepted({
      transactionId: 'tx-123',
      buyerId: 'buyer-uid',
      sellerId: 'seller-uid',
      listingId: 'listing-123',
      listingTitle: 'Test Item',
    });

    expect(addDoc).toHaveBeenCalledTimes(2);
    expect(addDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ type: 'trade_waiting', userId: 'buyer-uid' })
    );
    expect(addDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ type: 'trade_waiting', userId: 'seller-uid' })
    );
  });

  it('Test No.13 - creates buyer_paid notification for seller', async () => {
    await notifySellerBuyerPaid({
      transactionId: 'tx-123',
      sellerId: 'seller-uid',
      buyerName: 'Test Buyer',
      listingId: 'listing-123',
      listingTitle: 'Test Item',
      agreedPrice: 100,
    });

    expect(addDoc).toHaveBeenCalledTimes(1);
    expect(addDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        type: 'buyer_paid',
        userId: 'seller-uid',
        redirectPath: '/trade-facility',
      })
    );
  });

  it('Test No.14 - creates dropoff_booked notifications', async () => {
    await notifyDropOffBooked({
      transactionId: 'tx-123',
      sellerId: 'seller-uid',
      buyerId: 'buyer-uid',
      listingId: 'listing-123',
      listingTitle: 'Test Item',
      role: 'seller',
      date: '2024-01-15',
      timeSlot: '10:00-12:00',
    });

    expect(addDoc).toHaveBeenCalledTimes(2);
  });

  it('Test No.15 - creates dropoff confirmed notifications', async () => {
    await notifyDropOffConfirmed({
      transactionId: 'tx-123',
      sellerId: 'seller-uid',
      buyerId: 'buyer-uid',
      listingId: 'listing-123',
      listingTitle: 'Test Item',
    });

    expect(addDoc).toHaveBeenCalledTimes(2);
    expect(addDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ type: 'item_received_at_facility', userId: 'seller-uid' })
    );
    expect(addDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ type: 'item_at_facility', userId: 'buyer-uid' })
    );
  });

  it('Test No.16 - creates ready for collection notification', async () => {
    await notifyItemReadyForCollection({
      transactionId: 'tx-123',
      buyerId: 'buyer-uid',
      listingId: 'listing-123',
      listingTitle: 'Test Item',
    });

    expect(addDoc).toHaveBeenCalledTimes(1);
    expect(addDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        type: 'item_ready_for_collection',
        userId: 'buyer-uid',
        redirectPath: '/trade-facility',
      })
    );
  });

  it('Test No.17 - creates transaction complete + rate prompts', async () => {
    await notifyTransactionComplete({
      transactionId: 'tx-123',
      buyerId: 'buyer-uid',
      sellerId: 'seller-uid',
      listingId: 'listing-123',
      listingTitle: 'Test Item',
      buyerName: 'Buyer Name',
      sellerName: 'Seller Name',
    });

    expect(addDoc).toHaveBeenCalledTimes(4);
  });

  it('Test No.18 - creates overdue notifications', async () => {
    await notifyOverdueDropOff({
      transactionId: 'tx-123',
      sellerId: 'seller-uid',
      buyerId: 'buyer-uid',
      listingId: 'listing-123',
      listingTitle: 'Test Item',
    });

    expect(addDoc).toHaveBeenCalledTimes(2);
  });

  it('Test No.19 - marks notification as read', async () => {
    await markNotificationAsRead('notif-123');
    expect(updateDoc).toHaveBeenCalled();
  });

  it('Test No.20 - marks rating as read in localStorage', () => {
    markRatingAsRead('rating-notif-123');
    const stored = localStorage.getItem('readRatingNotifs');
    expect(stored).toBe(JSON.stringify(['rating-notif-123']));
  });

  it('Test No.21 - checks if rating notification is dismissed', () => {
    localStorage.setItem('readRatingNotifs', JSON.stringify(['rating-notif-123']));
    expect(isRatingNotificationDismissed('rating-notif-123')).toBe(true);
    expect(isRatingNotificationDismissed('rating-notif-456')).toBe(false);
  });
});