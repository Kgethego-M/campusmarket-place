import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { auth, db } from "../firebase.js";
import { collection, query, where, getDocs, doc, getDoc } from "firebase/firestore";
import NavBar from "./NavBarTemp.jsx";

export default function TradeFacility() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [transactions, setTransactions] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        fetchTransactions(currentUser.uid);
      } else {
        setTimeout(() => {
          if (!auth.currentUser) navigate("/login");
        }, 500);
        setLoading(false);
      }
    });
    return () => unsubscribe();
  }, [navigate]);

  async function fetchTransactions(uid) {
    setLoading(true);
    try {
      // Get transactions where user is seller
      const q = query(
        collection(db, "transactions"),
        where("sellerId", "==", uid)
      );
      const snapshot = await getDocs(q);
      const txns = [];

      for (const docSnap of snapshot.docs) {
        const txn = { id: docSnap.id, ...docSnap.data() };

        // Get listing details
        const listingSnap = await getDoc(doc(db, "listings", txn.listingId));
        if (listingSnap.exists()) {
          txn.listing = listingSnap.data();
        }

        // Get buyer name
        const buyerSnap = await getDoc(doc(db, "users", txn.buyerId));
        if (buyerSnap.exists()) {
          const buyer = buyerSnap.data();
          txn.buyerName = buyer.displayName || buyer.name || "Buyer";
        }

        txns.push(txn);
      }

      setTransactions(txns);
    } catch (err) {
      console.error("Error fetching transactions:", err);
    } finally {
      setLoading(false);
    }
  }

  function getStatusBadge(txn) {
    if (txn.dropOffStatus === "dropped_off") {
      return { label: "Item Dropped Off", color: "#4caf50", bg: "#e8f5e9" };
    }
    if (txn.dropOffStatus === "scheduled") {
      return { label: "Drop-off Scheduled", color: "#ff9800", bg: "#fff3e0" };
    }
    if (txn.status === "accepted") {
      return { label: "Accepted - Book Drop-off", color: "#2196f3", bg: "#e3f2fd" };
    }
    return { label: txn.status, color: "#9e9e9e", bg: "#f5f5f5" };
  }

  if (loading) {
    return (
      <>
        <NavBar />
        <div style={{ padding: "40px", textAlign: "center" }}>
          <p>Loading...</p>
        </div>
      </>
    );
  }

  if (!user) {
    return (
      <>
        <NavBar />
        <div style={{ padding: "40px", textAlign: "center" }}>
          <p>Please log in to access Trade Facility.</p>
          <button onClick={() => navigate("/login")}>Go to Login</button>
        </div>
      </>
    );
  }

  return (
    <>
      <NavBar />
      <div style={{
        maxWidth: "800px",
        margin: "0 auto",
        padding: "40px 20px",
        fontFamily: "'Segoe UI', sans-serif"
      }}>
        <h1 style={{ fontSize: "28px", fontWeight: "700", marginBottom: "8px" }}>
          Trade Facility
        </h1>
        <p style={{ color: "#666", marginBottom: "32px" }}>
          Track your transactions: drop-offs, collections, and trade exchanges
        </p>

        {transactions.length === 0 ? (
          <div style={{
            textAlign: "center",
            padding: "60px",
            backgroundColor: "#f9f9f9",
            borderRadius: "12px",
            color: "#999"
          }}>
            <p>No transactions yet.</p>
            <button
              onClick={() => navigate("/view-listing")}
              style={{
                marginTop: "16px",
                padding: "10px 20px",
                backgroundColor: "#4a90d9",
                color: "white",
                border: "none",
                borderRadius: "8px",
                cursor: "pointer"
              }}
            >
              Browse Listings
            </button>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            {transactions.map((txn) => {
              const badge = getStatusBadge(txn);
              return (
                <div key={txn.id} style={{
                  backgroundColor: "white",
                  border: "1px solid #e0e0e0",
                  borderRadius: "12px",
                  padding: "20px",
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "16px",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.05)"
                }}>
                  {/* Image placeholder */}
                  <div style={{
                    width: "80px",
                    height: "80px",
                    backgroundColor: "#f0f0f0",
                    borderRadius: "8px",
                    flexShrink: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#999",
                    fontSize: "12px"
                  }}>
                    IMG
                  </div>

                  {/* Details */}
                  <div style={{ flex: 1 }}>
                    <div style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      marginBottom: "8px"
                    }}>
                      <div>
                        <h3 style={{ margin: 0, fontSize: "16px", fontWeight: "600" }}>
                          {txn.listing?.title || "Item"}
                        </h3>
                        <p style={{ margin: "4px 0", color: "#666", fontSize: "14px" }}>
                          Buyer: {txn.buyerName}
                        </p>
                      </div>
                      {/* Status badge */}
                      <span style={{
                        padding: "4px 12px",
                        backgroundColor: badge.bg,
                        color: badge.color,
                        borderRadius: "20px",
                        fontSize: "13px",
                        fontWeight: "500",
                        whiteSpace: "nowrap"
                      }}>
                        {badge.label}
                      </span>
                    </div>

                    {/* Price */}
                    <div style={{ display: "flex", gap: "8px", marginBottom: "8px" }}>
                      <span style={{
                        padding: "2px 10px",
                        border: "1px solid #ddd",
                        borderRadius: "4px",
                        fontSize: "13px"
                      }}>
                        R{txn.listing?.price || "0"}
                      </span>
                      {txn.status === "accepted" && (
                        <span style={{
                          padding: "2px 10px",
                          backgroundColor: "#e8f5e9",
                          color: "#4caf50",
                          borderRadius: "4px",
                          fontSize: "13px"
                        }}>
                          Paid
                        </span>
                      )}
                    </div>

                    {/* Drop-off info */}
                    {txn.dropOffDate && (
                      <p style={{ margin: "4px 0", fontSize: "13px", color: "#555" }}>
                        📅 Drop-off: {txn.dropOffDate} {txn.dropOffTimeSlot}
                      </p>
                    )}

                    {/* Action button */}
                    {txn.status === "accepted" && !txn.dropOffStatus && (
                      <button
                        onClick={() => navigate(`/book-dropoff/${txn.id}`)}
                        style={{
                          marginTop: "12px",
                          padding: "8px 16px",
                          backgroundColor: "#4a90d9",
                          color: "white",
                          border: "none",
                          borderRadius: "8px",
                          cursor: "pointer",
                          fontSize: "13px"
                        }}
                      >
                        Book Drop-off
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}