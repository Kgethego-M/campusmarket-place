import { useState, useEffect } from "react";
import { collection, query, where, getDocs, doc, getDoc } from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import { db } from "../firebase.js";

export default function AdBanner() {
  const [ads, setAds] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [visible, setVisible] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const dismissed = sessionStorage.getItem("adsDismissed");
    if (dismissed) return;
    fetchActiveAds();
  }, []);

  async function fetchActiveAds() {
    try {
      const q = query(collection(db, "ads"), where("status", "==", "active"));
      const snapshot = await getDocs(q);
      if (snapshot.empty) return;

      const validAds = [];
      for (const docSnap of snapshot.docs) {
        const ad = { id: docSnap.id, ...docSnap.data() };
        if (ad.listingId) {
          const listingSnap = await getDoc(doc(db, "listings", ad.listingId));
          if (listingSnap.exists()) {
            const listing = listingSnap.data();
            const status = listing.status?.toLowerCase();
            const unavailable = ["sold", "inactive", "accepted", "completed"];
            if (!unavailable.includes(status)) {
              validAds.push(ad);
            }
          }
        } else {
          // Ad without a listingId – you may want to skip it
          validAds.push(ad);
        }
      }

      if (validAds.length > 0) {
        setAds(validAds);
        setVisible(true);
      }
    } catch (err) {
      console.error("Error fetching ads:", err);
    }
  }

  function handleDismissAll() {
    setVisible(false);
    sessionStorage.setItem("adsDismissed", "true");
  }

  function handlePrev() {
    setCurrentIndex(i => (i === 0 ? ads.length - 1 : i - 1));
  }

  function handleNext() {
    setCurrentIndex(i => (i === ads.length - 1 ? 0 : i + 1));
  }

  function handleView() {
    const ad = ads[currentIndex];
    if (ad?.listingId) {
      navigate(`/listing/${ad.listingId}`);
    }
  }

  if (!visible || ads.length === 0) return null;

  const ad = ads[currentIndex];

  return (
    <div style={{
      position: "fixed",
      bottom: 0,
      left: 0,
      right: 0,
      backgroundColor: "white",
      borderTop: "1px solid #e0e0e0",
      padding: "10px 16px",
      display: "flex",
      alignItems: "center",
      gap: "12px",
      zIndex: 1000,
      boxShadow: "0 -4px 16px rgba(0,0,0,0.1)",
      fontFamily: "'Segoe UI', sans-serif"
    }}>
      <span style={{
        flexShrink: 0,
        fontSize: "11px",
        fontWeight: "600",
        color: "white",
        backgroundColor: "#ff9800",
        padding: "4px 8px",
        borderRadius: "6px",
        whiteSpace: "nowrap"
      }}>
        ✦ Sponsored
      </span>

      {ad.imageUrl ? (
        <img
          src={ad.imageUrl}
          alt={ad.title}
          onClick={handleView}
          style={{
            width: "44px",
            height: "44px",
            objectFit: "cover",
            borderRadius: "8px",
            flexShrink: 0,
            cursor: "pointer"
          }}
        />
      ) : (
        <div
          onClick={handleView}
          style={{
            width: "44px",
            height: "44px",
            backgroundColor: "#f0f4f8",
            borderRadius: "8px",
            flexShrink: 0,
            cursor: "pointer"
          }}
        />
      )}

      <div
        onClick={handleView}
        style={{ flex: 1, minWidth: 0, cursor: "pointer" }}
      >
        <p style={{
          margin: 0,
          fontSize: "14px",
          fontWeight: "600",
          color: "#333",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap"
        }}>
          {ad.title}
        </p>
        <p style={{
          margin: "2px 0 0",
          fontSize: "12px",
          color: "#666"
        }}>
          R{ad.price}
          {ad.campus ? ` · ${ad.campus}` : ""}
          {ad.sellerName ? ` · by ${ad.sellerName}` : ""}
        </p>
      </div>

      {ads.length > 1 && (
        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
          <button onClick={handlePrev} style={{ background: "none", border: "none", fontSize: "16px", cursor: "pointer", color: "#666", padding: "4px" }}>‹</button>
          <span style={{ fontSize: "12px", color: "#999", minWidth: "32px", textAlign: "center" }}>
            {currentIndex + 1}/{ads.length}
          </span>
          <button onClick={handleNext} style={{ background: "none", border: "none", fontSize: "16px", cursor: "pointer", color: "#666", padding: "4px" }}>›</button>
        </div>
      )}

      <button
        onClick={handleView}
        style={{
          flexShrink: 0,
          padding: "8px 16px",
          backgroundColor: "#ff9800",
          color: "white",
          border: "none",
          borderRadius: "8px",
          cursor: "pointer",
          fontWeight: "600",
          fontSize: "13px"
        }}
      >
        View
      </button>

      <button
        onClick={handleDismissAll}
        style={{
          flexShrink: 0,
          background: "none",
          border: "none",
          fontSize: "20px",
          cursor: "pointer",
          color: "#999",
          padding: "0 4px",
          lineHeight: 1
        }}
      >
        ×
      </button>
    </div>
  );
}