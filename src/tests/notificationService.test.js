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
  isRatingNotificationDismissed,
  deleteNewOfferNotification,
  notifyAdminsOfReport,
} from '../services/notificationService';
import { collection, addDoc, getDocs, doc, updateDoc, deleteDoc } from 'firebase/firestore';

// ─── Mocks ────────────────────────────────────────────────────────────────────

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
  getDoc: vi.fn(() => Promise.resolve({ exists: () => false })),
}));

vi.mock('../firebase', () => ({
  db: {},
}));

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

// ─── Shared fixture ───────────────────────────────────────────────────────────

const BASE = {
  transactionId: 'tx-123',
  sellerId:      'seller-uid',
  buyerId:       'buyer-uid',
  buyerName:     'Test Buyer',
  sellerName:    'Test Seller',
  listingId:     'listing-123',
  listingTitle:  'Test Item',
  agreedPrice:   100,
};

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('notificationService', () => {

  // ── notifySellerOfOffer ──────────────────────────────────────────────────

  it('Test No.7 - creates a notification document for the seller when an offer is initiated', async () => {
    await notifySellerOfOffer(BASE);

    expect(addDoc).toHaveBeenCalledTimes(1);
    expect(addDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        type:         'new_offer',
        userId:       'seller-uid',
        transactionId:'tx-123',
        read:         false,
        redirectPath: `/profile?tab=offers&highlight=tx-123`,
      })
    );
  });

  it('Test No.7b - new_offer notification includes buyerName and agreedPrice', async () => {
    await notifySellerOfOffer(BASE);

    expect(addDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        buyerName:   'Test Buyer',
        agreedPrice: 100,
        listingTitle:'Test Item',
        listingId:   'listing-123',
      })
    );
  });

  it('Test No.7c - skips duplicate new_offer notification when one already exists', async () => {
    // Simulate existing unread notification
    getDocs.mockResolvedValueOnce({ empty: false, docs: [{ id: 'existing' }] });

    await notifySellerOfOffer(BASE);

    expect(addDoc).not.toHaveBeenCalled();
  });

  // ── deleteNewOfferNotification ───────────────────────────────────────────

  it('Test No.8 - deletes unread new_offer notifications when buyer withdraws offer', async () => {
    const mockDoc = { ref: { id: 'notif-1' } };
    getDocs.mockResolvedValueOnce({ empty: false, docs: [mockDoc] });

    await deleteNewOfferNotification('tx-123');

    expect(deleteDoc).toHaveBeenCalledTimes(1);
    expect(deleteDoc).toHaveBeenCalledWith(mockDoc.ref);
  });

  it('Test No.8b - does nothing when transactionId is null or undefined', async () => {
    await deleteNewOfferNotification(null);
    await deleteNewOfferNotification(undefined);

    expect(getDocs).not.toHaveBeenCalled();
    expect(deleteDoc).not.toHaveBeenCalled();
  });

  it('Test No.8c - handles multiple unread new_offer notifications gracefully', async () => {
    const mockDocs = [{ ref: { id: 'n1' } }, { ref: { id: 'n2' } }];
    getDocs.mockResolvedValueOnce({ empty: false, docs: mockDocs });

    await deleteNewOfferNotification('tx-123');

    expect(deleteDoc).toHaveBeenCalledTimes(2);
  });

  // ── notifyOfferAccepted ──────────────────────────────────────────────────

  it('Test No.10 - creates a notification document for the buyer when seller accepts the offer', async () => {
    await notifyOfferAccepted(BASE);

    expect(addDoc).toHaveBeenCalledTimes(1);
    expect(addDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        type:         'offer_accepted',
        userId:       'buyer-uid',
        transactionId:'tx-123',
        read:         false,
        redirectPath: `/payment/tx-123`,
      })
    );
  });

  it('Test No.10b - redirectPath for offer_accepted embeds the correct transactionId', async () => {
    await notifyOfferAccepted({ ...BASE, transactionId: 'tx-999' });

    expect(addDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ redirectPath: '/payment/tx-999' })
    );
  });

  it('Test No.10c - skips duplicate offer_accepted notification', async () => {
    getDocs.mockResolvedValueOnce({ empty: false, docs: [{ id: 'dup' }] });

    await notifyOfferAccepted(BASE);

    expect(addDoc).not.toHaveBeenCalled();
  });

  // ── notifyOfferDeclined ──────────────────────────────────────────────────

  it('Test No.11 - creates notification for buyer when seller declines offer', async () => {
    await notifyOfferDeclined(BASE);

    expect(addDoc).toHaveBeenCalledTimes(1);
    expect(addDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        type:         'offer_declined',
        userId:       'buyer-uid',
        transactionId:'tx-123',
        redirectPath: '/view-listing',
      })
    );
  });

  it('Test No.11b - offer_declined notification is marked unread', async () => {
    await notifyOfferDeclined(BASE);

    expect(addDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ read: false })
    );
  });

  // ── notifyTradeAccepted ──────────────────────────────────────────────────

  it('Test No.12 - creates trade waiting notifications for both parties', async () => {
    await notifyTradeAccepted(BASE);

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

  it('Test No.12b - trade_waiting notifications redirect to /trade-facility', async () => {
    await notifyTradeAccepted(BASE);

    const calls = addDoc.mock.calls.map(([, payload]) => payload);
    expect(calls.every(p => p.redirectPath === '/trade-facility')).toBe(true);
  });

  it('Test No.12c - both trade_waiting notifications include transactionId', async () => {
    await notifyTradeAccepted(BASE);

    const calls = addDoc.mock.calls.map(([, payload]) => payload);
    expect(calls.every(p => p.transactionId === 'tx-123')).toBe(true);
  });

  // ── notifySellerBuyerPaid ────────────────────────────────────────────────

  it('Test No.13 - creates buyer_paid notification for seller', async () => {
    await notifySellerBuyerPaid(BASE);

    expect(addDoc).toHaveBeenCalledTimes(1);
    expect(addDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        type:         'buyer_paid',
        userId:       'seller-uid',
        redirectPath: '/trade-facility',
      })
    );
  });

  it('Test No.13b - buyer_paid notification includes buyerName and agreedPrice', async () => {
    await notifySellerBuyerPaid(BASE);

    expect(addDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        buyerName:   'Test Buyer',
        agreedPrice: 100,
      })
    );
  });

  // ── notifyDropOffBooked ──────────────────────────────────────────────────

  it('Test No.14 - creates dropoff_booked notifications for seller role (sale)', async () => {
    await notifyDropOffBooked({ ...BASE, role: 'seller', date: '2024-01-15', timeSlot: '10:00-12:00' });

    expect(addDoc).toHaveBeenCalledTimes(2);
    expect(addDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ type: 'dropoff_booked', userId: 'seller-uid' })
    );
    expect(addDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ type: 'seller_dropoff_booked', userId: 'buyer-uid' })
    );
  });

  it('Test No.14b - creates trade_dropoff_required for buyer when tradeItemName is provided', async () => {
    await notifyDropOffBooked({
      ...BASE,
      role:          'seller',
      date:          '2024-01-15',
      timeSlot:      '10:00-12:00',
      tradeItemName: 'Buyer Trade Item',
    });

    expect(addDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ type: 'trade_dropoff_required', userId: 'buyer-uid' })
    );
  });

  it('Test No.14c - creates buyer_dropoff_booked notifications for both parties when role is buyer', async () => {
    await notifyDropOffBooked({
      ...BASE,
      role:          'buyer',
      date:          '2024-01-15',
      timeSlot:      '10:00-12:00',
      tradeItemName: 'Buyer Trade Item',
    });

    expect(addDoc).toHaveBeenCalledTimes(2);
    expect(addDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ type: 'buyer_dropoff_booked', userId: 'buyer-uid' })
    );
    expect(addDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ type: 'buyer_dropoff_booked', userId: 'seller-uid' })
    );
  });

  it('Test No.14d - dropoff_booked redirect for seller goes to /trade-facility', async () => {
    await notifyDropOffBooked({ ...BASE, role: 'seller', date: '2024-01-15', timeSlot: '10:00-12:00' });

    expect(addDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ type: 'dropoff_booked', redirectPath: '/trade-facility' })
    );
  });

  // ── notifyDropOffConfirmed ───────────────────────────────────────────────

  it('Test No.15 - creates dropoff confirmed notifications', async () => {
    await notifyDropOffConfirmed(BASE);

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

  it('Test No.15b - dropoff confirmed notifications have null redirectPath', async () => {
    await notifyDropOffConfirmed(BASE);

    const calls = addDoc.mock.calls.map(([, payload]) => payload);
    expect(calls.every(p => p.redirectPath === null)).toBe(true);
  });

  // ── notifyItemReadyForCollection ─────────────────────────────────────────

  it('Test No.16 - creates ready for collection notification', async () => {
    await notifyItemReadyForCollection(BASE);

    expect(addDoc).toHaveBeenCalledTimes(1);
    expect(addDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        type:         'item_ready_for_collection',
        userId:       'buyer-uid',
        redirectPath: '/trade-facility',
      })
    );
  });

  it('Test No.16b - item_ready_for_collection is marked unread', async () => {
    await notifyItemReadyForCollection(BASE);

    expect(addDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ read: false })
    );
  });

  // ── notifyTransactionComplete ────────────────────────────────────────────

  it('Test No.17 - creates transaction complete + rate prompts (4 total)', async () => {
    await notifyTransactionComplete(BASE);

    expect(addDoc).toHaveBeenCalledTimes(4);
  });

  it('Test No.17b - buyer receives item_collected and rate_seller notifications', async () => {
    await notifyTransactionComplete(BASE);

    expect(addDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ type: 'item_collected', userId: 'buyer-uid' })
    );
    expect(addDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ type: 'rate_seller', userId: 'buyer-uid' })
    );
  });

  it('Test No.17c - seller receives transaction_complete and rate_buyer notifications', async () => {
    await notifyTransactionComplete(BASE);

    expect(addDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ type: 'transaction_complete', userId: 'seller-uid' })
    );
    expect(addDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ type: 'rate_buyer', userId: 'seller-uid' })
    );
  });

  it('Test No.17d - rate_seller notification includes persistUntilReviewed flag', async () => {
    await notifyTransactionComplete(BASE);

    expect(addDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        type:                'rate_seller',
        persistUntilReviewed: true,
      })
    );
  });

  it('Test No.17e - rate_buyer notification includes persistUntilReviewed flag', async () => {
    await notifyTransactionComplete(BASE);

    expect(addDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        type:                'rate_buyer',
        persistUntilReviewed: true,
      })
    );
  });

  it('Test No.17f - rate_seller redirectPath includes sellerId and transactionId', async () => {
    await notifyTransactionComplete(BASE);

    expect(addDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        type:         'rate_seller',
        redirectPath: expect.stringContaining('seller-uid'),
      })
    );
    expect(addDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        type:         'rate_seller',
        redirectPath: expect.stringContaining('tx-123'),
      })
    );
  });

  it('Test No.17g - rate prompts fall back to generic name when buyerName/sellerName are omitted', async () => {
    const { buyerName, sellerName, ...noNames } = BASE;
    await notifyTransactionComplete(noNames);

    expect(addDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        type:             'rate_seller',
        reviewedUserName: 'Seller',
      })
    );
    expect(addDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        type:             'rate_buyer',
        reviewedUserName: 'Buyer',
      })
    );
  });

  // ── notifyOverdueDropOff ─────────────────────────────────────────────────

  it('Test No.18 - creates overdue drop-off notifications for both parties', async () => {
    await notifyOverdueDropOff(BASE);

    expect(addDoc).toHaveBeenCalledTimes(2);
    expect(addDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ type: 'overdue_dropoff_seller', userId: 'seller-uid' })
    );
    expect(addDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ type: 'overdue_dropoff_buyer', userId: 'buyer-uid' })
    );
  });

  it('Test No.18b - overdue drop-off notifications bypass duplicate guard and always fire', async () => {
    // Even if getDocs says a duplicate exists, overdue types should still call addDoc
    getDocs.mockResolvedValue({ empty: false, docs: [{ id: 'existing' }] });

    await notifyOverdueDropOff(BASE);

    expect(addDoc).toHaveBeenCalledTimes(2);
  });

  it('Test No.18c - overdue_dropoff_seller message mentions the listing title', async () => {
    await notifyOverdueDropOff(BASE);

    expect(addDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        type:    'overdue_dropoff_seller',
        message: expect.stringContaining('Test Item'),
      })
    );
  });

  // ── notifyOverdueCollection ──────────────────────────────────────────────

  it('Test No.18d - creates overdue collection notifications for both parties', async () => {
    await notifyOverdueCollection(BASE);

    expect(addDoc).toHaveBeenCalledTimes(2);
    expect(addDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ type: 'overdue_collection_buyer', userId: 'buyer-uid' })
    );
    expect(addDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ type: 'overdue_collection_seller', userId: 'seller-uid' })
    );
  });

  it('Test No.18e - overdue collection notifications bypass duplicate guard', async () => {
    getDocs.mockResolvedValue({ empty: false, docs: [{ id: 'existing' }] });

    await notifyOverdueCollection(BASE);

    expect(addDoc).toHaveBeenCalledTimes(2);
  });

  // ── notifyCancelledDropOff ───────────────────────────────────────────────

  it('Test No.18f - creates cancelled drop-off notifications for both parties', async () => {
    await notifyCancelledDropOff(BASE);

    expect(addDoc).toHaveBeenCalledTimes(2);
    expect(addDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ type: 'cancelled_dropoff_seller', userId: 'seller-uid' })
    );
    expect(addDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ type: 'cancelled_dropoff_buyer', userId: 'buyer-uid' })
    );
  });

  it('Test No.18g - buyer cancelled drop-off message mentions refund when wasOnlinePayment is true', async () => {
    await notifyCancelledDropOff({ ...BASE, wasOnlinePayment: true });

    expect(addDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        type:    'cancelled_dropoff_buyer',
        message: expect.stringContaining('refunded'),
      })
    );
  });

  it('Test No.18h - buyer cancelled drop-off message does not mention refund for cash payment', async () => {
    await notifyCancelledDropOff({ ...BASE, wasOnlinePayment: false });

    const buyerCall = addDoc.mock.calls.find(([, p]) => p.type === 'cancelled_dropoff_buyer');
    expect(buyerCall[1].message).not.toContain('refunded');
    expect(buyerCall[1].message).toContain('No payment was collected');
  });

  // ── notifyCancelledCollection ────────────────────────────────────────────

  it('Test No.18i - creates cancelled collection notifications for both parties', async () => {
    await notifyCancelledCollection(BASE);

    expect(addDoc).toHaveBeenCalledTimes(2);
    expect(addDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ type: 'cancelled_collection_buyer',  userId: 'buyer-uid' })
    );
    expect(addDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ type: 'cancelled_collection_seller', userId: 'seller-uid' })
    );
  });

  it('Test No.18j - cancelled collection seller message mentions the listing title', async () => {
    await notifyCancelledCollection(BASE);

    expect(addDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        type:    'cancelled_collection_seller',
        message: expect.stringContaining('Test Item'),
      })
    );
  });

  // ── markNotificationAsRead ───────────────────────────────────────────────

  it('Test No.19 - marks notification as read via updateDoc', async () => {
    await markNotificationAsRead('notif-123');

    expect(doc).toHaveBeenCalledWith(expect.anything(), 'notifications', 'notif-123');
    expect(updateDoc).toHaveBeenCalledWith(expect.anything(), { read: true });
  });

  it('Test No.19b - updateDoc is called exactly once per markNotificationAsRead call', async () => {
    await markNotificationAsRead('notif-abc');

    expect(updateDoc).toHaveBeenCalledTimes(1);
  });

  // ── markRatingAsRead ─────────────────────────────────────────────────────

  it('Test No.20 - marks rating as read in localStorage', () => {
    markRatingAsRead('rating-notif-123');

    const stored = localStorage.getItem('readRatingNotifs');
    expect(stored).toBe(JSON.stringify(['rating-notif-123']));
  });

  it('Test No.20b - appends to existing dismissed ratings list in localStorage', () => {
    localStorage.setItem('readRatingNotifs', JSON.stringify(['rating-notif-111']));
    markRatingAsRead('rating-notif-222');

    const stored = JSON.parse(localStorage.getItem('readRatingNotifs'));
    expect(stored).toContain('rating-notif-111');
    expect(stored).toContain('rating-notif-222');
  });

  it('Test No.20c - does not add duplicate entries to localStorage', () => {
    markRatingAsRead('rating-notif-123');
    markRatingAsRead('rating-notif-123');

    const stored = JSON.parse(localStorage.getItem('readRatingNotifs'));
    expect(stored.filter(id => id === 'rating-notif-123')).toHaveLength(1);
  });

  // ── isRatingNotificationDismissed ────────────────────────────────────────

  it('Test No.21 - checks if rating notification is dismissed', () => {
    localStorage.setItem('readRatingNotifs', JSON.stringify(['rating-notif-123']));

    expect(isRatingNotificationDismissed('rating-notif-123')).toBe(true);
    expect(isRatingNotificationDismissed('rating-notif-456')).toBe(false);
  });

  it('Test No.21b - returns false when localStorage is empty', () => {
    expect(isRatingNotificationDismissed('rating-notif-999')).toBe(false);
  });

  it('Test No.21c - returns false when localStorage contains malformed JSON', () => {
    localStorage.setItem('readRatingNotifs', 'NOT_VALID_JSON');

    expect(isRatingNotificationDismissed('rating-notif-123')).toBe(false);
  });

  // ── notifyAdminsOfReport ─────────────────────────────────────────────────

  it('Test No.22 - sends new_report notification to every admin user', async () => {
    const mockAdmins = [
      { id: 'admin-1', data: () => ({ userType: 'admin' }) },
      { id: 'admin-2', data: () => ({ userType: 'admin' }) },
    ];
    getDocs.mockResolvedValueOnce({ empty: false, docs: mockAdmins });

    await notifyAdminsOfReport({
      reportId:     'report-123',
      reportType:   'listing',
      reportedId:   'listing-456',
      reportedName: 'Bad Listing',
      reporterName: 'Concerned User',
      reason:       'Spam',
    });

    expect(addDoc).toHaveBeenCalledTimes(2);
    expect(addDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ type: 'new_report', userId: 'admin-1' })
    );
    expect(addDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ type: 'new_report', userId: 'admin-2' })
    );
  });

  it('Test No.22b - new_report notification redirectPath points to admin report detail page', async () => {
    const mockAdmins = [{ id: 'admin-1', data: () => ({}) }];
    getDocs.mockResolvedValueOnce({ empty: false, docs: mockAdmins });

    await notifyAdminsOfReport({
      reportId:     'report-123',
      reportType:   'listing',
      reportedId:   'listing-456',
      reportedName: 'Bad Listing',
      reporterName: 'Concerned User',
      reason:       'Spam',
    });

    expect(addDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ redirectPath: '/admin/reports/report-123' })
    );
  });

  it('Test No.22c - no notifications sent when there are no admin users', async () => {
    getDocs.mockResolvedValueOnce({ empty: true, docs: [] });

    await notifyAdminsOfReport({
      reportId:     'report-999',
      reportType:   'user',
      reportedId:   'user-abc',
      reportedName: 'Bad Actor',
      reporterName: 'Someone',
      reason:       'Harassment',
    });

    expect(addDoc).not.toHaveBeenCalled();
  });

  it('Test No.22d - new_report notification includes all report metadata fields', async () => {
    const mockAdmins = [{ id: 'admin-1', data: () => ({}) }];
    getDocs.mockResolvedValueOnce({ empty: false, docs: mockAdmins });

    await notifyAdminsOfReport({
      reportId:     'report-123',
      reportType:   'listing',
      reportedId:   'listing-456',
      reportedName: 'Bad Listing',
      reporterName: 'Concerned User',
      reason:       'Spam',
    });

    expect(addDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        reportId:     'report-123',
        reportType:   'listing',
        reportedId:   'listing-456',
        reportedName: 'Bad Listing',
        reporterName: 'Concerned User',
        reason:       'Spam',
      })
    );
  });

  // ── General / cross-cutting ──────────────────────────────────────────────

  it('Test No.23 - every notification is written with read: false', async () => {
    await notifySellerOfOffer(BASE);
    await notifyOfferAccepted(BASE);
    await notifyOfferDeclined(BASE);

    const calls = addDoc.mock.calls.map(([, payload]) => payload);
    expect(calls.every(p => p.read === false)).toBe(true);
  });

  it('Test No.24 - every notification is written with a createdAt timestamp', async () => {
    // Ensure duplicate guard passes so addDoc is actually called
    getDocs.mockResolvedValue({ empty: true, docs: [] });

    await notifySellerOfOffer(BASE);

    expect(addDoc).toHaveBeenCalledTimes(1);
    const [, payload] = addDoc.mock.calls[0];
    expect(payload).toHaveProperty('createdAt');
  });

  it('Test No.25 - duplicate guard is not applied to overdue_collection types', async () => {
    getDocs.mockResolvedValue({ empty: false, docs: [{ id: 'existing' }] });

    await notifyOverdueCollection(BASE);

    // Should fire regardless of duplicate check
    expect(addDoc).toHaveBeenCalledTimes(2);
  });

  it('Test No.26 - duplicate guard is not applied to cancelled_dropoff types', async () => {
    getDocs.mockResolvedValue({ empty: false, docs: [{ id: 'existing' }] });

    await notifyCancelledDropOff(BASE);

    expect(addDoc).toHaveBeenCalledTimes(2);
  });

  it('Test No.27 - duplicate guard is not applied to cancelled_collection types', async () => {
    getDocs.mockResolvedValue({ empty: false, docs: [{ id: 'existing' }] });

    await notifyCancelledCollection(BASE);

    expect(addDoc).toHaveBeenCalledTimes(2);
  });
});