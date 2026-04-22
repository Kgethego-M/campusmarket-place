import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';

// ─── Amount Helpers ───────────────────────────────────────────────────────────

/**
 * Returns the rand amount the buyer must pay online for this transaction.
 * - full_online / online  → agreedPrice (fallback listingPrice)
 * - partial               → partialAmount
 * - cash / cod            → 0  (nothing to pay online)
 */
export function getOnlineAmount(tx) {
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

/**
 * Returns the rand amount the buyer must pay in cash at drop-off.
 */
export function getCashAmount(tx) {
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
 * Convert rand amount to kobo/cents for Paystack (multiply by 100).
 */
export function toPaystackAmount(randAmount) {
  return Math.round(Number(randAmount) * 100);
}

/**
 * Human-readable payment type label.
 */
export const PAYMENT_LABELS = {
  full_online: 'Fully Online',
  online:      'Fully Online',
  partial:     'Partial Online + Cash',
  cash:        'Full Cash on Delivery',
  cod:         'Full Cash on Delivery',
};

// ─── Firestore Status Updater ─────────────────────────────────────────────────

/**
 * Update a transaction's status in Firestore.
 * @param {string} txId
 * @param {'waiting'|'completed'|string} status
 * @param {object} [extra]  additional fields to merge
 */
export async function updateTransactionStatus(txId, status, extra = {}) {
  const ref = doc(db, 'transactions', txId);
  await updateDoc(ref, {
    status,
    updatedAt: serverTimestamp(),
    ...extra,
  });
}

// ─── Paystack Inline SDK Loader ───────────────────────────────────────────────

let paystackLoaded = false;
let paystackLoadPromise = null;

/**
 * Lazily loads the Paystack inline JS SDK.
 * Safe to call multiple times — resolves immediately if already loaded.
 */
export function loadPaystackSDK() {
  if (paystackLoaded) return Promise.resolve();
  if (paystackLoadPromise) return paystackLoadPromise;

  paystackLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://js.paystack.co/v1/inline.js';
    script.async = true;
    script.onload = () => {
      paystackLoaded = true;
      resolve();
    };
    script.onerror = () => reject(new Error('Failed to load Paystack SDK'));
    document.head.appendChild(script);
  });

  return paystackLoadPromise;
}

/**
 * Opens the Paystack payment popup.
 * Resolves with the Paystack response object on success.
 * Rejects with { cancelled: true } if the user closes the popup.
 *
 * @param {object} opts
 * @param {string} opts.publicKey   - pk_test_... or pk_live_...
 * @param {string} opts.email       - buyer email
 * @param {number} opts.amountRand  - amount in RANDS (we convert internally)
 * @param {string} opts.ref         - unique reference
 * @param {object} [opts.metadata]  - optional Paystack metadata
 */
export function openPaystackPopup({ publicKey, email, amountRand, ref, metadata = {} }) {
  return new Promise((resolve, reject) => {
    if (!window.PaystackPop) {
      reject(new Error('Paystack SDK not loaded'));
      return;
    }

    const handler = window.PaystackPop.setup({
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

/**
 * Generate a unique Paystack reference for a transaction.
 */
export function generateRef(txId) {
  return `CM-${txId.slice(0, 6).toUpperCase()}-${Date.now()}`;
}