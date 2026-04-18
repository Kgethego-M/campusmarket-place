import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { db, auth } from "../firebase.js";
import {
  doc, getDoc, addDoc, collection, query,
  where, getDocs, updateDoc, serverTimestamp,
} from "firebase/firestore";
import NavBar from "./NavBarTemp.jsx";
import styles from "./BookDropOff.module.css";

const TIME_SLOTS = [
  "09:00 - 10:00",
  "10:00 - 11:00",
  "11:00 - 12:00",
  "12:00 - 13:00",
  "13:00 - 14:00",
  "14:00 - 15:00",
  "15:00 - 16:00",
];

export default function BookDropOff() {
  const { transactionId } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading]           = useState(true);
  const [submitting, setSubmitting]     = useState(false);
  const [error, setError]               = useState("");
  const [currentUser, setCurrentUser]   = useState(null);
  const [transaction, setTransaction]   = useState(null);
  const [listing, setListing]           = useState(null);
  const [buyerName, setBuyerName]       = useState("");
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedTimeSlot, setSelectedTimeSlot] = useState("");
  const [availableSlots, setAvailableSlots]     = useState(TIME_SLOTS);
  const [minDate, setMinDate]           = useState("");

  useEffect(() => {
    const unsub = auth.onAuthStateChanged((user) => setCurrentUser(user));
    return () => unsub();
  }, []);

  useEffect(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    setMinDate(tomorrow.toISOString().split("T")[0]);
  }, []);

  useEffect(() => {
    if (currentUser && transactionId) fetchTransaction();
    else if (currentUser === null && !loading) {
      setError("Please log in to book a drop-off");
      setLoading(false);
    }
  }, [currentUser, transactionId]);

  useEffect(() => {
    if (selectedDate) checkAvailableSlots(selectedDate);
  }, [selectedDate]);

  async function fetchTransaction() {
    setLoading(true);
    setError("");
    try {
      const txSnap = await getDoc(doc(db, "transactions", transactionId));
      if (!txSnap.exists()) { setError("Transaction not found"); return; }

      const txData = { id: txSnap.id, ...txSnap.data() };

      if (txData.sellerId !== currentUser.uid) {
        setError("You can only book drop-off for your own sales"); return;
      }
      if (txData.status !== "accepted") {
        setError(`Transaction must be accepted first. Current status: ${txData.status}`); return;
      }
      if (txData.bookingId) {
        setError("A drop-off has already been booked for this transaction."); return;
      }

      setTransaction(txData);

      // Fetch listing + buyer in parallel
      const [listingSnap, buyerSnap] = await Promise.all([
        getDoc(doc(db, "listings", txData.listingId)),
        getDoc(doc(db, "users", txData.buyerId)),
      ]);

      if (listingSnap.exists()) setListing({ id: listingSnap.id, ...listingSnap.data() });

      if (buyerSnap.exists()) {
        const b = buyerSnap.data();
        setBuyerName(
          `${b.firstName || ""} ${b.lastName || ""}`.trim() ||
          b.displayName || b.name || b.email || "Unknown Buyer"
        );
      }
    } catch (err) {
      console.error(err);
      setError("Failed to load transaction: " + err.message);
    } finally {
      setLoading(false);
    }
  }

  async function checkAvailableSlots(date) {
    try {
      const snap = await getDocs(query(collection(db, "bookings"), where("date", "==", date)));
      const booked = snap.docs.map((d) => d.data().timeSlot);
      const available = TIME_SLOTS.filter((s) => !booked.includes(s));
      setAvailableSlots(available);
      if (selectedTimeSlot && !available.includes(selectedTimeSlot)) setSelectedTimeSlot("");
    } catch (err) {
      console.error("Error checking slots:", err);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!selectedDate)     { setError("Please select a date"); return; }
    if (!selectedTimeSlot) { setError("Please select a time slot"); return; }

    setSubmitting(true);
    setError("");
    try {
      const latest = (await getDoc(doc(db, "transactions", transaction.id))).data();
      if (latest.bookingId) { setError("Already booked by someone else."); return; }

      const docRef = await addDoc(collection(db, "bookings"), {
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

      await updateDoc(doc(db, "transactions", transaction.id), {
        bookingId:        docRef.id,
        dropOffStatus:    "scheduled",
        dropOffDate:      selectedDate,
        dropOffTimeSlot:  selectedTimeSlot,
      });

      await addDoc(collection(db, "notifications"), {
        userId:    transaction.sellerId,
        title:     "Drop-off Booked",
        message:   `Your drop-off for ${listing?.title} is scheduled on ${selectedDate} at ${selectedTimeSlot}.`,
        read:      false,
        createdAt: serverTimestamp(),
      });

      navigate("/trade-facility");
    } catch (err) {
      console.error(err);
      setError("Failed to book: " + err.message);
    } finally {
      setSubmitting(false);
    }
  }

  // ── Loading state ──────────────────────────────────────────────
  if (loading) return (
    <>
      <NavBar />
      <div className={styles.page}>
        <div className={styles.skeletonHeader}>
          <div className={`${styles.skeletonBlock} ${styles.shimmer}`} style={{ width: "45%", height: 28 }} />
          <div className={`${styles.skeletonBlock} ${styles.shimmer}`} style={{ width: "65%", height: 16, marginTop: 10 }} />
        </div>
        <div className={`${styles.summaryCard} ${styles.shimmer}`} style={{ height: 100, background: "linear-gradient(90deg,#f0f2f5 25%,#e4e8ed 50%,#f0f2f5 75%)", backgroundSize: "200% 100%" }} />
        <div className={`${styles.skeletonBlock} ${styles.shimmer}`} style={{ height: 44, marginTop: 20, borderRadius: 10 }} />
        <div className={`${styles.skeletonBlock} ${styles.shimmer}`} style={{ height: 44, marginTop: 12, borderRadius: 10 }} />
      </div>
    </>
  );

  // ── Error state ────────────────────────────────────────────────
  if (error && !transaction) return (
    <>
      <NavBar />
      <div className={styles.page}>
        <div className={styles.errorBox}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2" strokeLinecap="round">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><circle cx="12" cy="16" r="0.5" fill="#dc2626"/>
          </svg>
          <p>{error}</p>
          <button className={styles.cancelBtn} onClick={() => navigate("/trade-facility")}>
            ← Back to Trade Facility
          </button>
        </div>
      </div>
    </>
  );

  const price = listing?.price ?? transaction?.agreedPrice ?? 0;

  return (
    <>
      <NavBar />
      <div className={styles.page}>

        {/* ── Page heading ── */}
        <div className={styles.pageHeader}>
          <button className={styles.backLink} onClick={() => navigate("/trade-facility")}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
            </svg>
            Trade Facility
          </button>
          <h1 className={styles.heading}>Book Drop-Off</h1>
          <p className={styles.subheading}>
            Schedule when you'll drop off the item for <strong>{buyerName}</strong>.
          </p>
        </div>

        {/* ── Summary card ── */}
        <div className={styles.summaryCard}>
          <div className={styles.summaryImgWrap}>
            {listing?.photos?.[0] ? (
              <img src={listing.photos[0]} alt={listing.title} className={styles.summaryImg} />
            ) : (
              <div className={styles.summaryImgPlaceholder}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ccc" strokeWidth="1.5">
                  <rect x="3" y="3" width="18" height="18" rx="2"/>
                  <circle cx="8.5" cy="8.5" r="1.5"/>
                  <path d="M21 15l-5-5L5 21"/>
                </svg>
              </div>
            )}
          </div>
          <div className={styles.summaryInfo}>
            <p className={styles.summaryTitle}>{listing?.title || "Loading item…"}</p>
            <div className={styles.summaryMeta}>
              <span className={styles.summaryPrice}>R {Number(price).toLocaleString()}</span>
              <span className={styles.summaryDot}>·</span>
              <span className={styles.summaryBuyer}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/>
                </svg>
                {buyerName}
              </span>
            </div>
          </div>
          <span className={styles.statusChip}>Accepted</span>
        </div>

        {/* ── Payment notice ── */}
        <div className={styles.paymentNotice}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
          Buyer has paid <strong>R {Number(price).toLocaleString()}</strong> online. Confirm before proceeding.
        </div>

        {/* ── Form ── */}
        <form className={styles.form} onSubmit={handleSubmit}>

          <div className={styles.fieldGroup}>
            <label className={styles.label}>Drop-off Date</label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              min={minDate}
              required
              className={styles.input}
            />
          </div>

          <div className={styles.fieldGroup}>
            <label className={styles.label}>Time Slot</label>
            <select
              value={selectedTimeSlot}
              onChange={(e) => setSelectedTimeSlot(e.target.value)}
              disabled={!selectedDate}
              required
              className={styles.input}
            >
              <option value="">
                {selectedDate ? "Choose a time slot" : "Select a date first"}
              </option>
              {availableSlots.map((slot) => (
                <option key={slot} value={slot}>{slot}</option>
              ))}
            </select>
            {selectedDate && availableSlots.length === 0 && (
              <p className={styles.noSlots}>No slots available for this date — try another day.</p>
            )}
          </div>

          {error && (
            <div className={styles.inlineError}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><circle cx="12" cy="16" r="0.5" fill="currentColor"/>
              </svg>
              {error}
            </div>
          )}

          <div className={styles.actions}>
            <button type="button" className={styles.cancelBtn} onClick={() => navigate("/trade-facility")}>
              Cancel
            </button>
            <button
              type="submit"
              className={styles.submitBtn}
              disabled={submitting || !selectedDate || !selectedTimeSlot}
            >
              {submitting ? (
                <span className={styles.spinner} />
              ) : (
                <>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                  Confirm & Book Drop-off
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}