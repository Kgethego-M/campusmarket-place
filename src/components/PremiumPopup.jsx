import { useState, useEffect, useRef } from "react";
import { collection, query, where, getDocs } from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import { db } from "../firebase.js";

const POPUP_VISIBLE_DURATION = 5000;     // 5 seconds visible
const DELAY_BEFORE_FIRST = 10000;        // 10 seconds before first popup
const DELAY_BETWEEN_POPUPS = 120000;     // 2 minutes (120000 ms) after close before next popup
const MAX_POPUPS = 3;

export default function PremiumPopup() {
  const [ad, setAd] = useState(null);
  const [visible, setVisible] = useState(false);
  const [countdown, setCountdown] = useState(POPUP_VISIBLE_DURATION / 1000);
  const navigate = useNavigate();

  const timeoutRef = useRef(null);      // timeout to show next popup
  const countdownRef = useRef(null);    // interval for countdown

  useEffect(() => {
    fetchPremiumAd();
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, []);

  async function fetchPremiumAd() {
    try {
      const q = query(
        collection(db, "ads"),
        where("status", "==", "active"),
        where("type", "==", "premium-popup")
      );
      const snapshot = await getDocs(q);
      if (!snapshot.empty) {
        const adData = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
        setAd(adData);
        // Initialise session counters
        let shownCount = parseInt(sessionStorage.getItem("premiumAdShownCount") || "0");
        if (shownCount < MAX_POPUPS) {
          // Schedule first popup after DELAY_BEFORE_FIRST
          scheduleNextPopup(true);
        }
      }
    } catch (err) {
      console.error("Error fetching premium ad:", err);
    }
  }

  function scheduleNextPopup(isFirst = false) {
    const shownCount = parseInt(sessionStorage.getItem("premiumAdShownCount") || "0");
    if (shownCount >= MAX_POPUPS) return;

    const delay = isFirst ? DELAY_BEFORE_FIRST : DELAY_BETWEEN_POPUPS;
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      showPopup();
    }, delay);
  }

  function showPopup() {
    setVisible(true);
    setCountdown(POPUP_VISIBLE_DURATION / 1000);
    // Start countdown timer
    if (countdownRef.current) clearInterval(countdownRef.current);
    countdownRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(countdownRef.current);
          closePopup();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }

  function closePopup() {
    setVisible(false);
    // Increment the shown count
    let shownCount = parseInt(sessionStorage.getItem("premiumAdShownCount") || "0");
    shownCount++;
    sessionStorage.setItem("premiumAdShownCount", shownCount);
    // Schedule next popup if fewer than MAX_POPUPS have been shown
    if (shownCount < MAX_POPUPS) {
      scheduleNextPopup(false);
    }
  }

  function handleViewListing() {
    if (ad?.listingId) {
      navigate(`/listing/${ad.listingId}`);
    }
    closePopup(); // closes immediately when clicked
  }

  if (!visible || !ad) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        style={{
          position: "fixed",
          top: 0, left: 0,
          width: "100vw",
          height: "100vh",
          backgroundColor: "rgba(0,0,0,0.7)",
          zIndex: 1999,
        }}
      />

      {/* Popup card */}
      <div
        onClick={handleViewListing}
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          backgroundColor: "white",
          borderRadius: "16px",
          padding: "28px",
          width: "340px",
          zIndex: 2000,
          boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
          fontFamily: "'Segoe UI', sans-serif",
          cursor: "pointer",
          textAlign: "center",
        }}
      >
        <div style={{
          position: "absolute",
          top: "-12px",
          left: "50%",
          transform: "translateX(-50%)",
          backgroundColor: "#ff9800",
          color: "white",
          padding: "4px 12px",
          borderRadius: "20px",
          fontSize: "12px",
          fontWeight: "bold",
        }}>
          ✦ PREMIUM AD ✦
        </div>

        {ad.imageUrl ? (
          <img src={ad.imageUrl} alt={ad.title} style={{
            width: "100%", height: "160px", objectFit: "cover",
            borderRadius: "10px", marginBottom: "16px",
          }} />
        ) : (
          <div style={{
            width: "100%", height: "160px", backgroundColor: "#f0f4f8",
            borderRadius: "10px", marginBottom: "16px",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "#aaa",
          }}>No image</div>
        )}

        <h3 style={{ margin: "0 0 6px", fontSize: "18px", fontWeight: "600", color: "#333" }}>
          {ad.title}
        </h3>
        {ad.price && (
          <p style={{ margin: "0 0 16px", fontSize: "20px", fontWeight: "700", color: "#ff9800" }}>
            R{ad.price}
          </p>
        )}

        <p style={{ fontSize: "12px", color: "#999", marginTop: "8px" }}>
          Auto‑closes in {countdown} second{countdown !== 1 ? "s" : ""} • Click anywhere to view
        </p>
      </div>
    </>
  );
}