import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { db, auth } from "../firebase.js";
import {
  doc, getDoc, addDoc, collection,
  query, where, getDocs, updateDoc, serverTimestamp,
} from "firebase/firestore";
import NavBar from "./NavBarTemp.jsx";
import styles from "./BookDropOff.module.css";

const TIME_SLOTS = [
  "09:00 - 10:00","10:00 - 11:00","11:00 - 12:00","12:00 - 13:00",
  "13:00 - 14:00","14:00 - 15:00","15:00 - 16:00",
];

function formatPrice(value) {
  const num = Number(String(value ?? "0").replace(/\s/g, ""));
  if (isNaN(num)) return "0";
  return num.toLocaleString("en-ZA", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
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
  const [availableSlots,   setAvailableSlots]    = useState(TIME_SLOTS);
  const [minDate,          setMinDate]           = useState("");

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

  const fetchTransaction = useCallback(async (uid) => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    setLoading(true);
    setError("");

    try {
      const transSnap = await getDoc(doc(db, "transactions", transactionId));

      if (!transSnap.exists())
        return setError("Transaction not found");

      const txn = { id: transSnap.id, ...transSnap.data() };

      if (txn.sellerId !== uid)
        return setError("You can only book drop-off for your own sales");
      if (txn.status !== "accepted")
        return setError(`Transaction must be accepted. Current status: ${txn.status}`);
      if (txn.bookingId)
        return setError("A drop-off has already been booked for this transaction.");

      setTransaction(txn);

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
        setBuyerName(b.displayName || b.name || b.firstName || "Buyer");
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
      else { setLoading(false); setError("Please log in to book a drop-off"); }
    });
    return () => unsub();
  }, [fetchTransaction]);

  useEffect(() => {
    if (!selectedDate) return;
    (async () => {
      try {
        const snap   = await getDocs(query(
          collection(db, "bookings"), where("date", "==", selectedDate)
        ));
        const booked = snap.docs.map(d => d.data().timeSlot);
        const avail  = TIME_SLOTS.filter(s => !booked.includes(s));
        setAvailableSlots(avail);
        if (selectedTimeSlot && !avail.includes(selectedTimeSlot)) setSelectedTimeSlot("");
      } catch (err) {
        console.error("Slot check failed:", err);
      }
    })();
  }, [selectedDate]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!selectedDate)     return setError("Please select a date");
    if (!selectedTimeSlot) return setError("Please select a time slot");

    setSubmitting(true);
    setError("");

    try {
      const latest = await getDoc(doc(db, "transactions", transaction.id));
      if (latest.data().bookingId)
        return setError("This transaction was already booked by someone else.");

      const bookingRef = await addDoc(collection(db, "bookings"), {
        transactionId: transaction.id,
        listingId:     transaction.listingId,
        sellerId:      transaction.sellerId,
        buyerId:       transaction.buyerId,
        date:          selectedDate,
        timeSlot:      selectedTimeSlot,
        status:        "scheduled",
        createdAt:     serverTimestamp(),
        updatedAt:     serverTimestamp(),
      });

      await Promise.all([
        updateDoc(doc(db, "transactions", transaction.id), {
          bookingId:       bookingRef.id,
          dropOffStatus:   "scheduled",
          dropOffDate:     selectedDate,
          dropOffTimeSlot: selectedTimeSlot,
        }),
        addDoc(collection(db, "notifications"), {
          userId:    transaction.sellerId,
          title:     "Drop-off booked",
          message:   `Your drop-off for ${listing?.title} is scheduled on ${selectedDate} at ${selectedTimeSlot}.`,
          read:      false,
          createdAt: serverTimestamp(),
        }),
      ]);

      navigate("/trade-facility");
    } catch (err) {
      console.error(err);
      setError("Failed to book: " + err.message);
    } finally {
      setSubmitting(false);
    }
  }

  function getPaymentMessage() {
    const price = formatPrice(listing?.price);
    switch (paymentMethod) {
      case "online":  return `Buyer paid R${price} online — no cash needed at drop-off.`;
      case "cod":     return `Buyer pays R${price} cash on delivery. Collect at the facility.`;
      case "partial": return `Partial online + cash payment. Confirm the split with the buyer before dropping off.`;
      default:        return `Transaction amount: R${price}. Confirm payment details with the buyer.`;
    }
  }

  // ── Skeleton ─────────────────────────────────────────────────
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
               style={{ height: 50,  marginBottom: 24, borderRadius: 10 }} />
          <div className={`${styles.shimmer} ${styles.skeletonBlock}`}
               style={{ height: 44,  marginBottom: 16, borderRadius: 9 }} />
          <div className={`${styles.shimmer} ${styles.skeletonBlock}`}
               style={{ height: 44,  marginBottom: 24, borderRadius: 9 }} />
          <div className={`${styles.shimmer} ${styles.skeletonBlock}`}
               style={{ height: 44,  borderRadius: 9 }} />
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
        <div className={styles.pageHeader}>
          <button className={styles.backLink}
                  onClick={() => navigate("/trade-facility")}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" strokeWidth="2">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
            Trade Facility
          </button>
          <h1 className={styles.heading}>Accept offer &amp; book drop-off</h1>
          <p className={styles.subheading}>
            Schedule when you'll drop off the item for {buyerName}.
          </p>
        </div>

        <div className={styles.summaryCard}>
          <div className={styles.summaryImgWrap}>
            {listing?.photos?.[0]
              ? <img src={listing.photos[0]} alt={listing.title}
                     className={styles.summaryImg} />
              : <div className={styles.summaryImgPlaceholder}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
                       stroke="#9ca3af" strokeWidth="1.5">
                    <rect x="3" y="3" width="18" height="18" rx="2"/>
                    <circle cx="8.5" cy="8.5" r="1.5"/>
                    <polyline points="21 15 16 10 5 21"/>
                  </svg>
                </div>
            }
          </div>
          <div className={styles.summaryInfo}>
            <p className={styles.summaryTitle}>{listing?.title ?? "Loading…"}</p>
            <div className={styles.summaryMeta}>
              <span className={styles.summaryPrice}>
                R{formatPrice(listing?.price)}
              </span>
              <span className={styles.summaryDot}>·</span>
              <span className={styles.summaryBuyer}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                     stroke="currentColor" strokeWidth="2">
                  <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/>
                  <circle cx="12" cy="7" r="4"/>
                </svg>
                {buyerName}
              </span>
            </div>
          </div>
          <span className={styles.statusChip}>{transaction?.status}</span>
        </div>

        <div className={styles.paymentNotice}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" strokeWidth="2">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          </svg>
          {getPaymentMessage()}
        </div>

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
            <label className={styles.label}>Time slot</label>
            <select
              className={styles.input}
              value={selectedTimeSlot}
              onChange={e => setSelectedTimeSlot(e.target.value)}
              disabled={!selectedDate}
              required
            >
              <option value="">Select a time slot</option>
              {availableSlots.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            {selectedDate && availableSlots.length === 0 && (
              <p className={styles.noSlots}>
                No slots available for this date — please choose another.
              </p>
            )}
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
                : "Accept & book drop-off"
              }
            </button>
          </div>
        </form>
      </div>
    </>
  );
}