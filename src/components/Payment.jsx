import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { doc, getDoc, onSnapshot, collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { doc, getDoc, onSnapshot, collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from '../firebase';
import NavBar from './NavBarTemp';
import {
  getOnlineAmount,
  getCashAmount,
  updateTransactionStatus,
  redirectToStripeCheckout,
  PAYMENT_LABELS,
} from '../utils/payment.utils';
import styles from './Payment.module.css';

// ─── Helper: notify seller ────────────────────────────────────────────────────
async function notifySellerPaymentConfirmed({ sellerId, buyerName, listingId, listingTitle, transactionId }) {
  try {
    await addDoc(collection(db, 'notifications'), {
      userId:        sellerId,
      type:          'buyer_paid',
      read:          false,
      buyerName,
      listingId,
      listingTitle:  listingTitle || 'your item',
      transactionId,
      createdAt:     serverTimestamp(),
    });
  } catch (err) {
    console.error('[Payment] Failed to create seller notification:', err);
  }
}

export default function Payment() {
  const { txId } = useParams();
  const navigate = useNavigate();

  const [currentUser, setCurrentUser]     = useState(null);
  const [tx, setTx]                       = useState(null);
  const [listing, setListing]             = useState(null);
  const [loading, setLoading]             = useState(true);
  const [error, setError]                 = useState('');
  const [processing, setProcessing]       = useState(false);
  const [step, setStep]                   = useState('summary'); // 'summary' | 'redirecting' | 'success' | 'cash_waiting'
  const [stripeRef, setStripeRef]         = useState('');
  const [cashConfirmed, setCashConfirmed] = useState(false);
  const [sellerName, setSellerName]       = useState('');

  // ── Auth ──────────────────────────────────────────────────────────────────────
  useEffect(() => {
    return onAuthStateChanged(auth, (user) => {
      if (!user) { navigate('/login'); return; }
      setCurrentUser(user);
    });
  }, [navigate]);

  // ── Load transaction (real-time) ──────────────────────────────────────────────
  useEffect(() => {
    if (!txId) return;
    const unsub = onSnapshot(doc(db, 'transactions', txId), async (snap) => {
      if (!snap.exists()) { setError('Transaction not found.'); setLoading(false); return; }
      const data = { id: snap.id, ...snap.data() };
      setTx(data);

      if (data.listingId) {
        try {
          const ls = await getDoc(doc(db, 'listings', data.listingId));
          if (ls.exists()) setListing(ls.data());
        } catch (_) {}
      }

      if (data.sellerName) {
        setSellerName(data.sellerName);
      if (data.sellerName) {
        setSellerName(data.sellerName);
      } else if (data.sellerId) {
        try {
          const us = await getDoc(doc(db, 'users', data.sellerId));
          if (us.exists()) {
            const ud = us.data();
            setSellerName(`${ud.firstName || ''} ${ud.lastName || ''}`.trim() || ud.email || '');
          }
        } catch (_) {}
      }

      // Persist cash_waiting screen if Firestore re-fires
      if (
        data.status === 'waiting' &&
        data.paymentProvider === 'cash' &&
        data.paymentStatus === 'cash_pending'
      ) {
        setStep('cash_waiting');
      }

      // Persist success screen if Firestore re-fires after Stripe webhook
      if (
        data.status === 'waiting' &&
        data.paymentProvider === 'stripe' &&
        data.paymentStatus === 'paid'
      ) {
        setStripeRef(
          data.stripeRef ||
          data.stripeCheckoutSessionId ||
          data.stripePaymentIntentId ||
          ''
        );
        setStep('success');
      }

      setLoading(false);
    });
    return () => unsub();
  }, [txId]);

  // ── Cash payment ──────────────────────────────────────────────────────────────
  const handleCashPayment = useCallback(async () => {
    if (!tx || !currentUser) return;
    setProcessing(true);
    setError('');
    try {
      await updateTransactionStatus(tx.id, 'waiting', {
        paymentProvider: 'cash',
        paymentStatus:   'cash_pending',
        paymentSettled:  false,
        onlineAmount:    0,
        cashAmount:      getCashAmount(tx),
      });
      await notifySellerPaymentConfirmed({
        sellerId:      tx.sellerId,
        buyerName:     currentUser.displayName || currentUser.email || 'The buyer',
        listingId:     tx.listingId,
        listingTitle:  tx.listingTitle || listing?.title || 'your item',
        transactionId: tx.id,
      });
      setStep('cash_waiting');
    } catch (e) {
      console.error(e);
      setError('Something went wrong. Please try again.');
    } finally {
      setProcessing(false);
    }
  }, [tx, currentUser, listing]);
  }, [tx, currentUser, listing]);

  // ── Stripe: user clicks button, THEN redirects ────────────────────────────────
  const handleOnlinePayment = useCallback(async () => {
    if (!tx || !currentUser) return;
    setProcessing(true);
    setStep('redirecting');
    setError('');

    const onlineAmount = getOnlineAmount(tx);
    if (onlineAmount <= 0) {
      setError('No online payment amount found.');
      setProcessing(false);
      setStep('summary');
      return;
    }

    try {
      await redirectToStripeCheckout({
        tx: {
          ...tx,
          listingTitle: tx.listingTitle || listing?.title || 'Campus Item',
        },
        buyerEmail:       currentUser.email,
        createSessionUrl: '/api/stripe/create-checkout-session',
        successUrl:       `${window.location.origin}/payment-success?tx=${tx.id}`,
        cancelUrl:        `${window.location.origin}/payment-cancelled?tx=${tx.id}`,
      });
      // Browser navigates away to Stripe — nothing runs after this
    } catch (e) {
      console.error('Stripe redirect failed:', e);
      setError(e?.message || 'Could not redirect to Stripe. Please try again.');
      setProcessing(false);
      setStep('summary');
    }
  }, [tx, currentUser, listing]);

  // ── Derived values ────────────────────────────────────────────────────────────
  const paymentType  = tx ? (tx.paymentType || tx.paymentMethod || 'cash') : null;
  const onlineAmount = tx ? getOnlineAmount(tx) : 0;
  const cashAmount   = tx ? getCashAmount(tx) : 0;
  const totalAmount  = tx ? Number(tx.agreedPrice ?? tx.listingPrice ?? 0) : 0;
  const isCashOnly   = paymentType === 'cash' || paymentType === 'cod';
  const isPartial    = paymentType === 'partial';
  const itemImage    = listing?.photos?.[0] || listing?.imageUrl || null;
  const itemTitle    = tx?.listingTitle || listing?.title || 'Campus Item';

  // ── Loading ───────────────────────────────────────────────────────────────────
  if (loading) return (
    <><NavBar /><div className={styles.page}><div className={styles.loadingState}>
      <i className="fas fa-spinner fa-spin" /><p>Loading payment details...</p>
    </div></div></>
  );

  // ── Missing transaction ───────────────────────────────────────────────────────
  if (error && !tx) return (
    <><NavBar /><div className={styles.page}><div className={styles.errorState}>
      <i className="fas fa-circle-exclamation" /><p>{error}</p>
      <button className={styles.backBtn} onClick={() => navigate(-1)}>Go back</button>
    </div></div></>
  );

  // ── Success screen — BEFORE already-processed guard ───────────────────────────
  if (step === 'success') return (
    <>
      <NavBar />
      <div className={styles.page}><div className={styles.container}>
        <div className={styles.successCard}>
          <div className={styles.successIconWrap}><i className="fas fa-check" /></div>
          <h2>Payment received!</h2>
          <p className={styles.successSub}>
            Your payment of <strong>R {onlineAmount.toLocaleString('en-ZA')}</strong> has been processed.
            Your transaction is now <strong>waiting for collection</strong>.
          </p>
          {stripeRef && (
            <div className={styles.refTag}><i className="fas fa-receipt" /> Stripe Ref: {stripeRef}</div>
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
            <button className={styles.primaryBtn} onClick={() => navigate('/my-purchases')}>View my purchases</button>
            {tx?.listingId && (
              <button className={styles.ghostBtn} onClick={() => navigate(`/listing/${tx.listingId}`)}>View listing</button>
            )}
          </div>
        </div>
      </div></div>
    </>
  );
      </div></div>
    </>
  );

  // ── Cash waiting screen — BEFORE already-processed guard ─────────────────────
  if (step === 'cash_waiting') return (
    <>
      <NavBar />
      <div className={styles.page}><div className={styles.container}>
        <div className={styles.successCard}>
          <div className={styles.waitingIconWrap}><i className="fas fa-handshake" /></div>
          <h2>You're confirmed!</h2>
          <p className={styles.successSub}>
            Your transaction is now marked as <strong>waiting</strong>. Bring{' '}
            <strong>R {cashAmount.toLocaleString('en-ZA')}</strong> in cash to the drop-off point.
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
            <button className={styles.primaryBtn} onClick={() => navigate('/my-purchases')}>View my purchases</button>
          </div>
        </div>
      </div></div>
    </>
  );

  // ── Redirecting to Stripe screen ──────────────────────────────────────────────
  if (step === 'redirecting') return (
    <>
      <NavBar />
      <div className={styles.page}><div className={styles.container}>
        <div className={styles.successCard}>
          <div className={styles.successIconWrap}><i className="fas fa-spinner fa-spin" /></div>
          <h2>Redirecting to Stripe...</h2>
          <p className={styles.successSub}>Please wait while we open the secure payment page.</p>
          {error && (
            <>
              <div className={styles.errorMsg}><i className="fas fa-circle-exclamation" /> {error}</div>
              <div className={styles.successActions}>
                <button className={styles.primaryBtn} onClick={handleOnlinePayment} disabled={processing}>
                  <i className="fas fa-rotate-right" /> Try again
                </button>
                <button className={styles.ghostBtn} onClick={() => navigate('/my-purchases')}>
                  Back to purchases
                </button>
              </div>
            </>
          )}
        </div>
      </div></div>
    </>
  );
      </div></div>
    </>
  );

  // ── Already processed guard — AFTER all step screens ─────────────────────────
  if (tx && tx.status !== 'accepted' && tx.status !== 'pending_payment') return (
    <><NavBar /><div className={styles.page}><div className={styles.container}>
      <div className={styles.alreadyProcessed}>
        <i className="fas fa-info-circle" />
        <p>This transaction has already been processed (status: <strong>{tx.status}</strong>).</p>
        <button className={styles.backBtn} onClick={() => navigate('/my-purchases')}>Back to purchases</button>
      </div>
    </div></div></>
  );

  // ── Main summary page (cash + online) ────────────────────────────────────────
  return (
    <>
      <NavBar />
      <div className={styles.page}>
        <div className={styles.container}>
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
            {/* ── Left: item + breakdown ── */}
            <div className={styles.summaryCol}>
              <div className={styles.card}>
                <p className={styles.cardLabel}>Item</p>
                <div className={styles.itemRow}>
                  <div className={styles.itemImg}>
                    {itemImage ? <img src={itemImage} alt={itemTitle} /> : <i className="fas fa-image" />}
                    {itemImage ? <img src={itemImage} alt={itemTitle} /> : <i className="fas fa-image" />}
                  </div>
                  <div className={styles.itemInfo}>
                    <p className={styles.itemTitle}>{itemTitle}</p>
                    <p className={styles.itemSeller}>
                      <i className="fas fa-user" /> {sellerName || tx.sellerName || 'Unknown Seller'}
                    </p>
                    <span className={styles.payTypeBadge}>{PAYMENT_LABELS[paymentType] || paymentType}</span>
                  </div>
                </div>
              </div>

              <div className={styles.card}>
                <p className={styles.cardLabel}>Payment breakdown</p>
                <div className={styles.breakdownRow}>
                  <span>Agreed price</span><span>R {totalAmount.toLocaleString('en-ZA')}</span>
                </div>
                {isPartial && (
                  <>
                    <div className={styles.breakdownRow}>
                      <span className={styles.breakdownOnline}><i className="fas fa-credit-card" /> Online now</span>
                      <span className={styles.breakdownOnline}><i className="fas fa-credit-card" /> Online now</span>
                      <span className={styles.breakdownOnlineAmt}>R {onlineAmount.toLocaleString('en-ZA')}</span>
                    </div>
                    <div className={styles.breakdownRow}>
                      <span className={styles.breakdownCash}><i className="fas fa-coins" /> Cash at drop-off</span>
                      <span className={styles.breakdownCash}><i className="fas fa-coins" /> Cash at drop-off</span>
                      <span className={styles.breakdownCashAmt}>R {cashAmount.toLocaleString('en-ZA')}</span>
                    </div>
                  </>
                )}
                <div className={styles.breakdownDivider} />
                <div className={`${styles.breakdownRow} ${styles.breakdownTotal}`}>
                  <span>Total</span><span>R {totalAmount.toLocaleString('en-ZA')}</span>
                </div>
              </div>

              {cashAmount > 0 && (
                <div className={styles.infoBox}>
                  <i className="fas fa-circle-info" />
                  <p>
                    {isCashOnly
                      ? 'This is a cash-on-delivery transaction. Your status will move to waiting once you confirm below — pay the seller in person at the drop-off point.'
                      : `R ${cashAmount.toLocaleString('en-ZA')} cash is due at drop-off. The item will only be released once all payments are settled.`}
                      : `R ${cashAmount.toLocaleString('en-ZA')} cash is due at drop-off. The item will only be released once all payments are settled.`}
                  </p>
                </div>
              )}
            </div>

            {/* ── Right: payment action ── */}
            <div className={styles.actionCol}>
              <div className={styles.card}>
                <p className={styles.cardLabel}>{isCashOnly ? 'Confirm & proceed' : 'Pay online'}</p>
                <p className={styles.cardLabel}>{isCashOnly ? 'Confirm & proceed' : 'Pay online'}</p>

                {/* Online amount display */}
                {!isCashOnly && (
                  <div className={styles.amountDisplay}>
                    <span className={styles.amountLabel}>{isPartial ? 'Online portion' : 'Amount due'}</span>
                    <span className={styles.amountValue}>R {onlineAmount.toLocaleString('en-ZA')}</span>
                  </div>
                )}

                {/* Cash amount display */}
                {isCashOnly && (
                  <div className={styles.amountDisplay}>
                    <span className={styles.amountLabel}>Cash to bring</span>
                    <span className={styles.amountValue}>R {cashAmount.toLocaleString('en-ZA')}</span>
                    <span className={styles.amountValue}>R {cashAmount.toLocaleString('en-ZA')}</span>
                  </div>
                )}

                {error && (
                  <div className={styles.errorMsg}><i className="fas fa-circle-exclamation" /> {error}</div>
                )}

                {/* Cash flow */}
                {isCashOnly ? (
                  <>
                    <label className={styles.confirmCheck}>
                      <input type="checkbox" checked={cashConfirmed} onChange={e => setCashConfirmed(e.target.checked)} />
                      <span>I confirm I have seen and verified the amount of <strong>R {cashAmount.toLocaleString('en-ZA')}</strong> and will bring this cash to the drop-off point.</span>
                    </label>
                    <button
                      className={styles.primaryBtn}
                      onClick={handleCashPayment}
                      disabled={processing || !cashConfirmed}
                    >
                      {processing
                        ? <><i className="fas fa-spinner fa-spin" /> Processing...</>
                        : <><i className="fas fa-check" /> Confirm &amp; mark as waiting</>}
                    </button>
                  </>
                ) : (
                  /* Stripe flow — user clicks button, then gets redirected */
                  <>
                    <div className={styles.stripeInfoBox}>
                      <i className="fab fa-stripe" style={{ fontSize: '1.5rem', color: '#6772e5' }} />
                      <p>You will be securely redirected to Stripe to complete your payment. No card details are stored by Campus Marketplace.</p>
                    </div>
                    <button
                      className={styles.primaryBtn}
                      onClick={handleOnlinePayment}
                      disabled={processing}
                      style={{ background: '#6772e5' }}
                    >
                      {processing
                        ? <><i className="fas fa-spinner fa-spin" /> Redirecting...</>
                        : <><i className="fas fa-lock" /> Pay R {onlineAmount.toLocaleString('en-ZA')} via Stripe</>}
                    </button>
                  </>
                )}

                <p className={styles.secureNote}>
                  <i className="fas fa-shield-halved" />
                  {isCashOnly
                    ? 'Your transaction is tracked and protected by Campus Marketplace.'
                    : 'Payments are processed securely by Stripe. Funds are held in escrow until collection is confirmed.'}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}