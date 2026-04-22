import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from '../firebase';
import NavBar from './NavBarTemp';
import {
  getOnlineAmount,
  getCashAmount,
  updateTransactionStatus,
  loadPaystackSDK,
  openPaystackPopup,
  generateRef,
  PAYMENT_LABELS,
} from '../utils/payment.utils';
import styles from './Payment.module.css';

// ─── Paystack public key ──────────────────────────────────────────────────────
// Replace with your actual test key or pull from env:
// const PAYSTACK_PUBLIC_KEY = import.meta.env.VITE_PAYSTACK_PUBLIC_KEY;
const PAYSTACK_PUBLIC_KEY = import.meta.env.VITE_PAYSTACK_PUBLIC_KEY;

// ─── Component ────────────────────────────────────────────────────────────────
export default function Payment() {
  const { txId } = useParams();
  const navigate = useNavigate();

  const [currentUser, setCurrentUser]   = useState(null);
  const [tx, setTx]                     = useState(null);
  const [listing, setListing]           = useState(null);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState('');
  const [processing, setProcessing]     = useState(false);
  const [step, setStep]                 = useState('summary'); // 'summary' | 'success' | 'cash_waiting'
  const [paystackRef, setPaystackRef]   = useState('');
  const [sdkReady, setSdkReady]         = useState(false);
  const [cashConfirmed, setCashConfirmed] = useState(false);
  const [sellerName, setSellerName]       = useState('');

  // ── Auth ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    return onAuthStateChanged(auth, (user) => {
      if (!user) { navigate('/login'); return; }
      setCurrentUser(user);
    });
  }, [navigate]);

  // ── Load SDK ────────────────────────────────────────────────────────────────
  useEffect(() => {
    loadPaystackSDK()
      .then(() => setSdkReady(true))
      .catch(() => setError('Could not load payment SDK. Check your connection.'));
  }, []);

  // ── Load transaction (real-time) ────────────────────────────────────────────
  useEffect(() => {
    if (!txId) return;

    const unsub = onSnapshot(doc(db, 'transactions', txId), async (snap) => {
      if (!snap.exists()) { setError('Transaction not found.'); setLoading(false); return; }

      const data = { id: snap.id, ...snap.data() };
      setTx(data);

      // Load listing details
      if (data.listingId) {
        try {
          const ls = await getDoc(doc(db, 'listings', data.listingId));
          if (ls.exists()) setListing(ls.data());
        } catch (_) {}
      }

      // Load seller name
      const existingName = data.sellerName;
      if (existingName) {
        setSellerName(existingName);
      } else if (data.sellerId) {
        try {
          const us = await getDoc(doc(db, 'users', data.sellerId));
          if (us.exists()) {
            const ud = us.data();
            setSellerName(`${ud.firstName || ''} ${ud.lastName || ''}`.trim() || ud.email || '');
          }
        } catch (_) {}
      }

      setLoading(false);
    });

    return () => unsub();
  }, [txId]);

  // ── Handle cash (no online payment needed) ──────────────────────────────────
  const handleCashPayment = useCallback(async () => {
    if (!tx) return;
    setProcessing(true);
    setError('');
    try {
      await updateTransactionStatus(tx.id, 'waiting', { paymentSettled: false });
      setStep('cash_waiting');
    } catch (e) {
      setError('Something went wrong. Please try again.');
    } finally {
      setProcessing(false);
    }
  }, [tx]);

  // ── Handle online payment ───────────────────────────────────────────────────
  const handleOnlinePayment = useCallback(async () => {
    if (!tx || !currentUser || !sdkReady) return;
    setProcessing(true);
    setError('');

    const onlineAmount = getOnlineAmount(tx);
    if (onlineAmount <= 0) { setError('No online payment amount found.'); setProcessing(false); return; }

    const ref = generateRef(tx.id);

    try {
      const response = await openPaystackPopup({
        publicKey: PAYSTACK_PUBLIC_KEY,
        email:     currentUser.email,
        amountRand: onlineAmount,
        ref,
        metadata: {
          custom_fields: [
            { display_name: 'Item',           variable_name: 'item',    value: tx.listingTitle || listing?.title || 'Campus Item' },
            { display_name: 'Transaction ID', variable_name: 'tx_id',   value: tx.id },
            { display_name: 'Buyer',          variable_name: 'buyer',   value: currentUser.displayName || currentUser.email },
          ],
        },
      });

      // Payment successful — update Firestore
      await updateTransactionStatus(tx.id, 'waiting', {
        paystackRef:    response.reference,
        onlinePaid:     onlineAmount,
        paymentSettled: getCashAmount(tx) === 0, // fully settled if no cash remaining
      });

      setPaystackRef(response.reference);
      setStep('success');

    } catch (e) {
      if (e?.cancelled) {
        setError('Payment was cancelled. You can try again.');
      } else {
        setError('Payment failed. Please try again.');
      }
    } finally {
      setProcessing(false);
    }
  }, [tx, currentUser, sdkReady, listing]);

  // ── Derived values ──────────────────────────────────────────────────────────
  const paymentType  = tx ? (tx.paymentType || tx.paymentMethod || 'cash') : null;
  const onlineAmount = tx ? getOnlineAmount(tx) : 0;
  const cashAmount   = tx ? getCashAmount(tx) : 0;
  const totalAmount  = tx ? Number(tx.agreedPrice ?? tx.listingPrice ?? 0) : 0;
  const isCashOnly   = paymentType === 'cash' || paymentType === 'cod';
  const isPartial    = paymentType === 'partial';
  const itemImage    = listing?.photos?.[0] || listing?.imageUrl || null;
  const itemTitle    = tx?.listingTitle || listing?.title || 'Campus Item';

  // ── Guards ──────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <>
        <NavBar />
        <div className={styles.page}>
          <div className={styles.loadingState}>
            <i className="fas fa-spinner fa-spin" />
            <p>Loading payment details...</p>
          </div>
        </div>
      </>
    );
  }

  if (error && !tx) {
    return (
      <>
        <NavBar />
        <div className={styles.page}>
          <div className={styles.errorState}>
            <i className="fas fa-circle-exclamation" />
            <p>{error}</p>
            <button className={styles.backBtn} onClick={() => navigate(-1)}>Go back</button>
          </div>
        </div>
      </>
    );
  }

  if (tx && tx.status !== 'accepted') {
    return (
      <>
        <NavBar />
        <div className={styles.page}>
          <div className={styles.container}>
            <div className={styles.alreadyProcessed}>
              <i className="fas fa-info-circle" />
              <p>This transaction has already been processed (status: <strong>{tx.status}</strong>).</p>
              <button className={styles.backBtn} onClick={() => navigate('/my-purchases')}>Back to purchases</button>
            </div>
          </div>
        </div>
      </>
    );
  }

  // ── Success screen ──────────────────────────────────────────────────────────
  if (step === 'success') {
    return (
      <>
        <NavBar />
        <div className={styles.page}>
          <div className={styles.container}>
            <div className={styles.successCard}>
              <div className={styles.successIconWrap}>
                <i className="fas fa-check" />
              </div>
              <h2>Payment received!</h2>
              <p className={styles.successSub}>
                Your online payment of <strong>R {onlineAmount.toLocaleString('en-ZA')}</strong> has been processed
                and is held in escrow until you collect your item.
              </p>
              {paystackRef && (
                <div className={styles.refTag}>
                  <i className="fas fa-receipt" /> Ref: {paystackRef}
                </div>
              )}
              {cashAmount > 0 && (
                <div className={styles.cashReminderBox}>
                  <i className="fas fa-coins" />
                  <div>
                    <p className={styles.cashReminderTitle}>Cash still due at drop-off</p>
                    <p className={styles.cashReminderAmt}>R {cashAmount.toLocaleString('en-ZA')}</p>
                  </div>
                </div>
              )}
              <div className={styles.successActions}>
                <button className={styles.primaryBtn} onClick={() => navigate('/my-purchases')}>
                  View my purchases
                </button>
                <button className={styles.ghostBtn} onClick={() => navigate(`/listing/${tx.listingId}`)}>
                  View listing
                </button>
              </div>
            </div>
          </div>
        </div>
      </>
    );
  }

  // ── Cash waiting screen ─────────────────────────────────────────────────────
  if (step === 'cash_waiting') {
    return (
      <>
        <NavBar />
        <div className={styles.page}>
          <div className={styles.container}>
            <div className={styles.successCard}>
              <div className={styles.waitingIconWrap}>
                <i className="fas fa-handshake" />
              </div>
              <h2>You're confirmed!</h2>
              <p className={styles.successSub}>
                Your transaction is now marked as <strong>waiting</strong>. Bring
                <strong> R {cashAmount.toLocaleString('en-ZA')}</strong> in cash to the drop-off point to collect your item.
              </p>
              <div className={styles.cashReminderBox}>
                <i className="fas fa-map-marker-alt" />
                <div>
                  <p className={styles.cashReminderTitle}>Arrange drop-off with the seller</p>
                  <p className={styles.cashReminderAmt} style={{ fontSize: '0.8rem', fontWeight: 500 }}>
                    Payment is settled in person — funds release once both parties confirm.
                  </p>
                </div>
              </div>
              <div className={styles.successActions}>
                <button className={styles.primaryBtn} onClick={() => navigate('/my-purchases')}>
                  View my purchases
                </button>
              </div>
            </div>
          </div>
        </div>
      </>
    );
  }

  // ── Main payment summary ────────────────────────────────────────────────────
  return (
    <>
      <NavBar />
      <div className={styles.page}>
        <div className={styles.container}>

          {/* Header */}
          <div className={styles.header}>
            <button className={styles.backBtn} onClick={() => navigate(-1)}>
              <i className="fas fa-arrow-left" /> Back
            </button>
            <div>
              <h1 className={styles.pageTitle}>Complete Payment</h1>
              <p className={styles.pageSub}>Review your order and confirm payment</p>
            </div>
          </div>

          <div className={styles.layout}>

            {/* ── Left: Order Summary ── */}
            <div className={styles.summaryCol}>

              <div className={styles.card}>
                <p className={styles.cardLabel}>Item</p>
                <div className={styles.itemRow}>
                  <div className={styles.itemImg}>
                    {itemImage
                      ? <img src={itemImage} alt={itemTitle} />
                      : <i className="fas fa-image" />
                    }
                  </div>
                  <div className={styles.itemInfo}>
                    <p className={styles.itemTitle}>{itemTitle}</p>
                    <p className={styles.itemSeller}>
                      <i className="fas fa-user" /> {sellerName || tx.sellerName || 'Unknown Seller'}
                    </p>
                    <span className={styles.payTypeBadge}>
                      {PAYMENT_LABELS[paymentType] || paymentType}
                    </span>
                  </div>
                </div>
              </div>

              <div className={styles.card}>
                <p className={styles.cardLabel}>Payment breakdown</p>
                <div className={styles.breakdownRow}>
                  <span>Agreed price</span>
                  <span>R {totalAmount.toLocaleString('en-ZA')}</span>
                </div>
                {isPartial && (
                  <>
                    <div className={styles.breakdownRow}>
                      <span className={styles.breakdownOnline}>
                        <i className="fas fa-credit-card" /> Online now
                      </span>
                      <span className={styles.breakdownOnlineAmt}>R {onlineAmount.toLocaleString('en-ZA')}</span>
                    </div>
                    <div className={styles.breakdownRow}>
                      <span className={styles.breakdownCash}>
                        <i className="fas fa-coins" /> Cash at drop-off
                      </span>
                      <span className={styles.breakdownCashAmt}>R {cashAmount.toLocaleString('en-ZA')}</span>
                    </div>
                  </>
                )}
                <div className={styles.breakdownDivider} />
                <div className={`${styles.breakdownRow} ${styles.breakdownTotal}`}>
                  <span>Total</span>
                  <span>R {totalAmount.toLocaleString('en-ZA')}</span>
                </div>
              </div>

              {/* Drop-off note */}
              {cashAmount > 0 && (
                <div className={styles.infoBox}>
                  <i className="fas fa-circle-info" />
                  <p>
                    {isCashOnly
                      ? 'This is a cash-on-delivery transaction. Your status will move to waiting once you confirm below — pay the seller in person at the drop-off point.'
                      : `R ${cashAmount.toLocaleString('en-ZA')} cash is due at drop-off. The item will only be released once all payments are settled.`
                    }
                  </p>
                </div>
              )}
            </div>

            {/* ── Right: Action Panel ── */}
            <div className={styles.actionCol}>
              <div className={styles.card}>
                <p className={styles.cardLabel}>
                  {isCashOnly ? 'Confirm & proceed' : 'Pay online'}
                </p>

                {!isCashOnly && (
                  <>
                    <div className={styles.testCardBox}>
                      <p className={styles.testCardTitle}>
                        <i className="fas fa-flask" /> Test card
                      </p>
                      <code>4084 0840 8408 4081</code>
                      <code>Exp: 01/99 · CVV: 408 · PIN: 0000 · OTP: 123456</code>
                    </div>

                    <div className={styles.amountDisplay}>
                      <span className={styles.amountLabel}>
                        {isPartial ? 'Online portion' : 'Amount due'}
                      </span>
                      <span className={styles.amountValue}>
                        R {onlineAmount.toLocaleString('en-ZA')}
                      </span>
                    </div>
                  </>
                )}

                {isCashOnly && (
                  <div className={styles.amountDisplay}>
                    <span className={styles.amountLabel}>Cash to bring</span>
                    <span className={styles.amountValue}>
                      R {cashAmount.toLocaleString('en-ZA')}
                    </span>
                  </div>
                )}

                {error && (
                  <div className={styles.errorMsg}>
                    <i className="fas fa-circle-exclamation" /> {error}
                  </div>
                )}

                {isCashOnly ? (
                  <>
                    <label className={styles.confirmCheck}>
                      <input
                        type="checkbox"
                        checked={cashConfirmed}
                        onChange={e => setCashConfirmed(e.target.checked)}
                      />
                      <span>
                        I confirm I have seen and verified the amount of{' '}
                        <strong>R {cashAmount.toLocaleString('en-ZA')}</strong> and will bring this cash to the drop-off point.
                      </span>
                    </label>
                    <button
                      className={styles.primaryBtn}
                      onClick={handleCashPayment}
                      disabled={processing || !cashConfirmed}
                    >
                      {processing
                        ? <><i className="fas fa-spinner fa-spin" /> Processing...</>
                        : <><i className="fas fa-check" /> Confirm &amp; mark as waiting</>
                      }
                    </button>
                  </>
                ) : (
                  <button
                    className={styles.paystackBtn}
                    onClick={handleOnlinePayment}
                    disabled={processing || !sdkReady}
                  >
                    {processing
                      ? <><i className="fas fa-spinner fa-spin" /> Opening Paystack...</>
                      : !sdkReady
                        ? <><i className="fas fa-spinner fa-spin" /> Loading SDK...</>
                        : <><i className="fas fa-lock" /> Pay R {onlineAmount.toLocaleString('en-ZA')} via Paystack</>
                    }
                  </button>
                )}

                <p className={styles.secureNote}>
                  <i className="fas fa-shield-halved" />
                  {isCashOnly
                    ? 'Your transaction is tracked and protected by Campus Marketplace.'
                    : 'Payments are processed securely by Paystack. Funds are held in escrow until collection is confirmed.'
                  }
                </p>
              </div>
            </div>

          </div>
        </div>
      </div>
    </>
  );
}