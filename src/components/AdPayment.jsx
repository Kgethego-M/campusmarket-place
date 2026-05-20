import { useState, useCallback, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { auth } from "../firebase";
import { onAuthStateChanged } from "firebase/auth";
import NavBar from "./NavBarTemp";
import styles from "./Payment.module.css";
import { getWalletBalance, deductAdFromWallet } from "../services/walletService";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";

const AD_LABELS = {
  banner: "Banner ad",
  "premium-popup": "Premium popup",
};

const API_BASE_URL = import.meta.env.VITE_API_URL || "https://campus-marketplace-api-gwgxand7f7aggha5.southafricanorth-01.azurewebsites.net";

export default function AdPayment() {
  const { state } = useLocation();
  const navigate  = useNavigate();

  const listing = state?.listing;
  const adType  = state?.adType  || "banner";
  const adPrice = state?.adPrice || 50;

  const [step,          setStep]          = useState("summary");
  const [processing,    setProcessing]    = useState(false);
  const [error,         setError]         = useState("");
  const [confirmed,     setConfirmed]     = useState(false);
  const [payWith,       setPayWith]       = useState("stripe"); // 'stripe' | 'wallet'
  const [walletBalance, setWalletBalance] = useState(null);
  const [currentUser,   setCurrentUser]   = useState(null);

  // ── Auth + wallet balance ─────────────────────────────────────────────────
  useEffect(() => {
    return onAuthStateChanged(auth, async (user) => {
      if (!user) { navigate('/login'); return; }
      setCurrentUser(user);
      try {
        const bal = await getWalletBalance(user.uid);
        setWalletBalance(bal);
      } catch { setWalletBalance(0); }
    });
  }, [navigate]);

  if (!listing) {
    return (
      <>
        <NavBar />
        <div className={styles.page}>
          <div className={styles.errorState}>
            <p>No listing selected. Please go back and try again.</p>
            <button className={styles.backBtn} onClick={() => navigate(-1)}>Go back</button>
          </div>
        </div>
      </>
    );
  }

  const itemImage          = listing.photos?.[0] || listing.imageUrl || null;
  const itemTitle          = listing.title || "Campus Item";
  const amountRand         = adPrice;
  const amountCents        = adPrice * 100;
  const walletSufficient   = walletBalance !== null && walletBalance >= adPrice;

  // ── Wallet payment ────────────────────────────────────────────────────────
  const handleWalletPay = useCallback(async () => {
    const user = currentUser || auth.currentUser;
    if (!user) { setError("You must be logged in."); return; }

    setProcessing(true);
    setError("");

    try {
      // Deduct from wallet (checks balance internally, throws if insufficient)
      await deductAdFromWallet(user.uid, listing.id, adType, itemTitle);

      // Create the ad document
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);

      await addDoc(collection(db, "ads"), {
        sellerId:  user.uid,
        listingId: listing.id,
        title:     itemTitle,
        imageUrl:  listing.photos?.[0] || listing.imageUrl || "",
        type:      adType,
        status:    "active",
        price:     listing.price || 0,
        createdAt: serverTimestamp(),
        expiresAt,
        paymentMethod: "wallet",
      });

      // Refresh balance display
      setWalletBalance(prev => (prev ?? 0) - adPrice);
      navigate(
        `/promote-success?lid=${listing.id}&type=${adType}&title=${encodeURIComponent(itemTitle)}`,
        { replace: true }
      );
    } catch (e) {
      console.error("Wallet ad payment failed:", e);
      setError(e.message || "Wallet payment failed. Please try again.");
    } finally {
      setProcessing(false);
    }
  }, [currentUser, listing, adType, adPrice, itemTitle, navigate]);

  // ── Stripe redirect ───────────────────────────────────────────────────────
  const handleStripePay = useCallback(async () => {
    const user = currentUser || auth.currentUser;
    if (!user) { setError("You must be logged in."); return; }

    setProcessing(true);
    setStep("redirecting");
    setError("");

    const stripeRef = `AD-${listing.id}-${Date.now()}`;

    const body = {
      transactionId: stripeRef,
      buyerEmail:    user.email,
      amount:        amountCents,
      amountRand,
      cashAmount:    0,
      totalAmount:   amountRand,
      currency:      "zar",
      stripeRef,
      paymentType:   "ad_promotion",
      listingId:     listing.id,
      listingTitle:  `${AD_LABELS[adType]} — ${itemTitle}`,
      successUrl:    `${window.location.origin}/promote-success?lid=${listing.id}&type=${adType}&ref=${stripeRef}&title=${encodeURIComponent(itemTitle)}`,
      cancelUrl:     `${window.location.origin}/listing/${listing.id}`,
      metadata: {
        type:      "ad_promotion",
        adType,
        listingId: listing.id,
        sellerId:  user.uid,
        stripeRef,
      },
    };

    try {
      const res = await fetch(`${API_BASE_URL}/api/stripe/create-checkout-session`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(body),
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.detail || `Server error ${res.status}`);
      }

      const { url } = await res.json();
      if (!url) throw new Error("No checkout URL returned from server.");
      window.location.href = url;
    } catch (err) {
      console.error("Stripe redirect failed:", err);
      setError(err.message || "Could not redirect to Stripe. Please try again.");
      setProcessing(false);
      setStep("summary");
    }
  }, [currentUser, adType, amountRand, amountCents, listing, itemTitle]);

  // ── Redirecting screen ────────────────────────────────────────────────────
  if (step === "redirecting") return (
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
                <button className={styles.primaryBtn} onClick={handleStripePay} disabled={processing}>
                  <i className="fas fa-rotate-right" /> Try again
                </button>
                <button className={styles.ghostBtn} onClick={() => navigate(-1)}>Go back</button>
              </div>
            </>
          )}
        </div>
      </div></div>
    </>
  );

  // ── Summary screen ────────────────────────────────────────────────────────
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
              <h1 className={styles.pageTitle}>Promote listing</h1>
              <p className={styles.pageSub}>Review your ad and complete payment</p>
            </div>
          </div>

          <div className={styles.layout}>
            {/* ── Left: item + breakdown ── */}
            <div className={styles.summaryCol}>
              <div className={styles.card}>
                <p className={styles.cardLabel}>Listing</p>
                <div className={styles.itemRow}>
                  <div className={styles.itemImg}>
                    {itemImage ? <img src={itemImage} alt={itemTitle} /> : <i className="fas fa-image" />}
                  </div>
                  <div className={styles.itemInfo}>
                    <p className={styles.itemTitle}>{itemTitle}</p>
                    <p className={styles.itemSeller}>
                      <i className="fas fa-tag" /> Listed at R{Number(listing.price || 0).toLocaleString("en-ZA")}
                    </p>
                    <span className={styles.payTypeBadge}>{AD_LABELS[adType]}</span>
                  </div>
                </div>
              </div>

              <div className={styles.card}>
                <p className={styles.cardLabel}>Ad details</p>
                <div className={styles.breakdownRow}>
                  <span>Ad type</span><span>{AD_LABELS[adType]}</span>
                </div>
                <div className={styles.breakdownRow}>
                  <span>Duration</span><span>7 days</span>
                </div>
                <div className={styles.breakdownRow}>
                  <span>Placement</span>
                  <span>{adType === "banner" ? "Browse page carousel" : "Full-screen popup"}</span>
                </div>
                <div className={styles.breakdownDivider} />
                <div className={`${styles.breakdownRow} ${styles.breakdownTotal}`}>
                  <span>Total</span><span>R{adPrice}</span>
                </div>
              </div>

              <div className={styles.infoBox}>
                <i className="fas fa-circle-info" />
                <p>
                  {adType === "banner"
                    ? "Your listing will appear in the banner carousel at the bottom of the browse page for 7 days."
                    : "Your listing will pop up 3 times per session for each visitor and auto-closes after 5 seconds."}
                </p>
              </div>
            </div>

            {/* ── Right: pay button ── */}
            <div className={styles.actionCol}>
              <div className={styles.card} style={{ overflow: "hidden" }}>
                <p className={styles.cardLabel}>Payment</p>

                <div className={styles.amountDisplay}>
                  <span className={styles.amountLabel}>Amount due</span>
                  <span className={styles.amountValue}>R{adPrice}</span>
                </div>

                {/* ── Payment method toggle ── */}
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
                          Insufficient — need R{adPrice}.{' '}
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

                {error && (
                  <div className={styles.errorMsg}>
                    <i className="fas fa-circle-exclamation" /> {error}
                  </div>
                )}

                <label className={styles.confirmCheck}>
                  <input
                    type="checkbox"
                    checked={confirmed}
                    onChange={(e) => setConfirmed(e.target.checked)}
                  />
                  <span>
                    I confirm I want to promote <strong>{itemTitle}</strong> as a{" "}
                    <strong>{AD_LABELS[adType]}</strong> for <strong>R{adPrice}</strong> for 7 days.
                  </span>
                </label>

                {/* Stripe button */}
                {payWith === 'stripe' && (
                  <>
                    <div className={styles.stripeInfoBox}>
                      <i className="fab fa-stripe" style={{ fontSize: "1.5rem", color: "#6772e5", flexShrink: 0 }} />
                      <p style={{ margin: 0, fontSize: "0.85rem", lineHeight: "1.4" }}>
                        You will be securely redirected to Stripe to complete payment.
                        No card details are stored by Campus Marketplace.
                      </p>
                    </div>
                    <button
                      className={styles.primaryBtn}
                      onClick={handleStripePay}
                      disabled={processing || !confirmed}
                      style={{
                        background:   '#6772e5',
                        width:        '100%',
                        boxSizing:    'border-box',
                        opacity:      !confirmed ? 0.5 : 1,
                      }}
                    >
                      {processing
                        ? <><i className="fas fa-spinner fa-spin" /> Redirecting...</>
                        : <><i className="fas fa-lock" /> Pay R{adPrice} via Stripe</>}
                    </button>
                  </>
                )}

                {/* Wallet button */}
                {payWith === 'wallet' && (
                  <button
                    className={styles.primaryBtn}
                    onClick={handleWalletPay}
                    disabled={processing || !confirmed || !walletSufficient}
                    style={{
                      background:  confirmed && walletSufficient ? '#0ea5e9' : '#94a3b8',
                      width:       '100%',
                      boxSizing:   'border-box',
                      opacity:     !confirmed ? 0.5 : 1,
                    }}
                  >
                    {processing
                      ? <><i className="fas fa-spinner fa-spin" /> Processing...</>
                      : <><i className="fas fa-wallet" /> Pay R{adPrice} from Wallet</>}
                  </button>
                )}

                <p className={styles.secureNote}>
                  <i className="fas fa-shield-halved" />
                  {payWith === 'wallet'
                    ? 'Funds are deducted from your wallet instantly.'
                    : 'Payments are processed securely by Stripe.'}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}