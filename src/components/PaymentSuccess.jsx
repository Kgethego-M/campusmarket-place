import { useEffect, useState, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import NavBar from './NavBarTemp';
import styles from './Payment.module.css';

export default function PaymentSuccess() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const txId      = searchParams.get('tx');
  const sessionId = searchParams.get('session_id');

  const [confirmed, setConfirmed]   = useState(false);
  const [message, setMessage]       = useState('Verifying your payment...');
  const [txStatus, setTxStatus]     = useState('');
  const [cashAmount, setCashAmount] = useState(0);
  const [verifyError, setVerifyError] = useState('');

  // Prevent calling verify-session more than once
  const hasVerified = useRef(false);

  // ── Step 1: Call backend to verify Stripe session and update Firestore ───────
  useEffect(() => {
    if (!sessionId || !txId || hasVerified.current) return;
    hasVerified.current = true;

    const verify = async () => {
      try {
        const res = await fetch(
          `${import.meta.env.VITE_API_URL}/api/stripe/verify-session`,
          {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ sessionId, transactionId: txId }),
          }
        );

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          console.error('[PaymentSuccess] verify-session failed:', err);
          // Don't block the UI — Firestore listener below will still catch
          // if the webhook fired separately
          setVerifyError('Could not auto-confirm. Check My Purchases in a moment.');
          return;
        }

        const data = await res.json();
        if (!data.paid) {
          setVerifyError('Payment not confirmed by Stripe. Please contact support.');
        }
        // If paid, the Firestore listener below will pick up the update
        // and set confirmed = true automatically

      } catch (e) {
        console.error('[PaymentSuccess] verify-session error:', e);
        setVerifyError('Network error during verification. Check My Purchases.');
      }
    };

    verify();
  }, [sessionId, txId]);

  // ── Step 2: Listen to Firestore for the status update ────────────────────────
  useEffect(() => {
    if (!txId) {
      // No txId but session_id exists — Stripe payment happened, just no tx ref
      if (sessionId) {
        setConfirmed(true);
        setMessage('Payment successful. Your transaction will update shortly in My Purchases.');
      } else {
        setConfirmed(false);
        setMessage('No transaction ID provided.');
      }
      return;
    }

    const unsub = onSnapshot(doc(db, 'transactions', txId), (snap) => {
      if (!snap.exists()) {
        if (sessionId) {
          setConfirmed(true);
          setMessage('Payment successful. Your transaction will update shortly.');
        } else {
          setMessage('Transaction not found.');
        }
        return;
      }

      const tx = snap.data();
      setTxStatus(tx.status || '');
      setCashAmount(Number(tx.cashAmount || 0));

      // Fully confirmed — webhook or verify-session updated Firestore
      if (tx.paymentProvider === 'stripe' && tx.paymentStatus === 'paid') {
        setConfirmed(true);
        setMessage(
          Number(tx.cashAmount || 0) > 0
            ? `Payment received! R ${Number(tx.cashAmount).toLocaleString('en-ZA')} cash is still due at drop-off.`
            : 'Payment received! Your transaction is now waiting for collection.'
        );
        return;
      }

      if (tx.status === 'waiting') {
        setConfirmed(true);
        setMessage('Payment received! Your transaction is now waiting for collection.');
        return;
      }

      // Stripe redirected here so payment definitely happened — show optimistic success
      // while Firestore catches up
      if (sessionId) {
        setConfirmed(true);
        setMessage('Payment successful. Your transaction will update shortly in My Purchases.');
      }
    });

    return () => unsub();
  }, [txId, sessionId]);

  return (
    <>
      <NavBar />
      <div className={styles.page}>
        <div className={styles.container}>
          <div className={styles.successCard}>

            {/* Icon */}
            <div className={styles.successIconWrap}>
              <i className={confirmed ? 'fas fa-check' : 'fas fa-spinner fa-spin'} />
            </div>

            {/* Title */}
            <h2>{confirmed ? 'Payment successful!' : 'Verifying payment...'}</h2>

            {/* Message */}
            <p className={styles.successSub}>{message}</p>

            {/* Error (non-blocking) */}
            {verifyError && !confirmed && (
              <div className={styles.errorMsg}>
                <i className="fas fa-circle-exclamation" /> {verifyError}
              </div>
            )}

            {/* Stripe session ref */}
            {sessionId && (
              <div className={styles.refTag}>
                <i className="fas fa-receipt" /> Stripe Session: {sessionId}
              </div>
            )}

            {/* Cash still due */}
            {cashAmount > 0 && (
              <div className={styles.cashReminderBox}>
                <i className="fas fa-coins" />
                <div>
                  <p className={styles.cashReminderTitle}>Cash still due at drop-off</p>
                  <p className={styles.cashReminderAmt}>
                    R {cashAmount.toLocaleString('en-ZA')}
                  </p>
                </div>
              </div>
            )}

            {/* Transaction status badge */}
            {txStatus && (
              <div className={styles.cashReminderBox}>
                <i className="fas fa-circle-info" />
                <div>
                  <p className={styles.cashReminderTitle}>Transaction status</p>
                  <p className={styles.cashReminderAmt}
                     style={{ fontSize: '0.85rem', fontWeight: 600 }}>
                    {txStatus.replaceAll('_', ' ')}
                  </p>
                </div>
              </div>
            )}

            {/* Actions */}
            <div className={styles.successActions}>
              <button
                className={styles.primaryBtn}
                onClick={() => navigate('/my-purchases')}
              >
                View my purchases
              </button>
              {txId && (
                <button
                  className={styles.ghostBtn}
                  onClick={() => navigate(`/payment/${txId}`)}
                >
                  Back to payment
                </button>
              )}
            </div>

          </div>
        </div>
      </div>
    </>
  );
}