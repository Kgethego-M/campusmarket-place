import { useState } from "react";
import { db, auth } from "../firebase";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import styles from "./PromoteListingModal.module.css";

export default function PromoteListingModal({ listing, onClose }) {
  const [adType, setAdType] = useState("banner");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handlePromote = async () => {
    const user = auth.currentUser;
    if (!user) {
      alert("You must be logged in to promote a listing.");
      return;
    }
    const sellerId = listing.sellerUID || listing.sellerId;
    if (user.uid !== sellerId) {
      alert("You can only promote your own listings.");
      return;
    }

    setLoading(true);
    try {
      // Simulate payment (replace with real payment later)
      await new Promise(resolve => setTimeout(resolve, 1000));

      await addDoc(collection(db, "ads"), {
        listingId: listing.id,
        title: listing.title,
        price: listing.price,
        imageUrl: listing.photos?.[0] || null,
        type: adType,
        status: "active",
        sellerId: user.uid,
        createdAt: serverTimestamp(),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });

      setSuccess(true);
      setTimeout(() => {
        onClose();
        window.location.reload(); // optional
      }, 1500);
    } catch (err) {
      console.error(err);
      alert("Failed to promote listing. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <h2 className={styles.title}>Promote your listing</h2>
        <p className={styles.subtitle}>Choose ad type</p>
        <div className={styles.options}>
          <label className={`${styles.option} ${adType === "banner" ? styles.selected : ""}`}>
            <input type="radio" name="adType" value="banner" checked={adType === "banner"} onChange={() => setAdType("banner")} />
            <span className={styles.optionTitle}>Banner ad</span>
            <span className={styles.optionDesc}>Shown at bottom of browse page, users can slide between ads.</span>
            <span className={styles.optionPrice}>R50</span>
          </label>
          <label className={`${styles.option} ${adType === "premium-popup" ? styles.selected : ""}`}>
            <input type="radio" name="adType" value="premium-popup" checked={adType === "premium-popup"} onChange={() => setAdType("premium-popup")} />
            <span className={styles.optionTitle}>Premium popup</span>
            <span className={styles.optionDesc}>Appears 3 times per session, cannot be dismissed, auto‑closes after 5s.</span>
            <span className={styles.optionPrice}>R150</span>
          </label>
        </div>

        {success ? (
          <div className={styles.successMessage}>✅ Your listing is now promoted! The ad will appear shortly.</div>
        ) : (
          <div className={styles.actions}>
            <button className={styles.cancelBtn} onClick={onClose} disabled={loading}>Cancel</button>
            <button className={styles.promoteBtn} onClick={handlePromote} disabled={loading}>
              {loading ? "Processing payment..." : "Pay & promote"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}