import { useState, useEffect } from "react";
import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "../firebase.js";

export default function AdPopup() {
  const [ad, setAd] = useState(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Only show popup once per browser session
    const alreadyShown = sessionStorage.getItem("adShown");
    if (alreadyShown) return;

    fetchActiveAd();
  }, []);

  async function fetchActiveAd() {
    try {
      const q = query(
        collection(db, "ads"),
        where("status", "==", "active"),
        where("type", "==", "popup")
      );
      const snapshot = await getDocs(q);
      if (!snapshot.empty) {
        const ads = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        const randomAd = ads[Math.floor(Math.random() * ads.length)];
        setAd(randomAd);
        // Show popup after 2 seconds
        setTimeout(() => {
          setVisible(true);
          sessionStorage.setItem("adShown", "true");
        }, 2000);
      }
    } catch (err) {
      console.error("Error fetching ad:", err);
    }
  }

  function handleClose() {
    setVisible(false);
  }

  function handleViewListing() {
    setVisible(false);
    window.location.href = `/listing/${ad.listingId}`;
  }

  if (!visible || !ad) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={handleClose}
        style={{
          position: "fixed",
          top: 0, left: 0,
          width: "100vw",
          height: "100vh",
          backgroundColor: "rgba(0,0,0,0.5)",
          zIndex: 999,
        }}
      />

      {/* Popup card */}
      <div style={{
        position: "fixed",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        backgroundColor: "white",
        borderRadius: "16px",
        padding: "28px",
        width: "340px",
        zIndex: 1000,
        boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
        fontFamily: "'Segoe UI', sans-serif"
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
          <span style={{
            fontSize: "11px",
            fontWeight: "600",
            color: "#4a90d9",
            backgroundColor: "#e3f2fd",
            padding: "3px 8px",
            borderRadius: "4px",
            letterSpacing: "0.5px",
            textTransform: "uppercase"
          }}>Sponsored</span>
          <button onClick={handleClose} style={{ background: "none", border: "none", fontSize: "20px", cursor: "pointer", color: "#999" }}>×</button>
        </div>

        {ad.imageUrl ? (
          <img src={ad.imageUrl} alt={ad.title} style={{ width: "100%", height: "160px", objectFit: "cover", borderRadius: "10px", marginBottom: "16px" }} />
        ) : (
          <div style={{ width: "100%", height: "160px", backgroundColor: "#f0f4f8", borderRadius: "10px", marginBottom: "16px", display: "flex", alignItems: "center", justifyContent: "center", color: "#aaa" }}>No image</div>
        )}

        <h3 style={{ margin: "0 0 6px", fontSize: "18px", fontWeight: "600", color: "#333" }}>{ad.title}</h3>
        {ad.price && <p style={{ margin: "0 0 16px", fontSize: "20px", fontWeight: "700", color: "#4a90d9" }}>R{ad.price}</p>}

        <div style={{ display: "flex", gap: "10px" }}>
          <button onClick={handleViewListing} style={{ flex: 1, padding: "10px", backgroundColor: "#4a90d9", color: "white", border: "none", borderRadius: "8px", cursor: "pointer", fontWeight: "600" }}>View listing</button>
          <button onClick={handleClose} style={{ padding: "10px 16px", backgroundColor: "white", color: "#666", border: "1px solid #ddd", borderRadius: "8px", cursor: "pointer" }}>Dismiss</button>
        </div>
      </div>
    </>
  );
}