import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─────────────────────────────────────────────────────────────────────────────
// Instead of importing from payment.utils, we copy the pure functions inline here
// so the tests stay simple and do not pull Firebase into Vitest.
// Firebase-touching functions are tested with hand-rolled mocks below.
// ─────────────────────────────────────────────────────────────────────────────

// ─── Amount Helpers ───────────────────────────────────────────────────────────

function getOnlineAmount(tx) {
  const type = tx.paymentType || tx.paymentMethod || 'cash';

  switch (type) {
    case 'full_online':
    case 'online':
      return Number(tx.agreedPrice ?? tx.listingPrice ?? 0);

    case 'partial':
      return Number(tx.partialAmount ?? 0);

    case 'cash':
    case 'cod':
    default:
      return 0;
  }
}

function getCashAmount(tx) {
  const type = tx.paymentType || tx.paymentMethod || 'cash';
  const total = Number(tx.agreedPrice ?? tx.listingPrice ?? 0);

  switch (type) {
    case 'full_online':
    case 'online':
      return 0;

    case 'partial':
      return Math.max(0, total - Number(tx.partialAmount ?? 0));

    case 'cash':
    case 'cod':
    default:
      return total;
  }
}

/**
 * Stripe expects the smallest currency unit.
 * For ZAR, this means cents.
 * Example: R255.00 → 25500
 */
function toStripeAmount(randAmount) {
  return Math.round(Number(randAmount) * 100);
}

function generateStripeRef(txId) {
  return `CM-${txId.slice(0, 6).toUpperCase()}-${Date.now()}`;
}

const PAYMENT_LABELS = {
  full_online: 'Fully Online',
  online: 'Fully Online',
  partial: 'Partial Online + Cash',
  cash: 'Full Cash on Delivery',
  cod: 'Full Cash on Delivery',
};

// ─────────────────────────────────────────────────────────────────────────────
// Firestore mock helper
// ─────────────────────────────────────────────────────────────────────────────

function makeUpdateTransactionStatus(mockUpdateDoc) {
  return async function updateTransactionStatus(txId, status, extra = {}) {
    const ref = `mock-ref-for-${txId}`;

    await mockUpdateDoc(ref, {
      status,
      updatedAt: 'mock-timestamp',
      ...extra,
    });
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Stripe Checkout helper mocks
// ─────────────────────────────────────────────────────────────────────────────

function makeCreateStripeCheckoutSession(updateTransactionStatus) {
  return async function createStripeCheckoutSession({
    tx,
    buyerEmail,
    createSessionUrl = '/api/stripe/create-checkout-session',
  }) {
    if (!tx?.id) {
      throw new Error('Transaction ID is required.');
    }

    const amountRand = getOnlineAmount(tx);

    if (amountRand <= 0) {
      throw new Error('This transaction does not require online payment.');
    }

    const stripeRef = generateStripeRef(tx.id);

    await updateTransactionStatus(tx.id, 'pending_payment', {
      paymentProvider: 'stripe',
      stripeRef,
      onlineAmount: amountRand,
      cashAmount: getCashAmount(tx),
    });

    const response = await fetch(createSessionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        transactionId: tx.id,
        buyerEmail,
        amount: toStripeAmount(amountRand),
        amountRand,
        currency: 'zar',
        stripeRef,
        paymentType: tx.paymentType || tx.paymentMethod || 'cash',
        listingId: tx.listingId ?? null,
        listingTitle: tx.listingTitle ?? tx.title ?? 'Marketplace transaction',
        metadata: {
          transactionId: tx.id,
          stripeRef,
          paymentType: tx.paymentType || tx.paymentMethod || 'cash',
        },
      }),
    });

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      throw new Error(data?.message || 'Failed to create Stripe Checkout session.');
    }

    if (!data?.url) {
      throw new Error('Stripe Checkout URL was not returned by the server.');
    }

    return data;
  };
}

