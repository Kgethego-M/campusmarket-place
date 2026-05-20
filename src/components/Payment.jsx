import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { doc, getDoc, onSnapshot, collection, addDoc, serverTimestamp, updateDoc } from 'firebase/firestore';
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
import { recordCashConfirmation } from '../services/revenueService';
import { notifySellerBuyerPaid } from '../services/notificationService';
import { deductBuyerWallet, getWalletBalance } from '../services/walletService';

export default function Payment() {
  const { txId } = useParams();
  const navigate = useNavigate();

  const [currentUser, setCurrentUser]         = useState(null);
  const [tx, setTx]                           = useState(null);
  const [listing, setListing]                 = useState(null);
  const [loading, setLoading]                 = useState(true);
  const [error, setError]                     = useState('');
  const [processing, setProcessing]           = useState(false);
  const [step, setStep]                       = useState('summary');
  const [stripeRef, setStripeRef]             = useState('');
  const [cashConfirmed, setCashConfirmed]     = useState(false);
  const [sellerName, setSellerName]           = useState('');
  const [walletBalance, setWalletBalance]     = useState(null);
  const [payWith, setPayWith]                 = useState('stripe'); // 'stripe' | 'wallet'

  // ── Auth ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    return onAuthStateChanged(auth, (user) => {
      if (!user) { navigate('/login'); return; }
      setCurrentUser(user);
    });
  }, [navigate]);

  // ── Load wallet balance ───────────────────────────────────────────────────
  useEffect(() => {
    if (!currentUser) return;
    getWalletBalance(currentUser.uid)
      .then(setWalletBalance)
      .catch(() => setWalletBalance(0));
  }, [currentUser]);

  // ── Load transaction (real-time) ──────────────────────────────────────────
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
      } else if (data.sellerId) {
        try {
          const us = await getDoc(doc(db, 'users', data.sellerId));
          if (us.exists()) {
            const ud = us.data();
            setSellerName(`${ud.firstName || ''} ${ud.lastName || ''}`.trim() || ud.email || '');
          }
        } catch (_) {}
      }

      if (data.paymentProvider === 'stripe' && data.paymentStatus === 'paid') {
        setStripeRef(
          data.stripeRef ||
          data.stripeCheckoutSessionId ||
          data.stripePaymentIntentId ||
          ''
        );
        setStep('success');
        setLoading(false);
        return;
      }

      if (data.paymentProvider === 'wallet' && data.paymentStatus === 'wallet_paid') {
        setStep('success');
        setLoading(false);
        return;
      }

      if (data.status === 'waiting' && data.paymentProvider === 'cash' && data.paymentStatus === 'cash_pending') {
        setStep('cash_waiting');
      }

      setLoading(false);
    });
    return () => unsub();
  }, [txId]);

  // ── Cash payment ──────────────────────────────────────────────────────────
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
      const cashAmount = getCashAmount(tx);
      await recordCashConfirmation(tx.id, cashAmount);
      await notifySellerBuyerPaid({
        transactionId: tx.id,
        sellerId:      tx.sellerId,
        buyerName:     currentUser.displayName || currentUser.email || 'The buyer',
        listingId:     tx.listingId,
        listingTitle:  tx.listingTitle || listing?.title || 'your item',
        agreedPrice:   tx.agreedPrice,
      });
      setStep('cash_waiting');
    } catch (e) {
      console.error(e);
      setError('Something went wrong. Please try again.');
    } finally {
      setProcessing(false);
    }
  }, [tx, currentUser, listing]);

  // ── Wallet payment ────────────────────────────────────────────────────────
  const handleWalletPayment = useCallback(async () => {
    if (!tx || !currentUser) return;
    setProcessing(true);
    setError('');

    const amountToPay = getOnlineAmount(tx);
    if (amountToPay <= 0) {
      setError('No payment amount found.');
      setProcessing(false);
      return;
    }

    try {
      // Deduct from buyer wallet
      await deductBuyerWallet(
        currentUser.uid,
        amountToPay,
        tx.id,
        tx.listingTitle || listing?.title || 'Item',
      );

      // Update transaction — same flow as cash: moves to waiting
      await updateTransactionStatus(tx.id, 'waiting', {
        paymentProvider: 'wallet',
        paymentStatus:   'wallet_paid',
        paymentSettled:  true,
        onlineAmount:    amountToPay,
        cashAmount:      getCashAmount(tx),
      });

      // Notify seller
      await notifySellerBuyerPaid({
        transactionId: tx.id,
        sellerId:      tx.sellerId,
        buyerName:     currentUser.displayName || currentUser.email || 'The buyer',
        listingId:     tx.listingId,
        listingTitle:  tx.listingTitle || listing?.title || 'your item',
        agreedPrice:   tx.agreedPrice,
      });

      // Refresh local wallet balance display
      setWalletBalance(prev => (prev ?? 0) - amountToPay);
      setStep('success');
    } catch (e) {
      console.error('Wallet payment failed:', e);
      setError(e.message || 'Wallet payment failed. Please try again.');
    } finally {
      setProcessing(false);
    }
  }, [tx, currentUser, listing]);

  // ── Stripe payment ────────────────────────────────────────────────────────
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
        createSessionUrl: `${import.meta.env.VITE_API_URL}/api/stripe/create-checkout-session`,
        successUrl:       `${window.location.origin}/payment-success?tx=${tx.id}`,
        cancelUrl:        `${window.location.origin}/payment-cancelled?tx=${tx.id}`,
      });
    } catch (e) {
      console.error('Stripe redirect failed:', e);
      setError(e?.message || 'Could not redirect to Stripe. Please try again.');
      setProcessing(false);
      setStep('summary');
    }
  }, [tx, currentUser, listing]);

  // ── Derived values ────────────────────────────────────────────────────────
  const paymentType  = tx ? (tx.paymentType || tx.paymentMethod || 'cash') : null;
  const onlineAmount = tx ? getOnlineAmount(tx) : 0;
  const cashAmount   = tx ? getCashAmount(tx) : 0;
  const totalAmount  = tx ? Number(tx.agreedPrice ?? tx.listingPrice ?? 0) : 0;
  const isCashOnly   = paymentType === 'cash' || paymentType === 'cod';
  const isPartial    = paymentType === 'partial';
  const itemImage    = listing?.photos?.[0] || listing?.imageUrl || null;
  const itemTitle    = tx?.listingTitle || listing?.title || 'Campus Item';
  const hasOnline    = !isCashOnly; // has an online/wallet portion
  const walletSufficient = walletBalance !== null && walletBalance >= onlineAmount;

  // ── Loading ───────────────────────────────────────────────────────────────
  if (loading) return (
    <><NavBar /><div className={styles.page}><div className={styles.loadingState}>
      <i className="fas fa-spinner fa-spin" /><p>Loading payment details...</p>
    </div></div></>
  );

  if (error && !tx) return (
    <><NavBar /><div className={styles.page}><div className={styles.errorState}>
      <i className="fas fa-circle-exclamation" /><p>{error}</p>
      <button className={styles.backBtn} onClick={() => navigate(-1)}>Go back</button>
    </div></div></>
  );

  // ── Success screen ────────────────────────────────────────────────────────
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

  // ── Cash waiting screen ───────────────────────────────────────────────────
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

  // ── Redirecting to Stripe screen ──────────────────────────────────────────
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

  // ── Already processed guard ───────────────────────────────────────────────
  if (tx && (
    tx.paymentStatus === 'paid' ||
    tx.paymentStatus === 'wallet_paid' ||
    tx.paymentStatus === 'cash_pending' ||
    (tx.status !== 'accepted' && tx.status !== 'pending_payment')
  )) return (
    <><NavBar /><div className={styles.page}><div className={styles.container}>
      <div className={styles.alreadyProcessed}>
        <i className="fas fa-info-circle" />
        <p>
          {tx.paymentStatus === 'paid'
            ? 'This payment has already been completed.'
            : tx.paymentStatus === 'wallet_paid'
            ? 'This payment was already completed via your wallet.'
            : tx.paymentStatus === 'cash_pending'
            ? 'You have already confirmed this cash transaction.'
            : `This transaction has already been processed (status: ${tx.status}).`}
        </p>
        <button className={styles.backBtn} onClick={() => navigate('/my-purchases')}>Back to purchases</button>
      </div>
    </div></div></>
  );

  // ── Main summary page ─────────────────────────────────────────────────────
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
                  </div>
                  <div className={styles.itemInfo}>
                    <p className={styles.itemTitle}>{itemTitle}</p>
                    <p className={styles.itemSeller}>
                      <i className="fas fa-user" /> {sellerName || tx?.sellerName || 'Unknown Seller'}
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
                      <span className={styles.breakdownOnlineAmt}>R {onlineAmount.toLocaleString('en-ZA')}</span>
                    </div>
                    <div className={styles.breakdownRow}>
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
                  </p>
                </div>
              )}
            </div>

            {/* ── Right: payment action ── */}
            <div className={styles.actionCol}>
              <div className={styles.card} style={{ overflow: 'hidden' }}>
                <p className={styles.cardLabel}>{isCashOnly ? 'Confirm & proceed' : 'Pay online'}</p>

                {/* ── Payment method toggle (only for non-cash payments) ── */}
                {hasOnline && (
                  <>
                    <div className={styles.amountDisplay}>
                      <span className={styles.amountLabel}>{isPartial ? 'Online portion' : 'Amount due'}</span>
                      <span className={styles.amountValue}>R {onlineAmount.toLocaleString('en-ZA')}</span>
                    </div>

                    {/* Toggle */}
                    <div style={{
                      display: 'flex', gap: 8, marginBottom: 16,
                      background: '#f1f5f9', borderRadius: 10, padding: 4,
                    }}>
                      <button
                        onClick={() => setPayWith('stripe')}
                        style={{
                          flex: 1, padding: '8px 0', borderRadius: 8, border: 'none',
                          cursor: 'pointer', fontWeight: 600, fontSize: '0.82rem',
                          background: payWith === 'stripe' ? '#fff' : 'transparent',
                          color:      payWith === 'stripe' ? '#6772e5' : '#64748b',
                          boxShadow:  payWith === 'stripe' ? '0 1px 4px rgba(0,0,0,0.1)' : 'none',
                          transition: 'all 0.15s',
                        }}
                      >
                        <i className="fab fa-stripe" style={{ marginRight: 6 }} />
                        Pay with Stripe
                      </button>
                      <button
                        onClick={() => setPayWith('wallet')}
                        style={{
                          flex: 1, padding: '8px 0', borderRadius: 8, border: 'none',
                          cursor: 'pointer', fontWeight: 600, fontSize: '0.82rem',
                          background: payWith === 'wallet' ? '#fff' : 'transparent',
                          color:      payWith === 'wallet' ? '#0ea5e9' : '#64748b',
                          boxShadow:  payWith === 'wallet' ? '0 1px 4px rgba(0,0,0,0.1)' : 'none',
                          transition: 'all 0.15s',
                        }}
                      >
                        <i className="fas fa-wallet" style={{ marginRight: 6 }} />
                        Pay with Wallet
                      </button>
                    </div>

                    {/* Wallet balance info */}
                    {payWith === 'wallet' && (
                      <div style={{
                        background: walletSufficient ? '#f0fdf4' : '#fef2f2',
                        border: `1px solid ${walletSufficient ? '#bbf7d0' : '#fecaca'}`,
                        borderRadius: 8, padding: '10px 14px', marginBottom: 14,
                        display: 'flex', alignItems: 'center', gap: 10,
                        fontSize: '0.83rem',
                      }}>
                        <i
                          className={`fas ${walletSufficient ? 'fa-circle-check' : 'fa-circle-exclamation'}`}
                          style={{ color: walletSufficient ? '#16a34a' : '#dc2626', flexShrink: 0 }}
                        />
                        <div>
                          <p style={{ margin: 0, fontWeight: 600, color: walletSufficient ? '#15803d' : '#dc2626' }}>
                            {walletBalance !== null
                              ? `Wallet balance: R${walletBalance.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`
                              : 'Loading balance...'}
                          </p>
                          {!walletSufficient && walletBalance !== null && (
                            <p style={{ margin: '2px 0 0', color: '#dc2626' }}>
                              Insufficient — need R{onlineAmount.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}.{' '}
                              <button
                                style={{ background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', padding: 0, fontWeight: 600, fontSize: '0.83rem' }}
                                onClick={() => navigate('/profile?tab=wallet')}
                              >
                                Top up wallet
                              </button>
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                  </>
                )}

                {isCashOnly && (
                  <div className={styles.amountDisplay}>
                    <span className={styles.amountLabel}>Cash to bring</span>
                    <span className={styles.amountValue}>R {cashAmount.toLocaleString('en-ZA')}</span>
                  </div>
                )}

                {error && (
                  <div className={styles.errorMsg}><i className="fas fa-circle-exclamation" /> {error}</div>
                )}

                {/* ── Cash only ── */}
                {isCashOnly && (
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
                        : <><i className="fas fa-check" /> Confirm &amp; mark as waiting</>}
                    </button>
                  </>
                )}

                {/* ── Stripe payment ── */}
                {hasOnline && payWith === 'stripe' && (
                  <>
                    <div className={styles.stripeInfoBox}>
                      <i className="fab fa-stripe" style={{ fontSize: '1.5rem', color: '#6772e5', flexShrink: 0 }} />
                      <p style={{ margin: 0, fontSize: '0.85rem', lineHeight: '1.4' }}>
                        You will be securely redirected to Stripe to complete your payment.
                        No card details are stored by Campus Marketplace.
                      </p>
                    </div>
                    <button
                      className={styles.primaryBtn}
                      onClick={handleOnlinePayment}
                      disabled={processing}
                      style={{ background: '#6772e5', width: '100%', boxSizing: 'border-box' }}
                    >
                      {processing
                        ? <><i className="fas fa-spinner fa-spin" /> Redirecting...</>
                        : <><i className="fas fa-lock" /> Pay R {onlineAmount.toLocaleString('en-ZA')} via Stripe</>}
                    </button>
                  </>
                )}

                {/* ── Wallet payment ── */}
                {hasOnline && payWith === 'wallet' && (
                  <button
                    className={styles.primaryBtn}
                    onClick={handleWalletPayment}
                    disabled={processing || !walletSufficient}
                    style={{
                      background: walletSufficient ? '#0ea5e9' : '#94a3b8',
                      width: '100%', boxSizing: 'border-box',
                    }}
                  >
                    {processing
                      ? <><i className="fas fa-spinner fa-spin" /> Processing...</>
                      : <><i className="fas fa-wallet" /> Pay R {onlineAmount.toLocaleString('en-ZA')} from Wallet</>}
                  </button>
                )}

                <p className={styles.secureNote}>
                  <i className="fas fa-shield-halved" />
                  {isCashOnly
                    ? 'Your transaction is tracked and protected by Campus Marketplace.'
                    : payWith === 'wallet'
                    ? 'Funds are deducted from your wallet instantly and held until collection is confirmed.'
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