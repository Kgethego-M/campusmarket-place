/**
 * WalletTopUpSuccess.jsx  —  src/components/WalletTopUpSuccess.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Stripe redirects here after a successful wallet top-up:
 *   /wallet-topup-success?session_id=cs_xxx&amount=200
 *
 * Add to your router:
 *   <Route path="/wallet-topup-success" element={<WalletTopUpSuccess />} />
 */

import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../firebase';
import { confirmStripeTopUp } from '../services/walletService';
import NavBar from './NavBarTemp';   // adjust import if your NavBar path differs
import styles from './WalletTopUpSuccess.module.css';

export default function WalletTopUpSuccess() {
  const navigate        = useNavigate();
  const [params]        = useSearchParams();
  const sessionId       = params.get('session_id') || '';
  const amountHint      = parseFloat(params.get('amount') || '0');

  const [state,    setState]    = useState('loading');  // 'loading' | 'success' | 'already' | 'error'
  const [balance,  setBalance]  = useState(null);
  const [errorMsg, setErrorMsg] = useState('');

    useEffect(() => {
    let cancelled = false;

    const run = async () => {
        // Wait for Firebase to finish restoring auth state from persistence.
        // This resolves once — after the initial check is complete.
        // Without this, onAuthStateChanged fires null immediately on page load.
        await auth.authStateReady();

        if (cancelled) return;

        const user = auth.currentUser;

        if (!user) {
        navigate('/login');
        return;
        }

        if (!sessionId) {
        setState('error');
        setErrorMsg('No session ID found.');
        return;
        }

        try {
        const { balance: newBal } = await confirmStripeTopUp({
            sessionId,
            userId:    user.uid,
            verifyUrl: `${import.meta.env.VITE_API_URL}/api/stripe/verify-topup-session`,
        });
        if (!cancelled) {
            setBalance(newBal);
            setState('success');
        }
        } catch (e) {
        console.error('Top-up confirmation error:', e);
        if (!cancelled) {
            if (e.message?.toLowerCase().includes('already')) {
            setState('already');
            } else {
            setErrorMsg(e.message || 'Could not confirm top-up.');
            setState('error');
            }
        }
        }
    };

    run();

    return () => { cancelled = true; };
    }, [sessionId, navigate]);

  const fmt = (n) => Math.abs(n ?? 0).toLocaleString('en-ZA', { minimumFractionDigits: 2 });

  return (
    <>
      <NavBar />
      <div className={styles.page}>
        <div className={styles.card}>

          {state === 'loading' && (
            <>
              <div className={styles.iconWrap} style={{ background: '#f0f9ff' }}>
                <i className="fas fa-spinner fa-spin" style={{ color: '#6AA6DA' }} />
              </div>
              <h2>Confirming your top-up…</h2>
              <p className={styles.sub}>Checking with Stripe and updating your wallet.</p>
            </>
          )}

          {(state === 'success' || state === 'already') && (
            <>
              <div className={styles.iconWrap} style={{ background: '#dcfce7' }}>
                <i className="fas fa-check" style={{ color: '#15803d' }} />
              </div>
              <h2>{state === 'already' ? 'Already credited!' : 'Wallet topped up!'}</h2>
              {amountHint > 0 && state === 'success' && (
                <p className={styles.amount}>+R{fmt(amountHint)}</p>
              )}
              {balance !== null && (
                <div className={styles.balanceBox}>
                  <span className={styles.balanceLabel}>New balance</span>
                  <span className={styles.balanceAmt}>R{fmt(balance)}</span>
                </div>
              )}
              <p className={styles.sub}>
                {state === 'already'
                  ? 'This top-up was already applied to your wallet.'
                  : 'Funds are now available to use for listing promotions and more.'}
              </p>
              <div className={styles.actions}>
                <button
                  className={styles.primaryBtn}
                  onClick={() => navigate('/profile?tab=wallet')}
                >
                  <i className="fas fa-wallet" /> View wallet
                </button>
                <button
                  className={styles.ghostBtn}
                  onClick={() => navigate('/')}
                >
                  Browse listings
                </button>
              </div>
            </>
          )}

          {state === 'error' && (
            <>
              <div className={styles.iconWrap} style={{ background: '#fef2f2' }}>
                <i className="fas fa-circle-exclamation" style={{ color: '#dc2626' }} />
              </div>
              <h2>Something went wrong</h2>
              <p className={styles.sub}>{errorMsg}</p>
              <p className={styles.hint}>
                If your card was charged, the funds will appear in your wallet shortly
                via our webhook. You can also{' '}
                <button
                  className={styles.retryLink}
                  onClick={() => window.location.reload()}
                >
                  try again
                </button>.
              </p>
              <div className={styles.actions}>
                <button
                  className={styles.primaryBtn}
                  onClick={() => navigate('/profile?tab=wallet')}
                >
                  Go to wallet
                </button>
              </div>
            </>
          )}

        </div>
      </div>
    </>
  );
}