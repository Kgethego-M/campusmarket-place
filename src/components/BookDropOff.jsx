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

function formatPrice(value) {
  const num = Number(String(value ?? "0").replace(/\s/g, ""));
  if (isNaN(num)) return "0";
  return num.toLocaleString("en-ZA", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

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

function getPaymentLabel(method) {
  switch (method) {
    case "online":  return "Online (paid)";
    case "cod":     return "Cash on delivery";
    case "partial": return "Partial online + cash";
    default:        return "Unknown";
  }
}

function getPaymentBanner(method, price) {
  switch (method) {
    case "online":  return { variant: "online",  icon: "shield-check", headline: "No cash needed at drop-off", detail: `The buyer already paid R${price} in full online. Bring the item and the facility will handle the rest.` };
    case "cod":     return { variant: "cod",     icon: "cash",         headline: `Collect R${price} cash at the facility`, detail: "This is a cash-on-delivery order. The buyer will pay when they collect the item — facility staff will verify the payment." };
    case "partial": return { variant: "partial", icon: "credit-card",  headline: "Partial payment — confirm the split with the buyer", detail: `Part of the R${price} was paid online. Clarify with the buyer how much cash remains before you drop off.` };
    default:        return { variant: "unknown", icon: "info-circle",   headline: `Transaction amount: R${price}`, detail: "Confirm payment details with the buyer before your drop-off." };
  }
}

// ── Condition colors ──────────────────────────────────────────────────────────
const CONDITION_COLORS = {
  'New':      { color: '#0369a1', bg: '#e0f2fe' },
  'Like New': { color: '#0284c7', bg: '#f0f9ff' },
  'Good':     { color: '#0e7490', bg: '#ecfeff' },
  'Fair':     { color: '#d97706', bg: '#fffbeb' },
  'Poor':     { color: '#dc2626', bg: '#fef2f2' },
};

export default function BookDropOff() {
  const { transactionId } = useParams();
  const navigate          = useNavigate();

  const [loading,          setLoading]         = useState(true);
  const [submitting,       setSubmitting]       = useState(false);
  const [error,            setError]            = useState("");
  const [transaction,      setTransaction]      = useState(null);
  const [listing,          setListing]          = useState(null);
  const [counterpartyName, setCounterpartyName] = useState("");
  const [paymentMethod,    setPaymentMethod]    = useState(null);
  const [selectedDate,     setSelectedDate]     = useState("");
  const [selectedTimeSlot, setSelectedTimeSlot] = useState("");
  const [minDate,          setMinDate]          = useState("");

  // Who is the current user in this transaction?
  const [role, setRole] = useState(null); // 'seller' | 'buyer'

  // Buyer trade item state (for the buyer's drop-off of their own trade item)
  const [buyerTradeItem,       setBuyerTradeItem]       = useState(null);   // existing from transaction
  const [tradeImageFile,       setTradeImageFile]        = useState(null);
  const [tradeImagePreview,    setTradeImagePreview]     = useState(null);
  const [tradeImageUploading,  setTradeImageUploading]   = useState(false);

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
    setMinDate(today.toISOString().split("T")[0]);
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

      // Determine role
      const isSeller = txn.sellerId === uid;
      const isBuyer  = txn.buyerId  === uid;

      if (!isSeller && !isBuyer)
        return setError("You are not part of this transaction.");

      // Only trade transactions require buyer to also drop off
      if (isBuyer && txn.type !== 'trade')
        return setError("Buyers only book drop-offs for trade transactions.");

      const currentRole = isSeller ? 'seller' : 'buyer';
      setRole(currentRole);

      // Check allowed statuses
      const ALLOWED_STATUSES = ["waiting", "accepted", "in_facility"];
      if (!ALLOWED_STATUSES.includes(txn.status))
        return setError(`Cannot book drop-off. Current status: ${txn.status}`);

      // Seller: check if already booked a drop-off slot
      if (isSeller && txn.bookingId)
        return setError("A drop-off has already been booked for this transaction.");

      // Buyer: check if buyer drop-off already booked
      if (isBuyer && txn.buyerBookingId)
        return setError("You have already booked your drop-off slot for this trade.");

      setTransaction(txn);

      // Load trade item if buyer
      if (isBuyer && txn.tradeItem) {
        setBuyerTradeItem(txn.tradeItem);
        if (txn.tradeItem.imageUrl) {
          setTradeImagePreview(txn.tradeItem.imageUrl);
        }
      }

      // Payment method (seller only relevant, but store anyway)
      let pm = txn.paymentMethod;
      if (!pm && txn.paymentType) {
        pm = txn.paymentType === "full_online" ? "online"
           : txn.paymentType === "cash"        ? "cod"
           : txn.paymentType === "partial"     ? "partial"
           : "unknown";
      }
      setPaymentMethod(pm ?? "unknown");

      // Load listing + counterparty
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

  // ── Build slot counts when date changes ───────────────────────────────────
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

  // ── Submit ─────────────────────────────────────────────────────────────────
  async function handleSubmit(e) {
    e.preventDefault();
    if (!selectedDate)     return setError("Please select a date.");
    if (!selectedTimeSlot) return setError("Please select a time slot.");

    setSubmitting(true);
    setError("");

    try {
      const latest = await getDoc(doc(db, "transactions", transaction.id));
      const latestData = latest.data();

      // ── SELLER flow ───────────────────────────────────────────────────────
      if (role === 'seller') {
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

        // Notify seller
        await addDoc(collection(db, "notifications"), {
          userId:        transaction.sellerId,
          type:          "dropoff_booked",
          transactionId: transaction.id,
          title:         "Drop-off slot booked ✓",
          message:       `Your drop-off for "${listingTitle}" is confirmed for ${selectedDate} at ${selectedTimeSlot}. Head to the Trade Facility to track progress.`,
          linkTo:        "/trade-facility",
          read:          false,
          createdAt:     serverTimestamp(),
        });

        // Notify buyer — their item is coming
        await addDoc(collection(db, "notifications"), {
          userId:        transaction.buyerId,
          type:          "dropoff_booked",
          transactionId: transaction.id,
          title:         "Seller booked their drop-off 📦",
          message:       `The seller has scheduled drop-off for "${listingTitle}" on ${selectedDate} at ${selectedTimeSlot}. Track progress in the Trade Facility.`,
          linkTo:        "/trade-facility",
          read:          false,
          createdAt:     serverTimestamp(),
        });

        // For trades: also prompt buyer to book THEIR drop-off if not yet done
        if (transaction.type === 'trade' && !latestData.buyerBookingId) {
          const tradeItemName = typeof transaction.tradeItem === 'object'
            ? transaction.tradeItem?.name
            : transaction.tradeItem;

          await addDoc(collection(db, "notifications"), {
            userId:        transaction.buyerId,
            type:          "trade_dropoff_required",
            transactionId: transaction.id,
            title:         "Book your drop-off slot 🔄",
            message:       `This is a trade! You also need to drop off "${tradeItemName || 'your trade item'}" at the facility. Book your slot now.`,
            linkTo:        `/book-dropoff/${transaction.id}`,
            read:          false,
            createdAt:     serverTimestamp(),
          });
        }
      }

      // ── BUYER flow (trade only) ───────────────────────────────────────────
      if (role === 'buyer') {
        if (latestData.buyerBookingId)
          return setError("You have already booked your drop-off slot.");

        // Upload new trade image to Cloudinary if user swapped it
        let finalImageUrl = buyerTradeItem?.imageUrl ?? null;
        if (tradeImageFile) {
          setTradeImageUploading(true);
          try {
            finalImageUrl = await uploadImageToCloudinary(tradeImageFile);
          } finally {
            setTradeImageUploading(false);
          }
        }

        // Updated trade item with (possibly new) Cloudinary URL
        const updatedTradeItem = buyerTradeItem
          ? { ...buyerTradeItem, imageUrl: finalImageUrl }
          : null;

        const bookingRef = await addDoc(collection(db, "bookings"), {
          transactionId:  transaction.id,
          listingId:      transaction.listingId,
          sellerId:       transaction.sellerId,
          buyerId:        transaction.buyerId,
          role:           'buyer',
          date:           selectedDate,
          timeSlot:       selectedTimeSlot,
          status:         "scheduled",
          createdAt:      serverTimestamp(),
          updatedAt:      serverTimestamp(),
        });

        await updateDoc(doc(db, "transactions", transaction.id), {
          buyerBookingId:       bookingRef.id,
          buyerDropOffStatus:   "scheduled",
          buyerDropOffDate:     selectedDate,
          buyerDropOffTimeSlot: selectedTimeSlot,
          // Persist updated trade item (with Cloudinary URL)
          ...(updatedTradeItem ? { tradeItem: updatedTradeItem } : {}),
          updatedAt: serverTimestamp(),
        });

        const tradeItemName = updatedTradeItem?.name ?? "your trade item";
        const listingTitle  = listing?.title ?? "the listing";

        // Notify buyer
        await addDoc(collection(db, "notifications"), {
          userId:        transaction.buyerId,
          type:          "buyer_dropoff_booked",
          transactionId: transaction.id,
          title:         "Your trade drop-off is booked ✓",
          message:       `Your drop-off of "${tradeItemName}" is confirmed for ${selectedDate} at ${selectedTimeSlot}. Track progress in the Trade Facility.`,
          linkTo:        "/trade-facility",
          read:          false,
          createdAt:     serverTimestamp(),
        });

        // Notify seller — buyer is bringing their trade item
        await addDoc(collection(db, "notifications"), {
          userId:        transaction.sellerId,
          type:          "buyer_dropoff_booked",
          transactionId: transaction.id,
          title:         `Buyer booked trade drop-off 🔄`,
          message:       `The buyer will drop off "${tradeItemName}" (for your "${listingTitle}") on ${selectedDate} at ${selectedTimeSlot}.`,
          linkTo:        "/trade-facility",
          read:          false,
          createdAt:     serverTimestamp(),
        });
      }

      navigate("/trade-facility");
    } catch (err) {
      console.error(err);
      setError("Failed to book drop-off: " + err.message);
    } finally {
      setSubmitting(false);
    }
  }

  // ── Slot grid renderer ────────────────────────────────────────────────────
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
          No more slots available for today — all time slots have passed. Please select a future date.
        </p>
      );
    }

    return (
      <>
        {isToday && hiddenCount > 0 && (
          <p className={styles.slotHint}>
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

  const price  = transaction?.agreedPrice ?? transaction?.price ?? listing?.price ?? 0;
  const banner = getPaymentBanner(paymentMethod, formatPrice(price));

  // ── Loading skeleton ──────────────────────────────────────────────────────
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

  const isBuyerFlow  = role === 'buyer';
  const tradeItemObj = buyerTradeItem && typeof buyerTradeItem === 'object' ? buyerTradeItem : null;

  return (
    <>
      <NavBar />
      <div className={styles.page}>

        {/* ── Page header ── */}
        <div className={styles.pageHeader}>
          <button className={styles.backLink} onClick={() => navigate("/trade-facility")}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
            Trade Facility
          </button>
          <h1 className={styles.heading}>
            {isBuyerFlow ? "Book your trade item drop-off" : "Book drop-off slot"}
          </h1>
          <p className={styles.subheading}>
            {isBuyerFlow
              ? `Schedule when you'll drop off your trade item for ${counterpartyName}.`
              : `Schedule when you'll drop off the item for ${counterpartyName}.`}
          </p>
        </div>

        {/* ── Role banner for buyers ── */}
        {isBuyerFlow && (
          <div style={{
            display: 'flex', gap: 10, padding: '12px 16px', marginBottom: 14,
            backgroundColor: '#ede9fe', border: '1px solid #c4b5fd', borderRadius: 10,
            fontSize: '0.82rem', color: '#5b21b6', lineHeight: '1.5',
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0, marginTop: 1 }}>
              <path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/>
              <path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>
            </svg>
            <span>
              <strong>Trade drop-off:</strong> Both you and the seller need to drop off your respective items at the Trade Facility for inspection and exchange.
            </span>
          </div>
        )}

        {/* ── Item summary card ── */}
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
                <span className={styles.summaryPrice}>R{formatPrice(price)}</span>
                <span className={`${styles.statusChip} ${styles[`status_${transaction?.status}`]}`}>
                  {getStatusLabel(transaction?.status)}
                </span>
              </div>
            </div>
          </div>

          <div className={styles.summaryDivider} />

          <div className={styles.txnGrid}>
            <div className={styles.txnCell}>
              <span className={styles.txnLabel}>{isBuyerFlow ? "Seller" : "Buyer"}</span>
              <span className={styles.txnValue}>{counterpartyName}</span>
            </div>
            <div className={styles.txnCell}>
              <span className={styles.txnLabel}>Amount</span>
              <span className={`${styles.txnValue} ${styles.txnValueBlue}`}>R{formatPrice(price)}</span>
            </div>
            <div className={styles.txnCell}>
              <span className={styles.txnLabel}>Payment</span>
              <span className={`${styles.txnValue} ${
                paymentMethod === "online" ? styles.txnValueGreen :
                paymentMethod === "cod"    ? styles.txnValueAmber :
                styles.txnValueBlue
              }`}>{getPaymentLabel(paymentMethod)}</span>
            </div>
          </div>
        </div>

        {/* ── Trade item preview (buyer flow) ── */}
        {isBuyerFlow && tradeItemObj && (
          <div style={{
            background: '#f0f6ff', border: '1px solid #bdd6f0',
            borderLeft: '4px solid #6AA6DA', borderRadius: 12,
            overflow: 'hidden', marginBottom: 14,
          }}>
            {/* Header */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '8px 14px', background: '#e8f2fb', borderBottom: '1px solid #bdd6f0',
            }}>
              <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#1e4d8c', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Your Trade Item
              </span>
              <span style={{ fontSize: '0.7rem', color: '#4a6a8a' }}>This will be inspected at the facility</span>
            </div>

            <div style={{ display: 'flex', gap: 14, padding: 14, alignItems: 'flex-start' }}>
              {/* Image with replace option */}
              <div style={{ position: 'relative', flexShrink: 0 }}>
                {tradeImagePreview
                  ? <img src={tradeImagePreview} alt={tradeItemObj.name}
                      style={{ width: 84, height: 84, borderRadius: 10, objectFit: 'cover', border: '2px solid #bdd6f0', display: 'block' }} />
                  : <div style={{ width: 84, height: 84, borderRadius: 10, background: '#dbeafe', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#93c5fd" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
                    </div>
                }
                {/* Replace image button */}
                <label htmlFor="trade-img-replace" style={{
                  position: 'absolute', bottom: 4, right: 4,
                  background: 'rgba(0,0,0,0.55)', color: '#fff', borderRadius: '50%',
                  width: 22, height: 22, display: 'flex', alignItems: 'center',
                  justifyContent: 'center', cursor: 'pointer', fontSize: '0.6rem',
                }} title="Replace photo">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                  </svg>
                </label>
                <input id="trade-img-replace" type="file" accept="image/*" style={{ display: 'none' }}
                  onChange={(e) => {
                    const file = e.target.files[0];
                    if (!file) return;
                    if (file.size > 5 * 1024 * 1024) { setError('Image must be under 5 MB'); return; }
                    setTradeImageFile(file);
                    const reader = new FileReader();
                    reader.onloadend = () => setTradeImagePreview(reader.result);
                    reader.readAsDataURL(file);
                  }}
                />
              </div>

              {/* Details */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: '0 0 6px', fontWeight: 700, fontSize: '0.9rem', color: '#1e3a5f' }}>{tradeItemObj.name}</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 6 }}>
                  {tradeItemObj.category && (
                    <span style={{ fontSize: '0.7rem', fontWeight: 600, background: '#e0f2fe', color: '#0369a1', borderRadius: 99, padding: '2px 8px' }}>
                      {tradeItemObj.category}
                    </span>
                  )}
                  {tradeItemObj.condition && (() => {
                    const cs = CONDITION_COLORS[tradeItemObj.condition] || { color: '#6b7280', bg: '#f3f4f6' };
                    return (
                      <span style={{ fontSize: '0.7rem', fontWeight: 600, background: cs.bg, color: cs.color, borderRadius: 99, padding: '2px 8px' }}>
                        {tradeItemObj.condition}
                      </span>
                    );
                  })()}
                </div>
                {tradeItemObj.description && (
                  <p style={{ margin: 0, fontSize: '0.75rem', color: '#4a6a8a', lineHeight: 1.5 }}>{tradeItemObj.description}</p>
                )}
                {tradeImageFile && (
                  <p style={{ margin: '6px 0 0', fontSize: '0.7rem', color: '#16a34a' }}>✓ New photo selected — will be saved on submit</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── Payment banner (seller only) ── */}
        {!isBuyerFlow && (
          <div className={`${styles.paymentBanner} ${styles[`banner_${banner.variant}`]}`}>
            <div className={styles.bannerIcon}>
              {banner.variant === "online" && (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                  <polyline points="9 12 11 14 15 10"/>
                </svg>
              )}
              {banner.variant === "cod" && (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="2" y="6" width="20" height="12" rx="2"/>
                  <circle cx="12" cy="12" r="3"/>
                </svg>
              )}
              {(banner.variant === "partial" || banner.variant === "unknown") && (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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
        )}

        {/* ── Booking form ── */}
        <form className={styles.form} onSubmit={handleSubmit}>
          <div className={styles.fieldGroup}>
            <label className={styles.label}>Drop-off date</label>
            <input type="date" className={styles.input} value={selectedDate}
              onChange={e => setSelectedDate(e.target.value)} min={minDate} required />
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
            <button type="submit" className={styles.submitBtn}
              disabled={submitting || !selectedDate || !selectedTimeSlot || tradeImageUploading}>
              {(submitting || tradeImageUploading)
                ? <><span className={styles.spinner} /> {tradeImageUploading ? "Uploading image…" : "Booking…"}</>
                : isBuyerFlow ? "Confirm trade drop-off" : "Confirm drop-off slot"
              }
            </button>
          </div>
        </form>
      </div>
    </>
  );
}