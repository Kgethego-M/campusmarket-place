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

/* ── Derive pipeline stage from transaction ───────────────────── */
function getPipelineStage(txn) {
  const status       = txn.status;
  const dropOffStatus = txn.dropOffStatus;

  if (status === "completed" || status === "awaiting_collection") return 5;
  if (status === "ready_for_release")                             return 4;
  if (status === "in_facility")                                   return 3;
  if (dropOffStatus === "scheduled")                              return 2;
  return 1;
}

const PIPELINE_STEPS = [
  { label: "Waiting for seller to book drop-off" },
  { label: "Drop-off booked — awaiting delivery" },
  { label: "Item received — being inspected"     },
  { label: "Evaluation complete — ready for pick-up" },
  { label: "Collected"                            },
];

/* ── Seller badge ─────────────────────────────────────────────── */
function getSellerStatusBadge(txn) {
  const s = txn.dropOffStatus;
  if (s === "inspection_pass")           return { label: "Inspection passed", color: "#166534", bg: "#dcfce7" };
  if (s === "inspection_fail")           return { label: "Inspection failed",  color: "#791F1F", bg: "#FCEBEB" };
  if (txn.status === "in_facility")      return { label: "In Facility",        color: "#0369a1", bg: "#e0f2fe" };
  if (s === "dropped_off")               return { label: "Item dropped off",   color: "#166534", bg: "#dcfce7" };
  if (s === "scheduled")                 return { label: "Drop-off scheduled", color: "#92400e", bg: "#fef3c7" };
  return                                        { label: "Awaiting drop-off",  color: "#1e40af", bg: "#dbeafe" };
}

