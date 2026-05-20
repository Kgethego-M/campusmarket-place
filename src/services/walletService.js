/**
 * walletService.js  —  src/services/walletService.js
 *
 * Wallet rules
 * ────────────────────────────────────────
 *  SELLER credits  — when ALL true:
 *    1. transaction.type !== 'trade'
 *    2. transaction.sellerId === userId
 *    3. status in COMPLETED_STATUSES
 *    Seller gets credited regardless of payment method (cash, online, partial)
 *
 *  BUYER refunds   — when ALL true:
 *    1. transaction.buyerId === userId
 *    2. status === 'cancelled' | 'overdue_cancelled'
 *    3. paymentType is 'online' → refund full agreedPrice
 *       paymentType is 'partial' → refund onlineAmount only
 *       paymentType is 'cash' | 'cod' | 'trade' → NO refund (cash/trade only)
 *
 *  AD debits       — every ad in `ads` collection for this user.
 *                    Always wallet-paid. Use AD_PRICES[ad.type], ignore ad.price.
 *
 *  MANUAL credits  — walletTransactions where type === 'topup'
 *  MANUAL debits   — walletTransactions where type === 'withdrawal'
 *
 *  BUYER PURCHASE  — walletTransactions where type === 'wallet_debit'
 *                    Shown in ledger for display only — does NOT affect balance
 *                    recalculation (balance is managed optimistically via
 *                    updateDoc in deductBuyerWallet). Seller is credited
 *                    separately via the sale_credit path on completion.
 */

