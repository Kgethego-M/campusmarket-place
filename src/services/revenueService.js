import { db } from '../firebase';
import { doc, updateDoc, increment, serverTimestamp, collection, addDoc, getDoc, setDoc } from 'firebase/firestore';

/**
 * Revenue Service - Tracks all money movements in the platform
 */

// ── Analytics document reference ─────────────────────────────────────────────
const getAnalyticsRef = () => doc(db, 'analytics', 'platform');

// ── Default analytics shape (single source of truth) ─────────────────────────
const DEFAULT_ANALYTICS = {
  totalRevenue:         0,
  onlineRevenue:        0,
  adPayments:           0,   // ← ad/promotion payments
  pendingCashRevenue:   0,
  collectedCashRevenue: 0,
  totalPayouts:         0,
  totalRefunds:         0,
  availableBalance:     0,
  promotionRevenue:     0,   // Alias for adPayments for display
  createdAt:            serverTimestamp(),
  lastUpdated:          serverTimestamp(),
};

// ── Ensure analytics document exists with all fields ─────────────────────────
async function ensureAnalyticsDocument() {
  const analyticsRef = getAnalyticsRef();
  const snap = await getDoc(analyticsRef);

  if (!snap.exists()) {
    await setDoc(analyticsRef, DEFAULT_ANALYTICS);
  } else {
    // Patch any missing fields (e.g. adPayments missing from older docs)
    const data = snap.data();
    const missing = {};
    Object.entries(DEFAULT_ANALYTICS).forEach(([key, val]) => {
      if (data[key] === undefined) missing[key] = val;
    });
    if (Object.keys(missing).length > 0) {
      await updateDoc(analyticsRef, missing);
    }
  }

  return analyticsRef;
}

// ── Record online payment from Stripe ────────────────────────────────────────
export async function recordOnlinePayment(transactionId, amount, paymentDetails = {}) {
  try {
    const analyticsRef = await ensureAnalyticsDocument();
    const txnRef = doc(db, 'transactions', transactionId);

    const txnSnap = await getDoc(txnRef);
    const txn = txnSnap.exists() ? txnSnap.data() : {};

    if (txn.revenueRecorded === true) {
      console.log(`Revenue already recorded for transaction ${transactionId}`);
      return false;
    }

    await updateDoc(analyticsRef, {
      totalRevenue:  increment(amount),
      onlineRevenue: increment(amount),
      lastUpdated:   serverTimestamp(),
    });

    await addDoc(collection(db, 'transactions', transactionId, 'revenueEvents'), {
      type:            'payment_received',
      amount:          amount,
      paymentMethod:   paymentDetails.paymentMethod || 'stripe',
      stripeSessionId: paymentDetails.stripeSessionId || null,
      timestamp:       serverTimestamp(),
    });

    await updateDoc(txnRef, {
      revenueRecorded:   true,
      revenueAmount:     amount,
      revenueRecordedAt: serverTimestamp(),
    });

    console.log(`✅ Recorded online payment: R${amount} for tx ${transactionId}`);
    return true;
  } catch (error) {
    console.error('Failed to record online payment:', error);
    return false;
  }
}

// ── Record ad / promotion payment ─────────────────────────────────────────────
export async function recordAdPayment(uniquePaymentId, amount, adDetails = {}) {
  try {
    const analyticsRef = await ensureAnalyticsDocument();

    // Idempotency: skip if already recorded
    const snap = await getDoc(analyticsRef);
    const recorded = snap.data()?.adPaymentIds || [];
    if (recorded.includes(uniquePaymentId)) {
      console.log(`Ad payment already recorded for ${uniquePaymentId}`);
      return false;
    }

    await updateDoc(analyticsRef, {
      totalRevenue:     increment(amount),
      adPayments:       increment(amount),   // ← "Ad Payments" card on dashboard
      promotionRevenue: increment(amount),   // Alias for consistency
      lastUpdated:      serverTimestamp(),
      // Keep a list of recorded IDs so we never double-count
      adPaymentIds:     [...recorded, uniquePaymentId],
    });

    console.log(`✅ Recorded ad payment: R${amount} for session ${uniquePaymentId}`);
    return true;
  } catch (error) {
    console.error('Failed to record ad payment:', error);
    return false;
  }
}

