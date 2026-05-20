// src/pages/PromoteSuccess.jsx
import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { getFirestore, doc, getDoc, setDoc, collection } from "firebase/firestore";
import NavBar from "../components/NavBarTemp";
import styles from "./Payment.module.css";

export default function PromoteSuccess() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [listing, setListing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [adCreated, setAdCreated] = useState(false);

  const listingId = searchParams.get("lid");
  const adType = searchParams.get("type");
  const stripeRef = searchParams.get("ref");
  const titleParam = searchParams.get("title");
  const sessionId = searchParams.get("session_id");
  const amountRand = parseFloat(searchParams.get("price") || "0"); // get price from URL
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
      const fetchListingOnly = async () => {
        const db = getFirestore();
        const listingRef = doc(db, "listings", listingId);
        const snap = await getDoc(listingRef);
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
        // Use the unique payment ID as the document ID in 'ads' collection
        const adDocRef = doc(db, "ads", uniquePaymentId);
        const existingAd = await getDoc(adDocRef);
        
        if (!existingAd.exists()) {
          // Fetch listing details
          const listingRef = doc(db, "listings", listingId);
          const listingSnap = await getDoc(listingRef);
          if (!listingSnap.exists()) throw new Error("Listing not found");
          const listingData = listingSnap.data();
          if (isMounted) setListing(listingData);

          // Create ad document
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
          console.log(" Ad created with ID:", uniquePaymentId);
        } else {
          // If ad already exists, still fetch listing for display
          const listingRef = doc(db, "listings", listingId);
          const listingSnap = await getDoc(listingRef);
          if (listingSnap.exists()) setListing(listingSnap.data());
        }

        // ---- NEW: Record ad revenue (only once) ----
        const revenueRef = doc(collection(db, "adRevenue"));
        const revenueData = {
          amount: amountRand,
          listingId,
          adType: adType,
          stripeSessionId: uniquePaymentId,
          createdAt: new Date(),
        };
        await setDoc(revenueRef, revenueData);
        console.log(" Ad revenue recorded");
        // -------------------------------------------

        setAdCreated(true);
      } catch (err) {
        console.error("Ad creation error:", err);
        setError("Payment succeeded but promotion could not be created. Please contact support.");
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    createAdAndRevenue();
    return () => { isMounted = false; };
  }, [listingId, adType, titleParam, uniquePaymentId, amountRand]);

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

  const displayTitle = listing?.title || titleParam || "Your listing";
  const displayImage = listing?.photos?.[0] || listing?.imageUrl || null;

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
            <p>
              <strong>{displayTitle}</strong> is being promoted as a{" "}
              <strong>{adType === "banner" ? "Banner ad" : "Premium popup"}</strong>{" "}
              for the next 7 days. Buyers will start seeing it shortly.
            </p>
            {displayImage && (
              <img
                src={displayImage}
                alt={displayTitle}
                style={{ maxWidth: "200px", borderRadius: "8px", margin: "1rem 0" }}
              />
            )}
            <p className={styles.refText}>
              Payment confirmed via Stripe<br />
              Ref: {uniquePaymentId}
            </p>
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