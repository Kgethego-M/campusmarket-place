// src/pages/PromoteSuccess.jsx
import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { getFirestore, doc, getDoc, setDoc } from "firebase/firestore";
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
  const uniquePaymentId = sessionId || stripeRef;

  useEffect(() => {
    if (!listingId || !uniquePaymentId) {
      setLoading(false);
      setError("Missing payment information.");
      return;
    }

    let isMounted = true;
    const storageKey = `ad_created_${uniquePaymentId}`;

    if (sessionStorage.getItem(storageKey) === "true") {
      // Already processed this session — just fetch listing for display
      const fetchListingOnly = async () => {
        const db = getFirestore();
        const snap = await getDoc(doc(db, "listings", listingId));
        if (isMounted && snap.exists()) setListing(snap.data());
        if (isMounted) setLoading(false);
      };
      fetchListingOnly();
      return;
    }

    const createAd = async () => {
      const db = getFirestore();
      try {
        // ── Idempotency: skip if ad already exists ────────────────────────
        const adDocRef = doc(db, "ads", uniquePaymentId);
        const existingAd = await getDoc(adDocRef);

        if (existingAd.exists()) {
          console.log("Ad already exists, skipping creation");
          setAdCreated(true);
          const listingSnap = await getDoc(doc(db, "listings", listingId));
          if (isMounted && listingSnap.exists()) setListing(listingSnap.data());
          if (isMounted) setLoading(false);
          return;
        }

        // ── Fetch listing ─────────────────────────────────────────────────
        const listingSnap = await getDoc(doc(db, "listings", listingId));
        if (!listingSnap.exists()) throw new Error("Listing not found");
        const listingData = listingSnap.data();
        if (isMounted) setListing(listingData);

        // ── Create ad document ────────────────────────────────────────────
        await setDoc(adDocRef, {
          listingId,
          title:           listingData.title || titleParam || "Listing",
          imageUrl:        listingData.photos?.[0] || listingData.imageUrl || null,
          price:           listingData.price,
          type:            adType || "banner",
          status:          "active",
          createdAt:       new Date(),
          expiresAt:       new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          stripeSessionId: uniquePaymentId,
          amountPaid:      amountParam ? Number(amountParam) : null,
        });
        console.log("✅ Ad created");

        // ── Record ad payment in analytics ────────────────────────────────
        // recordAdPayment() writes to analytics/platform — the same document
        // that getRevenueAnalytics() reads, incrementing adPayments and totalRevenue.
        const adAmount = amountParam ? Number(amountParam) : 0;
        if (adAmount > 0) {
          const recorded = await recordAdPayment(uniquePaymentId, adAmount, {
            listingId,
            adType: adType || "banner",
            title: listingData.title || titleParam || "Listing",
          });
          if (recorded) {
            console.log(`📊 Ad payment of R${adAmount} recorded in analytics`);
          }
        }

        setAdCreated(true);
        sessionStorage.setItem(storageKey, "true");

      } catch (err) {
        console.error("Ad creation error:", err);
        if (isMounted) {
          setError("Payment succeeded but promotion could not be created. Please contact support.");
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    createAd();
    return () => { isMounted = false; };
  }, [listingId, adType, titleParam, uniquePaymentId, amountParam]);

  if (loading) {
    return (
      <>
        <NavBar />
        <div className={styles.page}>
          <div className={styles.container}>
            <div className={styles.successCard}>
              <h2>Processing your promotion...</h2>
            </div>
          </div>
        </div>
      </>
    );
  }

  const displayTitle     = listing?.title || titleParam || "Your listing";
  const displayImage     = listing?.photos?.[0] || listing?.imageUrl || null;
  const displayPaymentId = uniquePaymentId?.length > 30
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

            <div className={styles.paymentRefBox}>
              <div className={styles.paymentRefIcon}>
                <i className="fas fa-receipt" />
              </div>
              <div className={styles.paymentRefContent}>
                <span className={styles.paymentRefLabel}>Payment confirmed via Stripe</span>
                <span className={styles.paymentRefValue} title={uniquePaymentId}>
                  Ref: {displayPaymentId}
                </span>
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