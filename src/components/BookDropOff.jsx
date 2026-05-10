import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { db, auth } from "../firebase.js";
import {
  doc, getDoc, addDoc, collection,
  query, where, getDocs, updateDoc, serverTimestamp,
} from "firebase/firestore";
import NavBar from "./NavBarTemp.jsx";
import styles from "./BookDropOff.module.css";
import { generateTimeSlots } from "../utils/facilityConfig.utils";

const FALLBACK_CONFIG = { openTime: "08:00", closeTime: "18:00", slotsPerHour: 1 };

function formatPrice(value) {
  const num = Number(String(value ?? "0").replace(/\s/g, ""));
  if (isNaN(num)) return "0";
  return num.toLocaleString("en-ZA", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

/* ── Human-readable status label ───────────────────────────────── */
function getStatusLabel(status) {
  switch (status) {
    case "waiting":            return "Payment confirmed";
    case "dropoff_scheduled":  return "Drop-off scheduled";
    case "pending":            return "Pending buyer";
    case "completed":          return "Completed";
    case "cancelled":          return "Cancelled";
    default:                   return status ?? "Unknown";
  }
}

/* ── Payment method display label ──────────────────────────────── */
function getPaymentLabel(method) {
  switch (method) {
    case "online":  return "Online (paid)";
    case "cod":     return "Cash on delivery";
    case "partial": return "Partial online + cash";
    default:        return "Unknown";
  }
}

/* ── Payment banner content by method ─────────────────────────── */
function getPaymentBanner(method, price) {
  switch (method) {
    case "online":
      return {
        variant:   "online",
        icon:      "shield-check",
        headline:  "No cash needed at drop-off",
        detail:    `The buyer already paid R${price} in full online. Bring the item and the facility will handle the rest.`,
      };
    case "cod":
      return {
        variant:   "cod",
        icon:      "cash",
        headline:  `Collect R${price} cash at the facility`,
        detail:    "This is a cash-on-delivery order. The buyer will pay when they collect the item — facility staff will verify the payment.",
      };
    case "partial":
      return {
        variant:   "partial",
        icon:      "credit-card",
        headline:  "Partial payment — confirm the split with the buyer",
        detail:    `Part of the R${price} was paid online. Clarify with the buyer how much cash remains before you drop off.`,
      };
    default:
      return {
        variant:   "unknown",
        icon:      "info-circle",
        headline:  `Transaction amount: R${price}`,
        detail:    "Confirm payment details with the buyer before your drop-off.",
      };
  }
}

export default function BookDropOff() {
  const { transactionId } = useParams();
  const navigate          = useNavigate();

  const [loading,          setLoading]          = useState(true);
  const [submitting,       setSubmitting]        = useState(false);
  const [error,            setError]             = useState("");
  const [transaction,      setTransaction]       = useState(null);
  const [listing,          setListing]           = useState(null);
  const [buyerName,        setBuyerName]         = useState("");
  const [paymentMethod,    setPaymentMethod]     = useState(null);
  const [selectedDate,     setSelectedDate]      = useState("");
  const [selectedTimeSlot, setSelectedTimeSlot]  = useState("");
  const [minDate,          setMinDate]           = useState("");

  const [facilityConfig,   setFacilityConfig]   = useState(FALLBACK_CONFIG);
  const [slotCounts,       setSlotCounts]        = useState({});
  const [slotsLoading,     setSlotsLoading]      = useState(false);

  const fetchedRef = useRef(false);

  useEffect(() => {
    document.body.style.background = "#f5f7fa";
    return () => { document.body.style.background = ""; };
  }, []);

  useEffect(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    setMinDate(tomorrow.toISOString().split("T")[0]);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const snap = await getDoc(doc(db, "facilityConfig", "default"));
        if (snap.exists()) {
          const data = snap.data();
          setFacilityConfig({
            openTime:     data.openTime     ?? FALLBACK_CONFIG.openTime,
            closeTime:    data.closeTime    ?? FALLBACK_CONFIG.closeTime,
            slotsPerHour: data.slotsPerHour ?? FALLBACK_CONFIG.slotsPerHour,
          });
        }
      } catch (err) {
        console.warn("Could not load facility config, using defaults:", err.message);
      }
    })();
  }, []);

  const fetchTransaction = useCallback(async (uid) => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    setLoading(true);
    setError("");

    try {
      const transSnap = await getDoc(doc(db, "transactions", transactionId));
      if (!transSnap.exists()) return setError("Transaction not found.");

      const txn = { id: transSnap.id, ...transSnap.data() };

      // Only the seller can book a drop-off
      if (txn.sellerId !== uid)
        return setError("You can only book a drop-off for your own sales.");

      // ✅ "waiting" is the status set when buyer agrees to pay
      const ALLOWED_STATUSES = ["waiting", "accepted", "in_facility"];
      if (!ALLOWED_STATUSES.includes(txn.status))
        return setError(`Cannot book drop-off. Current status: ${txn.status}`);

      // Prevent double-booking
      if (txn.bookingId)
        return setError("A drop-off has already been booked for this transaction.");

      setTransaction(txn);

      // Resolve payment method
      let pm = txn.paymentMethod;
      if (!pm && txn.paymentType) {
        pm = txn.paymentType === "full_online" ? "online"
           : txn.paymentType === "cash"        ? "cod"
           : txn.paymentType === "partial"     ? "partial"
           : "unknown";
      }
      setPaymentMethod(pm ?? "unknown");

      const [listingSnap, buyerSnap] = await Promise.all([
        getDoc(doc(db, "listings", txn.listingId)),
        getDoc(doc(db, "users",    txn.buyerId)),
      ]);

      if (listingSnap.exists()) setListing({ id: listingSnap.id, ...listingSnap.data() });
      if (buyerSnap.exists()) {
        const b = buyerSnap.data();
        setBuyerName(
          (b.firstName && b.lastName) ? `${b.firstName} ${b.lastName}` :
          b.displayName || b.name || b.firstName || "Buyer"
        );
      }
    } catch (err) {
      console.error(err);
      setError("Failed to load transaction: " + err.message);
    } finally {
      setLoading(false);
    }
  }, [transactionId]);

  useEffect(() => {
    const unsub = auth.onAuthStateChanged((user) => {
      if (user) fetchTransaction(user.uid);
      else { setLoading(false); setError("Please log in to book a drop-off."); }
    });
    return () => unsub();
  }, [fetchTransaction]);

  // ── Build slot counts when date changes ───────────────────────
  useEffect(() => {
    if (!selectedDate) return;
    setSelectedTimeSlot("");

    (async () => {
      setSlotsLoading(true);
      try {
        const snap = await getDocs(query(
          collection(db, "bookings"),
          where("date", "==", selectedDate)
        ));

        const booked = {};
        snap.docs.forEach(d => {
          const slot = d.data().timeSlot;
          booked[slot] = (booked[slot] || 0) + 1;
        });

        const allSlots = generateTimeSlots(facilityConfig.openTime, facilityConfig.closeTime);
        const counts   = {};
        allSlots.forEach(slot => {
          counts[slot] = Math.max(0, facilityConfig.slotsPerHour - (booked[slot] || 0));
        });

        setSlotCounts(counts);
      } catch (err) {
        console.error("Slot check failed:", err);
      } finally {
        setSlotsLoading(false);
      }
    })();
  }, [selectedDate, facilityConfig]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!selectedDate)     return setError("Please select a date.");
    if (!selectedTimeSlot) return setError("Please select a time slot.");

    setSubmitting(true);
    setError("");

    try {
      // Guard against race conditions
      const latest = await getDoc(doc(db, "transactions", transaction.id));
      if (latest.data().bookingId)
        return setError("A drop-off was already booked for this transaction.");

      const bookingRef = await addDoc(collection(db, "bookings"), {
        transactionId:  transaction.id,
        listingId:      transaction.listingId,
        sellerId:       transaction.sellerId,
        buyerId:        transaction.buyerId,
        date:           selectedDate,
        timeSlot:       selectedTimeSlot,
        status:         "scheduled",
        createdAt:      serverTimestamp(),
        updatedAt:      serverTimestamp(),
      });

      await Promise.all([
        updateDoc(doc(db, "transactions", transaction.id), {
          bookingId:       bookingRef.id,
          dropOffStatus:   "scheduled",
          dropOffDate:     selectedDate,
          dropOffTimeSlot: selectedTimeSlot,
          updatedAt:       serverTimestamp(),
        }),
        // Notify seller
        addDoc(collection(db, "notifications"), {
          userId:    transaction.sellerId,
          type:      "dropoff_booked",
          title:     "Drop-off booked",
          message:   `Your drop-off for "${listing?.title}" is scheduled on ${selectedDate} at ${selectedTimeSlot}.`,
          read:      false,
          createdAt: serverTimestamp(),
        }),
        // Notify buyer
        addDoc(collection(db, "notifications"), {
          userId:    transaction.buyerId,
          type:      "dropoff_booked",
          title:     "Seller booked drop-off",
          message:   `The seller has scheduled a drop-off for "${listing?.title}" on ${selectedDate} at ${selectedTimeSlot}.`,
          read:      false,
          createdAt: serverTimestamp(),
        }),
      ]);

      navigate("/trade-facility");
    } catch (err) {
      console.error(err);
      setError("Failed to book drop-off: " + err.message);
    } finally {
      setSubmitting(false);
    }
  }

  function renderSlotGrid() {
    const allSlots = generateTimeSlots(facilityConfig.openTime, facilityConfig.closeTime);
    if (slotsLoading) {
      return (
        <div className={styles.slotGrid}>
          {allSlots.map(s => (
            <div key={s} className={`${styles.slotPill} ${styles.slotShimmer}`} />
          ))}
        </div>
      );
    }
    return (
      <div className={styles.slotGrid}>
        {allSlots.map(slot => {
          const remaining = slotCounts[slot] ?? facilityConfig.slotsPerHour;
          const full      = remaining === 0;
          const selected  = selectedTimeSlot === slot;
          return (
            <button
              key={slot}
              type="button"
              disabled={full}
              onClick={() => setSelectedTimeSlot(slot)}
              className={[
                styles.slotPill,
                full     ? styles.slotFull     : "",
                selected ? styles.slotSelected : "",
                !full && !selected ? styles.slotAvailable : "",
              ].join(" ")}
            >
              <span className={styles.slotTime}>{slot}</span>
              <span className={styles.slotCount}>
                {full ? "Full" : `${remaining} slot${remaining !== 1 ? "s" : ""} left`}
              </span>
            </button>
          );
        })}
      </div>
    );
  }

  // Calculate price for display
  const price = transaction?.price 
    ? formatPrice(transaction.price) 
    : listing?.price 
      ? formatPrice(listing.price) 
      : "0";

  // Get payment banner based on payment method and price
  const banner = getPaymentBanner(paymentMethod, price);

  // ── Loading skeleton ──────────────────────────────────────────
  if (loading) {
    return (
      <>
        <NavBar />
        <div className={styles.page}>
          <div className={styles.skeletonHeader}>
            <div className={`${styles.shimmer} ${styles.skeletonBlock}`}
                 style={{ height: 28, marginBottom: 10, maxWidth: 280 }} />
            <div className={`${styles.shimmer} ${styles.skeletonBlock}`}
                 style={{ height: 14, maxWidth: 340 }} />
          </div>
          <div className={`${styles.shimmer} ${styles.skeletonBlock}`}
               style={{ height: 110, marginBottom: 14, borderRadius: 14 }} />
          <div className={`${styles.shimmer} ${styles.skeletonBlock}`}
               style={{ height: 50, marginBottom: 24, borderRadius: 10 }} />
          <div className={`${styles.shimmer} ${styles.skeletonBlock}`}
               style={{ height: 44, marginBottom: 16, borderRadius: 9 }} />
          <div className={`${styles.shimmer} ${styles.skeletonBlock}`}
               style={{ height: 120, marginBottom: 24, borderRadius: 9 }} />
          <div className={`${styles.shimmer} ${styles.skeletonBlock}`}
               style={{ height: 44, borderRadius: 9 }} />
        </div>
      </>
    );
  }

  // ── Error state ───────────────────────────────────────────────
  if (error && !transaction) {
    return (
      <>
        <NavBar />
        <div className={styles.page}>
          <div className={styles.errorBox}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" strokeWidth="1.5">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <p style={{ margin: 0 }}>{error}</p>
            <button className={styles.cancelBtn}
                    style={{ maxWidth: 200 }}
                    onClick={() => navigate("/trade-facility")}>
              Back to Trade Facility
            </button>
          </div>
        </div>
      </>
    );
  }

  // ── Main form ─────────────────────────────────────────────────
  return (
    <>
      <NavBar />
      <div className={styles.page}>

        {/* ── Page header ── */}
        <div className={styles.pageHeader}>
          <button className={styles.backLink}
                  onClick={() => navigate("/trade-facility")}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" strokeWidth="2">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
            Trade Facility
          </button>
          <h1 className={styles.heading}>Book drop-off slot</h1>
          <p className={styles.subheading}>
            Schedule when you'll drop off the item for {buyerName}.
          </p>
        </div>

        {/* Item summary */}
        <div className={styles.summaryCard}>
          <div className={styles.summaryTop}>
            <div className={styles.summaryImgWrap}>
              {listing?.photos?.[0]
                ? <img src={listing.photos[0]} alt={listing.title} className={styles.summaryImg} />
                : <div className={styles.summaryImgPlaceholder}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
                         stroke="currentColor" strokeWidth="1.5" opacity="0.4">
                      <rect x="2" y="7" width="20" height="14" rx="2"/>
                      <polyline points="16 7 12 3 8 7"/>
                    </svg>
                  </div>}
            </div>
            <div className={styles.summaryInfo}>
              <p className={styles.summaryTitle}>{listing?.title ?? "Loading…"}</p>
              <div className={styles.summaryPriceRow}>
                <span className={styles.summaryPrice}>R{price}</span>
                <span className={`${styles.statusChip} ${styles[`status_${transaction?.status}`]}`}>
                  {getStatusLabel(transaction?.status)}
                </span>
              </div>
            </div>
          </div>

          <div className={styles.summaryDivider} />

          {/* Transaction detail row */}
          <div className={styles.txnGrid}>
            <div className={styles.txnCell}>
              <span className={styles.txnLabel}>Buyer</span>
              <span className={styles.txnValue}>{buyerName}</span>
            </div>
            <div className={styles.txnCell}>
              <span className={styles.txnLabel}>Amount</span>
              <span className={`${styles.txnValue} ${styles.txnValueBlue}`}>R{price}</span>
            </div>
            <div className={styles.txnCell}>
              <span className={styles.txnLabel}>Payment</span>
              <span className={`${styles.txnValue} ${
                paymentMethod === "online"  ? styles.txnValueGreen :
                paymentMethod === "cod"     ? styles.txnValueAmber :
                styles.txnValueBlue
              }`}>{getPaymentLabel(paymentMethod)}</span>
            </div>
          </div>
        </div>

        {/* ── Payment banner ── */}
        <div className={`${styles.paymentBanner} ${styles[`banner_${banner.variant}`]}`}>
          <div className={styles.bannerIcon}>
            {banner.variant === "online" && (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                   stroke="currentColor" strokeWidth="2">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                <polyline points="9 12 11 14 15 10"/>
              </svg>
            )}
            {banner.variant === "cod" && (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                   stroke="currentColor" strokeWidth="2">
                <rect x="2" y="6" width="20" height="12" rx="2"/>
                <circle cx="12" cy="12" r="3"/>
                <line x1="6" y1="12" x2="6" y2="12"/>
                <line x1="18" y1="12" x2="18" y2="12"/>
              </svg>
            )}
            {(banner.variant === "partial" || banner.variant === "unknown") && (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                   stroke="currentColor" strokeWidth="2">
                <rect x="2" y="5" width="20" height="14" rx="2"/>
                <line x1="2" y1="10" x2="22" y2="10"/>
              </svg>
            )}
          </div>
          <div className={styles.bannerBody}>
            <p className={styles.bannerHeadline}>{banner.headline}</p>
            <p className={styles.bannerDetail}>{banner.detail}</p>
          </div>
        </div>

        {/* ── Form ── */}
        <form className={styles.form} onSubmit={handleSubmit}>
          <div className={styles.fieldGroup}>
            <label className={styles.label}>Drop-off date</label>
            <input
              type="date"
              className={styles.input}
              value={selectedDate}
              onChange={e => setSelectedDate(e.target.value)}
              min={minDate}
              required
            />
          </div>

          <div className={styles.fieldGroup}>
            <label className={styles.label}>
              Time slot
              {selectedTimeSlot && (
                <span className={styles.selectedBadge}>{selectedTimeSlot}</span>
              )}
            </label>
            {!selectedDate
              ? <p className={styles.slotHint}>Select a date above to see available slots.</p>
              : renderSlotGrid()
            }
          </div>

          {error && (
            <div className={styles.inlineError}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                   stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="8" x2="12" y2="12"/>
                <line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              {error}
            </div>
          )}

          <div className={styles.actions}>
            <button type="button" className={styles.cancelBtn}
                    onClick={() => navigate("/trade-facility")}>
              Cancel
            </button>
            <button
              type="submit"
              className={styles.submitBtn}
              disabled={submitting || !selectedDate || !selectedTimeSlot}
            >
              {submitting
                ? <><span className={styles.spinner} /> Booking…</>
                : "Confirm drop-off slot"
              }
            </button>
          </div>
        </form>
      </div>
    </>
  );
}