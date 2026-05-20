// src/components/PromoteSuccess.jsx
import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { getFirestore, doc, getDoc, setDoc, collection } from "firebase/firestore";
import { recordAdPayment } from "../services/revenueService";
import NavBar from "../components/NavBarTemp";
import styles from "./Payment.module.css";

export default function PromoteSuccess() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [listing, setListing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [adCreated, setAdCreated] = useState(false);

  const listingId       = searchParams.get("lid");
  const adType          = searchParams.get("type");
  const stripeRef       = searchParams.get("ref");
  const titleParam      = searchParams.get("title");
  const sessionId       = searchParams.get("session_id");
  const amountParam     = searchParams.get("amount");
  const amountRand = parseFloat(searchParams.get("price") || "0");
  const isWallet        = searchParams.get("wallet") === "true";

  // For wallet payments there is no Stripe session — use listingId + adType
  // as the idempotency key so the ad is never double-created.
  const uniquePaymentId = isWallet
    ? `wallet_${listingId}_${adType}`
    : (sessionId || stripeRef);

  useEffect(() => {
    if (!listingId) {
      setLoading(false);
      setError("Missing listing information.");
      return;
    }

    // Wallet payments don't need a payment reference — listingId is enough
    if (!isWallet && !uniquePaymentId) {
      setLoading(false);
      setError("Missing payment information.");
      return;
    }

    let isMounted = true;
    const storageKey = `ad_created_${uniquePaymentId}`;

    if (sessionStorage.getItem(storageKey) === "true") {
      const fetchListingOnly = async () => {
        const db = getFirestore();
        const snap = await getDoc(doc(db, "listings", listingId));
        if (isMounted && snap.exists()) setListing(snap.data());
        if (isMounted) setLoading(false);
      };
      fetchListingOnly();
      return;
    }

    sessionStorage.setItem(storageKey, "true");

    const createAdAndRevenue = async () => {
      const db = getFirestore();
      try {
        const adDocRef = doc(db, "ads", uniquePaymentId);
        const existingAd = await getDoc(adDocRef);

        if (!existingAd.exists()) {
          const listingRef = doc(db, "listings", listingId);
          const listingSnap = await getDoc(listingRef);
          if (!listingSnap.exists()) throw new Error("Listing not found");
          const listingData = listingSnap.data();
          if (isMounted) setListing(listingData);

          const adData = {
            listingId,
            title: listingData.title || titleParam || "Listing",
            imageUrl: listingData.photos?.[0] || listingData.imageUrl || null,
            price: listingData.price,
            type: adType || "banner",
            status: "active",
            createdAt: new Date(),
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            stripeSessionId: uniquePaymentId,
          };
          await setDoc(adDocRef, adData);
          console.log("✅ Ad created with ID:", uniquePaymentId);
        } else {
          const listingRef = doc(db, "listings", listingId);
          const listingSnap = await getDoc(listingRef);
          if (listingSnap.exists()) setListing(listingSnap.data());
        }

        // Your ad revenue write (for admin dashboard)
        const revenueRef = doc(collection(db, "adRevenue"));
        const revenueData = {
          amount: amountRand,
          listingId,
          adType,
          paymentMethod:   isWallet ? "wallet" : "stripe",
          stripeSessionId: isWallet ? null : uniquePaymentId,
          createdAt: new Date(),
          sellerId:        listingData.sellerId ?? listingData.userId ?? null,
        };
        await setDoc(adDocRef, adData);
        await setDoc(revenueRef, revenueData);
        console.log("✅ Ad created");

        // ── Update analytics revenue (Stripe payments only) ───────────────
        // Wallet payments already deducted from the user's balance in
        // AdPayment.jsx via deductAdFromWallet — no need to touch analytics
        // here for wallet. Only update for Stripe payments.
        if (!isWallet) {
          const adAmount = amountParam ? Number(amountParam) : amountRand;
          if (adAmount > 0) {
            try {
              const recorded = await recordAdPayment(uniquePaymentId, adAmount, {
                listingId,
                adType: adType || "banner",
                title: listing?.title || titleParam || "Listing",
              });
              if (recorded) {
                console.log(`📊 Ad payment of R${adAmount} recorded in analytics`);
              } else {
                console.log("⚠️ Ad payment already recorded (idempotent check)");
              }
              const analyticsRef = doc(db, "analytics", "platform");
              const analyticsSnap = await getDoc(analyticsRef)

              if (analyticsSnap.exists()) {
                await updateDoc(analyticsRef, {
                  totalRevenue:  increment(adAmount),
                  onlineRevenue: increment(adAmount),
                  lastUpdated:   new Date(),
                });
              } else {
                await setDoc(analyticsRef, {
                  totalRevenue:         adAmount,
                  onlineRevenue:        adAmount,
                  pendingCashRevenue:   0,
                  collectedCashRevenue: 0,
                  totalPayouts:         0,
                  totalRefunds:         0,
                  availableBalance:     0,
                  createdAt:            new Date(),
                  lastUpdated:          new Date(),
                });
              }
              console.log(`📊 Analytics updated: +R${adAmount} from ad promotion`);
            } catch (analyticsErr) {
              console.error("⚠️ Analytics update failed (non-fatal):", analyticsErr);
            }
          }
        }

        setAdCreated(true);
      } catch (err) {
        console.error("Ad creation error:", err);
        if (isMounted) {
          setError("Payment succeeded but promotion could not be created. Please contact support.");
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    createAdAndRevenue();
    return () => { isMounted = false; };
  }, [listingId, adType, titleParam, uniquePaymentId, amountRand, amountParam, isWallet, listing]);

  if (loading) {
    return (
      <>
        <NavBar />
        <div className={styles.page}>
          <div className={styles.container}>
            <div className={styles.successCard}>
              <div className={styles.successIconWrap}>
                <i className="fas fa-spinner fa-spin" />
              </div>
              <h2>Processing your promotion...</h2>
              <p>Please wait while we activate your ad.</p>
            </div>
          </div>
        </div>
      </>
    );
  }

  const displayTitle = listing?.title || titleParam || "Your listing";
  const displayImage = listing?.photos?.[0] || listing?.imageUrl || null;
  const displayPaymentId = (!isWallet && uniquePaymentId?.length > 30)
    ? `${uniquePaymentId.substring(0, 15)}...${uniquePaymentId.substring(uniquePaymentId.length - 10)}`
    : uniquePaymentId;

  return (
    <>
      <NavBar />
      <div className={styles.page}>
        <div className={styles.container}>
          <div className={styles.successCard}>
            <div className={styles.successIconWrap}>
              <i className="fas fa-check-circle" />
            </div>
            <h2>Your listing is now live!</h2>
            <p className={styles.successMessage}>
              <strong>{displayTitle}</strong> is being promoted as a{" "}
              <strong>{adType === "banner" ? "Banner ad" : "Premium popup"}</strong>{" "}
              for the next 7 days. Buyers will start seeing it shortly.
            </p>

            {displayImage && (
              <div className={styles.successImage}>
                <img src={displayImage} alt={displayTitle} />
              </div>
            )}

            {/* Payment confirmation — wallet vs Stripe */}
            <div className={styles.paymentRefBox}>
              <div className={styles.paymentRefIcon}>
                <i className={isWallet ? "fas fa-wallet" : "fas fa-receipt"} />
              </div>
              <div className={styles.paymentRefContent}>
                {isWallet ? (
                  <>
                    <span className={styles.paymentRefLabel}>Paid from wallet balance</span>
                    <span className={styles.paymentRefValue}>
                      R{amountParam ? Number(amountParam).toFixed(2) : "—"} deducted
                    </span>
                  </>
                ) : (
                  <>
                    <span className={styles.paymentRefLabel}>Payment confirmed via Stripe</span>
                    <span className={styles.paymentRefValue} title={uniquePaymentId}>
                      Ref: {displayPaymentId}
                    </span>
                  </>
                )}
              </div>
            </div>

            {error && <div className={styles.errorMsg}>{error}</div>}

            <div className={styles.successActions}>
              <button
                className={styles.primaryBtn}
                onClick={() => navigate(`/listing/${listingId}`)}
              >
                View listing
              </button>
              <button
                className={styles.ghostBtn}
                onClick={() => navigate("/view-listing")}
              >
                View all listings
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}