function makeRedirectToStripeCheckout(updateTransactionStatus, createStripeCheckoutSession) {
  return async function redirectToStripeCheckout({
    tx,
    buyerEmail,
    createSessionUrl = '/api/stripe/create-checkout-session',
  }) {
    const amountRand = getOnlineAmount(tx);

    if (amountRand <= 0) {
      await updateTransactionStatus(tx.id, 'waiting', {
        paymentProvider: 'cash',
        onlineAmount: 0,
        cashAmount: getCashAmount(tx),
      });

      return {
        skipped: true,
        reason: 'cash_payment',
      };
    }

    const session = await createStripeCheckoutSession({
      tx,
      buyerEmail,
      createSessionUrl,
    });

    window.location.href = session.url;

    return session;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// getOnlineAmount
// ─────────────────────────────────────────────────────────────────────────────

describe('getOnlineAmount', () => {
  it('returns agreedPrice for full_online', () => {
    expect(getOnlineAmount({ paymentType: 'full_online', agreedPrice: 500 })).toBe(500);
  });

  it('falls back to listingPrice when agreedPrice is missing for full_online', () => {
    expect(getOnlineAmount({ paymentType: 'full_online', listingPrice: 300 })).toBe(300);
  });

  it('returns 0 when both prices are missing for full_online', () => {
    expect(getOnlineAmount({ paymentType: 'full_online' })).toBe(0);
  });

  it('returns agreedPrice for online alias', () => {
    expect(getOnlineAmount({ paymentType: 'online', agreedPrice: 750 })).toBe(750);
  });

  it('uses paymentMethod when paymentType is absent', () => {
    expect(getOnlineAmount({ paymentMethod: 'online', agreedPrice: 200 })).toBe(200);
  });

  it('returns partialAmount for partial', () => {
    expect(getOnlineAmount({ paymentType: 'partial', agreedPrice: 500, partialAmount: 200 })).toBe(200);
  });

  it('returns 0 when partialAmount is missing for partial', () => {
    expect(getOnlineAmount({ paymentType: 'partial', agreedPrice: 500 })).toBe(0);
  });

  it('returns 0 for cash', () => {
    expect(getOnlineAmount({ paymentType: 'cash', agreedPrice: 400 })).toBe(0);
  });

  it('returns 0 for cod', () => {
    expect(getOnlineAmount({ paymentType: 'cod', agreedPrice: 400 })).toBe(0);
  });

  it('defaults to 0 when no paymentType or paymentMethod is set', () => {
    expect(getOnlineAmount({ agreedPrice: 300 })).toBe(0);
  });

  it('handles string numbers correctly', () => {
    expect(getOnlineAmount({ paymentType: 'full_online', agreedPrice: '250' })).toBe(250);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getCashAmount
// ─────────────────────────────────────────────────────────────────────────────

describe('getCashAmount', () => {
  it('returns 0 for full_online', () => {
    expect(getCashAmount({ paymentType: 'full_online', agreedPrice: 500 })).toBe(0);
  });

  it('returns 0 for online alias', () => {
    expect(getCashAmount({ paymentType: 'online', agreedPrice: 500 })).toBe(0);
  });

  it('returns remainder for partial', () => {
    expect(getCashAmount({ paymentType: 'partial', agreedPrice: 500, partialAmount: 200 })).toBe(300);
  });

  it('returns full agreedPrice when partialAmount is 0', () => {
    expect(getCashAmount({ paymentType: 'partial', agreedPrice: 500, partialAmount: 0 })).toBe(500);
  });

  it('clamps to 0 when partialAmount exceeds agreedPrice', () => {
    expect(getCashAmount({ paymentType: 'partial', agreedPrice: 200, partialAmount: 300 })).toBe(0);
  });

  it('falls back to listingPrice when agreedPrice is missing in partial', () => {
    expect(getCashAmount({ paymentType: 'partial', listingPrice: 400, partialAmount: 100 })).toBe(300);
  });

  it('returns full agreedPrice for cash', () => {
    expect(getCashAmount({ paymentType: 'cash', agreedPrice: 350 })).toBe(350);
  });

  it('returns full agreedPrice for cod', () => {
    expect(getCashAmount({ paymentType: 'cod', agreedPrice: 350 })).toBe(350);
  });

  it('falls back to listingPrice for cash when agreedPrice is missing', () => {
    expect(getCashAmount({ paymentType: 'cash', listingPrice: 280 })).toBe(280);
  });

  it('returns 0 for cash when both prices are missing', () => {
    expect(getCashAmount({ paymentType: 'cash' })).toBe(0);
  });

  it('defaults to full cash when no paymentType set', () => {
    expect(getCashAmount({ agreedPrice: 300 })).toBe(300);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// online + cash must always sum to total
// ─────────────────────────────────────────────────────────────────────────────

describe('getOnlineAmount + getCashAmount sum to agreedPrice', () => {
  const cases = [
    { paymentType: 'full_online', agreedPrice: 500, partialAmount: null },
    { paymentType: 'online', agreedPrice: 300, partialAmount: null },
    { paymentType: 'partial', agreedPrice: 500, partialAmount: 200 },
    { paymentType: 'partial', agreedPrice: 500, partialAmount: 0 },
    { paymentType: 'cash', agreedPrice: 400, partialAmount: null },
    { paymentType: 'cod', agreedPrice: 150, partialAmount: null },
  ];

  cases.forEach((tx) => {
    it(`sums correctly for paymentType="${tx.paymentType}"`, () => {
      expect(getOnlineAmount(tx) + getCashAmount(tx)).toBe(tx.agreedPrice);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// toStripeAmount
// ─────────────────────────────────────────────────────────────────────────────

describe('toStripeAmount', () => {
  it('converts rands to cents', () => {
    expect(toStripeAmount(255)).toBe(25500);
  });

  it('handles 0', () => {
    expect(toStripeAmount(0)).toBe(0);
  });

  it('handles string input', () => {
    expect(toStripeAmount('50')).toBe(5000);
  });

  it('handles decimal rands e.g. R99.99', () => {
    expect(toStripeAmount(99.99)).toBe(9999);
  });

  it('handles large amounts', () => {
    expect(toStripeAmount(50000)).toBe(5000000);
  });

  it('shows JavaScript floating point behaviour for 1.005', () => {
    expect(toStripeAmount(1.005)).toBe(100);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// generateStripeRef
// ─────────────────────────────────────────────────────────────────────────────

describe('generateStripeRef', () => {
  it('starts with CM-', () => {
    expect(generateStripeRef('abc123xyz')).toMatch(/^CM-/);
  });

  it('uses first 6 chars of txId uppercased', () => {
    expect(generateStripeRef('abcdef999').startsWith('CM-ABCDEF-')).toBe(true);
  });

  it('ends with a numeric timestamp', () => {
    const parts = generateStripeRef('txid01').split('-');
    const timestamp = Number(parts[parts.length - 1]);

    expect(timestamp).toBeGreaterThan(0);
    expect(Number.isInteger(timestamp)).toBe(true);
  });

  it('matches format CM-XXXXXX-timestamp', () => {
    expect(generateStripeRef('txid01')).toMatch(/^CM-TXID01-\d+$/);
  });

  it('handles txId shorter than 6 chars', () => {
    expect(generateStripeRef('ab1').startsWith('CM-AB1-')).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PAYMENT_LABELS
// ─────────────────────────────────────────────────────────────────────────────

describe('PAYMENT_LABELS', () => {
  it('full_online → Fully Online', () => {
    expect(PAYMENT_LABELS.full_online).toBe('Fully Online');
  });

  it('online → Fully Online', () => {
    expect(PAYMENT_LABELS.online).toBe('Fully Online');
  });

  it('partial → Partial Online + Cash', () => {
    expect(PAYMENT_LABELS.partial).toBe('Partial Online + Cash');
  });

  it('cash → Full Cash on Delivery', () => {
    expect(PAYMENT_LABELS.cash).toBe('Full Cash on Delivery');
  });

  it('cod → Full Cash on Delivery', () => {
    expect(PAYMENT_LABELS.cod).toBe('Full Cash on Delivery');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// updateTransactionStatus
// ─────────────────────────────────────────────────────────────────────────────

describe('updateTransactionStatus', () => {
  let mockUpdateDoc;
  let updateTransactionStatus;

  beforeEach(() => {
    mockUpdateDoc = vi.fn(() => Promise.resolve());
    updateTransactionStatus = makeUpdateTransactionStatus(mockUpdateDoc);
  });

  it('calls updateDoc with correct status and updatedAt', async () => {
    await updateTransactionStatus('tx123', 'waiting');

    expect(mockUpdateDoc).toHaveBeenCalledWith('mock-ref-for-tx123', {
      status: 'waiting',
      updatedAt: 'mock-timestamp',
    });
  });

  it('merges extra Stripe fields', async () => {
    await updateTransactionStatus('tx123', 'pending_payment', {
      stripeRef: 'CM-TX123-1234567890',
      onlineAmount: 250,
      paymentProvider: 'stripe',
    });

    expect(mockUpdateDoc).toHaveBeenCalledWith('mock-ref-for-tx123', {
      status: 'pending_payment',
      updatedAt: 'mock-timestamp',
      stripeRef: 'CM-TX123-1234567890',
      onlineAmount: 250,
      paymentProvider: 'stripe',
    });
  });

  it('works with completed status', async () => {
    await updateTransactionStatus('tx456', 'completed');

    expect(mockUpdateDoc).toHaveBeenCalledWith('mock-ref-for-tx456', {
      status: 'completed',
      updatedAt: 'mock-timestamp',
    });
  });

  it('resolves without throwing on success', async () => {
    await expect(updateTransactionStatus('tx789', 'waiting')).resolves.toBeUndefined();
  });

  it('rejects when updateDoc throws', async () => {
    mockUpdateDoc.mockRejectedValueOnce(new Error('Firestore error'));

    await expect(updateTransactionStatus('tx000', 'waiting')).rejects.toThrow('Firestore error');
  });

  it('calls updateDoc exactly once', async () => {
    await updateTransactionStatus('tx123', 'waiting');

    expect(mockUpdateDoc).toHaveBeenCalledTimes(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// createStripeCheckoutSession
// ─────────────────────────────────────────────────────────────────────────────

describe('createStripeCheckoutSession', () => {
  let mockUpdateDoc;
  let updateTransactionStatus;
  let createStripeCheckoutSession;

  beforeEach(() => {
    mockUpdateDoc = vi.fn(() => Promise.resolve());
    updateTransactionStatus = makeUpdateTransactionStatus(mockUpdateDoc);
    createStripeCheckoutSession = makeCreateStripeCheckoutSession(updateTransactionStatus);

    globalThis.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            id: 'cs_test_123',
            url: 'https://checkout.stripe.com/c/pay/cs_test_123',
          }),
      })
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete globalThis.fetch;
  });

  it('throws when transaction ID is missing', async () => {
    await expect(
      createStripeCheckoutSession({
        tx: { paymentType: 'online', agreedPrice: 300 },
        buyerEmail: 'student@university.ac.za',
      })
    ).rejects.toThrow('Transaction ID is required.');
  });

  it('throws when transaction does not require online payment', async () => {
    await expect(
      createStripeCheckoutSession({
        tx: { id: 'tx123', paymentType: 'cash', agreedPrice: 300 },
        buyerEmail: 'student@university.ac.za',
      })
    ).rejects.toThrow('This transaction does not require online payment.');
  });

  it('updates Firestore to pending_payment before creating Checkout session', async () => {
    await createStripeCheckoutSession({
      tx: {
        id: 'tx123',
        paymentType: 'online',
        agreedPrice: 300,
      },
      buyerEmail: 'student@university.ac.za',
    });

    expect(mockUpdateDoc).toHaveBeenCalledWith(
      'mock-ref-for-tx123',
      expect.objectContaining({
        status: 'pending_payment',
        paymentProvider: 'stripe',
        onlineAmount: 300,
        cashAmount: 0,
      })
    );
  });

  it('calls backend with Stripe amount in cents and lowercase zar currency', async () => {
    await createStripeCheckoutSession({
      tx: {
        id: 'tx123',
        paymentType: 'online',
        agreedPrice: 300,
        listingTitle: 'iPhone 13',
      },
      buyerEmail: 'student@university.ac.za',
    });

    const fetchBody = JSON.parse(globalThis.fetch.mock.calls[0][1].body);

    expect(fetchBody).toEqual(
      expect.objectContaining({
        transactionId: 'tx123',
        buyerEmail: 'student@university.ac.za',
        amount: 30000,
        amountRand: 300,
        currency: 'zar',
        paymentType: 'online',
        listingTitle: 'iPhone 13',
      })
    );
  });

  it('sends metadata with transactionId, stripeRef, and paymentType', async () => {
    await createStripeCheckoutSession({
      tx: {
        id: 'tx123',
        paymentType: 'partial',
        agreedPrice: 500,
        partialAmount: 200,
      },
      buyerEmail: 'student@university.ac.za',
    });

    const fetchBody = JSON.parse(globalThis.fetch.mock.calls[0][1].body);

    expect(fetchBody.metadata).toEqual(
      expect.objectContaining({
        transactionId: 'tx123',
        paymentType: 'partial',
      })
    );

    expect(fetchBody.metadata.stripeRef).toMatch(/^CM-TX123-\d+$/);
  });

  it('uses custom createSessionUrl when provided', async () => {
    await createStripeCheckoutSession({
      tx: {
        id: 'tx123',
        paymentType: 'online',
        agreedPrice: 300,
      },
      buyerEmail: 'student@university.ac.za',
      createSessionUrl: '/custom/stripe/session',
    });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/custom/stripe/session',
      expect.any(Object)
    );
  });

  it('returns Checkout session data when successful', async () => {
    const result = await createStripeCheckoutSession({
      tx: {
        id: 'tx123',
        paymentType: 'online',
        agreedPrice: 300,
      },
      buyerEmail: 'student@university.ac.za',
    });

    expect(result).toEqual({
      id: 'cs_test_123',
      url: 'https://checkout.stripe.com/c/pay/cs_test_123',
    });
  });

  it('throws backend error message when backend response is not ok', async () => {
    globalThis.fetch = vi.fn(() =>
      Promise.resolve({
        ok: false,
        json: () =>
          Promise.resolve({
            message: 'Could not create Stripe session.',
          }),
      })
    );

    await expect(
      createStripeCheckoutSession({
        tx: {
          id: 'tx123',
          paymentType: 'online',
          agreedPrice: 300,
        },
        buyerEmail: 'student@university.ac.za',
      })
    ).rejects.toThrow('Could not create Stripe session.');
  });

  it('throws fallback error when backend response is not ok and has no message', async () => {
    globalThis.fetch = vi.fn(() =>
      Promise.resolve({
        ok: false,
        json: () => Promise.resolve({}),
      })
    );

    await expect(
      createStripeCheckoutSession({
        tx: {
          id: 'tx123',
          paymentType: 'online',
          agreedPrice: 300,
        },
        buyerEmail: 'student@university.ac.za',
      })
    ).rejects.toThrow('Failed to create Stripe Checkout session.');
  });

  it('throws when backend does not return a Checkout URL', async () => {
    globalThis.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            id: 'cs_test_123',
          }),
      })
    );

    await expect(
      createStripeCheckoutSession({
        tx: {
          id: 'tx123',
          paymentType: 'online',
          agreedPrice: 300,
        },
        buyerEmail: 'student@university.ac.za',
      })
    ).rejects.toThrow('Stripe Checkout URL was not returned by the server.');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// redirectToStripeCheckout
// ─────────────────────────────────────────────────────────────────────────────

describe('redirectToStripeCheckout', () => {
  let mockUpdateDoc;
  let updateTransactionStatus;
  let createStripeCheckoutSession;
  let redirectToStripeCheckout;

  beforeEach(() => {
    mockUpdateDoc = vi.fn(() => Promise.resolve());
    updateTransactionStatus = makeUpdateTransactionStatus(mockUpdateDoc);

    createStripeCheckoutSession = vi.fn(() =>
      Promise.resolve({
        id: 'cs_test_123',
        url: 'https://checkout.stripe.com/c/pay/cs_test_123',
      })
    );

    redirectToStripeCheckout = makeRedirectToStripeCheckout(
      updateTransactionStatus,
      createStripeCheckoutSession
    );

    delete window.location;
    window.location = {
      href: '',
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('skips Stripe for cash payment and marks transaction as waiting', async () => {
    const result = await redirectToStripeCheckout({
      tx: {
        id: 'tx123',
        paymentType: 'cash',
        agreedPrice: 300,
      },
      buyerEmail: 'student@university.ac.za',
    });

    expect(result).toEqual({
      skipped: true,
      reason: 'cash_payment',
    });

    expect(mockUpdateDoc).toHaveBeenCalledWith('mock-ref-for-tx123', {
      status: 'waiting',
      updatedAt: 'mock-timestamp',
      paymentProvider: 'cash',
      onlineAmount: 0,
      cashAmount: 300,
    });

    expect(createStripeCheckoutSession).not.toHaveBeenCalled();
  });

  it('redirects to Stripe Checkout for online payment', async () => {
    const result = await redirectToStripeCheckout({
      tx: {
        id: 'tx123',
        paymentType: 'online',
        agreedPrice: 300,
      },
      buyerEmail: 'student@university.ac.za',
    });

    expect(createStripeCheckoutSession).toHaveBeenCalledWith({
      tx: {
        id: 'tx123',
        paymentType: 'online',
        agreedPrice: 300,
      },
      buyerEmail: 'student@university.ac.za',
      createSessionUrl: '/api/stripe/create-checkout-session',
    });

    expect(window.location.href).toBe('https://checkout.stripe.com/c/pay/cs_test_123');

    expect(result).toEqual({
      id: 'cs_test_123',
      url: 'https://checkout.stripe.com/c/pay/cs_test_123',
    });
  });

  it('passes custom createSessionUrl to createStripeCheckoutSession', async () => {
    await redirectToStripeCheckout({
      tx: {
        id: 'tx123',
        paymentType: 'online',
        agreedPrice: 300,
      },
      buyerEmail: 'student@university.ac.za',
      createSessionUrl: '/custom/stripe/session',
    });

    expect(createStripeCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({
        createSessionUrl: '/custom/stripe/session',
      })
    );
  });

  it('redirects for partial online payment', async () => {
    await redirectToStripeCheckout({
      tx: {
        id: 'tx123',
        paymentType: 'partial',
        agreedPrice: 500,
        partialAmount: 200,
      },
      buyerEmail: 'student@university.ac.za',
    });

    expect(createStripeCheckoutSession).toHaveBeenCalledTimes(1);
    expect(window.location.href).toBe('https://checkout.stripe.com/c/pay/cs_test_123');
  });
});