// src/services/revenueService.js
import { db } from '../firebase';
import { doc, updateDoc, increment, serverTimestamp, collection, addDoc, getDoc, setDoc } from 'firebase/firestore';

/**
 * Revenue Service - Tracks all money movements in the platform
 */

// ── Analytics document reference ─────────────────────────────────────────────
const getAnalyticsRef = () => doc(db, 'analytics', 'platform');

// ── Ensure analytics document exists ─────────────────────────────────────────
async function ensureAnalyticsDocument() {
  const analyticsRef = getAnalyticsRef();
  const snap = await getDoc(analyticsRef);
  
  if (!snap.exists()) {
    await setDoc(analyticsRef, {
      totalRevenue: 0,
      onlineRevenue: 0,
      pendingCashRevenue: 0,
      collectedCashRevenue: 0,
      totalPayouts: 0,
      totalRefunds: 0,
      availableBalance: 0,
      createdAt: serverTimestamp(),
      lastUpdated: serverTimestamp(),
    });
  }
  return analyticsRef;
}

// ── Record online payment from Stripe ───────────────────────────────────────
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
      totalRevenue: increment(amount),
      onlineRevenue: increment(amount),
      lastUpdated: serverTimestamp(),
    });
    
    await addDoc(collection(db, 'transactions', transactionId, 'revenueEvents'), {
      type: 'payment_received',
      amount: amount,
      paymentMethod: paymentDetails.paymentMethod || 'stripe',
      stripeSessionId: paymentDetails.stripeSessionId || null,
      timestamp: serverTimestamp(),
    });
    
    await updateDoc(txnRef, {
      revenueRecorded: true,
      revenueAmount: amount,
      revenueRecordedAt: serverTimestamp(),
    });
    
    console.log(`✅ Recorded online payment: R${amount} for tx ${transactionId}`);
    return true;
  } catch (error) {
    console.error('Failed to record online payment:', error);
    return false;
  }
}

// ── Record cash confirmation (when buyer commits to cash payment) ────────────
export async function recordCashConfirmation(transactionId, amount) {
  try {
    const analyticsRef = await ensureAnalyticsDocument();
    const txnRef = doc(db, 'transactions', transactionId);
    
    await updateDoc(analyticsRef, {
      pendingCashRevenue: increment(amount),
      lastUpdated: serverTimestamp(),
    });
    
    await addDoc(collection(db, 'transactions', transactionId, 'revenueEvents'), {
      type: 'cash_confirmed',
      amount: amount,
      timestamp: serverTimestamp(),
    });
    
    await updateDoc(txnRef, {
      cashConfirmed: true,
      cashAmount: amount,
    });
    
    console.log(`✅ Recorded cash confirmation: R${amount} for tx ${transactionId}`);
    return true;
  } catch (error) {
    console.error('Failed to record cash confirmation:', error);
    return false;
  }
}

// ── Record cash collected (when staff physically receives cash) ──────────────
export async function recordCashCollected(transactionId, amount) {
  try {
    const analyticsRef = await ensureAnalyticsDocument();
    const txnRef = doc(db, 'transactions', transactionId);
    
    // Get current analytics to check pending amount
    const analyticsSnap = await getDoc(analyticsRef);
    const currentData = analyticsSnap.data();
    const currentPending = currentData?.pendingCashRevenue || 0;
    
    // Only update pendingCashRevenue if there is a positive pending amount
    // For cash-on-delivery, pendingCashRevenue might be 0, so we don't decrement
    const updateData = {
      collectedCashRevenue: increment(amount),
      totalRevenue: increment(amount),
      lastUpdated: serverTimestamp(),
    };
    
    // Only decrement pending if there is pending cash to decrement
    if (currentPending > 0 && amount <= currentPending) {
      updateData.pendingCashRevenue = increment(-amount);
    } else if (currentPending > 0 && amount > currentPending) {
      // If collecting more than pending, set pending to 0
      updateData.pendingCashRevenue = increment(-currentPending);
    }
    // If currentPending is 0, don't modify pendingCashRevenue at all
    
    await updateDoc(analyticsRef, updateData);
    
    await addDoc(collection(db, 'transactions', transactionId, 'revenueEvents'), {
      type: 'cash_collected',
      amount: amount,
      timestamp: serverTimestamp(),
      collectedBy: 'staff',
    });
    
    await updateDoc(txnRef, {
      cashCollected: true,
      cashCollectedAt: serverTimestamp(),
    });
    
    console.log(`✅ Recorded cash collected: R${amount} for tx ${transactionId}`);
    return true;
  } catch (error) {
    console.error('Failed to record cash collected:', error);
    return false;
  }
}

// ── Record seller payout ────────────────────────────────────────────────────
export async function recordSellerPayout(transactionId, amount, sellerId) {
  try {
    const analyticsRef = await ensureAnalyticsDocument();
    
    await updateDoc(analyticsRef, {
      totalPayouts: increment(amount),
      availableBalance: increment(-amount),
      lastUpdated: serverTimestamp(),
    });
    
    const txnRef = doc(db, 'transactions', transactionId);
    await addDoc(collection(db, 'transactions', transactionId, 'revenueEvents'), {
      type: 'seller_payout',
      amount: amount,
      sellerId: sellerId,
      timestamp: serverTimestamp(),
    });
    
    await updateDoc(txnRef, {
      sellerPaid: true,
      sellerPaidAt: serverTimestamp(),
    });
    
    console.log(`✅ Recorded seller payout: R${amount} for tx ${transactionId}`);
    return true;
  } catch (error) {
    console.error('Failed to record seller payout:', error);
    return false;
  }
}

// ── Record refund ───────────────────────────────────────────────────────────
export async function recordRefund(transactionId, amount, reason) {
  try {
    const analyticsRef = await ensureAnalyticsDocument();
    
    await updateDoc(analyticsRef, {
      totalRevenue: increment(-amount),
      totalRefunds: increment(amount),
      lastUpdated: serverTimestamp(),
    });
    
    const txnRef = doc(db, 'transactions', transactionId);
    await addDoc(collection(db, 'transactions', transactionId, 'revenueEvents'), {
      type: 'refund_issued',
      amount: amount,
      reason: reason,
      timestamp: serverTimestamp(),
    });
    
    await updateDoc(txnRef, {
      refunded: true,
      refundAmount: amount,
      refundReason: reason,
      refundedAt: serverTimestamp(),
    });
    
    console.log(`✅ Recorded refund: R${amount} for tx ${transactionId} (${reason})`);
    return true;
  } catch (error) {
    console.error('Failed to record refund:', error);
    return false;
  }
}

// ── Get current analytics summary (AUTO-CREATES document if missing) ────────
export async function getRevenueAnalytics() {
  try {
    const analyticsRef = getAnalyticsRef();
    const snap = await getDoc(analyticsRef);
    
    if (!snap.exists()) {
      await setDoc(analyticsRef, {
        totalRevenue: 0,
        onlineRevenue: 0,
        pendingCashRevenue: 0,
        collectedCashRevenue: 0,
        totalPayouts: 0,
        totalRefunds: 0,
        availableBalance: 0,
        createdAt: serverTimestamp(),
        lastUpdated: serverTimestamp(),
      });
      return {
        totalRevenue: 0,
        onlineRevenue: 0,
        pendingCashRevenue: 0,
        collectedCashRevenue: 0,
        totalPayouts: 0,
        totalRefunds: 0,
        availableBalance: 0,
      };
    }
    
    return snap.data();
  } catch (error) {
    console.error('Failed to get revenue analytics:', error);
    return null;
  }
}