/* ── Buyer tracker card ───────────────────────────────────────── */
function BuyerTrackerCard({ txn, idx }) {
  const stage    = getPipelineStage(txn);
  const failed   = txn.dropOffStatus === "inspection_fail";
  const price    = formatPrice(txn.agreedPrice ?? txn.listing?.price);
  const imageUrl = txn.listing?.photos?.[0] ?? null;

  return (
    <div
      className={`${styles.trackerCard} ${failed ? styles.trackerCardFailed : ""}`}
      style={{ animationDelay: `${idx * 0.06}s` }}
    >
      {/* ── Item summary ── */}
      <div className={styles.trackerTop}>
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
        <div className={styles.trackerInfo}>
          <p className={styles.itemTitle}>{txn.listing?.title ?? "Item"}</p>
          <div className={styles.metaRow}>
            <span className={styles.metaPrice}>R{price}</span>
            <span className={styles.metaDot}>·</span>
            <span className={styles.metaItem}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                   stroke="currentColor" strokeWidth="2">
                <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/>
                <circle cx="12" cy="7" r="4"/>
              </svg>
              {txn.sellerName || txn.counterpartyName}
            </span>
          </div>
          {txn.dropOffDate && (
            <p className={styles.dropOffDate}>
              Drop-off: {txn.dropOffDate} · {txn.dropOffTimeSlot}
            </p>
          )}
        </div>
      </div>

      {/* ── Divider ── */}
      <div className={styles.trackerDivider} />

      {/* ── Pipeline or failed banner ── */}
      {failed ? (
        <div className={styles.failedBanner}>
          <div className={styles.failedIcon}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
          </div>
          <div>
            <p className={styles.failedTitle}>Evaluation failed</p>
            <p className={styles.failedSub}>
              This item did not pass inspection. Please contact support to resolve this transaction.
            </p>
          </div>
        </div>
      ) : (
        <div className={styles.pipeline}>
          {PIPELINE_STEPS.map((step, i) => {
            const stepNum   = i + 1;
            const completed = stage > stepNum;
            const active    = stage === stepNum;
            const pending   = !completed && !active;
            const isLast    = i === PIPELINE_STEPS.length - 1;

            return (
              <div key={i} className={styles.pipelineStep}>
                <div className={styles.pipelineLeft}>
                  {/* Dot */}
                  <div className={`${styles.pipelineDot}
                    ${completed ? styles.pipelineDotDone    : ""}
                    ${active    ? styles.pipelineDotActive  : ""}
                    ${pending   ? styles.pipelineDotPending : ""}
                  `}>
                    {completed && (
                      <svg width="9" height="9" viewBox="0 0 24 24" fill="none"
                           stroke="currentColor" strokeWidth="3.5">
                        <polyline points="20 6 9 17 4 12"/>
                      </svg>
                    )}
                    {active && <span className={styles.pipelinePulse} />}
                  </div>
                  {/* Connector line (skip last) */}
                  {!isLast && (
                    <div className={`${styles.pipelineConnector}
                      ${completed ? styles.pipelineConnectorDone : ""}
                    `} />
                  )}
                </div>

                <div className={styles.pipelineRight}>
                  <div className={styles.pipelineLabelRow}>
                    <span className={`${styles.pipelineLabel}
                      ${completed ? styles.pipelineLabelDone    : ""}
                      ${active    ? styles.pipelineLabelActive  : ""}
                      ${pending   ? styles.pipelineLabelPending : ""}
                    `}>
                      {step.label}
                    </span>
                    {active && stage < 4 && (
                      <span className={styles.pipelineInProgressBadge}>In progress</span>
                    )}
                    {active && stage === 4 && (
                      <span className={styles.pipelineReadyBadge}>Ready ✓</span>
                    )}
                    {active && stage === 5 && (
                      <span className={styles.pipelineReadyBadge}>Collected ✓</span>
                    )}
                  </div>
                  {/* Extra spacing below label except last */}
                  {!isLast && <div style={{ height: 14 }} />}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ── Main ─────────────────────────────────────────────────────── */
export default function TradeFacility() {
  const [user, setUser]               = useState(null);
  const [loading, setLoading]         = useState(true);
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
      // Fetch all active seller transactions
      const ACTIVE_STATUSES = ["accepted", "in_facility", "ready_to_release", "awaiting_collection"];

      const snapshots = await Promise.all(
        ACTIVE_STATUSES.map(status =>
          getDocs(query(
            collection(db, "transactions"),
            where("sellerId", "==", uid),
            where("status", "==", status)
          ))
        )
      );

      // Merge and deduplicate
      const seen = new Set();
      const txns = [];
      snapshots.forEach(snap => {
        snap.docs.forEach(d => {
          if (!seen.has(d.id)) {
            seen.add(d.id);
            txns.push({ id: d.id, ...d.data() });
          }
        });
      });

      const [listingSnaps, buyerSnaps] = await Promise.all([
        Promise.all(txns.map(t => getDoc(doc(db, "listings", t.listingId)))),
        Promise.all(txns.map(t => getDoc(doc(db, "users",    t.buyerId)))),
      ]);

      const enriched = txns.map((txn, i) => {
        if (listingSnaps[i].exists()) txn.listing = listingSnaps[i].data();
        if (buyerSnaps[i].exists()) {
          const b = buyerSnaps[i].data();
          txn.buyerName =
            (b.firstName && b.lastName) ? `${b.firstName} ${b.lastName}` :
            b.displayName || b.name ||
            (b.email ? b.email.split("@")[0] : "Buyer");
        } else {
          txn.buyerName = "Unknown User";
        }
        return txn;
      });

      // Sort: accepted first, then in_facility, ready_to_release, awaiting_collection
      const ORDER = { accepted: 0, in_facility: 1, ready_to_release: 2, awaiting_collection: 3 };
      enriched.sort((a, b) => (ORDER[a.status] ?? 9) - (ORDER[b.status] ?? 9));

      setTransactions(enriched);
    } catch (err) {
      console.error("Error fetching transactions:", err);
    } finally {
      setLoading(false);
    }
  }

  function getStatusBadge(txn) {
  if (txn.status === "awaiting_collection")
    return { label: "Awaiting Collection", color: "#6d28d9", bg: "#ede9fe" };
  if (txn.status === "ready_to_release")
    return { label: "Ready to Release",    color: "#c2410c", bg: "#ffedd5" };
  if (txn.status === "in_facility")
    return { label: "Item at Facility",    color: "#0369a1", bg: "#e0f2fe" };
  if (txn.dropOffStatus === "dropped_off")
    return { label: "Item at Facility",    color: "#0369a1", bg: "#e0f2fe" };
  if (txn.dropOffStatus === "scheduled")
    return { label: "Drop-off Scheduled",  color: "#92400e", bg: "#fef3c7" };
  if (txn.status === "accepted")
    return { label: "Book drop-off",       color: "#1e40af", bg: "#dbeafe" };
  return   { label: txn.status,            color: "#374151", bg: "#f3f4f6" };
}

  // Seller can book collection for trades — they also need to collect the buyer's item
  const canBookCollection = (txn) =>
    txn.type === "trade" &&
    ["in_facility", "ready_to_release"].includes(txn.status) &&
    !txn.collectionBookingId;

  const hasCollectionBooked = (txn) =>
    txn.type === "trade" &&
    ["in_facility", "ready_to_release", "awaiting_collection"].includes(txn.status) &&
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
                      {txn.type === "trade" && (
                        <span style={{ marginLeft: 6, fontSize: "0.7rem", background: "#dbeafe", color: "#1e40af", borderRadius: 4, padding: "1px 6px" }}>
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
                        {txn.buyerName}
                      </span>
                    </div>

                    {/* Drop-off schedule info */}
                    {txn.dropOffDate && (
                      <p className={styles.dropOffDate}>
                        Drop-off: {txn.dropOffDate} · {txn.dropOffTimeSlot}
                      </p>
                    )}

                    {/* Collection schedule info */}
                    {txn.collectionDate && (
                      <p className={styles.dropOffDate} style={{ color: "#6d28d9" }}>
                        Collection: {txn.collectionDate} · {txn.collectionTimeSlot}
                      </p>
                    )}

                    {/* Book drop-off button — accepted, not yet scheduled */}
                    {txn.status === "accepted" && !txn.dropOffStatus && (
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

                    {/* Book collection button — trade only, item at facility */}
                    {canBookCollection(txn) && (
                      <button
                        className={styles.dropOffBtn}
                        style={{ background: "#0ea5e9", marginTop: 6 }}
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

                    {/* Collection already booked confirmation */}
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