// ── Record cash confirmation (when buyer commits to cash payment) ─────────────
export async function recordCashConfirmation(transactionId, amount) {
  try {
    const analyticsRef = await ensureAnalyticsDocument();
    const txnRef = doc(db, 'transactions', transactionId);

    await updateDoc(analyticsRef, {
      pendingCashRevenue: increment(amount),
      lastUpdated:        serverTimestamp(),
    });

    await addDoc(collection(db, 'transactions', transactionId, 'revenueEvents'), {
      type:      'cash_confirmed',
      amount:    amount,
      timestamp: serverTimestamp(),
    });

    await updateDoc(txnRef, {
      cashConfirmed: true,
      cashAmount:    amount,
    });

    console.log(`✅ Recorded cash confirmation: R${amount} for tx ${transactionId}`);
    return true;
  } catch (error) {
    console.error('Failed to record cash confirmation:', error);
    return false;
  }
}

// ── Record cash collected (when staff physically receives cash) ───────────────
export async function recordCashCollected(transactionId, amount) {
  try {
    const analyticsRef = await ensureAnalyticsDocument();
    const txnRef = doc(db, 'transactions', transactionId);

    const analyticsSnap = await getDoc(analyticsRef);
    const currentPending = analyticsSnap.data()?.pendingCashRevenue || 0;

    const updateData = {
      collectedCashRevenue: increment(amount),
      totalRevenue:         increment(amount),
      lastUpdated:          serverTimestamp(),
    };

    if (currentPending > 0 && amount <= currentPending) {
      updateData.pendingCashRevenue = increment(-amount);
    } else if (currentPending > 0 && amount > currentPending) {
      updateData.pendingCashRevenue = increment(-currentPending);
    }

    await updateDoc(analyticsRef, updateData);

    await addDoc(collection(db, 'transactions', transactionId, 'revenueEvents'), {
      type:        'cash_collected',
      amount:      amount,
      timestamp:   serverTimestamp(),
      collectedBy: 'staff',
    });

    await updateDoc(txnRef, {
      cashCollected:   true,
      cashCollectedAt: serverTimestamp(),
    });

    console.log(`✅ Recorded cash collected: R${amount} for tx ${transactionId}`);
    return true;
  } catch (error) {
    console.error('Failed to record cash collected:', error);
    return false;
  }
}

// ── Record seller payout ──────────────────────────────────────────────────────
export async function recordSellerPayout(transactionId, amount, sellerId) {
  try {
    const analyticsRef = await ensureAnalyticsDocument();

    await updateDoc(analyticsRef, {
      totalPayouts:     increment(amount),
      availableBalance: increment(-amount),
      lastUpdated:      serverTimestamp(),
    });

    await addDoc(collection(db, 'transactions', transactionId, 'revenueEvents'), {
      type:      'seller_payout',
      amount:    amount,
      sellerId:  sellerId,
      timestamp: serverTimestamp(),
    });

    await updateDoc(doc(db, 'transactions', transactionId), {
      sellerPaid:   true,
      sellerPaidAt: serverTimestamp(),
    });

    console.log(`✅ Recorded seller payout: R${amount} for tx ${transactionId}`);
    return true;
  } catch (error) {
    console.error('Failed to record seller payout:', error);
    return false;
  }
}

// ── Record refund ─────────────────────────────────────────────────────────────
export async function recordRefund(transactionId, amount, reason) {
  try {
    const analyticsRef = await ensureAnalyticsDocument();

    await updateDoc(analyticsRef, {
      totalRevenue: increment(-amount),
      totalRefunds: increment(amount),
      lastUpdated:  serverTimestamp(),
    });

    await addDoc(collection(db, 'transactions', transactionId, 'revenueEvents'), {
      type:      'refund_issued',
      amount:    amount,
      reason:    reason,
      timestamp: serverTimestamp(),
    });

    await updateDoc(doc(db, 'transactions', transactionId), {
      refunded:      true,
      refundAmount:  amount,
      refundReason:  reason,
      refundedAt:    serverTimestamp(),
    });

    console.log(`✅ Recorded refund: R${amount} for tx ${transactionId} (${reason})`);
    return true;
  } catch (error) {
    console.error('Failed to record refund:', error);
    return false;
  }
}

// ── Get current analytics summary ────────────────────────────────────────────
export async function getRevenueAnalytics() {
  try {
    const analyticsRef = await ensureAnalyticsDocument();
    const snap = await getDoc(analyticsRef);
    return snap.exists() ? snap.data() : { ...DEFAULT_ANALYTICS };
  } catch (error) {
    console.error('Failed to get revenue analytics:', error);
    return null;
  }
}