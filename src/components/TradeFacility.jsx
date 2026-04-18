import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { auth, db } from "../firebase.js";
import { collection, query, where, getDocs, doc, getDoc } from "firebase/firestore";
import NavBar from "./NavBarTemp.jsx";
import styles from "./TradeFacility.module.css";

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
      const q = query(
        collection(db, "transactions"),
        where("sellerId", "==", uid)
      );
      const snapshot = await getDocs(q);
      const rawTxns = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));

      // Fetch all listings + buyers in parallel instead of sequentially
      const enriched = await Promise.all(
        rawTxns.map(async (txn) => {
          const [listingSnap, buyerSnap] = await Promise.all([
            getDoc(doc(db, "listings", txn.listingId)),
            getDoc(doc(db, "users", txn.buyerId)),
          ]);

          if (listingSnap.exists()) txn.listing = listingSnap.data();

          if (buyerSnap.exists()) {
            const b = buyerSnap.data();
            txn.buyerName =
              `${b.firstName || ""} ${b.lastName || ""}`.trim() ||
              b.displayName ||
              b.name ||
              b.email ||
              "Unknown Buyer";
          } else {
            txn.buyerName = "Unknown Buyer";
          }

          return txn;
        })
      );

      setTransactions(enriched);
    } catch (err) {
      console.error("Error fetching transactions:", err);
    } finally {
      setLoading(false);
    }
  }

  function getStatusConfig(txn) {
    if (txn.dropOffStatus === "dropped_off")
      return { label: "Item Dropped Off", color: "#16a34a", bg: "#dcfce7", icon: "✓" };
    if (txn.dropOffStatus === "scheduled")
      return { label: "Drop-off Scheduled", color: "#d97706", bg: "#fef3c7", icon: "📅" };
    if (txn.status === "accepted")
      return { label: "Accepted", color: "#2563eb", bg: "#dbeafe", icon: "✓" };
    if (txn.status === "pending")
      return { label: "Pending", color: "#7c3aed", bg: "#ede9fe", icon: "⏳" };
    return { label: txn.status || "Unknown", color: "#6b7280", bg: "#f3f4f6", icon: "·" };
  }

  // ── Skeleton card ──────────────────────────────────────────────
  const SkeletonCard = ({ delay = 0 }) => (
    <div className={styles.card} style={{ animationDelay: `${delay}ms` }}>
      <div className={`${styles.skeletonImg} ${styles.shimmer}`} />
      <div className={styles.cardBody}>
        <div className={`${styles.skeletonLine} ${styles.shimmer}`} style={{ width: "55%", height: 16 }} />
        <div className={`${styles.skeletonLine} ${styles.shimmer}`} style={{ width: "35%", height: 12, marginTop: 8 }} />
        <div className={`${styles.skeletonLine} ${styles.shimmer}`} style={{ width: "25%", height: 12, marginTop: 6 }} />
      </div>
      <div className={`${styles.skeletonBadge} ${styles.shimmer}`} />
    </div>
  );

  if (!user && !loading) {
    return (
      <>
        <NavBar />
        <div className={styles.centred}>
          <p>Please log in to access Trade Facility.</p>
          <button className={styles.primaryBtn} onClick={() => navigate("/login")}>
            Go to Login
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      <NavBar />
      <div className={styles.page}>

        {/* ── Header ── */}
        <div className={styles.header}>
          <div>
            <h1 className={styles.heading}>Trade Facility</h1>
            <p className={styles.subheading}>
              Track drop-offs, collections, and trade exchanges
            </p>
          </div>
          {!loading && (
            <span className={styles.countChip}>
              {transactions.length} transaction{transactions.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>

        {/* ── Loading skeletons ── */}
        {loading && (
          <div className={styles.list}>
            {[0, 1, 2].map((i) => <SkeletonCard key={i} delay={i * 80} />)}
          </div>
        )}

        {/* ── Empty state ── */}
        {!loading && transactions.length === 0 && (
          <div className={styles.empty}>
            <div className={styles.emptyIcon}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <path d="M21 10V7a2 2 0 00-2-2H5a2 2 0 00-2 2v3"/><path d="M3 10h18v11H3z"/><path d="M12 10v11"/>
              </svg>
            </div>
            <p className={styles.emptyTitle}>No transactions yet</p>
            <p className={styles.emptySub}>Accepted offers will appear here for you to manage drop-offs.</p>
            <button className={styles.primaryBtn} onClick={() => navigate("/view-listing")}>
              Browse Listings
            </button>
          </div>
        )}

        {/* ── Transaction cards ── */}
        {!loading && transactions.length > 0 && (
          <div className={styles.list}>
            {transactions.map((txn, i) => {
              const badge = getStatusConfig(txn);
              const imageUrl = txn.listing?.photos?.[0] || txn.listing?.imageUrl || null;
              const price = txn.listing?.price ?? txn.agreedPrice ?? 0;

              return (
                <div
                  key={txn.id}
                  className={styles.card}
                  style={{ animationDelay: `${i * 70}ms` }}
                >
                  {/* Image */}
                  <div className={styles.imgWrap}>
                    {imageUrl ? (
                      <img src={imageUrl} alt={txn.listing?.title} className={styles.img} />
                    ) : (
                      <div className={styles.imgPlaceholder}>
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ccc" strokeWidth="1.5">
                          <rect x="3" y="3" width="18" height="18" rx="2"/>
                          <circle cx="8.5" cy="8.5" r="1.5"/>
                          <path d="M21 15l-5-5L5 21"/>
                        </svg>
                      </div>
                    )}
                  </div>

                  {/* Body */}
                  <div className={styles.cardBody}>
                    <h3 className={styles.itemTitle}>
                      {txn.listing?.title || "Untitled Item"}
                    </h3>

                    <div className={styles.metaRow}>
                      <span className={styles.metaItem}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                          <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/>
                        </svg>
                        {txn.buyerName}
                      </span>
                      <span className={styles.metaDot}>·</span>
                      <span className={styles.metaPrice}>R {Number(price).toLocaleString()}</span>
                      {txn.type && (
                        <>
                          <span className={styles.metaDot}>·</span>
                          <span className={styles.metaType}>{txn.type === "trade" ? "Trade" : "Sale"}</span>
                        </>
                      )}
                    </div>

                    {txn.dropOffDate && (
                      <p className={styles.dropOffDate}>
                        📅 Drop-off: {txn.dropOffDate}
                        {txn.dropOffTimeSlot ? ` · ${txn.dropOffTimeSlot}` : ""}
                      </p>
                    )}

                    {txn.status === "accepted" && !txn.dropOffStatus && (
                      <button
                        className={styles.dropOffBtn}
                        onClick={() => navigate(`/book-dropoff/${txn.id}`)}
                      >
                        Book Drop-off →
                      </button>
                    )}
                  </div>

                  {/* Badge */}
                  <div className={styles.badgeWrap}>
                    <span
                      className={styles.badge}
                      style={{ color: badge.color, backgroundColor: badge.bg }}
                    >
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