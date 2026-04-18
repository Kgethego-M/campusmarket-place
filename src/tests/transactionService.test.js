// src/tests/transactionService.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createTransaction, acceptOffer } from '../services/transactionService';
import { createTransaction, acceptOffer, declineOffer } from '../services/transactionService';

vi.mock('firebase/firestore', () => ({
  getFirestore: vi.fn(),
  collection: vi.fn(),
  addDoc: vi.fn(() => Promise.resolve({ id: 'mock-transaction-id' })),
  updateDoc: vi.fn(() => Promise.resolve()),
  doc: vi.fn(),
}));

vi.mock('../firebase', () => ({
  db: {},
}));

import { addDoc, updateDoc } from 'firebase/firestore';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('transactionService - createTransaction', () => {

  it('Test No.5 - creates a transaction document with correct fields for a Buy Now', async () => {
    const transactionData = {
      type: 'sale',
      listingId: 'listing-123',
      buyerId: 'buyer-uid',
      sellerId: 'seller-uid',
    };

    const txId = await createTransaction(transactionData);

    expect(addDoc).toHaveBeenCalledTimes(1);
    expect(addDoc).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({
        type: 'sale',
        status: 'pending',
        listingId: 'listing-123',
        buyerId: 'buyer-uid',
        sellerId: 'seller-uid',
      })
    );
    expect(txId).toBe('mock-transaction-id');
  });

  it('Test No.6 - creates a transaction document with correct fields for a Make Trade Offer', async () => {
    const transactionData = {
      type: 'trade',
      listingId: 'listing-124',
      buyerId: 'buyer-uid',
      sellerId: 'seller-uid',
    };

    const txId = await createTransaction(transactionData);

    expect(addDoc).toHaveBeenCalledTimes(1);
    expect(addDoc).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({
        type: 'trade',
        status: 'pending',
        listingId: 'listing-124',
        buyerId: 'buyer-uid',
        sellerId: 'seller-uid',
      })
    );
    expect(txId).toBe('mock-transaction-id');
  });

  it('Test No.9 - updates transaction status to accepted when seller accepts an offer', async () => {
    await acceptOffer({
      transactionId: 'tx-123',
      sellerId: 'seller-uid',
    });

    expect(updateDoc).toHaveBeenCalledTimes(1);
    expect(updateDoc).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({
        status: 'accepted',
      })
    );
  });

  it('Test No.11 - updates transaction status to declined when seller declines an offer', async () => {
    await declineOffer({
      transactionId: 'tx-123',
      sellerId: 'seller-uid',
    });

    expect(updateDoc).toHaveBeenCalledTimes(1);
    expect(updateDoc).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({
        status: 'declined',
      })
    );
  });

});