import {
  doc, getDoc, getDocs, updateDoc, addDoc,
  collection, query, where, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase';

export const AD_PRICES = {
  'premium-popup': 150,
  banner: 50,
};

const COMPLETED_STATUSES = ['completed', 'sold', 'traded'];
const CASH_PAYMENT_TYPES = ['cash', 'cod', 'trade'];
const CANCELLED_STATUSES = ['cancelled', 'overdue_cancelled'];

const safeNum = (v) => { const n = Number(v); return isNaN(n) ? 0 : n; };

// ─────────────────────────────────────────────────────────────────────────────
// recalculateWallet
// ─────────────────────────────────────────────────────────────────────────────
export async function recalculateWallet(userId) {
  const [asSellerSnap, asBuyerCancelledSnap, adsSnap, manualTxSnap] = await Promise.all([
    getDocs(query(
      collection(db, 'transactions'),
      where('sellerId', '==', userId),
      where('status', 'in', COMPLETED_STATUSES),
    )),
    getDocs(query(
      collection(db, 'transactions'),
      where('buyerId', '==', userId),
      where('status', 'in', CANCELLED_STATUSES),
    )),
    getDocs(query(
      collection(db, 'ads'),
      where('sellerId', '==', userId),
    )),
    getDocs(query(
      collection(db, 'walletTransactions'),
      where('userId', '==', userId),
    )),
  ]);

  const ledger = [];

  // ── Seller credits (completed sales) ─────────────────────────────────────
  for (const d of asSellerSnap.docs) {
    const p = d.data();

    // SKIP: trades — no money changes hands
    if ((p.type ?? '').toLowerCase() === 'trade') continue;

    // SKIP: self-purchase edge case
    if (p.buyerId && p.buyerId === userId) continue;

    const amt = safeNum(p.agreedPrice ?? p.listingPrice ?? p.price ?? 0);
    if (amt <= 0) continue;

    const raw = p.completedAt ?? p.updatedAt ?? p.createdAt;
    ledger.push({
      id:          `tx-seller-${d.id}`,
      type:        'sale_credit',
      direction:   'credit',
      amount:      amt,
      description: `Sale: ${p.listingTitle || 'Item'}`,
      date:        raw?.toDate?.() ?? (raw ? new Date(raw) : new Date(0)),
    });
  }

  // ── Buyer refunds (cancelled transactions — online payments only) ─────────
  for (const d of asBuyerCancelledSnap.docs) {
    const p = d.data();

    // SKIP: self-purchase edge case
    if (p.sellerId && p.sellerId === userId) continue;

    const paymentType = (p.paymentType ?? '').toLowerCase();
    const provider    = (p.paymentProvider ?? '').toLowerCase();

    // Cash, COD, and trade payments were never in the wallet — nothing to refund
    if (CASH_PAYMENT_TYPES.includes(paymentType)) continue;
    if (CASH_PAYMENT_TYPES.includes(provider))    continue;

    let refundAmt = 0;

    if (paymentType === 'partial') {
      // Only the online portion was wallet/stripe — refund that portion only
      refundAmt = safeNum(p.onlineAmount ?? 0);
    } else {
      // 'online' or any other non-cash type — refund full agreed price
      refundAmt = safeNum(p.agreedPrice ?? p.listingPrice ?? p.price ?? 0);
    }

    if (refundAmt <= 0) continue;

    const raw = p.cancelledAt ?? p.updatedAt ?? p.createdAt;
    ledger.push({
      id:          `tx-refund-${d.id}`,
      type:        'refund',
      direction:   'credit',
      amount:      refundAmt,
      description: `Refund: ${p.listingTitle || 'Item'} (cancelled)`,
      date:        raw?.toDate?.() ?? (raw ? new Date(raw) : new Date(0)),
    });
  }

  // ── Ad debits (wallet-paid, use AD_PRICES — deduplicated) ─────────────────
  const seenAdIds = new Set();
  for (const d of adsSnap.docs) {
    if (seenAdIds.has(d.id)) continue;
    seenAdIds.add(d.id);
    const p       = d.data();
    const adPrice = AD_PRICES[p.type];
    if (!adPrice) continue; // unknown ad type — skip rather than guess
    const raw = p.createdAt;
    ledger.push({
      id:          `ad-${d.id}`,
      type:        'ad_debit',
      direction:   'debit',
      amount:      adPrice,
      description: `Ad: ${p.title || 'Listing promotion'} (${p.type || 'ad'})`,
      date:        raw?.toDate?.() ?? (raw ? new Date(raw) : new Date(0)),
    });
  }

  // ── Manual wallet entries: topup, withdrawal, wallet_debit ────────────────
  const seenManualIds = new Set();
  for (const d of manualTxSnap.docs) {
    if (seenManualIds.has(d.id)) continue;
    seenManualIds.add(d.id);
    const p = d.data();

    // wallet_debit: include in ledger for display (buyer sees their purchase
    // history) but do NOT count toward balance — the balance is managed
    // optimistically via updateDoc in deductBuyerWallet, and restored via the
    // cancelled-transaction refund logic above if the purchase is cancelled.
    if (p.type === 'wallet_debit') {
      ledger.push({
        id:          d.id,
        type:        'wallet_debit',
        direction:   'debit',
        amount:      safeNum(p.amount),
        description: p.description || 'Purchase',
        date:        p.createdAt?.toDate?.() ?? new Date(0),
        refId:       p.refId ?? null,
      });
      continue; // skip balance calculation
    }

    if (!['topup', 'withdrawal'].includes(p.type)) continue;

    ledger.push({
      id:          d.id,
      type:        p.type,
      direction:   p.direction,
      amount:      safeNum(p.amount),
      description: p.description || (p.type === 'topup' ? 'Top-up' : 'Withdrawal'),
      date:        p.createdAt?.toDate?.() ?? new Date(0),
      refId:       p.refId     ?? null,
      bankDetails: p.bankDetails ?? null,
      status:      p.status    ?? null,
    });
  }

  // ── Sort newest-first ─────────────────────────────────────────────────────
  ledger.sort((a, b) => b.date - a.date);

  // ── Calculate balance ─────────────────────────────────────────────────────
  const balance = ledger.reduce(
    (acc, e) => e.direction === 'credit' ? acc + e.amount : acc - e.amount,
    0,
  );

  // ── Persist ───────────────────────────────────────────────────────────────
  await updateDoc(doc(db, 'users', userId), { walletBalance: balance }).catch(() => {});

  return { balance, ledger };
}

// ─────────────────────────────────────────────────────────────────────────────
// Stripe top-up
// ─────────────────────────────────────────────────────────────────────────────
export async function redirectToStripeTopUp({
  userId, userEmail, amount, createSessionUrl, successUrl, cancelUrl,
}) {
  let res;
  try {
    res = await fetch(createSessionUrl, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        userEmail,
        amount,
        description: `Campus Marketplace Wallet — R${amount}`,
        successUrl,
        cancelUrl,
        metadata: { type: 'wallet_topup', userId, amount: String(amount) },
      }),
    });
  } catch {
    throw new Error('Could not reach the payment server. Check your connection and try again.');
  }

  if (!res.ok) {
    let msg = `Server error (${res.status})`;
    try { const j = await res.json(); msg = j.detail || j.message || msg; } catch (_) {}
    throw new Error(msg);
  }

  let url;
  try { ({ url } = await res.json()); } catch {
    throw new Error('Invalid response from payment server.');
  }
  if (!url) throw new Error('No checkout URL returned from server.');

  window.location.href = url;
}

