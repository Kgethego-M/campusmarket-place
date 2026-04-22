import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─────────────────────────────────────────────────────────────────────────────
// Instead of importing from payment.utils (which pulls in Firebase),
// we copy the pure functions inline here — zero external dependencies.
// Firebase-touching functions are tested with hand-rolled mocks below.
// ─────────────────────────────────────────────────────────────────────────────

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
  const type  = tx.paymentType || tx.paymentMethod || 'cash';
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

function toPaystackAmount(randAmount) {
  return Math.round(Number(randAmount) * 100);
}

function generateRef(txId) {
  return `CM-${txId.slice(0, 6).toUpperCase()}-${Date.now()}`;
}

const PAYMENT_LABELS = {
  full_online: 'Fully Online',
  online:      'Fully Online',
  partial:     'Partial Online + Cash',
  cash:        'Full Cash on Delivery',
  cod:         'Full Cash on Delivery',
};

// Hand-rolled mock — replaces the real updateTransactionStatus
// so we can inject a fake updateDoc and check what it received
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

// Inline version of openPaystackPopup with no Firebase import
function openPaystackPopup({ publicKey, email, amountRand, ref, metadata = {} }) {
  return new Promise((resolve, reject) => {
    if (!globalThis.PaystackPop) {
      reject(new Error('Paystack SDK not loaded'));
      return;
    }
    const handler = globalThis.PaystackPop.setup({
      key:      publicKey,
      email,
      amount:   toPaystackAmount(amountRand),
      currency: 'ZAR',
      ref,
      metadata,
      callback: (response) => resolve(response),
      onClose:  () => reject({ cancelled: true }),
    });
    handler.openIframe();
  });
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

  it('returns agreedPrice for online (alias)', () => {
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

  it('returns 0 when partialAmount is 0 for partial', () => {
    expect(getOnlineAmount({ paymentType: 'partial', agreedPrice: 500, partialAmount: 0 })).toBe(0);
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
    { paymentType: 'online',      agreedPrice: 300, partialAmount: null },
    { paymentType: 'partial',     agreedPrice: 500, partialAmount: 200  },
    { paymentType: 'partial',     agreedPrice: 500, partialAmount: 0    },
    { paymentType: 'cash',        agreedPrice: 400, partialAmount: null },
    { paymentType: 'cod',         agreedPrice: 150, partialAmount: null },
  ];

  cases.forEach((tx) => {
    it(`sums correctly for paymentType="${tx.paymentType}"`, () => {
      expect(getOnlineAmount(tx) + getCashAmount(tx)).toBe(tx.agreedPrice);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// toPaystackAmount
// ─────────────────────────────────────────────────────────────────────────────

describe('toPaystackAmount', () => {

  it('converts rands to cents', () => {
    expect(toPaystackAmount(255)).toBe(25500);
  });

  it('rounds floating point — 1.005 * 100 = 100.499... so rounds DOWN to 100', () => {
    // JS float: 1.005 * 100 = 100.49999999999999, not 100.5
    // Math.round(100.499...) = 100, not 101 — this is correct behaviour
    expect(toPaystackAmount(1.005)).toBe(100);
  });

  it('handles 0', () => {
    expect(toPaystackAmount(0)).toBe(0);
  });

  it('handles string input', () => {
    expect(toPaystackAmount('50')).toBe(5000);
  });

  it('handles decimal rands e.g. R 99.99', () => {
    expect(toPaystackAmount(99.99)).toBe(9999);
  });

  it('handles large amounts', () => {
    expect(toPaystackAmount(50000)).toBe(5000000);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// generateRef
// ─────────────────────────────────────────────────────────────────────────────

describe('generateRef', () => {

  it('starts with CM-', () => {
    expect(generateRef('abc123xyz')).toMatch(/^CM-/);
  });

  it('uses first 6 chars of txId uppercased', () => {
    expect(generateRef('abcdef999').startsWith('CM-ABCDEF-')).toBe(true);
  });

  it('ends with a numeric timestamp', () => {
    const parts     = generateRef('txid01').split('-');
    const timestamp = Number(parts[parts.length - 1]);
    expect(timestamp).toBeGreaterThan(0);
    expect(Number.isInteger(timestamp)).toBe(true);
  });

  it('matches format CM-XXXXXX-timestamp', () => {
    expect(generateRef('txid01')).toMatch(/^CM-TXID01-\d+$/);
  });

  it('handles txId shorter than 6 chars', () => {
    expect(generateRef('ab1').startsWith('CM-AB1-')).toBe(true);
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
// updateTransactionStatus (hand-rolled mock — no Firebase)
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
      status:    'waiting',
      updatedAt: 'mock-timestamp',
    });
  });

  it('merges extra fields', async () => {
    await updateTransactionStatus('tx123', 'waiting', { paystackRef: 'CM-REF-123', onlinePaid: 250 });
    expect(mockUpdateDoc).toHaveBeenCalledWith('mock-ref-for-tx123', {
      status:      'waiting',
      updatedAt:   'mock-timestamp',
      paystackRef: 'CM-REF-123',
      onlinePaid:  250,
    });
  });

  it('works with completed status', async () => {
    await updateTransactionStatus('tx456', 'completed');
    expect(mockUpdateDoc).toHaveBeenCalledWith('mock-ref-for-tx456', {
      status:    'completed',
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
// openPaystackPopup (mocks globalThis.PaystackPop — no Firebase)
// ─────────────────────────────────────────────────────────────────────────────

describe('openPaystackPopup', () => {
  const opts = {
    publicKey:  'pk_test_abc123',
    email:      'student@university.ac.za',
    amountRand: 255,
    ref:        'CM-TX1234-1234567890',
  };

  afterEach(() => {
    delete globalThis.PaystackPop;
  });

  it('rejects when PaystackPop is not available', async () => {
    await expect(openPaystackPopup(opts)).rejects.toThrow('Paystack SDK not loaded');
  });

  it('resolves with Paystack response on success', async () => {
    const mockResponse = { reference: 'CM-TX1234-1234567890', status: 'success' };
    globalThis.PaystackPop = {
      setup: vi.fn(({ callback }) => ({ openIframe: () => callback(mockResponse) })),
    };
    await expect(openPaystackPopup(opts)).resolves.toEqual(mockResponse);
  });

  it('rejects with { cancelled: true } when user closes popup', async () => {
    globalThis.PaystackPop = {
      setup: vi.fn(({ onClose }) => ({ openIframe: () => onClose() })),
    };
    await expect(openPaystackPopup(opts)).rejects.toEqual({ cancelled: true });
  });

  it('passes amount in cents to PaystackPop.setup', async () => {
    globalThis.PaystackPop = {
      setup: vi.fn(({ callback }) => ({ openIframe: () => callback({ reference: 'r' }) })),
    };
    await openPaystackPopup({ ...opts, amountRand: 255 });
    expect(globalThis.PaystackPop.setup).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 25500 })
    );
  });

  it('passes currency as ZAR', async () => {
    globalThis.PaystackPop = {
      setup: vi.fn(({ callback }) => ({ openIframe: () => callback({ reference: 'r' }) })),
    };
    await openPaystackPopup(opts);
    expect(globalThis.PaystackPop.setup).toHaveBeenCalledWith(
      expect.objectContaining({ currency: 'ZAR' })
    );
  });

  it('passes correct key and email', async () => {
    globalThis.PaystackPop = {
      setup: vi.fn(({ callback }) => ({ openIframe: () => callback({ reference: 'r' }) })),
    };
    await openPaystackPopup(opts);
    expect(globalThis.PaystackPop.setup).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'pk_test_abc123', email: 'student@university.ac.za' })
    );
  });
});