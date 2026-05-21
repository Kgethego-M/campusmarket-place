import { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { auth, db } from "../firebase.js";
import { collection, query, where, getDocs, doc, getDoc, onSnapshot, updateDoc, serverTimestamp } from "firebase/firestore";
import NavBar from "./NavBarTemp.jsx";
import styles from "./TradeFacility.module.css";

function formatPrice(value) {
  const num = Number(String(value ?? "0").replace(/\s/g, ""));
  if (isNaN(num)) return "0";
  return num.toLocaleString("en-ZA", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function getPipelineStage(txn) {
  const status        = txn.status;
  const dropOffStatus = txn.dropOffStatus;
  if (status === "completed")           return 5;
  if (status === "awaiting_collection") return 4;
  if (dropOffStatus === "scheduled")    return 2;
  return 1;
}

const PIPELINE_STEPS = [
  { label: "Waiting for seller to book drop-off" },
  { label: "Drop-off booked — awaiting delivery" },
  { label: "Item confirmed — ready for pick-up"  },
  { label: "Collected"                           },
];

const CONDITION_COLORS = {
  'New':      { color: '#0369a1', bg: '#e0f2fe' },
  'Like New': { color: '#0284c7', bg: '#f0f9ff' },
  'Good':     { color: '#0e7490', bg: '#ecfeff' },
  'Fair':     { color: '#d97706', bg: '#fffbeb' },
  'Poor':     { color: '#dc2626', bg: '#fef2f2' },
};

// ── Trade item mini-card ──────────────────────────────────────────────────────
function TradeItemMini({ tradeItem, label = "Buyer's trade item" }) {
  if (!tradeItem) return null;

  if (typeof tradeItem === 'string') {
    return (
      <div style={{
        marginTop: 10, padding: '8px 12px',
        background: '#f0f6ff', border: '1px solid #bdd6f0',
        borderLeft: '3px solid #6AA6DA', borderRadius: 8,
        fontSize: '0.75rem', color: '#1e3a5f',
      }}>
        <span style={{ fontWeight: 700, marginRight: 4 }}>{label}:</span>
        {tradeItem}
      </div>
    );
  }

  const cs = CONDITION_COLORS[tradeItem.condition] || { color: '#6b7280', bg: '#f3f4f6' };

  return (
    <div style={{
      marginTop: 10,
      background: '#f0f6ff', border: '1px solid #bdd6f0',
      borderLeft: '3px solid #6AA6DA', borderRadius: 8,
      overflow: 'hidden',
    }}>
      <div style={{
        padding: '5px 10px', background: '#e8f2fb',
        borderBottom: '1px solid #bdd6f0',
        fontSize: '0.65rem', fontWeight: 700, color: '#1e4d8c',
        textTransform: 'uppercase', letterSpacing: '0.06em',
        display: 'flex', alignItems: 'center', gap: 5,
      }}>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/>
          <path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>
        </svg>
        {label}
      </div>

      <div style={{ display: 'flex', gap: 10, padding: '9px 10px', alignItems: 'flex-start' }}>
        {tradeItem.imageUrl
          ? <img src={tradeItem.imageUrl} alt={tradeItem.name}
              style={{ width: 48, height: 48, borderRadius: 7, objectFit: 'cover',
                       border: '1px solid #bdd6f0', flexShrink: 0 }} />
          : <div style={{ width: 48, height: 48, borderRadius: 7, background: '#dbeafe',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#93c5fd" strokeWidth="1.5">
                <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/>
                <path d="M21 15l-5-5L5 21"/>
              </svg>
            </div>
        }

        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: '0 0 4px', fontSize: '0.78rem', fontWeight: 700, color: '#1e3a5f',
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {tradeItem.name}
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {tradeItem.category && (
              <span style={{ fontSize: '0.65rem', fontWeight: 600, background: '#e0f2fe',
                             color: '#0369a1', borderRadius: 99, padding: '1px 7px' }}>
                {tradeItem.category}
              </span>
            )}
            {tradeItem.condition && (
              <span style={{ fontSize: '0.65rem', fontWeight: 600, background: cs.bg,
                             color: cs.color, borderRadius: 99, padding: '1px 7px' }}>
                {tradeItem.condition}
              </span>
            )}
          </div>
          {tradeItem.description && (
            <p style={{ margin: '4px 0 0', fontSize: '0.68rem', color: '#4a6a8a',
                        lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
              {tradeItem.description}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Buyer tracker card ────────────────────────────────────────────────────────
function BuyerTrackerCard({ txn, idx, isHighlighted, isOverdueHL, highlightRef }) {
  const stage    = getPipelineStage(txn);
  const failed   = txn.dropOffStatus === "inspection_fail";
  const imageUrl = txn.listing?.photos?.[0] ?? null;
  const isTrade  = txn.type === 'trade';

  return (
    <div
      ref={isHighlighted || isOverdueHL ? highlightRef : null}
      className={`${styles.trackerCard} ${failed ? styles.trackerCardFailed : ""}`}
      style={{
        animationDelay: `${idx * 0.06}s`,
        ...(isOverdueHL ? {
          boxShadow: '0 0 0 3px #dc2626, 0 4px 20px rgba(220,38,38,0.22)',
          borderColor: '#dc2626',
          background: '#fff8f8',
        } : isHighlighted ? {
          boxShadow: '0 0 0 3px #8b5cf6, 0 4px 20px rgba(139,92,246,0.18)',
          borderColor: '#8b5cf6',
        } : {}),
      }}
    >
      {/* Item summary */}
      <div className={styles.trackerTop}>
        <div className={styles.imgWrap}>
          {imageUrl
            ? <img src={imageUrl} alt={txn.listing?.title} className={styles.img} />
            : <div className={styles.imgPlaceholder}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="1.5">
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
            <span className={styles.metaItem}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/>
                <circle cx="12" cy="7" r="4"/>
              </svg>
              {txn.sellerName || txn.counterpartyName}
            </span>
          </div>
          {txn.dropOffDate && (
            <p className={styles.dropOffDate}>
              Seller drop-off: {txn.dropOffDate} · {txn.dropOffTimeSlot}
            </p>
          )}
          {isTrade && txn.buyerDropOffDate && (
            <p className={styles.dropOffDate} style={{ color: '#6d28d9' }}>
              Your drop-off: {txn.buyerDropOffDate} · {txn.buyerDropOffTimeSlot}
            </p>
          )}
        </div>
      </div>

      {/* Trade item the buyer is giving */}
      {isTrade && txn.tradeItem && (
        <div style={{ padding: '0 0 4px' }}>
          <TradeItemMini tradeItem={txn.tradeItem} label="Your trade item" />
        </div>
      )}

      <div className={styles.trackerDivider} />

      {/* Pipeline or failed banner */}
      {failed ? (
        <div className={styles.failedBanner}>
          <div className={styles.failedIcon}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
          </div>
          <div>
            <p className={styles.failedTitle}>Evaluation failed</p>
            <p className={styles.failedSub}>This item did not pass inspection. Please contact support to resolve this transaction.</p>
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
                  <div className={`${styles.pipelineDot}
                    ${completed ? styles.pipelineDotDone    : ""}
                    ${active    ? styles.pipelineDotActive  : ""}
                    ${pending   ? styles.pipelineDotPending : ""}
                  `}>
                    {completed && (
                      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5">
                        <polyline points="20 6 9 17 4 12"/>
                      </svg>
                    )}
                    {active && <span className={styles.pipelinePulse} />}
                  </div>
                  {!isLast && (
                    <div className={`${styles.pipelineConnector} ${completed ? styles.pipelineConnectorDone : ""}`} />
                  )}
                </div>
                <div className={styles.pipelineRight}>
                  <div className={styles.pipelineLabelRow}>
                    <span className={`${styles.pipelineLabel}
                      ${completed ? styles.pipelineLabelDone    : ""}
                      ${active    ? styles.pipelineLabelActive  : ""}
                      ${pending   ? styles.pipelineLabelPending : ""}
                    `}>{step.label}</span>
                    {active && stage < 4 && <span className={styles.pipelineInProgressBadge}>In progress</span>}
                    {active && stage === 4 && <span className={styles.pipelineReadyBadge}>Ready</span>}
                    {active && stage === 5 && <span className={styles.pipelineReadyBadge}>Collected</span>}
                  </div>
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

function getSellerStatusBadge(txn) {
  const s = txn.dropOffStatus;
  const paymentMethod = (txn.paymentMethod || txn.paymentType || "").toLowerCase();
  const isCashOnly = paymentMethod === "cash" || paymentMethod === "cod" || paymentMethod === "fully_cash";

  if (s === "inspection_pass")       return { label: "Inspection passed", color: "#166534", bg: "#dcfce7" };
  if (s === "inspection_fail")       return { label: "Inspection failed",  color: "#791F1F", bg: "#FCEBEB" };
  if (s === "dropped_off")           return { label: "Item dropped off",   color: "#166534", bg: "#dcfce7" };
  if (s === "scheduled")             return { label: "Drop-off scheduled", color: "#92400e", bg: "#fef3c7" };

  if (!isCashOnly && !txn.paymentConfirmed && txn.status === "accepted") {
    return { label: "Awaiting payment", color: "#92400e", bg: "#fef3c7" };
  }

  return { label: "Awaiting drop-off", color: "#1e40af", bg: "#dbeafe" };
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function TradeFacility() {
  const [user,               setUser]               = useState(null);
  const [loading,            setLoading]            = useState(true);
  const [sellerTransactions, setSellerTransactions] = useState([]);
  const [buyerTransactions,  setBuyerTransactions]  = useState([]);
  const [activeTab,          setActiveTab]          = useState("seller");

  const [highlightId, setHighlightId] = useState(null);
  const [overdueHighlightId, setOverdueHighlightId] = useState(null);
  const highlightRef                  = useRef(null);

  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    document.body.style.background = "#f5f7fa";
    return () => { document.body.style.background = ""; };
  }, []);

  useEffect(() => {
    const params    = new URLSearchParams(location.search);
    const tabParam  = params.get('tab');
    const highlight = params.get('highlight');
    const overdueHL = params.get('overdueHighlight');
    if (tabParam === 'buyer' || tabParam === 'seller') setActiveTab(tabParam);
    if (highlight) setHighlightId(highlight);
    if (overdueHL) setOverdueHighlightId(overdueHL);
  }, [location.search]);

  useEffect(() => {
    if (highlightId && highlightRef.current) {
      setTimeout(() => {
        highlightRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 300);
    }
  }, [highlightId, sellerTransactions, buyerTransactions]);

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

  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, "transactions"),
      where("buyerId", "==", user.uid),
      where("status", "in", ["waiting", "accepted", "pending_payment", "awaiting_collection"])
    );

    const unsubscribe = onSnapshot(q, () => {
      fetchTransactions(user.uid);
    });

    return () => unsubscribe();
  }, [user]);

  async function fetchTransactions(uid) {
    setLoading(true);
    try {
      const ACTIVE_STATUSES = [
        "waiting",
        "accepted",
        "pending_payment",
        "awaiting_collection",
        "in_facility",
      ];

      const [sellerResults, buyerResults] = await Promise.all([
        Promise.all(ACTIVE_STATUSES.map(status =>
          getDocs(query(collection(db, "transactions"),
            where("sellerId", "==", uid),
            where("status", "==", status)
          ))
        )),
        Promise.all(ACTIVE_STATUSES.map(status =>
          getDocs(query(collection(db, "transactions"),
            where("buyerId", "==", uid),
            where("status", "==", status)
          ))
        )),
      ]);

      const sellerTxns = [];
      sellerResults.forEach(snap => snap.docs.forEach(d => sellerTxns.push({ id: d.id, ...d.data(), _currentUserId: uid })));

      const buyerTxns = [];
      buyerResults.forEach(snap => snap.docs.forEach(d => buyerTxns.push({ id: d.id, ...d.data(), _currentUserId: uid })));

      const [enrichedSeller, enrichedBuyer] = await Promise.all([
        Promise.all(sellerTxns.map(async (txn) => {
          const [listingSnap, counterpartySnap] = await Promise.all([
            getDoc(doc(db, "listings", txn.listingId)),
            getDoc(doc(db, "users",    txn.buyerId)),
          ]);
          if (listingSnap.exists())      txn.listing = listingSnap.data();
          if (counterpartySnap.exists()) {
            const u = counterpartySnap.data();
            txn.counterpartyName =
              (u.firstName && u.lastName) ? `${u.firstName} ${u.lastName}` :
              u.displayName || u.name || (u.email ? u.email.split("@")[0] : "Buyer");
          } else {
            txn.counterpartyName = "Unknown Buyer";
          }
          txn.tradeItem = txn.tradeItemDetails ?? txn.tradeItem ?? null;
          txn.isSeller = true;

          // ── Auto-heal: Stripe settled but paymentConfirmed not yet flipped ──
          // paymentSettled:true or paymentStatus:"paid" means money is in — heal
          // the flag so all downstream logic (other pages, staff panel) works too.
          const pm = (txn.paymentMethod || txn.paymentType || "").toLowerCase();
          const isOnline = pm !== "cash" && pm !== "cod" && pm !== "fully_cash" && txn.type !== "trade";
          if (isOnline && !txn.paymentConfirmed) {
            const ps = (txn.paymentStatus || "").toLowerCase();
            const settled = txn.paymentSettled === true || ps === "paid" || ps === "fully paid";
            if (settled) {
              try {
                await updateDoc(doc(db, "transactions", txn.id), {
                  paymentConfirmed:   true,
                  paymentConfirmedAt: serverTimestamp(),
                });
                txn.paymentConfirmed = true; // update local copy too
              } catch (healErr) {
                console.warn("Auto-heal paymentConfirmed failed:", healErr.message);
              }
            }
          }

          return txn;
        })),

        Promise.all(buyerTxns.map(async (txn) => {
          const [listingSnap, counterpartySnap] = await Promise.all([
            getDoc(doc(db, "listings", txn.listingId)),
            getDoc(doc(db, "users",    txn.sellerId)),
          ]);
          if (listingSnap.exists())      txn.listing = listingSnap.data();
          if (counterpartySnap.exists()) {
            const u = counterpartySnap.data();
            txn.counterpartyName =
              (u.firstName && u.lastName) ? `${u.firstName} ${u.lastName}` :
              u.displayName || u.name || (u.email ? u.email.split("@")[0] : "Seller");
          } else {
            txn.counterpartyName = "Unknown Seller";
          }
          txn.tradeItem = txn.tradeItemDetails ?? txn.tradeItem ?? null;
          txn.isSeller = false;
          return txn;
        })),
      ]);

      const ORDER = { waiting: 0, accepted: 1, awaiting_collection: 2 };

      // Hide seller cards only when staff have physically confirmed the item
      // was received (dropOffConfirmed/sellerDropOffConfirmed both written by
      // staff at the same time as droppedOffAt). A bookingId alone just means
      // a slot was scheduled — card must still show.
      const filteredSeller = enrichedSeller.filter(
        (txn) => !txn.dropOffConfirmed && !txn.sellerDropOffConfirmed
      );

      filteredSeller.sort((a, b) => (ORDER[a.status] ?? 9) - (ORDER[b.status] ?? 9));
      enrichedBuyer.sort((a, b)  => (ORDER[a.status] ?? 9) - (ORDER[b.status] ?? 9));

      setSellerTransactions(filteredSeller);
      setBuyerTransactions(enrichedBuyer);
    } catch (err) {
      console.error("Error fetching transactions:", err);
    } finally {
      setLoading(false);
    }
  }

  // ── Payment settled helper ────────────────────────────────────────────────
  // Covers every combination seen in real transactions:
  //   • paymentConfirmed: true          (manually/webhook confirmed)
  //   • paymentSettled: true            (Stripe webhook wrote this)
  //   • paymentStatus: "paid" | "Fully Paid"
  //   • cash / cod / fully_cash        (collected at facility — no online step)
  //   • trade                          (no money, always ok)
  function isPaymentSatisfied(txn) {
    if (txn.type === 'trade') return true;

    const pm = (txn.paymentMethod || txn.paymentType || "").toLowerCase();
    const isCash = pm === "cash" || pm === "cod" || pm === "fully_cash";
    if (isCash) return true;

    if (txn.paymentConfirmed === true) return true;
    if (txn.paymentSettled   === true) return true;

    const ps = (txn.paymentStatus || "").toLowerCase();
    if (ps === "paid" || ps === "fully paid") return true;

    return false;
  }

  // ── Button logic — all keyed off real Firestore fields ───────────────────
  //
  // Seller "Book drop-off" shows when:
  //   1. No bookingId yet (slot not yet reserved)
  //   2. Staff haven't confirmed physical receipt (dropOffConfirmed / sellerDropOffConfirmed)
  //   3. Status is still active
  //   4. Payment is satisfied (see isPaymentSatisfied above)
  const canBookDropOff = (txn) => {
    if (!txn.isSeller) return false;
    if (txn.bookingId) return false;
    if (txn.dropOffConfirmed || txn.sellerDropOffConfirmed) return false;
    if (!["waiting", "accepted", "awaiting_collection", "in_facility"].includes(txn.status)) return false;
    return isPaymentSatisfied(txn);
  };

  // Seller drop-off slot is booked but item not yet physically received
  const hasDropOffBooked = (txn) =>
    txn.isSeller &&
    !!txn.bookingId &&
    !txn.dropOffConfirmed &&
    !txn.sellerDropOffConfirmed;

  // Buyer "Book your trade drop-off" button:
  //   Show when this is a trade, buyer has no slot yet (no buyerBookingId),
  //   and the transaction is still active
  const canBookBuyerDropOff = (txn) =>
    !txn.isSeller &&
    txn.type === 'trade' &&
    !txn.buyerBookingId &&
    ["waiting", "accepted", "awaiting_collection", "in_facility"].includes(txn.status);

  const hasBuyerDropOffBooked = (txn) =>
    !txn.isSeller && txn.type === 'trade' && !!txn.buyerBookingId;

  // Buyer "Book collection" button:
  //   Show when item is at facility (awaiting_collection) and collection not yet booked.
  //   For trades, seller also gets a collection button.
  const canBookCollection = (txn) => {
    if (txn.status !== "awaiting_collection") return false;
    if (txn.collectionConfirmed) return false;         // already collected
    if (txn.collectionBookingId) return false;         // slot already booked
    if (!txn.isSeller) return true;                    // buyer always can
    return txn.type === "trade";                       // seller only for trades
  };

  // FIX: Include all active statuses for buyer trade cards shown in seller tab
  const buyerTradeTxns = buyerTransactions.filter(t => t.type === 'trade');

  const activeBuyerTransactions = buyerTransactions;

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
          <div className={`${styles.shimmer} ${styles.skeletonLine}`} style={{ width: 240, height: 38, borderRadius: 999, marginBottom: 24 }} />
          <div className={styles.list}>
            {[1, 2, 3].map(n => (
              <div key={n} className={styles.card}
                   style={{ animationDelay: `${n * 0.07}s` }}>
                <div className={`${styles.shimmer} ${styles.skeletonImg}`} />
                <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 10 }}>
                  <div className={`${styles.shimmer} ${styles.skeletonLine}`} style={{ width: "55%", height: 14 }} />
                  <div className={`${styles.shimmer} ${styles.skeletonLine}`} style={{ width: "35%", height: 12 }} />
                  <div className={`${styles.shimmer} ${styles.skeletonLine}`} style={{ width: "75%", height: 10 }} />
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

  const currentTransactions = activeTab === "seller" ? sellerTransactions : activeBuyerTransactions;
  const totalCount = activeTab === "seller"
    ? sellerTransactions.length + buyerTradeTxns.length
    : activeBuyerTransactions.length;

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
          {totalCount > 0 && (
            <span className={styles.countChip}>
              {totalCount} transaction{totalCount !== 1 ? "s" : ""}
            </span>
          )}
        </div>

        {/* Toggle */}
        <div className={styles.toggleWrap}>
          <button
            className={`${styles.toggleBtn} ${activeTab === "seller" ? styles.toggleActive : ""}`}
            onClick={() => setActiveTab("seller")}
          >
            Book Drop-off
            {sellerTransactions.length > 0 && (
              <span className={`${styles.toggleCount} ${activeTab === "seller" ? styles.toggleCountActive : ""}`}>
                {sellerTransactions.length}
              </span>
            )}
          </button>
          <button
            className={`${styles.toggleBtn} ${activeTab === "buyer" ? styles.toggleActive : ""}`}
            onClick={() => setActiveTab("buyer")}
          >
            Track Pick-up
            {activeBuyerTransactions.length > 0 && (
              <span className={`${styles.toggleCount} ${activeTab === "buyer" ? styles.toggleCountActive : ""}`}>
                {activeBuyerTransactions.length}
              </span>
            )}
          </button>
        </div>

        {/* Content */}
        {activeTab === "seller" && sellerTransactions.length === 0 && buyerTradeTxns.length === 0 ? (
          <div className={styles.empty}>
            <div className={styles.emptyIcon}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>
                <polyline points="9 22 9 12 15 12 15 22"/>
              </svg>
            </div>
            <p className={styles.emptyTitle}>No drop-offs to book</p>
            <p className={styles.emptySub}>
              When a buyer confirms payment on your listing, or you accept a trade offer, you'll book your drop-off here.
            </p>
            <button className={styles.primaryBtn} onClick={() => navigate("/view-listing")}>
              Browse listings
            </button>
          </div>
        ) : activeTab === "buyer" && activeBuyerTransactions.length === 0 ? (
          <div className={styles.empty}>
            <div className={styles.emptyIcon}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>
                <polyline points="9 22 9 12 15 12 15 22"/>
              </svg>
            </div>
            <p className={styles.emptyTitle}>No active purchases</p>
            <p className={styles.emptySub}>When you purchase an item, you can track its progress here.</p>
            <button className={styles.primaryBtn} onClick={() => navigate("/view-listing")}>
              Browse listings
            </button>
          </div>
        ) : (
          <div className={styles.list}>

            {/* ── Seller tab ──────────────────────────────────────────────────── */}
            {activeTab === "seller" && (
              <>
                {sellerTransactions.map((txn, idx) => {
                  const badge       = getSellerStatusBadge(txn);
                  const imageUrl    = txn.listing?.photos?.[0] ?? null;
                  const isTrade     = txn.type === 'trade';
                  const isHighlighted = highlightId === txn.id;
                  const isOverdueHL   = overdueHighlightId === txn.id;

                  // Derive button/status states
                  const showBookBtn   = canBookDropOff(txn);
                  const showBooked    = hasDropOffBooked(txn);
                  const showCollect   = canBookCollection(txn);

                  return (
                    <div
                      key={txn.id}
                      ref={isHighlighted || isOverdueHL ? highlightRef : null}
                      className={styles.card}
                      style={{
                        animationDelay: `${idx * 0.06}s`,
                        ...(isOverdueHL ? {
                          boxShadow: '0 0 0 3px #dc2626, 0 4px 20px rgba(220,38,38,0.22)',
                          borderColor: '#dc2626',
                          background: '#fff8f8',
                        } : isHighlighted ? {
                          boxShadow: '0 0 0 3px #8b5cf6, 0 4px 20px rgba(139,92,246,0.18)',
                          borderColor: '#8b5cf6',
                        } : {}),
                      }}
                    >
                      <div className={styles.imgWrap}>
                        {imageUrl
                          ? <img src={imageUrl} alt={txn.listing?.title} className={styles.img} />
                          : <div className={styles.imgPlaceholder}>
                              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="1.5">
                                <rect x="3" y="3" width="18" height="18" rx="2"/>
                                <circle cx="8.5" cy="8.5" r="1.5"/>
                                <polyline points="21 15 16 10 5 21"/>
                              </svg>
                            </div>
                        }
                      </div>

                      <div className={styles.cardBody}>
                        {isOverdueHL && (
                          <div style={{
                            display: 'flex', alignItems: 'center', gap: 7,
                            background: '#fef2f2', border: '1px solid #fca5a5',
                            borderRadius: 8, padding: '7px 10px', marginBottom: 8,
                            fontSize: '0.75rem', color: '#dc2626', fontWeight: 600,
                          }}>
                            <i className="fas fa-triangle-exclamation" />
                            This transaction is overdue — action required
                          </div>
                        )}
                        <p className={styles.itemTitle}>
                          {txn.listing?.title ?? "Item"}
                          <span style={{ marginLeft: 6, fontSize: "0.7rem", borderRadius: 4, padding: "1px 6px", background: "#dcfce7", color: "#166534" }}>
                            Selling
                          </span>
                          {isTrade && (
                            <span style={{ marginLeft: 4, fontSize: "0.7rem", background: "#ede9fe", color: "#6d28d9", borderRadius: 4, padding: "1px 6px" }}>
                              Trade
                            </span>
                          )}
                        </p>

                        <div className={styles.metaRow}>
                          <span className={styles.metaItem}>
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/>
                              <circle cx="12" cy="7" r="4"/>
                            </svg>
                            Buyer: {txn.counterpartyName}
                          </span>
                        </div>

                        {txn.dropOffDate && (
                          <p className={styles.dropOffDate}>
                            Your drop-off: {txn.dropOffDate} · {txn.dropOffTimeSlot}
                          </p>
                        )}
                        {txn.collectionDate && (
                          <p className={styles.dropOffDate} style={{ color: "#6d28d9" }}>
                            Collection: {txn.collectionDate} · {txn.collectionTimeSlot}
                          </p>
                        )}

                        {isTrade && txn.tradeItem && (
                          <TradeItemMini tradeItem={txn.tradeItem} label="Buyer's trade item" />
                        )}

                        {isTrade && txn.buyerDropOffDate && (
                          <p style={{ fontSize: "0.73rem", color: "#6d28d9", marginTop: 6, fontWeight: 600 }}>
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ marginRight: 4, verticalAlign: 'middle' }}>
                              <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/>
                              <line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                            </svg>
                            Buyer drop-off: {txn.buyerDropOffDate} · {txn.buyerDropOffTimeSlot}
                          </p>
                        )}
                        {isTrade && !txn.buyerBookingId && (
                          <p style={{ fontSize: "0.72rem", color: "#92400e", marginTop: 5, background: '#fef3c7', borderRadius: 6, padding: '3px 8px', display: 'inline-block' }}>
                            Waiting for buyer to book their drop-off
                          </p>
                        )}

                        {/* PRIMARY: Book drop-off slot */}
                        {showBookBtn && (
                          <button
                            className={styles.dropOffBtn}
                            onClick={() => navigate(`/book-dropoff/${txn.id}`)}
                          >
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                              <rect x="3" y="4" width="18" height="18" rx="2"/>
                              <line x1="16" y1="2" x2="16" y2="6"/>
                              <line x1="8"  y1="2" x2="8"  y2="6"/>
                              <line x1="3"  y1="10" x2="21" y2="10"/>
                            </svg>
                            Book drop-off
                          </button>
                        )}

                        {/* Awaiting payment notice for non-cash, non-trade */}
                        {!showBookBtn && !showBooked && !isTrade && (
                          (() => {
                            const pm = (txn.paymentMethod || txn.paymentType || "").toLowerCase();
                            const isCash = pm === "cash" || pm === "cod" || pm === "fully_cash";
                            if (!isCash && !txn.paymentConfirmed) {
                              return (
                                <p style={{ fontSize: "0.72rem", color: "#92400e", marginTop: 5, background: '#fef3c7', borderRadius: 6, padding: '3px 8px', display: 'inline-block' }}>
                                  Waiting for buyer payment confirmation
                                </p>
                              );
                            }
                            return null;
                          })()
                        )}

                        {/* Slot already booked confirmation */}
                        {showBooked && !showBookBtn && (
                          <p style={{ fontSize: "0.75rem", color: "#166534", marginTop: 4, display: 'flex', alignItems: 'center', gap: 5 }}>
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                              <polyline points="20 6 9 17 4 12"/>
                            </svg>
                            Drop-off slot booked
                          </p>
                        )}

                        {/* Book collection slot (item at facility, awaiting collection) */}
                        {showCollect && (
                          <button
                            className={styles.dropOffBtn}
                            style={{ background: '#7c3aed', marginTop: 6 }}
                            onClick={() => navigate(`/book-collection/${txn.id}`)}
                          >
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                              <path d="M5 12h14"/><path d="M12 5l7 7-7 7"/>
                            </svg>
                            Book collection
                          </button>
                        )}
                      </div>

                      <div className={styles.badgeWrap}>
                        <span className={styles.badge} style={{ background: badge.bg, color: badge.color }}>
                          {badge.label}
                        </span>
                      </div>
                    </div>
                  );
                })}

                {/* ── Buyer trade drop-off cards (purple, in seller tab) ── */}
                {buyerTradeTxns.length > 0 && (
                  <>
                    {sellerTransactions.length > 0 && (
                      <div className={styles.sectionDivider}>
                        <span>Your trade drop-offs</span>
                      </div>
                    )}
                    {buyerTradeTxns.map((txn, idx) => {
                      const hasBooked     = !!txn.buyerBookingId;
                      const needsBooking  = canBookBuyerDropOff(txn);
                      const tradeItem     = txn.tradeItem;
                      const tradeItemObj  = tradeItem && typeof tradeItem === 'object' ? tradeItem : null;
                      const tradeItemName = tradeItemObj?.name ?? (typeof tradeItem === 'string' ? tradeItem : 'Trade item');
                      const cs            = CONDITION_COLORS[tradeItemObj?.condition] || { color: '#6b7280', bg: '#f3f4f6' };
                      const imageUrl      = txn.listing?.photos?.[0] ?? null;
                      const isHighlighted = highlightId === txn.id;
                      const isOverdueHL   = overdueHighlightId === txn.id;

                      return (
                        <div
                          key={`buyer-trade-${txn.id}`}
                          ref={isHighlighted || isOverdueHL ? highlightRef : null}
                          className={styles.buyerDropOffCard}
                          style={{
                            animationDelay: `${(sellerTransactions.length + idx) * 0.06}s`,
                            ...(isOverdueHL ? {
                              boxShadow: '0 0 0 3px #dc2626, 0 4px 20px rgba(220,38,38,0.22)',
                              borderColor: '#dc2626',
                              background: '#fff8f8',
                            } : isHighlighted ? {
                              boxShadow: '0 0 0 3px #8b5cf6, 0 4px 20px rgba(139,92,246,0.18)',
                              borderColor: '#8b5cf6',
                            } : {}),
                          }}
                        >
                          <div className={styles.buyerDropOffHeader}>
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                              <path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/>
                              <path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>
                            </svg>
                            Your Trade Drop-off
                            {hasBooked && (
                              <span className={styles.buyerDropOffBooked}>
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                                  <polyline points="20 6 9 17 4 12"/>
                                </svg>
                                Booked
                              </span>
                            )}
                          </div>

                          <div className={styles.buyerDropOffBody}>
                            <div className={styles.buyerDropOffItemWrap}>
                              {tradeItemObj?.imageUrl
                                ? <img src={tradeItemObj.imageUrl} alt={tradeItemName} className={styles.buyerDropOffImg} />
                                : <div className={styles.buyerDropOffImgPlaceholder}>
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#c4b5fd" strokeWidth="1.5">
                                      <path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/>
                                      <path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>
                                    </svg>
                                  </div>
                              }
                            </div>

                            <div className={styles.buyerDropOffInfo}>
                              <p style={{ margin: '0 0 2px', fontSize: '0.7rem', color: '#7c3aed', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                You receive
                              </p>
                              <p className={styles.buyerDropOffItemName} style={{ marginBottom: 4 }}>
                                {txn.listing?.title ?? 'Listing item'}
                              </p>
                              <div style={{ borderTop: '1px solid #e9d5ff', margin: '6px 0' }} />
                              <p style={{ margin: '0 0 2px', fontSize: '0.7rem', color: '#7c3aed', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                You drop off
                              </p>
                              <p className={styles.buyerDropOffItemName}>{tradeItemName}</p>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 3 }}>
                                {tradeItemObj?.category && (
                                  <span className={styles.buyerDropOffChip} style={{ background: '#ede9fe', color: '#6d28d9' }}>
                                    {tradeItemObj.category}
                                  </span>
                                )}
                                {tradeItemObj?.condition && (
                                  <span className={styles.buyerDropOffChip} style={{ background: cs.bg, color: cs.color }}>
                                    {tradeItemObj.condition}
                                  </span>
                                )}
                              </div>

                              <p style={{ margin: '6px 0 0', fontSize: '0.72rem', color: '#6b7280', display: 'flex', alignItems: 'center', gap: 4 }}>
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/>
                                  <circle cx="12" cy="7" r="4"/>
                                </svg>
                                Seller: {txn.counterpartyName}
                              </p>

                              {hasBooked ? (
                                <div className={styles.buyerDropOffScheduled}>
                                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                    <rect x="3" y="4" width="18" height="18" rx="2"/>
                                    <line x1="16" y1="2" x2="16" y2="6"/>
                                    <line x1="8" y1="2" x2="8" y2="6"/>
                                    <line x1="3" y1="10" x2="21" y2="10"/>
                                  </svg>
                                  {txn.buyerDropOffDate} · {txn.buyerDropOffTimeSlot}
                                </div>
                              ) : needsBooking ? (
                                <button
                                  className={styles.buyerDropOffBtn}
                                  onClick={() => navigate(`/book-dropoff/${txn.id}`)}
                                >
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                    <rect x="3" y="4" width="18" height="18" rx="2"/>
                                    <line x1="16" y1="2" x2="16" y2="6"/>
                                    <line x1="8" y1="2" x2="8" y2="6"/>
                                    <line x1="3" y1="10" x2="21" y2="10"/>
                                  </svg>
                                  Book drop-off
                                </button>
                              ) : (
                                <p className={styles.buyerDropOffPending}>
                                  Pending — waiting for transaction to progress
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </>
                )}
              </>
            )}

            {/* ── Buyer tab — tracker cards ───────────────────────────────── */}
            {activeTab === "buyer" && activeBuyerTransactions.map((txn, idx) => (
              <BuyerTrackerCard
                key={txn.id}
                txn={txn}
                idx={idx}
                isHighlighted={highlightId === txn.id}
                isOverdueHL={overdueHighlightId === txn.id}
                highlightRef={highlightRef}
              />
            ))}

          </div>
        )}
      </div>
    </>
  );
}