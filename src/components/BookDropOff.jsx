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

const CLOUDINARY_CLOUD_NAME    = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
const CLOUDINARY_UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET;
const FALLBACK_CONFIG = { openTime: "08:00", closeTime: "18:00", slotsPerHour: 1 };

async function uploadImageToCloudinary(file) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);
  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`,
    { method: "POST", body: formData }
  );
  if (!res.ok) throw new Error(`Image upload failed: ${res.statusText}`);
  const data = await res.json();
  return data.secure_url;
}

const DROP_OFF_WINDOW_DAYS = 7;

function getStatusLabel(status) {
  switch (status) {
    case "waiting":           return "Payment confirmed";
    case "dropoff_scheduled": return "Drop-off scheduled";
    case "pending":           return "Pending buyer";
    case "completed":         return "Completed";
    case "cancelled":         return "Cancelled";
    default:                  return status ?? "Unknown";
  }
}

function getPaymentDate(txn) {
  const ts =
    txn.paymentConfirmedAt ||
    txn.paymentDate        ||
    txn.paidAt             ||
    txn.updatedAt          ||
    txn.createdAt          ||
    null;
  if (!ts) return null;
  return ts?.toDate ? ts.toDate() : new Date(ts);
}

function toDateStr(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

const CONDITION_COLORS = {
  'New':      { color: '#0369a1', bg: '#e0f2fe' },
  'Like New': { color: '#0284c7', bg: '#f0f9ff' },
  'Good':     { color: '#0e7490', bg: '#ecfeff' },
  'Fair':     { color: '#d97706', bg: '#fffbeb' },
  'Poor':     { color: '#dc2626', bg: '#fef2f2' },
};

// ── Trade exchange card ──────────────────────────────────────────
function TradeExchangeCard({ listing, tradeItem, tradeImagePreview, tradeImageFile, onReplaceImage, isBuyerFlow }) {
  const tradeItemObj  = tradeItem && typeof tradeItem === 'object' ? tradeItem : null;
  const tradeItemName = tradeItemObj?.name ?? (typeof tradeItem === 'string' ? tradeItem : null);

  return (
    <div className={styles.tradeExchangeCard}>
      <div className={styles.tradeExchangeHeader}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/>
          <path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>
        </svg>
        Trade Exchange Summary
      </div>

      <div className={styles.tradeExchangeBody}>
        {/* Item being listed (seller's item) */}
        <div className={styles.tradeExchangeItem}>
          <div className={styles.tradeExchangeRole}>
            {isBuyerFlow ? "You receive" : "You drop off"}
          </div>
          <div className={styles.tradeExchangeImgWrap}>
            {listing?.photos?.[0]
              ? <img src={listing.photos[0]} alt={listing.title} className={styles.tradeExchangeImg} />
              : <div className={styles.tradeExchangeImgPlaceholder}>
                  <i className="fas fa-image" />
                </div>
            }
          </div>
          <p className={styles.tradeExchangeItemName}>{listing?.title ?? "Listing item"}</p>
          {listing?.condition && (
            <span className={styles.tradeExchangeChip} style={CONDITION_COLORS[listing.condition] || {}}>
              {listing.condition}
            </span>
          )}
        </div>

        {/* Arrow */}
        <div className={styles.tradeExchangeArrow}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6AA6DA" strokeWidth="2.5" strokeLinecap="round">
            <path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/>
            <path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>
          </svg>
        </div>

        {/* Buyer's trade item */}
        <div className={styles.tradeExchangeItem}>
          <div className={styles.tradeExchangeRole} style={{ color: '#6d28d9' }}>
            {isBuyerFlow ? "You drop off" : "You receive"}
          </div>
          <div className={styles.tradeExchangeImgWrap} style={{ position: 'relative' }}>
            {tradeImagePreview
              ? <img src={tradeImagePreview} alt={tradeItemName} className={styles.tradeExchangeImg} />
              : <div className={styles.tradeExchangeImgPlaceholder} style={{ background: '#ede9fe' }}>
                  <i className="fas fa-exchange-alt" style={{ color: '#a78bfa' }} />
                </div>
            }
            {isBuyerFlow && (
              <label htmlFor="trade-img-replace" className={styles.tradeExchangeReplaceBtn} title="Replace photo">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
                  <polyline points="17 8 12 3 7 8"/>
                  <line x1="12" y1="3" x2="12" y2="15"/>
                </svg>
              </label>
            )}
          </div>
          {isBuyerFlow && (
            <input id="trade-img-replace" type="file" accept="image/*" style={{ display: 'none' }}
              onChange={onReplaceImage}
            />
          )}
          <p className={styles.tradeExchangeItemName}>{tradeItemName ?? "Your trade item"}</p>
          {tradeItemObj?.condition && (
            <span className={styles.tradeExchangeChip} style={CONDITION_COLORS[tradeItemObj.condition] || {}}>
              {tradeItemObj.condition}
            </span>
          )}
          {tradeItemObj?.category && (
            <span className={styles.tradeExchangeChip} style={{ background: '#f0f9ff', color: '#0369a1' }}>
              {tradeItemObj.category}
            </span>
          )}
          {tradeImageFile && (
            <p style={{ margin: '4px 0 0', fontSize: '0.65rem', color: '#16a34a', textAlign: 'center' }}>
              New photo selected
            </p>
          )}
        </div>
      </div>

      {tradeItemObj?.description && (
        <div className={styles.tradeExchangeDesc}>
          <i className="fas fa-info-circle" style={{ color: '#6AA6DA', marginRight: 5, fontSize: 11 }} />
          {tradeItemObj.description}
        </div>
      )}
    </div>
  );
}

export default function BookDropOff() {
  const { transactionId } = useParams();
  const navigate          = useNavigate();

  const [loading,          setLoading]         = useState(true);
  const [submitting,       setSubmitting]       = useState(false);
  const [error,            setError]            = useState("");
  const [transaction,      setTransaction]      = useState(null);
  const [listing,          setListing]          = useState(null);
  const [counterpartyName, setCounterpartyName] = useState("");
  const [selectedDate,     setSelectedDate]     = useState("");
  const [selectedTimeSlot, setSelectedTimeSlot] = useState("");
  const [minDate,          setMinDate]          = useState("");
  const [maxDate,          setMaxDate]          = useState("");
  const [role,             setRole]             = useState(null);

  const [buyerTradeItem,      setBuyerTradeItem]      = useState(null);
  const [tradeImageFile,      setTradeImageFile]      = useState(null);
  const [tradeImagePreview,   setTradeImagePreview]   = useState(null);
  const [tradeImageUploading, setTradeImageUploading] = useState(false);

  const [facilityConfig, setFacilityConfig] = useState(FALLBACK_CONFIG);
  const [slotCounts,     setSlotCounts]     = useState({});
  const [slotsLoading,   setSlotsLoading]   = useState(false);

  const fetchedRef = useRef(false);

  useEffect(() => {
    document.body.style.background = "#f5f7fa";
    return () => { document.body.style.background = ""; };
  }, []);

  useEffect(() => {
    const today = new Date();
    setMinDate(toDateStr(today));
  }, []);

  // ── Load facility config once on mount ────────────────────────
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
        console.warn("Could not load facility config:", err.message);
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

      const isSeller = txn.sellerId === uid;
      const isBuyer  = txn.buyerId  === uid;

      if (!isSeller && !isBuyer)
        return setError("You are not part of this transaction.");

      if (isBuyer && txn.type !== 'trade')
        return setError("Buyers only book drop-offs for trade transactions.");

      const currentRole = isSeller ? 'seller' : 'buyer';
      setRole(currentRole);

      const ALLOWED_STATUSES = ["waiting", "accepted", "in_facility"];
      if (!ALLOWED_STATUSES.includes(txn.status))
        return setError(`Cannot book drop-off. Current status: ${txn.status}`);

      if (isSeller && txn.bookingId)
        return setError("A drop-off has already been booked for this transaction.");

      // Rules allow buyer to get their own transaction — buyerBookingId is now
      // written directly to the transaction, so this simple check is sufficient.
      if (isBuyer && txn.buyerBookingId)
        return setError("You have already booked your drop-off slot for this trade.");

      const paymentDate = getPaymentDate(txn);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      if (paymentDate) {
        const deadline = new Date(paymentDate);
        deadline.setHours(0, 0, 0, 0);
        deadline.setDate(deadline.getDate() + DROP_OFF_WINDOW_DAYS);
        if (deadline < today) {
          setError(`The ${DROP_OFF_WINDOW_DAYS}-day drop-off window has passed (deadline was ${toDateStr(deadline)}). Please contact support.`);
        }
        setMaxDate(toDateStr(deadline));
      } else {
        const fallbackDeadline = new Date(today);
        fallbackDeadline.setDate(fallbackDeadline.getDate() + DROP_OFF_WINDOW_DAYS);
        setMaxDate(toDateStr(fallbackDeadline));
      }

      setTransaction(txn);

      if (isBuyer && txn.tradeItem) {
        setBuyerTradeItem(txn.tradeItem);
        if (txn.tradeItem.imageUrl) setTradeImagePreview(txn.tradeItem.imageUrl);
      }

      const counterpartyId = isSeller ? txn.buyerId : txn.sellerId;
      const [listingSnap, counterpartySnap] = await Promise.all([
        getDoc(doc(db, "listings", txn.listingId)),
        getDoc(doc(db, "users",    counterpartyId)),
      ]);

      if (listingSnap.exists()) setListing({ id: listingSnap.id, ...listingSnap.data() });
      if (counterpartySnap.exists()) {
        const u = counterpartySnap.data();
        setCounterpartyName(
          (u.firstName && u.lastName) ? `${u.firstName} ${u.lastName}` :
          u.displayName || u.name || u.firstName || (isSeller ? "Buyer" : "Seller")
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
    if (maxDate && selectedDate > maxDate) {
      return setError(`Please choose a date on or before ${maxDate} (${DROP_OFF_WINDOW_DAYS}-day drop-off window).`);
    }

    setSubmitting(true);
    setError("");

    try {
      // ── SELLER PATH ────────────────────────────────────────────────────────
      // Sellers can always read their own transaction, so re-fetch to guard
      // against double-booking races.
      if (role === 'seller') {
        const latest     = await getDoc(doc(db, "transactions", transaction.id));
        const latestData = latest.data();

        if (latestData.bookingId)
          return setError("A drop-off was already booked for this transaction.");

        const bookingRef = await addDoc(collection(db, "bookings"), {
          transactionId:  transaction.id,
          listingId:      transaction.listingId,
          sellerId:       transaction.sellerId,
          buyerId:        transaction.buyerId,
          role:           'seller',
          date:           selectedDate,
          timeSlot:       selectedTimeSlot,
          status:         "scheduled",
          createdAt:      serverTimestamp(),
          updatedAt:      serverTimestamp(),
        });

        await updateDoc(doc(db, "transactions", transaction.id), {
          bookingId:       bookingRef.id,
          dropOffStatus:   "scheduled",
          dropOffDate:     selectedDate,
          dropOffTimeSlot: selectedTimeSlot,
          updatedAt:       serverTimestamp(),
        });

        const listingTitle = listing?.title ?? "your item";

        // Notify seller: their drop-off slot is confirmed, with item name
        try {
          await addDoc(collection(db, "notifications"), {
            userId:        transaction.sellerId,
            type:          "dropoff_booked",
            transactionId: transaction.id,
            listingId:     transaction.listingId,
            listingTitle,
            title:         "Drop-off slot booked",
            message:       `Your drop-off for "${listingTitle}" is confirmed for ${selectedDate} at ${selectedTimeSlot}.`,
            linkTo:        "/trade-facility",
            read:          false,
            createdAt:     serverTimestamp(),
          });
        } catch (_) {}

        // For trade: prompt buyer to book their own drop-off slot if they haven't yet
        if (transaction.type === 'trade' && !latestData.buyerBookingId) {
          const tradeItemName = typeof transaction.tradeItem === 'object'
            ? transaction.tradeItem?.name
            : (transaction.tradeItem || 'your trade item');
          try {
            await addDoc(collection(db, "notifications"), {
              userId:        transaction.buyerId,
              type:          "trade_dropoff_required",
              transactionId: transaction.id,
              listingId:     transaction.listingId,
              listingTitle,
              title:         "Book your trade drop-off",
              message:       `The seller has booked their drop-off for "${listingTitle}". Now book your slot to drop off "${tradeItemName}".`,
              linkTo:        `/book-dropoff/${transaction.id}`,
              read:          false,
              createdAt:     serverTimestamp(),
            });
          } catch (_) {}
        }
      }

      // ── BUYER PATH ─────────────────────────────────────────────────────────
      // Rules allow buyer to update their own transaction (buyerId match).
      // We mirror the seller pattern exactly:
      //   1. addDoc to bookings  → get bookingRef.id
      //   2. updateDoc on transaction with buyerBookingId + all drop-off fields
      if (role === 'buyer') {
        if (transaction.buyerBookingId)
          return setError("You have already booked your drop-off slot.");

        let finalImageUrl = buyerTradeItem?.imageUrl ?? null;
        if (tradeImageFile) {
          setTradeImageUploading(true);
          try {
            finalImageUrl = await uploadImageToCloudinary(tradeImageFile);
          } finally {
            setTradeImageUploading(false);
          }
        }

        const updatedTradeItem = buyerTradeItem
          ? { ...buyerTradeItem, imageUrl: finalImageUrl }
          : null;

        // 1. Create booking document
        console.log("[BookDropOff] buyer: creating booking doc...");
        console.log("[BookDropOff] transaction.id:", transaction.id);
        console.log("[BookDropOff] transaction.buyerId:", transaction.buyerId);
        console.log("[BookDropOff] auth uid:", auth.currentUser?.uid);

        let bookingRef;
        try {
          bookingRef = await addDoc(collection(db, "bookings"), {
            transactionId:   transaction.id,
            listingId:       transaction.listingId,
            sellerId:        transaction.sellerId,
            buyerId:         transaction.buyerId,
            role:            'buyer',
            date:            selectedDate,
            timeSlot:        selectedTimeSlot,
            status:          "scheduled",
            createdAt:       serverTimestamp(),
            updatedAt:       serverTimestamp(),
          });
          console.log("[BookDropOff] booking created:", bookingRef.id);
        } catch (bookingErr) {
          console.error("[BookDropOff] FAILED at addDoc bookings:", bookingErr.code, bookingErr.message);
          throw bookingErr;
        }

        // 2. Update transaction with buyer drop-off fields
        console.log("[BookDropOff] buyer: updating transaction...");
        try {
          await updateDoc(doc(db, "transactions", transaction.id), {
            buyerBookingId:       bookingRef.id,
            buyerDropOffStatus:   "scheduled",
            buyerDropOffDate:     selectedDate,
            buyerDropOffTimeSlot: selectedTimeSlot,
            ...(updatedTradeItem ? { tradeItem: updatedTradeItem } : {}),
            updatedAt:            serverTimestamp(),
          });
          console.log("[BookDropOff] transaction updated successfully");
        } catch (txnErr) {
          console.error("[BookDropOff] FAILED at updateDoc transaction:", txnErr.code, txnErr.message);
          throw txnErr;
        }

        const tradeItemName = updatedTradeItem?.name ?? "your trade item";
        const listingTitle  = listing?.title ?? "the listing";

        // Notify buyer: their trade drop-off is confirmed
        try {
          await addDoc(collection(db, "notifications"), {
            userId:        transaction.buyerId,
            type:          "buyer_dropoff_booked",
            transactionId: transaction.id,
            listingId:     transaction.listingId,
            listingTitle,
            title:         "Trade drop-off booked",
            message:       `Your drop-off of "${tradeItemName}" is confirmed for ${selectedDate} at ${selectedTimeSlot}.`,
            linkTo:        "/trade-facility",
            read:          false,
            createdAt:     serverTimestamp(),
          });
        } catch (_) {}

        // Notify seller: buyer has booked their trade drop-off
        try {
          await addDoc(collection(db, "notifications"), {
            userId:        transaction.sellerId,
            type:          "buyer_dropoff_booked",
            transactionId: transaction.id,
            listingId:     transaction.listingId,
            listingTitle,
            title:         "Buyer booked their trade drop-off",
            message:       `The buyer will drop off "${tradeItemName}" for "${listingTitle}" on ${selectedDate} at ${selectedTimeSlot}.`,
            linkTo:        "/trade-facility",
            read:          false,
            createdAt:     serverTimestamp(),
          });
        } catch (_) {}
      }

      navigate("/trade-facility");
    } catch (err) {
      console.error(err);
      setError("Failed to book drop-off: " + err.message);
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

  function renderSlotGrid() {
    const todayStr = new Date().toISOString().split("T")[0];
    const isToday  = selectedDate === todayStr;
    const now      = new Date();

    function slotStartHasPassed(slot) {
      if (!isToday) return false;
      const match = slot.match(/(\d{1,2}):(\d{2})/);
      if (!match) return false;
      const slotStart = new Date();
      slotStart.setHours(parseInt(match[1], 10), parseInt(match[2], 10), 0, 0);
      return now >= slotStart;
    }

    const allSlots     = generateTimeSlots(facilityConfig.openTime, facilityConfig.closeTime);
    const visibleSlots = allSlots.filter(slot => !slotStartHasPassed(slot));
    const hiddenCount  = allSlots.length - visibleSlots.length;

    if (slotsLoading) {
      return (
        <div className={styles.slotGrid}>
          {(isToday ? visibleSlots : allSlots).map(s => (
            <div key={s} className={`${styles.slotPill} ${styles.slotShimmer}`} />
          ))}
        </div>
      );
    }

    if (isToday && visibleSlots.length === 0) {
      return (
        <p className={styles.noSlots}>
          <i className="fas fa-clock" style={{ marginRight: "6px" }} />
          No more slots available for today — all time slots have passed. Please select a future date.
        </p>
      );
    }

    return (
      <>
        {isToday && hiddenCount > 0 && (
          <p className={styles.slotHint}>
            <i className="fas fa-hourglass-half" style={{ marginRight: "6px" }} />
            Showing today's remaining slots only — {hiddenCount} earlier slot{hiddenCount !== 1 ? "s have" : " has"} passed.
          </p>
        )}
        <div className={styles.slotGrid}>
          {visibleSlots.map(slot => {
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
      </>
    );
  }

  const isBuyerFlow = role === 'buyer';
  const isTrade     = transaction?.type === 'trade';

  if (loading) {
    return (
      <>
        <NavBar />
        <div className={styles.page}>
          <div className={styles.skeletonHeader}>
            <div className={`${styles.shimmer} ${styles.skeletonBlock}`} style={{ height: 28, marginBottom: 10, maxWidth: 280 }} />
            <div className={`${styles.shimmer} ${styles.skeletonBlock}`} style={{ height: 14, maxWidth: 340 }} />
          </div>
          <div className={`${styles.shimmer} ${styles.skeletonBlock}`} style={{ height: 110, marginBottom: 14, borderRadius: 14 }} />
          <div className={`${styles.shimmer} ${styles.skeletonBlock}`} style={{ height: 50, marginBottom: 24, borderRadius: 10 }} />
          <div className={`${styles.shimmer} ${styles.skeletonBlock}`} style={{ height: 44, marginBottom: 16, borderRadius: 9 }} />
          <div className={`${styles.shimmer} ${styles.skeletonBlock}`} style={{ height: 120, marginBottom: 24, borderRadius: 9 }} />
          <div className={`${styles.shimmer} ${styles.skeletonBlock}`} style={{ height: 44, borderRadius: 9 }} />
        </div>
      </>
    );
  }

  if (error && !transaction) {
    return (
      <>
        <NavBar />
        <div className={styles.page}>
          <div className={styles.errorBox}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <p style={{ margin: 0 }}>{error}</p>
            <button className={styles.cancelBtn} style={{ maxWidth: 200 }} onClick={() => navigate("/trade-facility")}>
              Back to Trade Facility
            </button>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <NavBar />
      <div className={styles.page}>

        {/* Page header */}
        <div className={styles.pageHeader}>
          <button className={styles.backLink} onClick={() => navigate("/trade-facility")}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
            Trade Facility
          </button>
          <h1 className={styles.heading}>
            {isBuyerFlow ? "Book your trade item drop-off" : isTrade ? "Book trade drop-off" : "Book drop-off slot"}
          </h1>
          <p className={styles.subheading}>
            {isBuyerFlow
              ? `Schedule when you'll drop off your trade item for ${counterpartyName}.`
              : `Schedule when you'll drop off the item for ${counterpartyName}.`}
          </p>
        </div>

        {/* Deadline card */}
        {maxDate && (
          <div className={styles.deadlineCard}>
            <div className={styles.deadlineIcon}>
              <i className="fas fa-clock" style={{ fontSize: "18px" }} />
            </div>
            <div className={styles.deadlineContent}>
              <span className={styles.deadlineLabel}>
                <i className="fas fa-hourglass-half" style={{ marginRight: "4px", fontSize: "10px" }} />
                Drop-off deadline
              </span>
              <span className={styles.deadlineValue}>
                Must be booked within <strong>{DROP_OFF_WINDOW_DAYS} days</strong> of payment
              </span>
              <span className={styles.deadlineDate}>
                <i className="fas fa-calendar-alt" style={{ marginRight: "4px", fontSize: "10px" }} />
                Latest allowed date: <strong>{maxDate}</strong>
              </span>
            </div>
          </div>
        )}

        {/* Trade exchange card */}
        {isTrade ? (
          <TradeExchangeCard
            listing={listing}
            tradeItem={isBuyerFlow ? buyerTradeItem : transaction?.tradeItem}
            tradeImagePreview={tradeImagePreview}
            tradeImageFile={tradeImageFile}
            isBuyerFlow={isBuyerFlow}
            onReplaceImage={(e) => {
              const file = e.target.files[0];
              if (!file) return;
              if (file.size > 5 * 1024 * 1024) { setError('Image must be under 5 MB'); return; }
              setTradeImageFile(file);
              const reader = new FileReader();
              reader.onloadend = () => setTradeImagePreview(reader.result);
              reader.readAsDataURL(file);
            }}
          />
        ) : (
          /* Standard item summary card (non-trade, seller only) */
          <div className={styles.summaryCard}>
            <div className={styles.summaryTop}>
              <div className={styles.summaryImgWrap}>
                {listing?.photos?.[0]
                  ? <img src={listing.photos[0]} alt={listing.title} className={styles.summaryImg} />
                  : <div className={styles.summaryImgPlaceholder}>
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.4">
                        <rect x="2" y="7" width="20" height="14" rx="2"/><polyline points="16 7 12 3 8 7"/>
                      </svg>
                    </div>
                }
              </div>
              <div className={styles.summaryInfo}>
                <p className={styles.summaryTitle}>{listing?.title ?? "Loading…"}</p>
                <div className={styles.summaryPriceRow}>
                  <span className={`${styles.statusChip} ${styles[`status_${transaction?.status}`]}`}>
                    {getStatusLabel(transaction?.status)}
                  </span>
                </div>
              </div>
            </div>
            <div className={styles.summaryDivider} />
            <div className={styles.txnGrid}>
              <div className={styles.txnCell}>
                <span className={styles.txnLabel}>Buyer</span>
                <span className={styles.txnValue}>{counterpartyName}</span>
              </div>
            </div>
          </div>
        )}

        {/* Trade participants row (for trades) */}
        {isTrade && (
          <div className={styles.tradePartiesRow}>
            <div className={styles.tradePartyChip}>
              <i className="fas fa-user" />
              <span>{isBuyerFlow ? "Seller" : "Buyer"}: <strong>{counterpartyName}</strong></span>
            </div>
            <div className={styles.tradePartyChip} style={{ background: '#ede9fe', borderColor: '#c4b5fd', color: '#5b21b6' }}>
              <i className="fas fa-exchange-alt" />
              <span>Trade transaction</span>
            </div>
          </div>
        )}

        {/* Booking form */}
        <form className={styles.form} onSubmit={handleSubmit}>
          <div className={styles.fieldGroup}>
            <label className={styles.label}>Select drop-off date</label>
            <input
              type="date"
              className={styles.input}
              value={selectedDate}
              onChange={e => setSelectedDate(e.target.value)}
              min={minDate}
              max={maxDate || undefined}
              required
            />
            {maxDate && (
              <p className={styles.dateHelper}>
                <i className="fas fa-calendar-check" style={{ marginRight: "4px", fontSize: "10px" }} />
                Latest allowed: {maxDate}
              </p>
            )}
            {selectedDate && maxDate && selectedDate > maxDate && (
              <p className={styles.dateWarning}>
                <i className="fas fa-exclamation-triangle" style={{ marginRight: "4px" }} />
                This date is past the {DROP_OFF_WINDOW_DAYS}-day deadline. Please pick an earlier date.
              </p>
            )}
          </div>

          <div className={styles.fieldGroup}>
            <label className={styles.label}>
              Select time slot
              {selectedTimeSlot && (
                <span className={styles.selectedBadge}>{selectedTimeSlot}</span>
              )}
            </label>
            {!selectedDate
              ? <p className={styles.slotHint}>
                  <i className="fas fa-calendar-day" style={{ marginRight: "6px" }} />
                  Select a date above to see available slots.
                </p>
              : renderSlotGrid()
            }
          </div>

          {error && (
            <div className={styles.inlineError}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="8" x2="12" y2="12"/>
                <line x1="12" y1="16" x2="12.01" y2="16"/>
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
              disabled={submitting || !selectedDate || !selectedTimeSlot || (maxDate && selectedDate > maxDate) || tradeImageUploading}
            >
              {(submitting || tradeImageUploading)
                ? <><span className={styles.spinner} /> {tradeImageUploading ? "Uploading image…" : "Booking…"}</>
                : isBuyerFlow ? "Confirm trade drop-off" : isTrade ? "Confirm trade drop-off" : "Confirm drop-off slot"
              }
            </button>
          </div>
        </form>
      </div>
    </>
  );
}