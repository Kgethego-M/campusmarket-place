// src/components/AdPayment.jsx
//
// Payment page for promoting a listing via real Stripe checkout.
// Uses Vite proxy to forward /api requests to FastAPI backend on port 8000.
//
// Route: /promote-payment
// State: { listing, adType, adPrice }

import { useState, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { auth } from "../firebase";
import NavBar from "./NavBarTemp";
import styles from "./Payment.module.css";

const AD_LABELS = {
  banner: "Banner ad",
  "premium-popup": "Premium popup",
};

export default function AdPayment() {
  const { state } = useLocation();
  const navigate = useNavigate();

  const listing = state?.listing;
  const adType = state?.adType || "banner";
  const adPrice = state?.adPrice || 50;

  const [step, setStep] = useState("summary"); // summary | redirecting
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");
  const [confirmed, setConfirmed] = useState(false);

  // Guard: navigated here without state
  if (!listing) {
    return (
      <>
        <NavBar />
        <div className={styles.page}>
          <div className={styles.errorState}>
            <p>No listing selected. Please go back and try again.</p>
            <button className={styles.backBtn} onClick={() => navigate(-1)}>
              Go back
            </button>
          </div>
        </div>
      </>
    );
  }

  const itemImage = listing.photos?.[0] || listing.imageUrl || null;
  const itemTitle = listing.title || "Campus Item";
  const amountRand = adPrice;
  const amountCents = adPrice * 100; // Stripe expects cents

  // ── Stripe redirect ────────────────────────────────────────────────────────
  const handlePay = useCallback(async () => {
    const user = auth.currentUser;
    if (!user) {
      setError("You must be logged in.");
      return;
    }

    setProcessing(true);
    setStep("redirecting");
    setError("");

    // Build a unique reference for this ad promotion
    const stripeRef = `AD-${listing.id}-${Date.now()}`;

    // Match exactly what CheckoutSessionRequest expects on the backend
    const body = {
      transactionId: stripeRef, // used as client_reference_id
      buyerEmail: user.email,
      amount: amountCents, // in cents (e.g. 5000 for R50)
      amountRand: amountRand,
      cashAmount: 0,
      totalAmount: amountRand,
      currency: "zar",
      stripeRef: stripeRef,
      paymentType: "ad_promotion",
      listingId: listing.id,
      listingTitle: `${AD_LABELS[adType]} — ${itemTitle}`,
      // ✅ Added &price= parameter for ad revenue tracking
      successUrl: `${window.location.origin}/promote-success?lid=${listing.id}&type=${adType}&ref=${stripeRef}&title=${encodeURIComponent(
        itemTitle
      )}&price=${amountRand}`,
      cancelUrl: `${window.location.origin}/listing/${listing.id}`,
      metadata: {
        type: "ad_promotion",
        adType: adType,
        listingId: listing.id,
        sellerId: user.uid,
        stripeRef: stripeRef,
      },
    };

    try {
      // ✅ Use relative URL – Vite proxy forwards /api to http://localhost:8000
      const res = await fetch("/api/stripe/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.detail || `Server error ${res.status}`);
      }

      const { url } = await res.json();
      if (!url) throw new Error("No checkout URL returned from server.");

      window.location.href = url; // hand off to Stripe
    } catch (err) {
      console.error("Stripe redirect failed:", err);
      setError(err.message || "Could not redirect to Stripe. Please try again.");
      setProcessing(false);
      setStep("summary");
    }
  }, [adType, amountRand, amountCents, listing, itemTitle]);

  // ── Redirecting screen ─────────────────────────────────────────────────────
  if (step === "redirecting") {
    return (
      <>
        <NavBar />
        <div className={styles.page}>
          <div className={styles.container}>
            <div className={styles.successCard}>
              <div className={styles.successIconWrap}>
                <i className="fas fa-spinner fa-spin" />
              </div>
              <h2>Redirecting to Stripe...</h2>
              <p className={styles.successSub}>
                Please wait while we open the secure payment page.
              </p>
              {error && (
                <>
                  <div className={styles.errorMsg}>
                    <i className="fas fa-circle-exclamation" /> {error}
                  </div>
                  <div className={styles.successActions}>
                    <button
                      className={styles.primaryBtn}
                      onClick={handlePay}
                      disabled={processing}
                    >
                      <i className="fas fa-rotate-right" /> Try again
                    </button>
                    <button className={styles.ghostBtn} onClick={() => navigate(-1)}>
                      Go back
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </>
    );
  }

  // ── Summary screen ─────────────────────────────────────────────────────────
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
                    {itemImage ? (
                      <img src={itemImage} alt={itemTitle} />
                    ) : (
                      <i className="fas fa-image" />
                    )}
                  </div>
                  <div className={styles.itemInfo}>
                    <p className={styles.itemTitle}>{itemTitle}</p>
                    <p className={styles.itemSeller}>
                      <i className="fas fa-tag" /> Listed at R
                      {Number(listing.price || 0).toLocaleString("en-ZA")}
                    </p>
                    <span className={styles.payTypeBadge}>{AD_LABELS[adType]}</span>
                  </div>
                </div>
              </div>

              <div className={styles.card}>
                <p className={styles.cardLabel}>Ad details</p>
                <div className={styles.breakdownRow}>
                  <span>Ad type</span>
                  <span>{AD_LABELS[adType]}</span>
                </div>
                <div className={styles.breakdownRow}>
                  <span>Duration</span>
                  <span>7 days</span>
                </div>
                <div className={styles.breakdownRow}>
                  <span>Placement</span>
                  <span>
                    {adType === "banner"
                      ? "Browse page carousel"
                      : "Full-screen popup"}
                  </span>
                </div>
                <div className={styles.breakdownDivider} />
                <div className={`${styles.breakdownRow} ${styles.breakdownTotal}`}>
                  <span>Total</span>
                  <span>R{adPrice}</span>
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
                <p className={styles.cardLabel}>Pay via Stripe</p>

                <div className={styles.amountDisplay}>
                  <span className={styles.amountLabel}>Amount due</span>
                  <span className={styles.amountValue}>R{adPrice}</span>
                </div>

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
                    <strong>{AD_LABELS[adType]}</strong> for{" "}
                    <strong>R{adPrice}</strong> for 7 days.
                  </span>
                </label>

                <div className={styles.stripeInfoBox}>
                  <i
                    className="fab fa-stripe"
                    style={{ fontSize: "1.5rem", color: "#6772e5", flexShrink: 0 }}
                  />
                  <p style={{ margin: 0, fontSize: "0.85rem", lineHeight: "1.4" }}>
                    You will be securely redirected to Stripe to complete payment.
                    No card details are stored by Campus Marketplace.
                  </p>
                </div>

                <button
                  className={styles.primaryBtn}
                  onClick={handlePay}
                  disabled={processing || !confirmed}
                  style={{
                    background: "#6772e5",
                    width: "100%",
                    boxSizing: "border-box",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    opacity: !confirmed ? 0.5 : 1,
                  }}
                >
                  {processing ? (
                    <>
                      <i className="fas fa-spinner fa-spin" /> Redirecting...
                    </>
                  ) : (
                    <>
                      <i className="fas fa-lock" /> Pay R{adPrice} via Stripe
                    </>
                  )}
                </button>

                <p className={styles.secureNote}>
                  <i className="fas fa-shield-halved" />
                  Payments are processed securely by Stripe.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}