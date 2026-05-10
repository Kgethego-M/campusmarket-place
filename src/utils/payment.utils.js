import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';

// ─── Amount Helpers ───────────────────────────────────────────────────────────

export function getOnlineAmount(tx) {
  if (!tx) return 0;

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

export function getCashAmount(tx) {
  if (!tx) return 0;

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

export function getTotalAmount(tx) {
  if (!tx) return 0;

  return Number(tx.agreedPrice ?? tx.listingPrice ?? 0);
}

export function toStripeAmount(randAmount) {
  const amount = Number(randAmount);

  if (!Number.isFinite(amount) || amount < 0) {
    return 0;
  }

  return Math.round(amount * 100);
}

// ─── API URL Helper ───────────────────────────────────────────────────────────

export function buildApiUrl(path) {
  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  const apiBaseUrl =
    import.meta.env.VITE_API_URL ||
    import.meta.env.VITE_API_BASE_URL ||
    '';

  if (!apiBaseUrl) {
    console.warn(
      'No VITE_API_URL or VITE_API_BASE_URL found. Calling relative API path:',
      path
    );

    return path;
  }

  const cleanBase = apiBaseUrl.replace(/\/$/, '');
  const cleanPath = path.replace(/^\//, '');

  return `${cleanBase}/${cleanPath}`;
}

export const PAYMENT_LABELS = {
  full_online: 'Fully Online',
  online: 'Fully Online',
  partial: 'Partial Online + Cash',
  cash: 'Full Cash on Delivery',
  cod: 'Full Cash on Delivery',
};

// ─── Firestore Status Updater ─────────────────────────────────────────────────

export async function updateTransactionStatus(txId, status, extra = {}) {
  if (!txId) {
    throw new Error('Transaction ID is required.');
  }

  const ref = doc(db, 'transactions', txId);

  await updateDoc(ref, {
    status,
    updatedAt: serverTimestamp(),
    ...extra,
  });
}

// ─── Stripe Checkout Helpers ──────────────────────────────────────────────────

export function generateStripeRef(txId) {
  if (!txId) {
    return `CM-UNKNOWN-${Date.now()}`;
  }

  return `CM-${txId.slice(0, 6).toUpperCase()}-${Date.now()}`;
}

/**
 * Creates a Stripe Checkout Session by calling your backend.
 *
 * IMPORTANT:
 * This function does NOT mark the transaction as pending_payment.
 * It keeps the transaction as accepted until Stripe actually confirms payment.
 */
export async function createStripeCheckoutSession({
  tx,
  buyerEmail,
  createSessionUrl = '/api/stripe/create-checkout-session',
  successUrl,
  cancelUrl,
}) {
  if (!tx?.id) {
    throw new Error('Transaction ID is required.');
  }

  if (!buyerEmail) {
    throw new Error('Buyer email is required.');
  }

  const paymentType = tx.paymentType || tx.paymentMethod || 'cash';
  const amountRand = getOnlineAmount(tx);
  const cashAmount = getCashAmount(tx);
  const totalAmount = getTotalAmount(tx);

  if (amountRand <= 0) {
    throw new Error('This transaction does not require online payment.');
  }

  const stripeRef = tx.stripeRef || generateStripeRef(tx.id);

  const payload = {
    transactionId: tx.id,
    buyerEmail,
    amount: toStripeAmount(amountRand),
    amountRand,
    cashAmount,
    totalAmount,
    currency: 'zar',
    stripeRef,
    paymentType,
    listingId: tx.listingId ?? null,
    listingTitle: tx.listingTitle ?? tx.title ?? 'Marketplace transaction',

    successUrl:
      successUrl ||
      `${window.location.origin}/payment-success?tx=${tx.id}`,

    cancelUrl:
      cancelUrl ||
      `${window.location.origin}/payment-cancelled?tx=${tx.id}`,

    metadata: {
      transactionId: tx.id,
      stripeRef,
      paymentType,
      listingId: tx.listingId ?? '',
      buyerId: tx.buyerId ?? '',
      sellerId: tx.sellerId ?? '',
    },
  };

  const finalUrl = buildApiUrl(createSessionUrl);

  console.log('Creating Stripe Checkout session at:', finalUrl);
  console.log('Stripe Checkout payload:', payload);

  let response;

  try {
    response = await fetch(finalUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    console.error('Stripe Checkout fetch failed:', error);

    await updateTransactionStatus(tx.id, 'accepted', {
      paymentProvider: 'stripe',
      paymentStatus: 'network_error',
      stripeRef,
      paymentError: error?.message || 'Could not connect to Stripe backend.',
    });

    throw new Error(
      'Could not connect to the Stripe backend. Make sure your backend is running and VITE_API_URL is correct.'
    );
  }

  let data = null;

  try {
    data = await response.json();
  } catch {
    data = null;
  }

  console.log('Stripe Checkout response:', {
    status: response.status,
    ok: response.ok,
    data,
  });

  if (!response.ok) {
    await updateTransactionStatus(tx.id, 'accepted', {
      paymentProvider: 'stripe',
      paymentStatus: 'failed_to_create_session',
      stripeRef,
      paymentError:
        data?.message ||
        data?.error ||
        'Failed to create Stripe Checkout session.',
    });

    throw new Error(
      data?.message ||
      data?.error ||
      'Failed to create Stripe Checkout session.'
    );
  }

  if (!data?.url) {
    await updateTransactionStatus(tx.id, 'accepted', {
      paymentProvider: 'stripe',
      paymentStatus: 'missing_checkout_url',
      stripeRef,
      paymentError: 'Stripe Checkout URL was not returned by the server.',
    });

    throw new Error('Stripe Checkout URL was not returned by the server.');
  }

  /**
   * Important:
   * Keep status as accepted.
   * Do not show "waiting for Stripe".
   * Do not mark as pending_payment.
   *
   * The transaction becomes waiting/paid only after your Stripe webhook confirms payment.
   */
  await updateTransactionStatus(tx.id, 'accepted', {
    paymentProvider: 'stripe',
    paymentStatus: 'checkout_ready',
    stripeRef,
    onlineAmount: amountRand,
    cashAmount,
    totalAmount,
    paymentSettled: false,
    stripeCheckoutSessionId: data.id || null,
    stripeCheckoutUrl: data.url,
  });

  return {
    ...data,
    stripeRef,
  };
}

/**
 * Redirects the buyer to Stripe Checkout.
 */
export async function redirectToStripeCheckout({
  tx,
  buyerEmail,
  createSessionUrl = '/api/stripe/create-checkout-session',
  successUrl,
  cancelUrl,
}) {
  if (!tx?.id) {
    throw new Error('Transaction ID is required.');
  }

  const amountRand = getOnlineAmount(tx);

  /**
   * Cash-only transaction.
   * No Stripe redirect is needed.
   */
  if (amountRand <= 0) {
    await updateTransactionStatus(tx.id, 'waiting', {
      paymentProvider: 'cash',
      paymentStatus: 'cash_pending',
      onlineAmount: 0,
      cashAmount: getCashAmount(tx),
      totalAmount: getTotalAmount(tx),
      paymentSettled: false,
    });

    return {
      skipped: true,
      reason: 'cash_payment',
    };
  }

  /**
   * If Stripe Checkout was already created, immediately reuse it.
   * Status can remain accepted.
   */
  if (tx.stripeCheckoutUrl) {
    console.log('Continuing existing Stripe Checkout session:', tx.stripeCheckoutUrl);

    window.location.assign(tx.stripeCheckoutUrl);

    return {
      reused: true,
      url: tx.stripeCheckoutUrl,
      id: tx.stripeCheckoutSessionId || null,
      stripeRef: tx.stripeRef || null,
    };
  }

  const session = await createStripeCheckoutSession({
    tx,
    buyerEmail,
    createSessionUrl,
    successUrl,
    cancelUrl,
  });

  console.log('Redirecting to Stripe Checkout:', session.url);

  window.location.assign(session.url);

  return session;
}