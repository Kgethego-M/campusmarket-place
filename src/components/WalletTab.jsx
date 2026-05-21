/**
 * WalletTab.jsx  —  src/components/WalletTab.jsx
 */

import React, { useState, useEffect, useCallback } from 'react';
import { auth } from '../firebase';
import {
  recalculateWallet,
  withdrawFromWallet,
  redirectToStripeTopUp,
  AD_PRICES,
} from '../services/walletService';
import styles from './WalletTab.module.css';

const TX_META = {
  sale_credit:  { label: 'Sale',       icon: 'fa-tag',               dir: 'credit' },
  topup:        { label: 'Top-up',     icon: 'fa-circle-arrow-down', dir: 'credit' },
  refund:       { label: 'Refund',     icon: 'fa-rotate-left',       dir: 'credit' },
  wallet_debit: { label: 'Purchase',   icon: 'fa-cart-shopping',     dir: 'debit'  },
  ad_debit:     { label: 'Ad spend',   icon: 'fa-bullhorn',          dir: 'debit'  },
  withdrawal:   { label: 'Withdrawal', icon: 'fa-circle-arrow-up',   dir: 'debit'  },
};

const SA_BANKS = [
  'ABSA','Capitec Bank','FNB (First National Bank)','Nedbank',
  'Standard Bank','African Bank','Bidvest Bank','Discovery Bank',
  'Investec','Old Mutual','TymeBank','Other',
];

const safeNum = (v) => { const n = Number(v); return isNaN(n) ? 0 : n; };
const fmt     = (n)  => Math.abs(safeNum(n)).toLocaleString('en-ZA', { minimumFractionDigits: 2 });
const fmtDate = (d)  =>
  d instanceof Date && !isNaN(d)
    ? d.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })
    : '';

