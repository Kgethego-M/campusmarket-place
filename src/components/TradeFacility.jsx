import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { auth, db } from "../firebase.js";
import { collection, query, where, getDocs, doc, getDoc } from "firebase/firestore";
import NavBar from "./NavBarTemp.jsx";
import styles from "./TradeFacility.module.css";

function formatPrice(value) {
  const num = Number(String(value ?? "0").replace(/\s/g, ""));
  if (isNaN(num)) return "0";
  return num.toLocaleString("en-ZA", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

export default function TradeFacility() {
  const [user, setUser]                 = useState(null);
  const [loading, setLoading]           = useState(true);
  const [transactions, setTransactions] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    document.body.style.background = "#f5f7fa";
    return () => { document.body.style.background = ""; };
  }, []);

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
      const ACTIVE_STATUSES = [
        "waiting",             // ← buyer agreed to pay; seller must book drop-off
        "accepted",
        "in_facility",
        "ready_to_release",
        "awaiting_collection",
      ];

      const [sellerSnaps, buyerSnaps] = await Promise.all([
        Promise.all(
          ACTIVE_STATUSES.map(status =>
            getDocs(query(
              collection(db, "transactions"),
              where("sellerId", "==", uid),
              where("status", "==", status)
            ))
          )
        ),
        Promise.all(
          ACTIVE_STATUSES.map(status =>
            getDocs(query(
              collection(db, "transactions"),
              where("buyerId", "==", uid),
              where("status", "==", status)
            ))
          )
        ),
      ]);

      // Merge and deduplicate
      const seen = new Set();
      const txns = [];
      [...sellerSnaps, ...buyerSnaps].forEach(snap => {
        snap.docs.forEach(d => {
          if (!seen.has(d.id)) {
            seen.add(d.id);
            txns.push({ id: d.id, ...d.data(), _currentUserId: uid });
          }
        });
      });

      // Enrich with listing + counterparty name
      const enriched = await Promise.all(
        txns.map(async (txn) => {
          const isSeller = txn.sellerId === uid;
          const counterpartyId = isSeller ? txn.buyerId : txn.sellerId;

          const [listingSnap, counterpartySnap] = await Promise.all([
            getDoc(doc(db, "listings", txn.listingId)),
            getDoc(doc(db, "users", counterpartyId)),
          ]);

          if (listingSnap.exists()) txn.listing = listingSnap.data();

          if (counterpartySnap.exists()) {
            const u = counterpartySnap.data();
            txn.counterpartyName =
              (u.firstName && u.lastName) ? `${u.firstName} ${u.lastName}` :
              u.displayName || u.name ||
              (u.email ? u.email.split("@")[0] : isSeller ? "Buyer" : "Seller");
          } else {
            txn.counterpartyName = isSeller ? "Unknown Buyer" : "Unknown Seller";
          }

          txn.isSeller = isSeller;
          return txn;
        })
      );

      const ORDER = {
        waiting: 0,
        accepted: 1,
        in_facility: 2,
        ready_to_release: 3,
        awaiting_collection: 4,
      };
      enriched.sort((a, b) => (ORDER[a.status] ?? 9) - (ORDER[b.status] ?? 9));

      setTransactions(enriched);
    } catch (err) {
      console.error("Error fetching transactions:", err);
    } finally {
      setLoading(false);
    }
  }

  function getStatusBadge(txn) {
    if (txn.status === "waiting")
      return { label: "Book drop-off",       color: "#1e40af", bg: "#dbeafe" };
    if (txn.status === "awaiting_collection")
      return { label: "Awaiting Collection", color: "#6d28d9", bg: "#ede9fe" };
    if (txn.status === "ready_to_release")
      return { label: "Ready to Release",    color: "#c2410c", bg: "#ffedd5" };
    if (txn.status === "in_facility")
      return { label: "Item at Facility",    color: "#0369a1", bg: "#e0f2fe" };
    if (txn.dropOffStatus === "dropped_off")
      return { label: "Item dropped off",    color: "#166534", bg: "#dcfce7" };
    if (txn.dropOffStatus === "scheduled")
      return { label: "Drop-off scheduled",  color: "#92400e", bg: "#fef3c7" };
    if (txn.status === "accepted")
      return { label: "Book drop-off",       color: "#1e40af", bg: "#dbeafe" };
    return   { label: txn.status,            color: "#374151", bg: "#f3f4f6" };
  }

  // ── "waiting" and "accepted" both mean seller must book drop-off ──
  const canBookDropOff = (txn) =>
    txn.isSeller &&
    ["waiting", "accepted"].includes(txn.status) &&
    !txn.bookingId;

  const hasDropOffBooked = (txn) =>
    txn.isSeller &&
    (txn.dropOffStatus === "scheduled" || !!txn.bookingId);

  const canBookCollection = (txn) => {
    const itemAtFacility = ["in_facility", "ready_to_release", "awaiting_collection"].includes(txn.status);
    if (!itemAtFacility || txn.collectionBookingId) return false;
    if (!txn.isSeller) return true;
    return txn.type === "trade";
  };

  const hasCollectionBooked = (txn) =>
    !!txn.collectionBookingId;

  if (loading) {
    return (
      <>
        <NavBar />
        <div className={styles.page}>
          <div className={styles.header}>
            <div>
              <div className={`${styles.shimmer} ${styles.skeletonLine}`}
                   style={{ width: 180, height: 28, marginBottom: 8 }} />
              <div className={`${styles.shimmer} ${styles.skeletonLine}`}
                   style={{ width: 260, height: 14 }} />
            </div>
          </div>
          <div className={styles.list}>
            {[1, 2, 3].map(n => (
              <div key={n} className={styles.card}
                   style={{ animationDelay: `${n * 0.07}s` }}>
                <div className={`${styles.shimmer} ${styles.skeletonImg}`} />
                <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 10 }}>
                  <div className={`${styles.shimmer} ${styles.skeletonLine}`}
                       style={{ width: "55%", height: 14 }} />
                  <div className={`${styles.shimmer} ${styles.skeletonLine}`}
                       style={{ width: "35%", height: 12 }} />
                  <div className={`${styles.shimmer} ${styles.skeletonLine}`}
                       style={{ width: "45%", height: 12 }} />
                </div>
                <div className={`${styles.shimmer} ${styles.skeletonBadge}`} />
              </div>
            ))}
          </div>
        </div>
      </>
    );
  }

  if (!user) {
    return (
      <>
        <NavBar />
        <div className={styles.centred}>
          <p>Please log in to access Trade Facility.</p>
          <button className={styles.primaryBtn} onClick={() => navigate("/login")}>
            Go to login
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      <NavBar />
      <div className={styles.page}>
        <div className={styles.header}>
          <div>
            <h1 className={styles.heading}>Trade Facility</h1>
            <p className={styles.subheading}>
              <strong>Track your drop-offs, collections and trade exchanges</strong>
            </p>
          </div>
          {transactions.length > 0 && (
            <span className={styles.countChip}>
              {transactions.length} transaction{transactions.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>

        {transactions.length === 0 ? (
          <div className={styles.empty}>
            <div className={styles.emptyIcon}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none"
                   stroke="currentColor" strokeWidth="1.5">
                <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>
                <polyline points="9 22 9 12 15 12 15 22"/>
              </svg>
            </div>
            <p className={styles.emptyTitle}>No transactions waiting</p>
            <p className={styles.emptySub}>
              When a buyer confirms payment, you'll be able to book a drop‑off here.
            </p>
            <button className={styles.primaryBtn}
                    onClick={() => navigate("/view-listing")}>
              Browse listings
            </button>
          </div>
        ) : (
          <div className={styles.list}>
            {transactions.map((txn, idx) => {
              const badge    = getStatusBadge(txn);
              const imageUrl = txn.listing?.photos?.[0] ?? null;

              return (
                <div key={txn.id} className={styles.card}
                     style={{ animationDelay: `${idx * 0.06}s` }}>
                  <div className={styles.imgWrap}>
                    {imageUrl
                      ? <img src={imageUrl} alt={txn.listing?.title} className={styles.img} />
                      : <div className={styles.imgPlaceholder}>
                          <svg width="24" height="24" viewBox="0 0 24 24" fill="none"
                               stroke="#9ca3af" strokeWidth="1.5">
                            <rect x="3" y="3" width="18" height="18" rx="2"/>
                            <circle cx="8.5" cy="8.5" r="1.5"/>
                            <polyline points="21 15 16 10 5 21"/>
                          </svg>
                        </div>
                    }
                  </div>

                  <div className={styles.cardBody}>
                    <p className={styles.itemTitle}>
                      {txn.listing?.title ?? "Item"}
                      <span style={{
                        marginLeft: 6, fontSize: "0.7rem", borderRadius: 4,
                        padding: "1px 6px",
                        background: txn.isSeller ? "#dcfce7" : "#dbeafe",
                        color:      txn.isSeller ? "#166534" : "#1e40af",
                      }}>
                        {txn.isSeller ? "Selling" : "Buying"}
                      </span>
                      {txn.type === "trade" && (
                        <span style={{ marginLeft: 4, fontSize: "0.7rem", background: "#ede9fe", color: "#6d28d9", borderRadius: 4, padding: "1px 6px" }}>
                          Trade
                        </span>
                      )}
                    </p>

                    <div className={styles.metaRow}>
                      <span className={styles.metaPrice}>
                        R{formatPrice(txn.listing?.price)}
                      </span>
                      <span className={styles.metaDot}>·</span>
                      <span className={styles.metaItem}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                             stroke="currentColor" strokeWidth="2">
                          <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/>
                          <circle cx="12" cy="7" r="4"/>
                        </svg>
                        {txn.isSeller ? `Buyer: ${txn.counterpartyName}` : `Seller: ${txn.counterpartyName}`}
                      </span>
                    </div>

                    {txn.dropOffDate && (
                      <p className={styles.dropOffDate}>
                        Drop-off: {txn.dropOffDate} · {txn.dropOffTimeSlot}
                      </p>
                    )}

                    {txn.collectionDate && (
                      <p className={styles.dropOffDate} style={{ color: "#6d28d9" }}>
                        Collection: {txn.collectionDate} · {txn.collectionTimeSlot}
                      </p>
                    )}

                    {/* ── SELLER: Book drop-off ── */}
                    {canBookDropOff(txn) && (
                      <button
                        className={styles.dropOffBtn}
                        onClick={() => navigate(`/book-dropoff/${txn.id}`)}
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                             stroke="currentColor" strokeWidth="2.5">
                          <rect x="3" y="4" width="18" height="18" rx="2"/>
                          <line x1="16" y1="2" x2="16" y2="6"/>
                          <line x1="8"  y1="2" x2="8"  y2="6"/>
                          <line x1="3"  y1="10" x2="21" y2="10"/>
                        </svg>
                        Book drop-off
                      </button>
                    )}

                    {/* ── SELLER: Drop-off already booked ── */}
                    {hasDropOffBooked(txn) && (
                      <p style={{ fontSize: "0.75rem", color: "#166534", marginTop: 4 }}>
                        <i className="fas fa-calendar-check" style={{ marginRight: 4 }} />
                        Drop-off slot booked
                      </p>
                    )}

                    {/* ── BUYER: Book collection ── */}
                    {canBookCollection(txn) && (
                      <button
                        className={styles.dropOffBtn}
                        style={{ background: "#6d28d9", marginTop: 6 }}
                        onClick={() => navigate(`/book-collection/${txn.id}`)}
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                             stroke="currentColor" strokeWidth="2.5">
                          <rect x="3" y="4" width="18" height="18" rx="2"/>
                          <line x1="16" y1="2" x2="16" y2="6"/>
                          <line x1="8"  y1="2" x2="8"  y2="6"/>
                          <line x1="3"  y1="10" x2="21" y2="10"/>
                        </svg>
                        Book collection
                      </button>
                    )}

                    {/* ── Collection already booked ── */}
                    {hasCollectionBooked(txn) && (
                      <p style={{ fontSize: "0.75rem", color: "#6d28d9", marginTop: 4 }}>
                        <i className="fas fa-calendar-check" style={{ marginRight: 4 }} />
                        Collection slot booked
                      </p>
                    )}
                  </div>

                  <div className={styles.badgeWrap}>
                    <span className={styles.badge}
                          style={{ background: badge.bg, color: badge.color }}>
                      {badge.label}
                    </span>
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