export async function confirmStripeTopUp({ sessionId, userId, verifyUrl }) {
  const res = await fetch(verifyUrl, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ sessionId, userId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || err.message || 'Could not verify top-up');
  }
  return await recalculateWallet(userId);
}

// ─────────────────────────────────────────────────────────────────────────────
// Withdrawal
// ─────────────────────────────────────────────────────────────────────────────
export async function withdrawFromWallet(userId, amount, bankDetails = {}) {
  const amt = safeNum(amount);
  if (amt <= 0) throw new Error('Amount must be positive');

  const userSnap = await getDoc(doc(db, 'users', userId));
  const stored   = safeNum(userSnap.data()?.walletBalance ?? 0);
  if (stored < amt) throw new Error(`Insufficient balance — R${stored.toFixed(2)} available`);

  await addDoc(collection(db, 'walletTransactions'), {
    userId,
    type:        'withdrawal',
    direction:   'debit',
    amount:      amt,
    description: `Withdrawal — R${amt.toLocaleString('en-ZA')}`,
    refId:       'manual',
    bankDetails,
    status:      'pending',
    createdAt:   serverTimestamp(),
  });

  return await recalculateWallet(userId);
}

// ─────────────────────────────────────────────────────────────────────────────
// Ad gate
// ─────────────────────────────────────────────────────────────────────────────
export async function deductAdFromWallet(userId, adId, adType, adTitle = '') {
  const adPrice = AD_PRICES[adType];
  if (adPrice == null) throw new Error(`Unknown ad type: ${adType}`);

  const userSnap = await getDoc(doc(db, 'users', userId));
  const stored   = safeNum(userSnap.data()?.walletBalance ?? 0);
  if (stored < adPrice) {
    throw new Error(
      `Insufficient balance — R${stored.toFixed(2)} available, R${adPrice} needed for a ${adType} ad`,
    );
  }

  const newBalance = stored - adPrice;
  await updateDoc(doc(db, 'users', userId), { walletBalance: newBalance });
  return newBalance;
}

// ─────────────────────────────────────────────────────────────────────────────
// Buyer wallet deduction (for purchases)
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Deducts the online payment portion from the buyer's wallet immediately.
 * Writes a wallet_debit entry to walletTransactions so it shows in their ledger.
 *
 * The seller is NOT credited here — that happens separately via recalculateWallet
 * when the transaction reaches a COMPLETED_STATUSES state (sale_credit path).
 *
 * If the transaction is later cancelled, the refund is handled by the
 * cancelled-transaction logic in recalculateWallet (refund credit path).
 *
 * @param {string} buyerId
 * @param {number} amount        — the online portion to deduct
 * @param {string} transactionId — Firestore transaction doc ID
 * @param {string} listingTitle  — for the ledger description
 */
export async function deductBuyerWallet(buyerId, amount, transactionId, listingTitle = '') {
  const amt = safeNum(amount);
  if (amt <= 0) throw new Error('Amount must be positive');

  const userSnap = await getDoc(doc(db, 'users', buyerId));
  const stored   = safeNum(userSnap.data()?.walletBalance ?? 0);
  if (stored < amt) {
    throw new Error(
      `Insufficient wallet balance — R${stored.toFixed(2)} available, R${amt.toFixed(2)} needed`,
    );
  }

  // Write a debit entry — this appears in the buyer's transaction history
  await addDoc(collection(db, 'walletTransactions'), {
    userId:      buyerId,
    type:        'wallet_debit',
    direction:   'debit',
    amount:      amt,
    description: `Purchase: ${listingTitle || 'Item'}`,
    refId:       transactionId,
    createdAt:   serverTimestamp(),
  });

  // Optimistically update walletBalance on the user doc
  await updateDoc(doc(db, 'users', buyerId), {
    walletBalance: stored - amt,
  });

  return stored - amt;
}

// ─────────────────────────────────────────────────────────────────────────────
// Get wallet balance (lightweight — no full recalc)
// ─────────────────────────────────────────────────────────────────────────────
export async function getWalletBalance(userId) {
  const userSnap = await getDoc(doc(db, 'users', userId));
  return safeNum(userSnap.data()?.walletBalance ?? 0);
}