// ── Withdraw modal — 2 steps ──────────────────────────────────────────────────
function WithdrawModal({ balance, onConfirm, onClose }) {
  const [step,   setStep]   = useState('amount');
  const [amount, setAmount] = useState('');
  const [bank,   setBank]   = useState({
    accountHolder: '', bank: '', accountNumber: '',
    accountType: 'Cheque / Current', reference: '',
  });
  const [error, setError] = useState('');
  const [busy,  setBusy]  = useState(false);

  const parsedAmt = parseFloat(amount) || 0;
  const presets   = [...new Set([100, 200, 500, Math.floor(balance)])]
    .filter(v => v > 0 && v <= balance);
  const setBF = (f, v) => setBank(p => ({ ...p, [f]: v }));

  const handleNext = () => {
    if (!parsedAmt || parsedAmt <= 0) { setError('Enter a valid amount.'); return; }
    if (parsedAmt > balance)          { setError(`Maximum is R${fmt(balance)}`); return; }
    setError(''); setStep('bank');
  };

  const handleSubmit = async () => {
    if (!bank.accountHolder.trim()) { setError('Enter the account holder name.'); return; }
    if (!bank.bank)                 { setError('Select your bank.'); return; }
    const accNum = bank.accountNumber.replace(/\s/g, '');
    if (!accNum)                    { setError('Enter your account number.'); return; }
    if (!/^\d{6,20}$/.test(accNum)) { setError('Account number should be 6–20 digits.'); return; }
    setBusy(true); setError('');
    try {
      await onConfirm(parsedAmt, {
        accountHolder: bank.accountHolder.trim(),
        bank: bank.bank, accountNumber: accNum,
        accountType: bank.accountType, reference: bank.reference.trim(),
      });
      onClose();
    } catch (e) { setError(e.message || 'Something went wrong.'); }
    finally     { setBusy(false); }
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHead}>
          <span className={`${styles.mIcon} ${styles.mIconWithdraw}`}><i className="fas fa-circle-arrow-up" /></span>
          <div>
            <h3 className={styles.mTitle}>Withdraw Funds</h3>
            <p className={styles.mSub}>{step === 'amount' ? `Available: R${fmt(balance)}` : `Withdrawing R${fmt(parsedAmt)}`}</p>
          </div>
          <button className={styles.mClose} onClick={onClose}><i className="fas fa-xmark" /></button>
        </div>

        <div className={styles.stepRow}>
          <div className={`${styles.stepDot} ${styles.stepActive}`}>1</div>
          <div className={`${styles.stepLine} ${step === 'bank' ? styles.stepLineDone : ''}`} />
          <div className={`${styles.stepDot} ${step === 'bank' ? styles.stepActive : styles.stepInactive}`}>2</div>
          <span className={styles.stepLabel}>{step === 'amount' ? 'Enter amount' : 'Banking details'}</span>
        </div>

        <div className={styles.modalBody}>
          {step === 'amount' && (
            <>
              <div className={styles.amtWrap}>
                <span className={styles.amtPrefix}>R</span>
                <input className={styles.amtInput} type="number" min="1" max={balance}
                  placeholder="0.00" value={amount} autoFocus
                  onChange={e => { setAmount(e.target.value); setError(''); }} />
              </div>
              {presets.length > 0 && (
                <div className={styles.presets}>
                  {presets.map(v => (
                    <button key={v} className={styles.preset} onClick={() => setAmount(String(v))}>
                      R{v.toLocaleString('en-ZA')}
                    </button>
                  ))}
                </div>
              )}
              {error && <p className={styles.mErr}><i className="fas fa-circle-exclamation" /> {error}</p>}
              <button className={`${styles.mBtn} ${styles.mBtnWithdraw}`} onClick={handleNext}>
                Next — Banking details <i className="fas fa-arrow-right" />
              </button>
            </>
          )}

          {step === 'bank' && (
            <>
              <div className={styles.bankGrid}>
                <div className={styles.bankField}>
                  <label className={styles.bankLabel}>Account holder name</label>
                  <input className={styles.bankInput} type="text" autoFocus
                    placeholder="Full name as on bank account"
                    value={bank.accountHolder} onChange={e => setBF('accountHolder', e.target.value)} />
                </div>
                <div className={styles.bankField}>
                  <label className={styles.bankLabel}>Bank</label>
                  <select className={styles.bankSelect} value={bank.bank} onChange={e => setBF('bank', e.target.value)}>
                    <option value="">Select your bank…</option>
                    {SA_BANKS.map(b => <option key={b} value={b}>{b}</option>)}
                  </select>
                </div>
                <div className={styles.bankField}>
                  <label className={styles.bankLabel}>Account number</label>
                  <input className={styles.bankInput} type="text" inputMode="numeric"
                    placeholder="e.g. 62012345678" value={bank.accountNumber}
                    onChange={e => setBF('accountNumber', e.target.value.replace(/[^\d\s]/g, ''))} />
                </div>
                <div className={styles.bankField}>
                  <label className={styles.bankLabel}>Account type</label>
                  <select className={styles.bankSelect} value={bank.accountType} onChange={e => setBF('accountType', e.target.value)}>
                    <option>Cheque / Current</option>
                    <option>Savings</option>
                    <option>Transmission</option>
                  </select>
                </div>
                <div className={styles.bankField} style={{ gridColumn: '1 / -1' }}>
                  <label className={styles.bankLabel}>
                    Payment reference <span className={styles.optional}>(optional)</span>
                  </label>
                  <input className={styles.bankInput} type="text"
                    placeholder="e.g. your name or student number"
                    value={bank.reference} onChange={e => setBF('reference', e.target.value)} />
                </div>
              </div>

              <div className={styles.withdrawSummary}>
                <div className={styles.summaryLine}><span>Amount</span><strong>R{fmt(parsedAmt)}</strong></div>
                <div className={styles.summaryLine} style={{ opacity: 0.5, fontSize: '0.75rem' }}>
                  <span>Processing time</span><span>1–2 business days</span>
                </div>
              </div>

              {error && <p className={styles.mErr}><i className="fas fa-circle-exclamation" /> {error}</p>}

              <div className={styles.bankActions}>
                <button className={styles.mBtnGhost} onClick={() => { setStep('amount'); setError(''); }} disabled={busy}>
                  <i className="fas fa-arrow-left" /> Back
                </button>
                <button className={`${styles.mBtn} ${styles.mBtnWithdraw}`} style={{ flex: 1 }} onClick={handleSubmit} disabled={busy}>
                  {busy ? <><i className="fas fa-spinner fa-spin" /> Submitting…</> : <><i className="fas fa-circle-check" /> Submit withdrawal</>}
                </button>
              </div>

              <p className={styles.mNote}>
                <i className="fas fa-shield-halved" />
                Banking details are stored securely and used only to process this withdrawal.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Top-up modal ──────────────────────────────────────────────────────────────
function TopUpModal({ onConfirm, onClose }) {
  const [amount, setAmount] = useState('');
  const [error,  setError]  = useState('');
  const [busy,   setBusy]   = useState(false);
  const presets = [50, 100, 200, 500];

  const submit = async () => {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { setError('Enter a valid amount.'); return; }
    if (amt < 10)         { setError('Minimum top-up is R10.'); return; }
    setBusy(true); setError('');
    try {
      await onConfirm(amt);
      setBusy(false);
    } catch (e) {
      setError(e.message || 'Could not start payment. Please try again.');
      setBusy(false);
    }
  };

  return (
    <div className={styles.overlay} onClick={!busy ? onClose : undefined}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHead}>
          <span className={`${styles.mIcon} ${styles.mIconTopup}`}><i className="fas fa-circle-arrow-down" /></span>
          <div>
            <h3 className={styles.mTitle}>Top Up Wallet</h3>
            <p className={styles.mSub}>Secure payment via Stripe</p>
          </div>
          {!busy && <button className={styles.mClose} onClick={onClose}><i className="fas fa-xmark" /></button>}
        </div>

        <div className={styles.modalBody}>
          <div className={styles.stripeBanner}>
            <i className="fab fa-stripe" style={{ fontSize: '1.6rem', color: '#6772e5' }} />
            <div>
              <p style={{ margin: '0 0 1px', fontSize: '0.8rem', fontWeight: 700, color: '#1f2937' }}>Pay securely with Stripe</p>
              <p style={{ margin: 0, fontSize: '0.7rem', color: '#6b7280' }}>You'll be redirected to Stripe's hosted checkout page</p>
            </div>
          </div>

          <div className={styles.amtWrap}>
            <span className={styles.amtPrefix}>R</span>
            <input className={styles.amtInput} type="number" min="10" placeholder="0.00"
              value={amount} autoFocus disabled={busy}
              onChange={e => { setAmount(e.target.value); setError(''); }} />
          </div>

          <div className={styles.presets}>
            {presets.map(v => (
              <button key={v} className={styles.preset} disabled={busy}
                onClick={() => { setAmount(String(v)); setError(''); }}>
                R{v}
              </button>
            ))}
          </div>

          {error && <p className={styles.mErr}><i className="fas fa-circle-exclamation" /> {error}</p>}

          <button className={`${styles.mBtn} ${styles.mBtnTopup}`} onClick={submit} disabled={busy}>
            {busy
              ? <><i className="fas fa-spinner fa-spin" /> Opening Stripe…</>
              : <><i className="fas fa-lock" /> Pay{parseFloat(amount) > 0 ? ` R${parseFloat(amount).toLocaleString('en-ZA')}` : ''} via Stripe</>}
          </button>

          {busy && <p style={{ textAlign: 'center', fontSize: '0.73rem', color: '#9ca3af', margin: 0 }}>Please wait — opening secure payment page…</p>}

          <p className={styles.mNote}>
            <i className="fas fa-lock" />
            Your card details are handled entirely by Stripe — never stored by Campus Marketplace.
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Main WalletTab ────────────────────────────────────────────────────────────
export default function WalletTab({ userId, onBalanceUpdate }) {  // ← added onBalanceUpdate
  const [balance, setBalance] = useState(null);
  const [ledger,  setLedger]  = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal,   setModal]   = useState(null);
  const [toast,   setToast]   = useState('');
  const [filter,  setFilter]  = useState('all');

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 3500); };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { balance: b, ledger: l } = await recalculateWallet(userId);
      setBalance(b);
      setLedger(l);
      onBalanceUpdate?.(b);  // ← notify parent of real balance on load
    } catch (e) { console.error('WalletTab load error:', e); }
    finally     { setLoading(false); }
  }, [userId, onBalanceUpdate]);

  useEffect(() => { load(); }, [load]);

  const handleWithdraw = async (amt, bankDetails) => {
    const { balance: b, ledger: l } = await withdrawFromWallet(userId, amt, bankDetails);
    setBalance(b);
    setLedger(l);
    onBalanceUpdate?.(b);  // ← notify parent after withdrawal
    showToast(`Withdrawal of R${amt.toLocaleString('en-ZA')} submitted — 1–2 business days`);
  };

  const handleTopUp = async (amt) => {
    const user = auth.currentUser;
    await redirectToStripeTopUp({
      userId,
      userEmail:        user?.email || '',
      amount:           amt,
      createSessionUrl: `${import.meta.env.VITE_API_URL}/api/stripe/create-topup-session`,
      successUrl:       `${window.location.origin}/wallet-topup-success?amount=${amt}`,
      cancelUrl:        `${window.location.origin}/profile?tab=wallet`,
    });
  };

  const isNeg    = safeNum(balance) < 0;
  const totalIn  = ledger.filter(e => e.direction === 'credit').reduce((s, e) => s + e.amount, 0);
  const totalOut = ledger.filter(e => e.direction === 'debit').reduce((s, e)  => s + e.amount, 0);
  const shown    = filter === 'all'    ? ledger
                 : filter === 'credit' ? ledger.filter(e => e.direction === 'credit')
                 :                       ledger.filter(e => e.direction === 'debit');

  if (loading) return (
    <div className={styles.loading}>
      <i className="fas fa-spinner fa-spin" /><p>Calculating balance…</p>
    </div>
  );

  return (
    <div className={styles.root}>
      {toast && <div className={styles.toast}><i className="fas fa-check-circle" /> {toast}</div>}

      <div className={`${styles.hero} ${isNeg ? styles.heroNeg : ''}`}>
        <div className={styles.blob1} /><div className={styles.blob2} />
        <div className={styles.heroTop}>
          <div>
            <p className={styles.heroLabel}>Available Balance</p>
            <p className={styles.heroAmt}>{isNeg ? '−' : ''}R{fmt(balance)}</p>
            {isNeg && <p className={styles.negNote}><i className="fas fa-triangle-exclamation" /> Negative — top up to promote listings</p>}
          </div>
          <div className={styles.heroWalletIcon}><i className="fas fa-wallet" /></div>
        </div>

        <div className={styles.summaryRow}>
          <div className={styles.summaryChip}>
            <i className="fas fa-arrow-down" style={{ color: '#4ade80' }} />
            <span>Earned</span><strong>R{fmt(totalIn)}</strong>
          </div>
          <div className={styles.summaryDivider} />
          <div className={styles.summaryChip}>
            <i className="fas fa-arrow-up" style={{ color: '#f87171' }} />
            <span>Spent</span><strong>R{fmt(totalOut)}</strong>
          </div>
          <div className={styles.summaryDivider} />
          <div className={styles.summaryChip}>
            <i className="fas fa-receipt" style={{ color: '#94a3b8' }} />
            <span>Entries</span><strong>{ledger.length}</strong>
          </div>
        </div>

        <div className={styles.heroActions}>
          <button className={styles.heroTopupBtn} onClick={() => setModal('topup')}>
            <i className="fas fa-plus" /> Top Up
          </button>
          <button className={styles.heroWithdrawBtn} onClick={() => setModal('withdraw')} disabled={safeNum(balance) <= 0}>
            <i className="fas fa-arrow-up-from-bracket" /> Withdraw
          </button>
        </div>

        <div className={styles.adInfo}>
          <i className="fas fa-circle-info" />
          <span>Promotions: <strong>Premium Popup</strong> R{AD_PRICES['premium-popup']} · <strong>Banner</strong> R{AD_PRICES.banner}</span>
        </div>
      </div>

      <div className={styles.ledgerCard}>
        <div className={styles.ledgerHead}>
          <h4 className={styles.ledgerTitle}>Transaction History</h4>
          <div className={styles.filters}>
            {[{ key:'all', label:'All' }, { key:'credit', label:'Earned' }, { key:'debit', label:'Spent' }].map(({ key, label }) => (
              <button key={key} className={`${styles.filterBtn} ${filter === key ? styles.filterActive : ''}`} onClick={() => setFilter(key)}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {shown.length === 0 ? (
          <div className={styles.empty}>
            <i className="fas fa-receipt" />
            <p>{filter === 'all' ? 'No transactions yet' : filter === 'credit' ? 'No earnings yet' : 'No spending yet'}</p>
            {filter === 'all' && <p className={styles.emptyHint}>Completed cash and online sales credit your wallet automatically.</p>}
          </div>
        ) : (
          <div className={styles.ledgerList}>
            {shown.map((entry, idx) => {
              const meta    = TX_META[entry.type] ?? { label: entry.type, icon: 'fa-circle', dir: entry.direction };
              const isDebit = entry.direction === 'debit';
              return (
                <div key={entry.id} className={styles.ledgerRow} style={{ animationDelay: `${idx * 25}ms` }}>
                  <div className={`${styles.ledgerDot} ${isDebit ? styles.dotDebit : styles.dotCredit}`}>
                    <i className={`fas ${meta.icon}`} />
                  </div>
                  <div className={styles.ledgerInfo}>
                    <p className={styles.ledgerDesc}>{entry.description}</p>
                    <div className={styles.ledgerMeta}>
                      <span className={`${styles.badge} ${isDebit ? styles.badgeDebit : styles.badgeCredit}`}>{meta.label}</span>
                      {fmtDate(entry.date) && <span className={styles.ledgerDate}>{fmtDate(entry.date)}</span>}
                      {entry.type === 'withdrawal' && entry.bankDetails?.bank && (
                        <span className={styles.ledgerBank}><i className="fas fa-building-columns" /> {entry.bankDetails.bank}</span>
                      )}
                      {entry.type === 'withdrawal' && entry.status === 'pending' && (
                        <span className={styles.pendingBadge}>Pending</span>
                      )}
                    </div>
                  </div>
                  <span className={`${styles.ledgerAmt} ${isDebit ? styles.amtDebit : styles.amtCredit}`}>
                    {isDebit ? '−' : '+'}R{fmt(entry.amount)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {modal === 'withdraw' && <WithdrawModal balance={safeNum(balance)} onConfirm={handleWithdraw} onClose={() => setModal(null)} />}
      {modal === 'topup'    && <TopUpModal onConfirm={handleTopUp} onClose={() => setModal(null)} />}
    </div>
  );
}