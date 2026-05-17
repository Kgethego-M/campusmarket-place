// src/components/PremiumPopup.jsx
import { useState, useEffect, useRef } from "react";
import { collection, query, where, getDocs, doc, getDoc } from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import { db } from "../firebase.js";

const POPUP_VISIBLE_DURATION = 5000;   // 5 seconds visible
const DELAY_BEFORE_FIRST = 10000;      // 10 seconds before first popup
const DELAY_BETWEEN_POPUPS = 120000;   // 2 minutes between popups
const MAX_POPUPS_PER_SESSION = 3;
const SESSION_TIMEOUT = 2 * 60 * 1000; // 2 minutes – after this, session resets

export default function PremiumPopup() {
  const [ad, setAd] = useState(null);
  const [visible, setVisible] = useState(false);
  const [countdown, setCountdown] = useState(POPUP_VISIBLE_DURATION / 1000);
  const navigate = useNavigate();

  const timeoutRef = useRef(null);
  const countdownRef = useRef(null);

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
      if (snapshot.empty) return;

      // For each ad, fetch the actual listing data
      const validAds = [];
      for (const docSnap of snapshot.docs) {
        const adData = { id: docSnap.id, ...docSnap.data() };
        if (adData.listingId) {
          const listingSnap = await getDoc(doc(db, "listings", adData.listingId));
          if (listingSnap.exists()) {
            const listing = listingSnap.data();
            const status = listing.status?.toLowerCase();
            const unavailable = ["sold", "inactive", "accepted", "completed"];
            if (!unavailable.includes(status)) {
              validAds.push({
                ...adData,
                title: listing.title || "Premium Listing",
                price: listing.price,
                imageUrl: listing.photos?.[0] || listing.imageUrl,
                sellerName: listing.sellerName,
              });
            }
          }
        } else if (adData.title && adData.title !== "session_id") {
          // Fallback for ads that already have correct data
          validAds.push(adData);
        }
      }

      if (validAds.length === 0) return;

      // Randomly pick one ad for this popup session
      const randomAd = validAds[Math.floor(Math.random() * validAds.length)];
      setAd(randomAd);

      // Session management (sessionStorage)
      const now = Date.now();
      let startTime = parseInt(sessionStorage.getItem("premiumStartTime") || now);
      let count = parseInt(sessionStorage.getItem("premiumCount") || 0);

      if (now - startTime > SESSION_TIMEOUT) {
        startTime = now;
        count = 0;
        sessionStorage.setItem("premiumStartTime", startTime);
        sessionStorage.setItem("premiumCount", "0");
      }

      if (count >= MAX_POPUPS_PER_SESSION) return;

      const delay = count === 0 ? DELAY_BEFORE_FIRST : DELAY_BETWEEN_POPUPS;
      timeoutRef.current = setTimeout(() => {
        showPopup();
      }, delay);
    } catch (err) {
      console.error("Error fetching premium popup ad:", err);
    }
  }

  function showPopup() {
    setVisible(true);
    setCountdown(POPUP_VISIBLE_DURATION / 1000);
    countdownRef.current = setInterval(() => {
      setCountdown((prev) => {
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
    let count = parseInt(sessionStorage.getItem("premiumCount") || 0);
    count++;
    sessionStorage.setItem("premiumCount", count);

    const startTime = parseInt(sessionStorage.getItem("premiumStartTime") || Date.now());
    const now = Date.now();
    if (count < MAX_POPUPS_PER_SESSION && now - startTime <= SESSION_TIMEOUT) {
      timeoutRef.current = setTimeout(() => {
        showPopup();
      }, DELAY_BETWEEN_POPUPS);
    }
  }

  function handleViewListing() {
    if (ad?.listingId) {
      navigate(`/listing/${ad.listingId}`);
    }
    closePopup();
  }

  if (!visible || !ad) return null;

  return (
    <>
      <div
        onClick={handleViewListing}
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: "100vw",
          height: "100vh",
          backgroundColor: "rgba(0,0,0,0.7)",
          zIndex: 1999,
        }}
      />
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
          cursor: "pointer",
          textAlign: "center",
        }}
      >
        <div
          style={{
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
          }}
        >
          ✦ PREMIUM AD ✦
        </div>

        {ad.imageUrl ? (
          <img
            src={ad.imageUrl}
            alt={ad.title}
            style={{
              width: "100%",
              height: "160px",
              objectFit: "cover",
              borderRadius: "10px",
              marginBottom: "16px",
            }}
          />
        ) : (
          <div
            style={{
              width: "100%",
              height: "160px",
              backgroundColor: "#f0f4f8",
              borderRadius: "10px",
              marginBottom: "16px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#aaa",
            }}
          >
            No image
          </div>
        )}

        <h3
          style={{
            margin: "0 0 6px",
            fontSize: "18px",
            fontWeight: "600",
            color: "#333",
          }}
        >
          {ad.title}
        </h3>
        {ad.price && (
          <p
            style={{
              margin: "0 0 16px",
              fontSize: "20px",
              fontWeight: "700",
              color: "#ff9800",
            }}
          >
            R{ad.price}
          </p>
        )}

        <p
          style={{
            fontSize: "12px",
            color: "#999",
            marginTop: "8px",
          }}
        >
          Auto‑closes in {countdown} second{countdown !== 1 ? "s" : ""} • Click anywhere to view
        </p>
      </div>
    </>
  );
}