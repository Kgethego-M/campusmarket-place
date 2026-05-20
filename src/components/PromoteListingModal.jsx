// src/components/PromoteListingModal.jsx
import { useState } from "react";
import { auth } from "../firebase";
import { useNavigate } from "react-router-dom";
import styles from "./PromoteListingModal.module.css";

const AD_TYPES = [
  {
    id: "banner",
    title: "Banner ad",
    desc: "Shown at the bottom of the browse page – buyers scroll through multiple ads.",
    price: 50,
  },
  {
    id: "premium-popup",
    title: "Premium popup",
    desc: "Appears 3 times per session, cannot be dismissed, auto-closes after 5s.",
    price: 150,
  },
];

export default function PromoteListingModal({ listing, onClose }) {
  const [adType, setAdType] = useState("banner");
  const navigate = useNavigate();

  const selected = AD_TYPES.find((t) => t.id === adType);

  const handleContinue = () => {
  const user = auth.currentUser;
  if (!user) {
    navigate("/login", { state: { from: { pathname: `/listing/${listing.id}` } } });
    return;
  }
  navigate("/promote-payment", {
    state: { listing, adType, adPrice: selected.price },
  });
  // No onClose() needed – the modal will go away when the page changes
};

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <h2>Promote your listing</h2>
          <button className={styles.closeBtn} onClick={onClose}>&times;</button>
        </div>
        <p className={styles.subtitle}>Choose an ad type to reach more buyers</p>

        <div className={styles.options}>
          {AD_TYPES.map((t) => (
            <label
              key={t.id}
              className={`${styles.option} ${adType === t.id ? styles.selected : ""}`}
            >
              <input
                type="radio"
                name="adType"
                value={t.id}
                checked={adType === t.id}
                onChange={() => setAdType(t.id)}
              />
              <div className={styles.optionContent}>
                <span className={styles.optionTitle}>{t.title}</span>
                <span className={styles.optionDesc}>{t.desc}</span>
                <span className={styles.optionPrice}>R{t.price}</span>
              </div>
            </label>
          ))}
        </div>

        <div className={styles.actions}>
          <button className={styles.cancelBtn} onClick={onClose}>Cancel</button>
          <button className={styles.promoteBtn} onClick={handleContinue}>
            Continue — R{selected.price}
          </button>
        </div>
      </div>
    </div>
  );
}