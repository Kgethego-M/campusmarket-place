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

const FALLBACK_CONFIG = { openTime: "09:00", closeTime: "16:00", slotsPerHour: 1 };

function formatPrice(value) {
  const num = Number(String(value ?? "0").replace(/\s/g, ""));
  if (isNaN(num)) return "0";
  return num.toLocaleString("en-ZA", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

export default function BookCollection() {
  const { transactionId } = useParams();
  const navigate          = useNavigate();

  const [loading,          setLoading]          = useState(true);
  const [submitting,       setSubmitting]        = useState(false);
  const [error,            setError]             = useState("");
  const [transaction,      setTransaction]       = useState(null);
  const [listing,          setListing]           = useState(null);
  const [counterpartyName, setCounterpartyName]  = useState("");
  const [isSeller,         setIsSeller]          = useState(false);
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

  // ── Load facility config ───────────────────────────────────────
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

      // ✅ FIXED: Allow both buyer AND seller to book collection
      const isUserSeller = txn.sellerId === uid;
      const isUserBuyer  = txn.buyerId  === uid;

      if (!isUserSeller && !isUserBuyer)
        return setError("You are not part of this transaction.");

      // Item must be at facility
      const ALLOWED_STATUSES = ["in_facility", "ready_to_release", "awaiting_collection"];
      if (!ALLOWED_STATUSES.includes(txn.status))
        return setError(`Item is not ready for collection yet. Current status: ${txn.status}`);

      // Prevent double-booking
      if (txn.collectionBookingId)
        return setError("A collection slot has already been booked for this transaction.");

      setTransaction(txn);
      setIsSeller(isUserSeller);

      // Load listing + counterparty
      const counterpartyId = isUserSeller ? txn.buyerId : txn.sellerId;
      const [listingSnap, counterpartySnap] = await Promise.all([
        getDoc(doc(db, "listings", txn.listingId)),
        getDoc(doc(db, "users",    counterpartyId)),
      ]);

      if (listingSnap.exists()) setListing({ id: listingSnap.id, ...listingSnap.data() });
      if (counterpartySnap.exists()) {
        const u = counterpartySnap.data();
        setCounterpartyName(
          (u.firstName && u.lastName) ? `${u.firstName} ${u.lastName}` :
          u.displayName || u.name ||
          (u.email ? u.email.split("@")[0] : isUserSeller ? "Buyer" : "Seller")
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
      else { setLoading(false); setError("Please log in to book a collection slot."); }
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
          collection(db, "collectionBookings"),
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
      // Race condition guard
      const latest = await getDoc(doc(db, "transactions", transaction.id));
      if (latest.data().collectionBookingId)
        return setError("A collection slot was already booked for this transaction.");

      const bookingRef = await addDoc(collection(db, "collectionBookings"), {
        transactionId:  transaction.id,
        listingId:      transaction.listingId,
        sellerId:       transaction.sellerId,
        buyerId:        transaction.buyerId,
        bookedByRole:   isSeller ? "seller" : "buyer",
        date:           selectedDate,
        timeSlot:       selectedTimeSlot,
        status:         "scheduled",
        createdAt:      serverTimestamp(),
        updatedAt:      serverTimestamp(),
      });

      await Promise.all([
        updateDoc(doc(db, "transactions", transaction.id), {
          collectionBookingId: bookingRef.id,
          collectionStatus:    "scheduled",
          collectionDate:      selectedDate,
          collectionTimeSlot:  selectedTimeSlot,
          status:              "awaiting_collection",
          updatedAt:           serverTimestamp(),
        }),
        // Notify buyer
        addDoc(collection(db, "notifications"), {
          userId:    transaction.buyerId,
          type:      "collection_booked",
          title:     "Collection slot booked",
          message:   `Collection for "${listing?.title}" is scheduled on ${selectedDate} at ${selectedTimeSlot}. Please bring your student card.`,
          read:      false,
          createdAt: serverTimestamp(),
        }),
        // Notify seller
        addDoc(collection(db, "notifications"), {
          userId:    transaction.sellerId,
          type:      "collection_booked",
          title:     "Collection slot booked",
          message:   `Collection for "${listing?.title}" has been scheduled on ${selectedDate} at ${selectedTimeSlot}.`,
          read:      false,
          createdAt: serverTimestamp(),
        }),
      ]);

      // ✅ FIXED: Go back to trade facility, not my-purchases
      navigate("/trade-facility");
    } catch (err) {
      console.error(err);
      setError("Failed to book collection slot: " + err.message);
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
        <div className={styles.pageHeader}>
          <button className={styles.backLink}
                  onClick={() => navigate("/trade-facility")}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" strokeWidth="2">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
            Trade Facility
          </button>
          <h1 className={styles.heading}>Book collection slot</h1>
          <p className={styles.subheading}>
            {isSeller
              ? `Schedule when you'll collect the traded item from the facility.`
              : `Schedule when you'll collect your item from the trade facility.`
            }
          </p>
        </div>

        {/* Item summary */}
        <div className={styles.summaryCard}>
          <div className={styles.summaryImgWrap}>
            {listing?.photos?.[0]
              ? <img src={listing.photos[0]} alt={listing.title} className={styles.summaryImg} />
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
              <span className={styles.summaryPrice}>R{formatPrice(listing?.price)}</span>
              <span className={styles.summaryDot}>·</span>
              <span className={styles.summaryBuyer}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                     stroke="currentColor" strokeWidth="2">
                  <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/>
                  <circle cx="12" cy="7" r="4"/>
                </svg>
                {isSeller ? `Buyer: ${counterpartyName}` : `Sold by: ${counterpartyName}`}
              </span>
            </div>
          </div>
          <span className={styles.statusChip}>{transaction?.status}</span>
        </div>

        {/* Reminder notice */}
        <div className={styles.paymentNotice}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" strokeWidth="2">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          </svg>
          Please bring your student card when collecting.
          {!isSeller && transaction?.cashShortfall > 0 && (
            <strong> You still owe R{formatPrice(transaction.cashShortfall)} — bring cash to the facility.</strong>
          )}
        </div>

        <form className={styles.form} onSubmit={handleSubmit}>
          <div className={styles.fieldGroup}>
            <label className={styles.label}>Collection date</label>
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
                : "Confirm collection slot"
              }
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
