import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import NavBar from './NavBarTemp';
import styles from './Payment.module.css';

export default function PaymentSuccess() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const txId = searchParams.get('tx');
  const sessionId = searchParams.get('session_id');

  const [message, setMessage] = useState(
    'Your Stripe payment was completed successfully.'
  );
  const [confirmed, setConfirmed] = useState(Boolean(sessionId));
  const [txStatus, setTxStatus] = useState('');
  const [cashAmount, setCashAmount] = useState(0);

  useEffect(() => {
    /**
     * Stripe only redirects to this page after successful checkout.
     * So we show success immediately if session_id exists.
     * Firestore/webhook may update a few seconds later.
     */
    if (!txId) {
      if (sessionId) {
        setConfirmed(true);
        setMessage('Payment successful. Your transaction will update shortly.');
      } else {
        setConfirmed(false);
        setMessage('Payment success page opened, but no transaction ID was provided.');
      }

      return;
    }

    const unsub = onSnapshot(doc(db, 'transactions', txId), (snap) => {
      if (!snap.exists()) {
        if (sessionId) {
          setConfirmed(true);
          setMessage('Payment successful. Your transaction will update shortly.');
        } else {
          setConfirmed(false);
          setMessage('Transaction not found.');
        }

        return;
      }

      const tx = snap.data();

      setTxStatus(tx.status || '');
      setCashAmount(Number(tx.cashAmount || 0));

      if (tx.paymentProvider === 'stripe' && tx.paymentStatus === 'paid') {
        setConfirmed(true);

        if (Number(tx.cashAmount || 0) > 0) {
          setMessage(
            `Payment successful. R ${Number(tx.cashAmount).toLocaleString(
              'en-ZA'
            )} cash is still due at drop-off.`
          );
        } else {
          setMessage(
            'Payment successful. Your transaction is now waiting for collection.'
          );
        }

        return;
      }

      if (tx.status === 'waiting') {
        setConfirmed(true);
        setMessage(
          'Payment successful. Your transaction is now waiting for collection.'
        );
        return;
      }

      if (sessionId) {
        setConfirmed(true);
        setMessage(
          'Payment successful. Your transaction will update shortly in My Purchases.'
        );
        return;
      }

      setConfirmed(false);
      setMessage('Payment could not be confirmed. Please check My Purchases.');
    });

    return () => unsub();
  }, [txId, sessionId]);

  return (
    <>
      <NavBar />

      <div className={styles.page}>
        <div className={styles.container}>
          <div className={styles.successCard}>
            <div className={styles.successIconWrap}>
              <i
                className={
                  confirmed ? 'fas fa-check' : 'fas fa-spinner fa-spin'
                }
              />
            </div>

            <h2>{confirmed ? 'Payment successful!' : 'Checking payment...'}</h2>

            <p className={styles.successSub}>{message}</p>

            {sessionId && (
              <div className={styles.refTag}>
                <i className="fas fa-receipt" /> Stripe Session: {sessionId}
              </div>
            )}

            {cashAmount > 0 && (
              <div className={styles.cashReminderBox}>
                <i className="fas fa-coins" />
                <div>
                  <p className={styles.cashReminderTitle}>
                    Cash still due at drop-off
                  </p>
                  <p className={styles.cashReminderAmt}>
                    R {cashAmount.toLocaleString('en-ZA')}
                  </p>
                </div>
              </div>
            )}

            {txStatus && (
              <div className={styles.cashReminderBox}>
                <i className="fas fa-circle-info" />
                <div>
                  <p className={styles.cashReminderTitle}>
                    Transaction status
                  </p>
                  <p
                    className={styles.cashReminderAmt}
                    style={{ fontSize: '0.85rem', fontWeight: 600 }}
                  >
                    {txStatus.replaceAll('_', ' ')}
                  </p>
                </div>
              </div>
            )}

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