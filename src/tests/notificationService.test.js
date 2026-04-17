// src/tests/notificationService.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { notifySellerOfOffer, notifyBuyerOfAcceptance } from '../services/notificationService';
import { collection, addDoc, doc, updateDoc } from 'firebase/firestore';

vi.mock('firebase/firestore', () => ({
  getFirestore: vi.fn(),
  collection: vi.fn(),
  addDoc: vi.fn(() => Promise.resolve({ id: 'mock-notification-id' })),
}));

vi.mock('../firebase', () => ({
  db: {},
}));

import { addDoc } from 'firebase/firestore';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('notificationService', () => {

  it('Test No.7 - creates a notification document for the seller when an offer is initiated', async () => {
    await notifySellerOfOffer({
      transactionId: 'tx-123',
      sellerId: 'seller-uid',
      buyerId: 'buyer-uid',
    });

    expect(addDoc).toHaveBeenCalledTimes(1);
    expect(addDoc).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({
        type: 'new_offer',
        userId: 'seller-uid',
        transactionId: 'tx-123',
        read: false,
      })
    );
  });

  it('Test No.10 - creates a notification document for the buyer when seller accepts the offer', async () => {
    await notifyBuyerOfAcceptance({
      transactionId: 'tx-123',
      buyerId: 'buyer-uid',
    });

    expect(addDoc).toHaveBeenCalledTimes(1);
    expect(addDoc).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({
        type: 'offer_accepted',
        userId: 'buyer-uid',
        transactionId: 'tx-123',
        read: false,
      })
    );
  });

});