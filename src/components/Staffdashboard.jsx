import { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { auth, db } from "../firebase.js";
import { signOut, onAuthStateChanged } from "firebase/auth";
import {
    doc, getDoc, updateDoc, serverTimestamp,
    collection, addDoc, query, where, getDocs, onSnapshot,
} from "firebase/firestore";
import styles from "./Staffdashboard.module.css";
import { recordCashCollected } from "../services/revenueService";


// ─── Firestore helpers ────────────────────────────────────────────────────────

async function sendNotification(userId, payload) {
    try {
        await addDoc(collection(db, "notifications"), {
            userId,
            read: false,
            createdAt: serverTimestamp(),
            ...payload,
        });
    } catch (err) {
        console.error("sendNotification failed:", err);
    }
}

async function notifyBothParties(txn, stage) {
    if (!txn.buyerId || !txn.sellerId) return;

    const title = txn.listingTitle || txn.item;

    if (stage === "drop_off") {
        await sendNotification(txn.sellerId, {
            type:          "item_received_at_facility",
            listingId:     txn.listingId || null,
            transactionId: txn.id,
            listingTitle:  title,
            message:       `Your item "${title}" has been received at the trade facility.`,
        });
        await sendNotification(txn.buyerId, {
            type:          "item_at_facility",
            listingId:     txn.listingId || null,
            transactionId: txn.id,
            listingTitle:  title,
            message:       `"${title}" has been dropped off at the trade facility. You have up to 7 days to collect it. Show your receipt to staff when collecting.`,
        });
    } else if (stage === "ready_to_collect") {
        // Item has passed inspection and staff released it — buyer can now come collect
        await sendNotification(txn.buyerId, {
            type:          "item_ready_for_collection",
            listingId:     txn.listingId || null,
            transactionId: txn.id,
            listingTitle:  title,
            message:       `"${title}" is ready for collection at the trade facility. Show your receipt in the My Purchases section to staff when collecting.`,
        });
    } else {
        await sendNotification(txn.buyerId, {
            type:          "item_collected",
            listingId:     txn.listingId || null,
            transactionId: txn.id,
            listingTitle:  title,
            message:       `"${title}" has been collected. Your transaction is complete!`,
        });
        await sendNotification(txn.sellerId, {
            type:          "transaction_complete",
            listingId:     txn.listingId || null,
            transactionId: txn.id,
            listingTitle:  title,
            message:       `"${title}" has been collected by the buyer. Your transaction is complete!`,
        });
    }
}

// ─── Overdue notification helpers ────────────────────────────────────────────

/**
 * Fired when the BUYER failed to collect within the collection period.
 * Gives buyer 24 hrs to collect before cancellation.
 */
async function notifyOverdueCollection(txn) {
    if (!txn.buyerId || !txn.sellerId) return;
    const title = txn.listingTitle || txn.item;

    const buyerMsg  = `Your collection of "${title}" is overdue. You have 24 hours to collect your item from the trade facility — please come in as soon as possible. If the item is not collected within 24 hours, this transaction will be automatically cancelled and the item returned to the seller.`;
    const sellerMsg = `The buyer has not yet collected "${title}". They have been notified and given 24 hours to collect. If they do not collect within 24 hours, the transaction will be cancelled and you will be asked to come collect your item.`;

    await sendNotification(txn.buyerId, {
        type:          "overdue_collection_buyer",
        listingId:     txn.listingId || null,
        transactionId: txn.id,
        listingTitle:  title,
        message:       buyerMsg,
    });

    await sendNotification(txn.sellerId, {
        type:          "overdue_collection_seller",
        listingId:     txn.listingId || null,
        transactionId: txn.id,
        listingTitle:  title,
        message:       sellerMsg,
    });
}

/**
 * Fired when the SELLER failed to drop off within the drop-off period.
 * Gives seller 24 hrs to drop off before cancellation.
 */
async function notifyOverdueDropOff(txn) {
    if (!txn.buyerId || !txn.sellerId) return;
    const title = txn.listingTitle || txn.item;

    const sellerMsg = `Your drop-off for "${title}" is overdue. You have 24 hours to drop off the item at the trade facility. If the item is not dropped off within 24 hours, this transaction will be automatically cancelled.`;
    const buyerMsg  = `The seller has not yet dropped off "${title}" at the trade facility. They have been notified and given 24 hours to drop off. If they do not drop off within 24 hours, this transaction will be cancelled.`;

    await sendNotification(txn.sellerId, {
        type:          "overdue_dropoff_seller",
        listingId:     txn.listingId || null,
        transactionId: txn.id,
        listingTitle:  title,
        message:       sellerMsg,
    });

    await sendNotification(txn.buyerId, {
        type:          "overdue_dropoff_buyer",
        listingId:     txn.listingId || null,
        transactionId: txn.id,
        listingTitle:  title,
        message:       buyerMsg,
    });
}

/**
 * Fired when a drop-off overdue transaction is cancelled after 24 hrs.
 * - Seller: directed to trade facility to decide on their listing.
 * - Buyer: notified of cancellation + refund if online payment was made.
 */
async function notifyCancelledDropOff(txn) {
    if (!txn.buyerId || !txn.sellerId) return;
    const title = txn.listingTitle || txn.item;
    const wasOnline = ["online", "full_online", "fully_online", "fully online", "partial", "partial_online"].includes(
        (txn.paymentType || txn.paymentMethod || "").toLowerCase()
    );

    const sellerMsg = `Your transaction for "${title}" has been cancelled due to a missed drop-off.`;
    const buyerMsg  = wasOnline
        ? `Your transaction for "${title}" was cancelled — the seller did not drop off in time. You will be refunded within 24 hours.`
        : `Your transaction for "${title}" was cancelled — the seller did not drop off in time. No payment was collected.`;

    await sendNotification(txn.sellerId, {
        type:          "cancelled_dropoff_seller",
        listingId:     txn.listingId || null,
        transactionId: txn.id,
        listingTitle:  title,
        message:       sellerMsg,
    });

    await sendNotification(txn.buyerId, {
        type:          "cancelled_dropoff_buyer",
        listingId:     txn.listingId || null,
        transactionId: txn.id,
        listingTitle:  title,
        message:       buyerMsg,
    });
}

/**
 * Fired when a collection overdue transaction is cancelled after 24 hrs.
 */
async function notifyCancelledCollection(txn) {
    if (!txn.buyerId || !txn.sellerId) return;
    const title = txn.listingTitle || txn.item;

    const buyerMsg  = `Your transaction for "${title}" was cancelled due to non-collection.`;
    const sellerMsg = `The buyer did not collect "${title}" — the transaction has been cancelled. Please come to the trade facility to collect your item back.`;

    await sendNotification(txn.buyerId, {
        type:          "cancelled_collection_buyer",
        listingId:     txn.listingId || null,
        transactionId: txn.id,
        listingTitle:  title,
        message:       buyerMsg,
    });

    await sendNotification(txn.sellerId, {
        type:          "cancelled_collection_seller",
        listingId:     txn.listingId || null,
        transactionId: txn.id,
        listingTitle:  title,
        message:       sellerMsg,
    });
}



const TABS = [
    { key: "drop_offs",   label: "Drop Offs",         icon: "fa-truck-arrow-right"  },
    { key: "collections", label: "Collections",        icon: "fa-person-walking"     },
    { key: "overdue",     label: "Overdue",            icon: "fa-triangle-exclamation" },
    { key: "all",         label: "All Transactions",   icon: "fa-list"               },
    { key: "history",     label: "History",            icon: "fa-clock-rotate-left"  },
    { key: "time_slots",  label: "Time Slots",         icon: "fa-clock"              },
];

const STATUS_META = {
    pending_payment:     { label: "Pending Payment",   cls: "payment", icon: "fa-credit-card"     },
    pending:             { label: "Pending Drop-off",  cls: "pending",  icon: "fa-hourglass-half"  },
    awaiting_collection: { label: "Awaiting Collection", cls: "awaiting", icon: "fa-person-walking" },
    completed:           { label: "Completed",         cls: "done",     icon: "fa-check-double"    },
};

// ─── Payment type configuration ───────────────────────────────────────────────
const PAYMENT_CONFIG = {
    full_online: { label: "Fully Online",     icon: "fa-globe",               color: "#10b981", bg: "#d1fae5", staffNote: "Paid in full online. No cash to collect at any stage." },
    partial:     { label: "Partial Online",   icon: "fa-credit-card",         color: "#f59e0b", bg: "#fed7aa", staffNote: "Online portion is confirmed. Collect the remaining cash from the buyer at collection — not at drop-off." },
    cash:        { label: "Full Cash",        icon: "fa-money-bill",          color: "#ef4444", bg: "#fee2e2", staffNote: "Full cash payment is collected by staff at collection. Nothing to collect at drop-off." },
    cod:         { label: "Cash on Delivery", icon: "fa-hand-holding-dollar", color: "#ef4444", bg: "#fee2e2", staffNote: "Full cash payment is collected by staff at collection. Nothing to collect at drop-off." },
    unknown:     { label: "Unknown",          icon: "fa-question",            color: "#6b7280", bg: "#f3f4f6", staffNote: "Verify payment details with buyer before releasing." },
};

function getPaymentConfig(txn) {
    const method = (txn.paymentType || txn.paymentMethod || "").toLowerCase();
    if (method === "full_online" || method === "online" || method === "fully_online" || method === "fully online") return PAYMENT_CONFIG.full_online;
    if (method === "partial" || method === "partial_online" || method === "partially_online" || method === "partially online") return PAYMENT_CONFIG.partial;
    if (method === "cash" || method === "cod" || method === "in_person" || method === "in person") return PAYMENT_CONFIG.cash;
    return PAYMENT_CONFIG.unknown;
}

// Matches MyPurchases receipt format: receiptRef field, receiptId, or RCP-{last 8 of id}
function getReceiptRef(txn) {
    return txn.receiptRef || txn.receiptId || `RCP-${(txn.id || "").slice(-8).toUpperCase()}`;
}

// ─── Date/Time helpers ────────────────────────────────────────────────────────

/** Parses the START time from a slot string like "09:00 - 10:00". */
function parseSlotStart(timeSlot) {
    if (!timeSlot) return null;
    const match = timeSlot.match(/(\d{1,2}):(\d{2})/);
    if (!match) return null;
    return { hour: parseInt(match[1], 10), minute: parseInt(match[2], 10) };
}

/** Parses the END time from a slot string like "09:00 - 10:00". Falls back to start if only one time. */
function parseSlotEnd(timeSlot) {
    if (!timeSlot) return null;
    const matches = [...timeSlot.matchAll(/(\d{1,2}):(\d{2})/g)];
    if (matches.length >= 2) return { hour: parseInt(matches[1][1], 10), minute: parseInt(matches[1][2], 10) };
    if (matches.length === 1) return { hour: parseInt(matches[0][1], 10), minute: parseInt(matches[0][2], 10) };
    return null;
}

// Unlock buttons from slot START time (e.g. 09:00 for a 09:00 - 10:00 slot)
function isSlotOpen(dateStr, timeSlot) {
    if (!dateStr) return false;
    const slotStart = parseSlotStart(timeSlot);
    const deadline = new Date(dateStr + "T00:00:00");
    if (slotStart) deadline.setHours(slotStart.hour, slotStart.minute, 0, 0);
    return new Date() >= deadline;
}

// Overdue check: slot END time + 1 minute (e.g. 10:01 for a 09:00 - 10:00 slot)
function isBookingTimeReached(dateStr, timeSlot) {
    if (!dateStr) return false;
    const slotEnd = parseSlotEnd(timeSlot);
    const deadline = new Date(dateStr + "T00:00:00");
    if (slotEnd) deadline.setHours(slotEnd.hour, slotEnd.minute + 1, 0, 0);
    return new Date() >= deadline;
}

// ─── Overdue helpers (shared by Card and Detail Panel) ───────────────────────
// Drop-off overdue: slot END + 1 min has passed and item not yet received
function isDropOffOverdue(txn) {
    if (txn.status !== "pending" || !txn.dropOffBooked) return false;
    if (!txn.dropOffDate) return false;
    return isBookingTimeReached(txn.dropOffDate, txn.dropOffTimeSlot || txn.timeSlot);
}
// Collection overdue: matches the "Collect By" date shown in the detail panel
function isCollectionOverdue(txn) {
    if (txn.status !== "awaiting_collection") return false;
    let deadlineMs = null;
    if (txn.collectionDeadline) {
        deadlineMs = new Date(txn.collectionDeadline).getTime();
    } else if (txn.droppedOffAt) {
        deadlineMs = new Date(txn.droppedOffAt).getTime() + 7 * 24 * 60 * 60 * 1000;
    } else if (txn.dropOffDate) {
        deadlineMs = new Date(txn.dropOffDate + "T00:00:00").getTime() + 7 * 24 * 60 * 60 * 1000;
    }
    if (!deadlineMs) return false;
    return Date.now() > deadlineMs;
}

// ─── Confirm Dialog ───────────────────────────────────────────────────────────
function ConfirmDialog({ title, message, confirmLabel, confirmClass, onConfirm, onCancel }) {
    return (
        <div className={styles.dialogOverlay} onClick={onCancel}>
            <div className={styles.dialogBox} onClick={e => e.stopPropagation()}>
                <div className={styles.dialogIcon}>
                    <i className="fa-solid fa-circle-question" />
                </div>
                <h3 className={styles.dialogTitle}>{title}</h3>
                <p className={styles.dialogMessage}>{message}</p>
                <div className={styles.dialogActions}>
                    <button className={styles.dialogCancel} onClick={onCancel}>Cancel</button>
                    <button className={`${styles.dialogConfirm} ${styles[confirmClass] || ""}`} onClick={onConfirm}>
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── Navbar ───────────────────────────────────────────────────────────────────
function StaffNavbar() {
    const navigate = useNavigate();

    return (
        <header className={styles.navbar}>
            <div className={styles.logo} onClick={() => navigate("/staff-dashboard")}>
                <div className={styles.logoBox}>
                    <i className="fa-solid fa-shop" style={{ color: "#fff", fontSize: "1.1rem" }} />
                </div>
                <span className={styles.logoText}>CampusMarket</span>
            </div>
        </header>
    );
}

// ─── Transaction Detail Panel (full-page overlay) ────────────────────────────
function TransactionDetailPanel({ txn, onClose, onConfirmDropOff, onConfirmCollection, onRelease, onMarkStep, onAlertOverdue, onCancelOverdue }) {
    const isOverdueDropOff    = isDropOffOverdue(txn);
    const isOverdueCollection = isCollectionOverdue(txn);
    const isOverdue = isOverdueDropOff || isOverdueCollection;

    const meta = isOverdue
        ? { ...STATUS_META[txn.status] || STATUS_META.pending, label: "Overdue", cls: (STATUS_META[txn.status] || STATUS_META.pending).cls }
        : (STATUS_META[txn.status] || STATUS_META.pending);

    const allChecked = txn.checklist.every(c => c.done);

    // ── Payment method helpers ────────────────────────────────
    const paymentConfig    = getPaymentConfig(txn);
    const paymentMethod    = (txn.paymentMethod || txn.paymentType || "cash").toLowerCase();
    const isFullyOnline    = paymentMethod === "online"  || paymentMethod === "full_online" || paymentMethod === "fully_online"  || paymentMethod === "fully online";
    const isFullyCash      = paymentMethod === "cash"    || paymentMethod === "cod"          || paymentMethod === "fully_cash"  || paymentMethod === "fully cash"   || paymentMethod === "in_person" || paymentMethod === "in person";
    const isPartial        = paymentMethod === "partial" || paymentMethod === "partial_online" || paymentMethod === "split" || paymentMethod === "partially online" || paymentMethod === "partially_online";

    const totalPrice       = txn.price ?? 0;
    const onlineAmountPaid = txn.onlineAmountPaid ?? 0;
    const shortfall        = isFullyOnline
        ? 0
        : isPartial
            ? Math.max(0, totalPrice - onlineAmountPaid)
            : (txn.cashShortfall > 0 ? txn.cashShortfall : totalPrice);

    const hasShortfall = !isFullyOnline && (isFullyCash || isPartial);

    // Online payment is always auto-confirmed; cash/partial confirmed by staff at collection
    const [cashConfirmed, setCashConfirmed] = useState(
        isFullyOnline || txn.paymentStatus === "Fully Paid"
    );
    const [saving,        setSaving]        = useState(false);
    const [alertSending,  setAlertSending]  = useState(false);
    const [alertSent,     setAlertSent]     = useState(!!txn.overdueAlertSentAt);
    const [dropOffLoading,    setDropOffLoading]    = useState(false);
    const [collectionLoading, setCollectionLoading] = useState(false);

    // Staff confirms cash at collection only — payment never blocks the drop-off or release steps
    const canConfirmCash = !isFullyOnline && hasShortfall && !cashConfirmed;
    const canRelease     = allChecked;

    const waitingForDropOff    = txn.status === "pending" && !txn.dropOffBooked;
    const waitingForCollection = txn.status === "awaiting_collection";
    const showConfirmDropOff   = txn.status === "pending" && txn.dropOffBooked;
    const showConfirmCollection = txn.status === "awaiting_collection";

    const dropOffTimeReached    = isSlotOpen(txn.dropOffDate,    txn.dropOffTimeSlot);
    const collectionTimeReached = isSlotOpen(txn.collectionDate, txn.collectionTimeSlot);

    useEffect(() => {
        const handler = (e) => { if (e.key === "Escape") onClose(); };
        document.addEventListener("keydown", handler);
        return () => document.removeEventListener("keydown", handler);
    }, [onClose]);

    useEffect(() => {
        document.body.style.overflow = "hidden";
        return () => { document.body.style.overflow = ""; };
    }, []);

    async function handleConfirmCash() {
        setCashConfirmed(true); setSaving(true);
        try {
            await updateDoc(doc(db, "transactions", txn.id), { cashShortfall: 0, paymentStatus: "Fully Paid", cashConfirmedAt: serverTimestamp() });
        } catch (err) { console.error(err); } finally { setSaving(false); }
    }
    async function handleAlertOverdue() {
        setAlertSending(true);
        try { await onAlertOverdue(txn, isOverdueDropOff ? "drop_off" : "collection"); setAlertSent(true); }
        catch (err) { console.error(err); } finally { setAlertSending(false); }
    }
    async function handleDropOff() {
        setDropOffLoading(true);
        try { await onConfirmDropOff(txn.id); onClose(); } finally { setDropOffLoading(false); }
    }
    async function handleCollection() {
        setCollectionLoading(true);
        try { await onConfirmCollection(txn.id); onClose(); } finally { setCollectionLoading(false); }
    }

    return (
        <div className={styles.detailOverlay} onClick={onClose}>
            <div className={styles.detailPanel} onClick={e => e.stopPropagation()}>

                <div className={`${styles.detailHeader} ${isOverdue ? styles.detailHeaderOverdue : styles[`detailHeader_${meta.cls}`]}`}>
                    <div className={styles.detailHeaderLeft}>
                        <div className={styles.detailThumb}>
                            {txn.itemImage
                                ? <img src={txn.itemImage} alt={txn.item} />
                                : <i className="fa-solid fa-box-open" />
                            }
                        </div>
                        <div className={styles.detailHeaderInfo}>
                            <h2 className={styles.detailTitle}>{txn.item}</h2>
                            <div className={styles.detailHeaderBadges}>
                                <span className={`${styles.statusBadge} ${isOverdue ? styles.status_overdue : styles[`status_${meta.cls}`]}`}>
                                    <i className={`fa-solid ${isOverdue ? "fa-circle-exclamation" : meta.icon}`} />
                                    {isOverdue ? "Overdue" : meta.label}
                                </span>
                                <span className={styles.paymentBadge} style={{ background: paymentConfig.bg, color: paymentConfig.color }}>
                                    <i className={`fa-solid ${paymentConfig.icon}`} />
                                    {paymentConfig.label}
                                </span>
                                {txn.dropOffDate && (
                                    <span className={styles.dateBadge}>
                                        <i className="fa-regular fa-calendar" />
                                        {new Date(txn.dropOffDate + "T00:00:00").toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })}
                                    </span>
                                )}
                                <span className={styles.timeBadge}>
                                    <i className="fa-regular fa-clock" /> {txn.timeSlot}
                                </span>
                            </div>
                        </div>
                    </div>
                    <button className={styles.detailClose} onClick={onClose} title="Close (Esc)">
                        <i className="fa-solid fa-xmark" />
                    </button>
                </div>

                <div className={styles.detailBody}>

                    <div className={styles.paymentInstructionBanner} style={{ background: paymentConfig.bg, borderLeftColor: paymentConfig.color }}>
                        <i className={`fa-solid ${paymentConfig.icon}`} style={{ color: paymentConfig.color }} />
                        <div>
                            <strong>{paymentConfig.label} Payment</strong>
                            <p>{paymentConfig.staffNote}</p>
                        </div>
                    </div>

                    {isOverdue && (
                        <div className={styles.overdueBanner}>
                            <i className="fa-solid fa-triangle-exclamation" />
                            <span>
                                {isOverdueDropOff
                                    ? `Drop-off was due ${new Date(txn.dropOffDate + "T00:00:00").toLocaleDateString("en-ZA", { day: "numeric", month: "short" })} — item not yet received at facility`
                                    : `Collection was due ${new Date(txn.dropOffDate + "T00:00:00").toLocaleDateString("en-ZA", { day: "numeric", month: "short" })} — buyer has not collected`
                                }
                            </span>
                            {!alertSent ? (
                                <span className={styles.alertSentChip} style={{ background: "#fef3c7", color: "#92400e", border: "1px solid #fcd34d" }}>
                                    <i className="fa-solid fa-clock fa-spin" /> Alert sending automatically…
                                </span>
                            ) : (
                                <span className={styles.alertSentChip}><i className="fa-solid fa-circle-check" /> Alert sent — auto-cancellation pending</span>
                            )}
                        </div>
                    )}

                    <div className={styles.detailGrid}>
                        <div className={styles.detailSection}>
                            <h3 className={styles.detailSectionTitle}><i className="fa-solid fa-users" /> Parties</h3>
                            <div className={styles.detailInfoRow}>
                                <span className={styles.detailInfoLabel}>Seller</span>
                                <span className={styles.detailInfoValue}>{txn.seller}</span>
                            </div>
                            <div className={styles.detailInfoRow}>
                                <span className={styles.detailInfoLabel}>Buyer</span>
                                <span className={styles.detailInfoValue}>{txn.buyer}</span>
                            </div>
                        </div>

                        <div className={styles.detailSection}>
                            <h3 className={styles.detailSectionTitle}><i className="fa-solid fa-receipt" /> Transaction</h3>
                            <div className={styles.detailInfoRow}>
                                <span className={styles.detailInfoLabel}>Type</span>
                                <span className={styles.detailInfoValue}>{txn.type}</span>
                            </div>
                            <div className={styles.detailInfoRow}>
                                <span className={styles.detailInfoLabel}>Payment Method</span>
                                <span className={styles.detailInfoValue}>
                                    <span className={styles.paymentMethodChip} style={{ background: paymentConfig.bg, color: paymentConfig.color }}>
                                        <i className={`fa-solid ${paymentConfig.icon}`} />
                                        {paymentConfig.label}
                                    </span>
                                </span>
                            </div>
                            {txn.type === "Purchase" ? (
                                <>
                                    <div className={styles.detailInfoRow}>
                                        <span className={styles.detailInfoLabel}>Amount</span>
                                        <span className={styles.detailInfoValue}>
                                            R{totalPrice?.toLocaleString()}
                                            {isFullyOnline ? (
                                                <span className={styles.paidChip}><i className="fa-solid fa-circle-check" /> Paid Online</span>
                                            ) : cashConfirmed ? (
                                                <span className={styles.paidChip}><i className="fa-solid fa-circle-check" /> Paid</span>
                                            ) : hasShortfall ? (
                                                <span className={styles.shortfallChip}><i className="fa-solid fa-triangle-exclamation" /> Cash owed: R{shortfall.toLocaleString()}</span>
                                            ) : (
                                                <span className={styles.paidChip}><i className="fa-solid fa-circle-check" /> Paid</span>
                                            )}
                                        </span>
                                    </div>
                                    <div className={styles.detailInfoRow}>
                                        <span className={styles.detailInfoLabel}>Payment</span>
                                        <span className={styles.detailInfoValue}>
                                            {isFullyOnline ? "Fully Online" : isFullyCash ? "Fully Cash" : isPartial ? "Partial (Online + Cash)" : txn.paymentMethod}
                                        </span>
                                    </div>
                                    {isPartial && (
                                        <>
                                            <div className={styles.detailInfoRow}>
                                                <span className={styles.detailInfoLabel}>Paid Online</span>
                                                <span className={styles.detailInfoValue} style={{ color: "#10b981", fontWeight: 600 }}>
                                                    R{onlineAmountPaid.toLocaleString()}
                                                    <span className={styles.paidChip}><i className="fa-solid fa-circle-check" /> Confirmed</span>
                                                </span>
                                            </div>
                                            <div className={styles.detailInfoRow}>
                                                <span className={styles.detailInfoLabel}>Cash Due</span>
                                                <span className={styles.detailInfoValue}>
                                                    R{shortfall.toLocaleString()}
                                                    {cashConfirmed
                                                        ? <span className={styles.paidChip}><i className="fa-solid fa-circle-check" /> Received</span>
                                                        : <span className={styles.shortfallChip}><i className="fa-solid fa-coins" /> Collect at pickup</span>
                                                    }
                                                </span>
                                            </div>
                                        </>
                                    )}
                                </>
                            ) : (
                                <div className={styles.detailInfoRow}>
                                    <span className={styles.detailInfoLabel}>Trade For</span>
                                    <span className={styles.detailInfoValue}>
                                        {typeof txn.tradeFor === "object" && txn.tradeFor !== null
                                            ? (txn.tradeFor.name || txn.tradeFor.title || "—")
                                            : (txn.tradeFor || "—")}
                                    </span>
                                </div>
                            )}
                        </div>

                        <div className={styles.detailSection}>
                            <h3 className={styles.detailSectionTitle}><i className="fa-solid fa-truck-arrow-right" /> Drop-off</h3>
                            <div className={styles.detailInfoRow}>
                                <span className={styles.detailInfoLabel}>Date</span>
                                <span className={styles.detailInfoValue}>{txn.dropOffDate || "—"}</span>
                            </div>
                            <div className={styles.detailInfoRow}>
                                <span className={styles.detailInfoLabel}>Time Slot</span>
                                <span className={styles.detailInfoValue}>{txn.dropOffTimeSlot || txn.timeSlot || "—"}</span>
                            </div>
                            <div className={styles.detailInfoRow}>
                                <span className={styles.detailInfoLabel}>Booked</span>
                                <span className={styles.detailInfoValue}>{txn.dropOffBooked ? "Yes" : "Not yet"}</span>
                            </div>
                        </div>

                        <div className={styles.detailSection}>
                            <h3 className={styles.detailSectionTitle}><i className="fa-solid fa-person-walking" /> Collection</h3>
                            <div className={styles.detailInfoRow}>
                                <span className={styles.detailInfoLabel}>Receipt ID</span>
                                <span className={styles.detailInfoValue}>
                                    <span style={{ fontFamily: "monospace", fontWeight: 700, fontSize: "0.9rem", letterSpacing: "0.05em", background: "#faf5ff", border: "1.5px dashed #a78bfa", borderRadius: 6, padding: "2px 10px", color: "#1e293b", display: "inline-flex", alignItems: "center", gap: 5 }}>
                                        <i className="fa-solid fa-receipt" style={{ color: "#7c3aed", fontSize: "0.78rem" }} />
                                        {getReceiptRef(txn)}
                                    </span>
                                </span>
                            </div>
                            <div className={styles.detailInfoRow}>
                                <span className={styles.detailInfoLabel}>Collect By</span>
                                <span className={styles.detailInfoValue}>
                                    {(() => {
                                        // Best source: explicit deadline field
                                        if (txn.collectionDeadline) {
                                            return new Date(txn.collectionDeadline).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" });
                                        }
                                        // Second: droppedOffAt timestamp + 7 days
                                        if (txn.droppedOffAt) {
                                            return new Date(new Date(txn.droppedOffAt).getTime() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" });
                                        }
                                        // Fallback: dropOffDate (string "YYYY-MM-DD") + 7 days — always available once booked
                                        if (txn.dropOffDate) {
                                            return new Date(new Date(txn.dropOffDate + "T00:00:00").getTime() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" });
                                        }
                                        return "—";
                                    })()}
                                </span>
                            </div>
                            <div className={styles.detailInfoRow}>
                                <span className={styles.detailInfoLabel}>Status</span>
                                <span className={styles.detailInfoValue}>
                                    {txn.status === "completed"
                                        ? <span className={styles.paidChip}><i className="fa-solid fa-circle-check" /> Collected</span>
                                        : txn.status === "awaiting_collection"
                                            ? <span style={{ color: "#6AA6DA", fontWeight: 600 }}>In Facility — ready to collect</span>
                                            : "Not yet released"
                                    }
                                </span>
                            </div>
                        </div>
                    </div>

                    {waitingForDropOff && (
                        <div className={styles.waitingBanner}>
                            <i className="fa-solid fa-hourglass-half" />
                            <span>Waiting for <strong>{txn.seller}</strong> to book a drop-off slot. No action required yet.</span>
                        </div>
                    )}
                    {txn.status === "pending" && txn.dropOffBooked && (
                        <div className={styles.bookedBanner}>
                            <i className="fa-solid fa-calendar-check" />
                            <span>Drop-off booked by <strong>{txn.seller}</strong> for <strong>{txn.dropOffDate}</strong> at <strong>{txn.dropOffTimeSlot}</strong>. Confirm once item is received.</span>
                        </div>
                    )}
                    {waitingForCollection && (
                        <div className={styles.waitingBanner}>
                            <i className="fa-solid fa-clipboard-check" />
                            <span>Item received at facility. Complete the <strong>inspection checklist</strong> below, then press <strong>Confirm Drop-Off</strong> to notify the buyer.</span>
                        </div>
                    )}
                    {txn.collectionBooked && txn.collectionDate && (
                        <div className={styles.bookedBanner}>
                            <i className="fa-solid fa-calendar-check" />
                            <span>Collection previously booked by <strong>{txn.buyer}</strong> for <strong>{txn.collectionDate}</strong> at <strong>{txn.collectionTimeSlot}</strong>.</span>
                        </div>
                    )}
                    {txn.status === "pending" && txn.dropOffBooked && (
                        <div className={styles.dropOffBanner}>
                            <i className="fa-solid fa-truck-arrow-right" />
                            <span>Awaiting item drop-off from seller. Click <strong>Confirm Drop-Off</strong> once you have physically received the item.</span>
                        </div>
                    )}
                    {isFullyOnline && txn.type === "Purchase" && (
                        <div className={styles.cashConfirmedBanner}>
                            <i className="fa-solid fa-circle-check" />
                            <span>Full payment of <strong>R{totalPrice.toLocaleString()}</strong> confirmed online — no cash required.</span>
                        </div>
                    )}
                    {isPartial && !cashConfirmed && (
                        <div className={txn.status === "pending" ? styles.cashConfirmedBanner : styles.shortfallBanner}>
                            <i className={`fa-solid ${txn.status === "pending" ? "fa-circle-check" : "fa-coins"}`} />
                            <span>
                                R{onlineAmountPaid.toLocaleString()} paid online — <strong>confirmed</strong>.{" "}
                                {txn.status === "pending"
                                    ? <>Remaining <strong>R{shortfall.toLocaleString()} cash</strong> will be collected from buyer at collection.</>
                                    : <>Collect remaining <strong>R{shortfall.toLocaleString()} cash</strong> from buyer before releasing.</>
                                }
                            </span>
                        </div>
                    )}
                    {isPartial && cashConfirmed && (
                        <div className={styles.cashConfirmedBanner}>
                            <i className="fa-solid fa-circle-check" />
                            <span>R{onlineAmountPaid.toLocaleString()} online + R{shortfall.toLocaleString()} cash — <strong>fully confirmed</strong>.</span>
                        </div>
                    )}
                    {isFullyCash && !cashConfirmed && (
                        <div className={txn.status === "pending" ? styles.cashConfirmedBanner : styles.shortfallBanner}>
                            <i className={`fa-solid ${txn.status === "pending" ? "fa-circle-check" : "fa-coins"}`} />
                            <span>
                                {txn.status === "pending"
                                    ? <>Full payment of <strong>R{totalPrice.toLocaleString()} cash</strong> will be confirmed by staff at collection.</>
                                    : <>Collect full payment of <strong>R{totalPrice.toLocaleString()} cash</strong> from buyer before releasing.</>
                                }
                            </span>
                        </div>
                    )}
                    {isFullyCash && cashConfirmed && (
                        <div className={styles.cashConfirmedBanner}>
                            <i className="fa-solid fa-circle-check" />
                            <span>Cash of <strong>R{totalPrice.toLocaleString()}</strong> confirmed received.</span>
                        </div>
                    )}

                    {((txn.status === "pending" && txn.dropOffBooked) || txn.status === "awaiting_collection") && (
                        <div className={styles.detailSection} style={{ marginTop: 8 }}>
                            <h3 className={styles.detailSectionTitle}><i className="fa-solid fa-clipboard-check" /> Inspection Checklist</h3>
                            {txn.status === "pending" && !allChecked && dropOffTimeReached && (
                                <div className={styles.timeGateBanner} style={{ marginBottom: 8, background: "rgba(245,158,11,0.1)", borderColor: "#f59e0b", color: "#b45309" }}>
                                    <i className="fa-solid fa-triangle-exclamation" />
                                    <span>Complete <strong>all inspection steps</strong> before confirming drop-off.</span>
                                </div>
                            )}
                            {!dropOffTimeReached && (
                                <div className={styles.timeGateBanner}>
                                    <i className="fa-solid fa-lock" />
                                    <span>Inspection available from <strong>{txn.dropOffDate}</strong>{txn.dropOffTimeSlot && <> at <strong>{txn.dropOffTimeSlot}</strong></>}.</span>
                                </div>
                            )}
                            <div className={styles.checklist}>
                                {txn.checklist.map((step, i) => (
                                    <button
                                        key={i}
                                        className={`${styles.checkItem} ${step.done ? styles.checkDone : styles.checkPending} ${!dropOffTimeReached ? styles.checkLocked : ""}`}
                                        onClick={() => dropOffTimeReached && onMarkStep && onMarkStep(txn.id, i)}
                                        disabled={step.done || !dropOffTimeReached}
                                        title={!dropOffTimeReached ? `Locked until ${txn.dropOffDate}${txn.dropOffTimeSlot ? ` at ${txn.dropOffTimeSlot}` : ""}` : undefined}
                                    >
                                        <i className={`fa-solid ${!dropOffTimeReached ? "fa-lock" : step.done ? "fa-circle-check" : "fa-circle"}`} />
                                        {step.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                <div className={styles.detailFooter}>
                    {showConfirmDropOff && (
                        <>
                            {!dropOffTimeReached && (
                                <div className={styles.timeGateBanner} style={{ marginBottom: 8 }}>
                                    <i className="fa-solid fa-lock" />
                                    <span>Drop-off confirmation unlocks on <strong>{txn.dropOffDate}</strong>{txn.dropOffTimeSlot && <> at <strong>{txn.dropOffTimeSlot}</strong></>}.</span>
                                </div>
                            )}
                            {dropOffTimeReached && !allChecked && (
                                <div className={styles.timeGateBanner} style={{ marginBottom: 8, background: "rgba(245,158,11,0.1)", borderColor: "#f59e0b", color: "#b45309" }}>
                                    <i className="fa-solid fa-clipboard-list" />
                                    <span>Complete the <strong>inspection checklist</strong> above before confirming drop-off.</span>
                                </div>
                            )}
                            <button
                                className={styles.dropOffBtn}
                                onClick={handleDropOff}
                                disabled={dropOffLoading || !dropOffTimeReached || !allChecked}
                                style={(!dropOffTimeReached || !allChecked) ? { opacity: 0.45, cursor: "not-allowed" } : undefined}
                            >
                                <i className={`fa-solid ${dropOffLoading ? "fa-spinner fa-spin" : !dropOffTimeReached ? "fa-lock" : !allChecked ? "fa-clipboard-list" : "fa-box-archive"}`} />
                                {dropOffLoading ? "Confirming…" : !dropOffTimeReached ? "Confirm Drop-Off (Locked)" : !allChecked ? "Complete Inspection First" : "Confirm Drop-Off"}
                            </button>
                        </>
                    )}

                    {showConfirmCollection && (
                        <>
                            {/* ── Collection checklist ── */}
                            <div style={{ marginBottom: 12, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, overflow: "hidden" }}>
                                <div style={{ padding: "8px 14px", background: "#f1f5f9", borderBottom: "1px solid #e2e8f0", fontSize: "0.72rem", fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                                    <i className="fa-solid fa-clipboard-check" style={{ marginRight: 6 }} />
                                    Collection Checklist
                                </div>

                                {/* Step 1 — Receipt verification */}
                                <div style={{ padding: "10px 14px", borderBottom: "1px solid #f1f5f9", display: "flex", alignItems: "center", gap: 10 }}>
                                    <i className="fa-solid fa-circle-check" style={{ color: "#10b981", fontSize: "1rem", flexShrink: 0 }} />
                                    <div style={{ flex: 1 }}>
                                        <p style={{ margin: 0, fontSize: "0.8rem", fontWeight: 600, color: "#1e293b" }}>Verify buyer's receipt</p>
                                        {txn.receiptId ? (
                                            <p style={{ margin: "2px 0 0", fontSize: "0.73rem", color: "#64748b" }}>
                                                Receipt ID: <span style={{ fontFamily: "monospace", fontWeight: 700, color: "#1e293b", background: "#e2e8f0", borderRadius: 4, padding: "0 5px" }}>{txn.receiptId}</span>
                                            </p>
                                        ) : (
                                            <p style={{ margin: "2px 0 0", fontSize: "0.73rem", color: "#94a3b8" }}>Ask buyer to show receipt from their My Purchases page</p>
                                        )}
                                    </div>
                                </div>

                                {/* Step 2 — Confirm payment (cash/partial only) */}
                                {!isFullyOnline && hasShortfall && (
                                    <div style={{ padding: "10px 14px", borderBottom: "1px solid #f1f5f9", display: "flex", alignItems: "center", gap: 10 }}>
                                        <i className={`fa-solid ${cashConfirmed ? "fa-circle-check" : "fa-circle"}`} style={{ color: cashConfirmed ? "#10b981" : "#cbd5e1", fontSize: "1rem", flexShrink: 0 }} />
                                        <div style={{ flex: 1 }}>
                                            <p style={{ margin: 0, fontSize: "0.8rem", fontWeight: 600, color: "#1e293b" }}>
                                                {isPartial
                                                    ? `Collect R${shortfall.toLocaleString()} cash (R${onlineAmountPaid.toLocaleString()} paid online)`
                                                    : `Collect full payment — R${shortfall.toLocaleString()} cash`
                                                }
                                            </p>
                                            {cashConfirmed
                                                ? <p style={{ margin: "2px 0 0", fontSize: "0.73rem", color: "#10b981", fontWeight: 600 }}>✓ Cash received</p>
                                                : <p style={{ margin: "2px 0 0", fontSize: "0.73rem", color: "#92400e" }}>Collect cash from buyer before completing</p>
                                            }
                                        </div>
                                        {!cashConfirmed && (
                                            <button
                                                onClick={handleConfirmCash}
                                                disabled={saving}
                                                style={{ padding: "5px 12px", background: "#f59e0b", color: "#fff", border: "none", borderRadius: 7, fontSize: "0.75rem", fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0 }}
                                            >
                                                <i className={`fa-solid ${saving ? "fa-spinner fa-spin" : "fa-hand-holding-dollar"}`} style={{ marginRight: 4 }} />
                                                {saving ? "Saving…" : "Confirm Payment"}
                                            </button>
                                        )}
                                    </div>
                                )}

                                {/* Online payment confirmation row */}
                                {isFullyOnline && (
                                    <div style={{ padding: "10px 14px", display: "flex", alignItems: "center", gap: 10 }}>
                                        <i className="fa-solid fa-circle-check" style={{ color: "#10b981", fontSize: "1rem", flexShrink: 0 }} />
                                        <div>
                                            <p style={{ margin: 0, fontSize: "0.8rem", fontWeight: 600, color: "#1e293b" }}>Payment confirmed online</p>
                                            <p style={{ margin: "2px 0 0", fontSize: "0.73rem", color: "#10b981" }}>R{totalPrice.toLocaleString()} — no cash to collect</p>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Collection Complete button */}
                            <button
                                className={styles.confirmCollectionBtn}
                                onClick={handleCollection}
                                disabled={collectionLoading || (!isFullyOnline && hasShortfall && !cashConfirmed)}
                                style={(!isFullyOnline && hasShortfall && !cashConfirmed) ? { opacity: 0.45, cursor: "not-allowed" } : undefined}
                            >
                                <i className={`fa-solid ${collectionLoading ? "fa-spinner fa-spin" : "fa-handshake"}`} />
                                {collectionLoading ? "Confirming…"
                                    : (!isFullyOnline && hasShortfall && !cashConfirmed) ? "Confirm Payment First"
                                    : "Collection Complete"}
                            </button>
                        </>
                    )}
                    <button className={styles.detailCloseFooterBtn} onClick={onClose}>
                        <i className="fa-solid fa-chevron-left" /> Back to List
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── Transaction Card (compact summary row) ───────────────────────────────────
function TransactionCard({ txn, onConfirmDropOff, onConfirmCollection, onRelease, onMarkStep, onAlertOverdue, onCancelOverdue }) {
    const [panelOpen, setPanelOpen] = useState(false);
    const paymentConfig = getPaymentConfig(txn);
    const receiptRef    = getReceiptRef(txn);

    const isOverdueDropOff    = isDropOffOverdue(txn);
    const isOverdueCollection = isCollectionOverdue(txn);
    const isOverdue = isOverdueDropOff || isOverdueCollection;

    const meta = isOverdue
        ? { ...STATUS_META[txn.status] || STATUS_META.pending, label: "Overdue", cls: (STATUS_META[txn.status] || STATUS_META.pending).cls }
        : (STATUS_META[txn.status] || STATUS_META.pending);

    const paymentMethod    = (txn.paymentMethod || "cash").toLowerCase();
    const isFullyOnline    = paymentMethod === "online"  || paymentMethod === "fully_online"  || paymentMethod === "fully online";
    const isPartialCard    = paymentMethod === "partial" || paymentMethod === "partial_online" || paymentMethod === "split" || paymentMethod === "partially online" || paymentMethod === "partially_online";

    const totalPrice       = txn.price ?? 0;
    const onlineAmountPaid = txn.onlineAmountPaid ?? 0;
    const shortfall        = isFullyOnline
        ? 0
        : isPartialCard
            ? Math.max(0, totalPrice - onlineAmountPaid)
            : (txn.cashShortfall ?? totalPrice);

    const hasShortfall = shortfall > 0;
    const isPaid       = isFullyOnline || txn.paymentStatus === "Fully Paid" || shortfall === 0;

    return (
        <>
            <div
                className={`${styles.txnCard} ${styles[`txnCard_${meta.cls}`]} ${isOverdue ? styles.txnCard_overdue : ""}`}
                onClick={() => setPanelOpen(true)}
                role="button"
                tabIndex={0}
                onKeyDown={e => e.key === "Enter" && setPanelOpen(true)}
                title="Click to view details"
            >
                {isOverdue && (
                    <div className={styles.overdueBannerWrap}>
                        <div className={styles.overdueBanner}>
                            <i className="fa-solid fa-triangle-exclamation" />
                            <span>
                                {isOverdueDropOff
                                    ? `Drop-off was due ${new Date(txn.dropOffDate + "T00:00:00").toLocaleDateString("en-ZA", { day: "numeric", month: "short" })} — not yet received`
                                    : `Collection was due ${new Date(txn.dropOffDate + "T00:00:00").toLocaleDateString("en-ZA", { day: "numeric", month: "short" })} — buyer has not collected`
                                }
                            </span>
                        </div>
                    </div>
                )}

                <div className={styles.txnInnerRow}>
                    <div className={styles.txnThumb}>
                        {txn.itemImage
                            ? <img src={txn.itemImage} alt={txn.item} />
                            : <i className="fa-solid fa-box-open" />
                        }
                    </div>

                    <div className={styles.txnMain}>
                        <div className={styles.txnTopRow}>
                            <span className={styles.txnTitle}>{txn.item}</span>
                            <div className={styles.txnBadges}>
                                <span className={styles.paymentBadgeSmall} style={{ background: paymentConfig.bg, color: paymentConfig.color }}>
                                    <i className={`fa-solid ${paymentConfig.icon}`} />
                                    {paymentConfig.label}
                                </span>
                                {txn.dropOffDate && (
                                    <span className={styles.dateBadge}>
                                        <i className="fa-regular fa-calendar" />
                                        {new Date(txn.dropOffDate + "T00:00:00").toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })}
                                    </span>
                                )}
                                <span className={styles.timeBadge}>
                                    <i className="fa-regular fa-clock" /> {txn.timeSlot}
                                </span>
                                <span className={`${styles.statusBadge} ${isOverdue ? styles.status_overdue : styles[`status_${meta.cls}`]}`}>
                                    <i className={`fa-solid ${isOverdue ? "fa-circle-exclamation" : meta.icon}`} />
                                    {isOverdue ? "Overdue" : meta.label}
                                </span>
                            </div>
                        </div>

                        <div className={styles.txnParties}>
                            <span className={styles.txnParty}>{txn.seller}</span>
                            <i className="fa-solid fa-arrow-right" style={{ color: "#bbb", fontSize: "0.7rem" }} />
                            <span className={styles.txnParty}>{txn.buyer}</span>
                        </div>

                        {/* ─── FIXED PAYMENT STATUS DISPLAY ─── */}
                        <div className={styles.txnMeta}>
                            {txn.type === "Purchase" ? (
                                <span className={styles.txnTag}>
                                    Purchase · R{totalPrice?.toLocaleString()}
                                    {isFullyOnline ? (
                                        <span className={styles.paidChip}><i className="fa-solid fa-wifi" /> Online</span>
                                    ) : isPaid ? (
                                        <span className={styles.paidChip}><i className="fa-solid fa-circle-check" /> Paid</span>
                                    ) : isPartialCard ? (
                                        <span className={styles.shortfallChip}><i className="fa-solid fa-coins" /> R{shortfall.toLocaleString()} cash due</span>
                                    ) : (
                                        <span className={styles.shortfallChip}><i className="fa-solid fa-triangle-exclamation" /> Cash owed: R{shortfall.toLocaleString()}</span>
                                    )}
                                </span>
                            ) : (
                                <span className={styles.txnTag}>Trade · {typeof txn.tradeFor === "object" && txn.tradeFor !== null
                                    ? (txn.tradeFor.name || txn.tradeFor.title || "—")
                                    : (txn.tradeFor || "—")}</span>
                            )}
                            {/* Receipt badge — always visible for collection & completed */}
                            {(txn.status === "awaiting_collection" || txn.status === "completed") && (
                                <span style={{
                                    display: "inline-flex", alignItems: "center", gap: 4,
                                    fontFamily: "monospace", fontWeight: 700, fontSize: "0.78rem",
                                    letterSpacing: "0.06em", background: "#faf5ff",
                                    border: "1.5px dashed #a78bfa", borderRadius: 6,
                                    padding: "1px 8px", color: "#1e293b", marginLeft: 4,
                                }}>
                                    <i className="fa-solid fa-receipt" style={{ color: "#7c3aed", fontSize: "0.72rem" }} />
                                    {receiptRef}
                                </span>
                            )}
                        </div>
                    </div>

                    {/* Right column: overdue status + chevron */}
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 5, flexShrink: 0 }}>
                        {isOverdue && (
                            <>
                                {!txn.overdueAlertSentAt ? (
                                    <span style={{
                                        display: "inline-flex", alignItems: "center", gap: 5,
                                        padding: "5px 10px", borderRadius: 7, border: "none",
                                        fontSize: "0.73rem", fontWeight: 700,
                                        background: "#fef3c7", color: "#92400e", whiteSpace: "nowrap",
                                    }}>
                                        <i className="fa-solid fa-clock fa-spin" /> Auto-alerting…
                                    </span>
                                ) : (
                                    <span style={{
                                        display: "inline-flex", alignItems: "center", gap: 5,
                                        padding: "5px 10px", borderRadius: 7, border: "none",
                                        fontSize: "0.73rem", fontWeight: 700,
                                        background: "#dcfce7", color: "#16a34a", whiteSpace: "nowrap",
                                    }}>
                                        <i className="fa-solid fa-circle-check" /> Alerted — cancelling soon
                                    </span>
                                )}
                            </>
                        )}
                        <div className={styles.txnChevron}>
                            <i className="fa-solid fa-chevron-right" />
                        </div>
                    </div>
                </div>
            </div>

            {panelOpen && (
                <TransactionDetailPanel
                    txn={txn}
                    onClose={() => setPanelOpen(false)}
                    onConfirmDropOff={onConfirmDropOff}
                    onConfirmCollection={onConfirmCollection}
                    onRelease={onRelease}
                    onMarkStep={onMarkStep}
                    onAlertOverdue={onAlertOverdue}
                    onCancelOverdue={onCancelOverdue}
                />
            )}
        </>
    );
}

// ─── Time Slots View ──────────────────────────────────────────────────────────
function TimeSlotsView({ transactions }) {
    const slots = {};
    transactions.forEach(t => {
        if (!slots[t.timeSlot]) slots[t.timeSlot] = [];
        slots[t.timeSlot].push(t);
    });
    const sorted = Object.entries(slots).sort(([a], [b]) => a.localeCompare(b));

    return (
        <div className={styles.slotsGrid}>
            {sorted.map(([slot, txns]) => (
                <div key={slot} className={styles.slotCard}>
                    <div className={styles.slotHeader}>
                        <i className="fa-regular fa-clock" />
                        <span className={styles.slotTime}>{slot}</span>
                        <span className={styles.slotCount}>{txns.length} item{txns.length > 1 ? "s" : ""}</span>
                    </div>
                    {txns.map(t => {
                        const meta = STATUS_META[t.status] || STATUS_META.pending;
                        const paymentConfig = getPaymentConfig(t);
                        return (
                            <div key={t.id} className={styles.slotItem}>
                                <div className={styles.slotItemLeft}>
                                    <span className={styles.slotItemTitle}>{t.item}</span>
                                    <span className={styles.slotItemParties}>{t.seller} → {t.buyer}</span>
                                    <span className={styles.paymentBadgeSmall} style={{ background: paymentConfig.bg, color: paymentConfig.color, fontSize: "9px", padding: "1px 6px" }}>
                                        <i className={`fa-solid ${paymentConfig.icon}`} />
                                        {paymentConfig.label}
                                    </span>
                                </div>
                                <span className={`${styles.statusBadge} ${styles[`status_${meta.cls}`]}`}>
                                    {meta.label}
                                </span>
                            </div>
                        );
                    })}
                </div>
            ))}
        </div>
    );
}

// ─── Staff Profile Panel ──────────────────────────────────────────────────────
function StaffProfilePanel({ staffName, staffEmail, staffInitials, staffPhoto, onClose, onLogout, isLoggingOut }) {
    return (
        <div className={styles.profileOverlay} onClick={onClose}>
            <div className={styles.profilePanel} onClick={e => e.stopPropagation()}>
                <div className={styles.profilePanelHeader}>
                    <span>Staff Profile</span>
                    <button className={styles.profileClose} onClick={onClose}>
                        <i className="fa-solid fa-xmark" />
                    </button>
                </div>
                <div className={styles.profileHero}>
                    <div className={styles.profileAvatarLg}>
                        {staffPhoto
                            ? <img src={staffPhoto} alt={staffName} />
                            : <span>{staffInitials}</span>
                        }
                    </div>
                    <div className={styles.staffBadgeLg}>
                        <i className="fa-solid fa-shield-halved" /> STAFF
                    </div>
                    <h2 className={styles.profileHeroName}>{staffName}</h2>
                    <p className={styles.profileHeroEmail}>{staffEmail}</p>
                </div>
                <div className={styles.profileInfoList}>
                    <div className={styles.profileInfoRow}>
                        <i className="fa-solid fa-id-badge" />
                        <div>
                            <span className={styles.profileInfoLbl}>Role</span>
                            <span className={styles.profileInfoVal}>Trade Facility Staff</span>
                        </div>
                    </div>
                    <div className={styles.profileInfoRow}>
                        <i className="fa-solid fa-building" />
                        <div>
                            <span className={styles.profileInfoLbl}>Assigned Campus</span>
                            <span className={styles.profileInfoVal}>Main Campus</span>
                        </div>
                    </div>
                    <div className={styles.profileInfoRow}>
                        <i className="fa-solid fa-calendar-check" />
                        <div>
                            <span className={styles.profileInfoLbl}>Member Since</span>
                            <span className={styles.profileInfoVal}>January 2024</span>
                        </div>
                    </div>
                    <div className={styles.profileInfoRow}>
                        <i className="fa-solid fa-clock" />
                        <div>
                            <span className={styles.profileInfoLbl}>Shift</span>
                            <span className={styles.profileInfoVal}>08:00 – 16:00 (Mon–Fri)</span>
                        </div>
                    </div>
                </div>
                <div className={styles.profileLogoutSection}>
                    <button
                        className={styles.profileLogoutBtn}
                        onClick={onLogout}
                        disabled={isLoggingOut}
                    >
                        {isLoggingOut
                            ? <><i className="fas fa-spinner fa-spin" /> Logging out...</>
                            : <><i className="fas fa-right-from-bracket" /> Logout</>
                        }
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────
export default function StaffDashboard() {
    const navigate = useNavigate();
    const [activeTab, setActiveTab]           = useState("drop_offs");
    const [dueTodaySubTab, setDueTodaySubTab] = useState("drop_off");
    const [overdueSubTab, setOverdueSubTab]   = useState("drop_offs");
    const [selectedOverdue, setSelectedOverdue] = useState(new Set());
    const [bulkActioning, setBulkActioning]     = useState(false);
    const [search, setSearch]                 = useState("");
    const [collectionSearch, setCollectionSearch] = useState("");
    const [transactions, setTransactions]     = useState([]);
    const [campus, setCampus]                 = useState("All Campuses");
    const [isLoggingOut, setIsLoggingOut] = useState(false);
    const [showProfile, setShowProfile]   = useState(false);
    const [staffUser, setStaffUser]       = useState({
        name: "", email: "", photoURL: "", initials: "",
    });
    const [authReady, setAuthReady]       = useState(false);
    const [loadingTxns, setLoadingTxns]   = useState(true);
    const [lastFetched, setLastFetched]   = useState(null);
    const sellerCacheRef  = useRef({});
    const listingCacheRef = useRef({});

    useEffect(() => {
        const unsub = onAuthStateChanged(auth, async (user) => {
            if (!user) { setAuthReady(true); return; }
            const parts = (user.displayName || "").split(" ");
            const fn = parts[0] || "", ln = parts.slice(1).join(" ") || "";
            const ini = `${fn[0] || ""}${ln[0] || ""}`.toUpperCase() || "S";
            setStaffUser({ name: user.displayName || "Staff", email: user.email || "", photoURL: user.photoURL || "", initials: ini });
            try {
                const snap = await getDoc(doc(db, "users", user.uid));
                if (snap.exists()) {
                    const d = snap.data();
                    const f = d.firstName || fn, l = d.lastName || ln;
                    setStaffUser({
                        name:     `${f} ${l}`.trim() || user.displayName || "Staff",
                        email:    d.email     || user.email    || "",
                        photoURL: d.photoURL  || user.photoURL || "",
                        initials: `${f[0] || ""}${l[0] || ""}`.toUpperCase() || "S",
                    });
                }
            } catch {} finally { setAuthReady(true); }
        });
        return () => unsub();
    }, []);

    useEffect(() => {
        const q = query(
            collection(db, "transactions"),
            where("status", "in", [
                "waiting",
                "accepted",
                "pending_payment",
                "awaiting_collection",
                "completed",
            ])
        );

        const unsub = onSnapshot(q, async (snapshot) => {
            try {
                const base = snapshot.docs.map(d => ({ _ref: d.id, _data: d.data() }));

                // Only fetch IDs not already cached — reduces Firestore reads significantly
                const allSellerIds  = [...new Set(base.map(b => b._data.sellerId).filter(Boolean))];
                const allListingIds = [...new Set(base.map(b => b._data.listingId).filter(Boolean))];
                const newSellerIds  = allSellerIds.filter(id => !sellerCacheRef.current[id]);
                const newListingIds = allListingIds.filter(id => !(id in listingCacheRef.current));

                const [sellerSnaps, listingSnaps] = await Promise.all([
                    Promise.all(newSellerIds.map(id  => getDoc(doc(db, "users",    id)))),
                    Promise.all(newListingIds.map(id => getDoc(doc(db, "listings", id)))),
                ]);

                sellerSnaps.forEach(snap => {
                    if (snap.exists()) {
                        const d = snap.data();
                        sellerCacheRef.current[snap.id] = `${d.firstName || ""} ${d.lastName || ""}`.trim() || "Seller";
                    }
                });
                listingSnaps.forEach(snap => {
                    if (snap.exists()) {
                        const d = snap.data();
                        listingCacheRef.current[snap.id] =
                            (Array.isArray(d.photos) && d.photos[0]) ||
                            (Array.isArray(d.images) && d.images[0]) ||
                            d.imageUrl || d.image || d.itemImage || null;
                    }
                });

                const live = base.map(({ _ref: id, _data: data }) => ({
                    id,
                    item:          (typeof (data.listingTitle) === "object" && data.listingTitle !== null)
                        ? (data.listingTitle.name || data.listingTitle.title || "Item")
                        : (data.listingTitle || "Item"),
                    itemImage:     listingCacheRef.current[data.listingId] ?? data.itemImage ?? null,
                    seller:        sellerCacheRef.current[data.sellerId] || data.sellerName || "Seller",
                    sellerId:      data.sellerId,
                    buyer:         data.buyerName || "Buyer",
                    buyerId:       data.buyerId,
                    listingId:     data.listingId    || null,
                    listingTitle:  data.listingTitle || "Item",
                    type:          data.type === "sale" || data.type === "Purchase" ? "Purchase" : "Trade",
                    price:         data.agreedPrice  || data.price || 0,
                    cashShortfall: data.cashShortfall ?? 0,
                    paymentStatus: data.paymentStatus || (data.cashShortfall > 0 ? "Partially Paid" : "Fully Paid"),
                    paymentMethod: data.paymentMethod || data.paymentType || "cash",
                    paymentType:   data.paymentType || data.paymentMethod || "unknown",
                    tradeFor:      (typeof data.tradeItem === "object" && data.tradeItem !== null)
                        ? (data.tradeItem.name || data.tradeItem.title || JSON.stringify(data.tradeItem))
                        : (data.tradeItem || null),
                    timeSlot:      data.dropOffTimeSlot || data.timeSlot || "TBD",
                    status: (data.status === "accepted" || data.status === "waiting")
                        ? "pending"
                        : (data.status === "pending_payment")
                        ? "pending_payment"
                        : (data.status || "pending"),
                    campus: data.campus || "Main Campus",
                    dropOffBooked:   !!(data.bookingId || data.dropOffStatus === "scheduled"),
                    dropOffDate:     data.dropOffDate     || null,
                    dropOffTimeSlot: data.dropOffTimeSlot || null,
                    collectionBooked:   !!(data.collectionBookingId || data.collectionStatus === "scheduled"),
                    collectionDate:     data.collectionDate     || null,
                    collectionTimeSlot: data.collectionTimeSlot || null,
                    receiptId:       data.receiptId || null,
                    overdueAlertSentAt: data.overdueAlertSentAt || null,
                    droppedOffAt: data.droppedOffAt?.toDate ? data.droppedOffAt.toDate().toISOString() : data.droppedOffAt || null,
                    collectionDeadline: data.collectionDeadline?.toDate ? data.collectionDeadline.toDate().toISOString() : data.collectionDeadline || null,
                    onlineAmountPaid: data.onlineAmount ?? data.onlineAmountPaid ?? data.depositAmount ?? 0,
                    checklist: data.checklist
                        ? data.checklist.filter(c => c.label !== "Confirmed Payment")
                        : [
                            { label: "Confirmed Drop-off", done: data.dropOffConfirmed || false },
                            { label: "Inspected Item",     done: data.itemInspected    || false },
                        ],
                    date: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(),
                }));

                setTransactions(live);
                setLastFetched(new Date());
            } catch (err) {
                console.error("Failed to process snapshot:", err);
            } finally {
                setLoadingTxns(false);
            }
        });

        return () => unsub();
    }, []);

    const fetchTransactions = useCallback(async () => {
        setLoadingTxns(true);
        try {
            const q = query(
                collection(db, "transactions"),
                where("status", "in", [
                    "waiting", "accepted", "pending_payment",
                    "awaiting_collection", "completed",
                ])
            );
            const snapshot = await getDocs(q);
            const base = snapshot.docs.map(d => ({ _ref: d.id, _data: d.data() }));

            const sellerIds  = [...new Set(base.map(b => b._data.sellerId).filter(Boolean))];
            const listingIds = [...new Set(base.map(b => b._data.listingId).filter(Boolean))];

            const [sellerSnaps, listingSnaps] = await Promise.all([
                Promise.all(sellerIds.map(id  => getDoc(doc(db, "users",    id)))),
                Promise.all(listingIds.map(id => getDoc(doc(db, "listings", id)))),
            ]);

            sellerSnaps.forEach(snap => {
                if (snap.exists()) {
                    const d = snap.data();
                    sellerCacheRef.current[snap.id] = `${d.firstName || ""} ${d.lastName || ""}`.trim() || "Seller";
                }
            });
            listingSnaps.forEach(snap => {
                if (snap.exists()) {
                    const d = snap.data();
                    listingCacheRef.current[snap.id] =
                        (Array.isArray(d.photos) && d.photos[0]) ||
                        (Array.isArray(d.images) && d.images[0]) ||
                        d.imageUrl || d.image || d.itemImage || null;
                }
            });

            const live = base.map(({ _ref: id, _data: data }) => ({
                id,
                item:          (typeof data.listingTitle === "object" && data.listingTitle !== null)
                    ? (data.listingTitle.name || data.listingTitle.title || "Item")
                    : (data.listingTitle || "Item"),
                itemImage:     listingCacheRef.current[data.listingId] ?? data.itemImage ?? null,
                seller:        sellerCacheRef.current[data.sellerId] || data.sellerName || "Seller",
                sellerId:      data.sellerId,
                buyer:         data.buyerName || "Buyer",
                buyerId:       data.buyerId,
                listingId:     data.listingId    || null,
                listingTitle:  data.listingTitle || "Item",
                type:          data.type === "sale" || data.type === "Purchase" ? "Purchase" : "Trade",
                price:         data.agreedPrice  || data.price || 0,
                cashShortfall: data.cashShortfall ?? 0,
                paymentStatus: data.paymentStatus || (data.cashShortfall > 0 ? "Partially Paid" : "Fully Paid"),
                paymentMethod: data.paymentMethod || data.paymentType || "cash",
                paymentType:   data.paymentType || data.paymentMethod || "unknown",
                tradeFor:      (typeof data.tradeItem === "object" && data.tradeItem !== null)
                    ? (data.tradeItem.name || data.tradeItem.title || JSON.stringify(data.tradeItem))
                    : (data.tradeItem || null),
                timeSlot:      data.dropOffTimeSlot || data.timeSlot || "TBD",
                status: (data.status === "accepted" || data.status === "waiting")
                    ? "pending"
                    : (data.status === "pending_payment")
                    ? "pending_payment"
                    : (data.status || "pending"),
                campus:            data.campus || "Main Campus",
                dropOffBooked:     !!(data.bookingId || data.dropOffStatus === "scheduled"),
                dropOffDate:       data.dropOffDate     || null,
                dropOffTimeSlot:   data.dropOffTimeSlot || null,
                collectionBooked:  !!(data.collectionBookingId || data.collectionStatus === "scheduled"),
                collectionDate:    data.collectionDate     || null,
                collectionTimeSlot: data.collectionTimeSlot || null,
                receiptId:         data.receiptId || null,
                overdueAlertSentAt: data.overdueAlertSentAt || null,
                    droppedOffAt: data.droppedOffAt?.toDate ? data.droppedOffAt.toDate().toISOString() : data.droppedOffAt || null,
                    collectionDeadline: data.collectionDeadline?.toDate ? data.collectionDeadline.toDate().toISOString() : data.collectionDeadline || null,
                onlineAmountPaid: data.onlineAmount ?? data.onlineAmountPaid ?? data.depositAmount ?? 0,
                checklist: data.checklist
                    ? data.checklist.filter(c => c.label !== "Confirmed Payment")
                    : [
                        { label: "Confirmed Drop-off", done: data.dropOffConfirmed || false },
                        { label: "Inspected Item",     done: data.itemInspected    || false },
                    ],
                date: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(),
            }));

            setTransactions(live);
            setLastFetched(new Date());
        } catch (err) {
            console.error("Failed to refresh transactions:", err);
        } finally {
            setLoadingTxns(false);
        }
    }, []);

    const handleAlertOverdue = async (txn, type) => {
        try {
            await updateDoc(doc(db, "transactions", txn.id), {
                overdueAlertSentAt: serverTimestamp(),
                overdueAlertType:   type,
            });
            // Actually send the notifications — this was the missing piece
            if (type === "drop_off") {
                await notifyOverdueDropOff(txn);
            } else {
                await notifyOverdueCollection(txn);
            }
        } catch (err) {
            console.error("Failed to record overdue alert:", err);
        }
    };

    /**
     * Called by staff after 24 hrs have passed. Cancels the transaction,
     * marks the listing as overdue_cancelled, and notifies both parties.
     */
    const handleCancelOverdue = async (txn, overdueType) => {
        try {
            // 1. Cancel the transaction
            await updateDoc(doc(db, "transactions", txn.id), {
                status:            "overdue_cancelled",
                cancelledAt:       serverTimestamp(),
                cancelReason:      overdueType === "drop_off" ? "seller_no_dropoff" : "buyer_no_collection",
                cancelledByStaff:  true,
            });

            // 2. Mark the listing as cancelled so seller's profile moves it to history
            if (txn.listingId) {
                await updateDoc(doc(db, "listings", txn.listingId), {
                    status:              "cancelled",
                    cancelReason:        overdueType === "drop_off" ? "seller_no_dropoff" : "buyer_no_collection",
                    cancelledAt:         serverTimestamp(),
                    cancelledByStaff:    true,
                    pendingSellerAction: true,  // seller must relist or delete
                });
            }

            // 3. Send cancellation notifications to both parties
            if (overdueType === "drop_off") {
                await notifyCancelledDropOff(txn);
            } else {
                await notifyCancelledCollection(txn);
            }

            // 4. Update local state
            setTransactions(prev =>
                prev.map(t => t.id === txn.id ? { ...t, status: "overdue_cancelled" } : t)
            );
        } catch (err) {
            console.error("Failed to cancel overdue transaction:", err);
        }
    };



    // ─── Auto-send overdue alerts (staff still handles cancellation) ─────────
    useEffect(() => {
        if (transactions.length === 0) return;
        async function autoAlert() {
            for (const txn of transactions) {
                if (txn.overdueAlertSentAt) continue;
                if (txn.status === "overdue_cancelled") continue;
                const overdueDropOff    = isDropOffOverdue(txn);
                const overdueCollection = isCollectionOverdue(txn);
                if (!overdueDropOff && !overdueCollection) continue;
                try {
                    await handleAlertOverdue(txn, overdueDropOff ? "drop_off" : "collection");
                    setTransactions(prev => prev.map(t =>
                        t.id === txn.id ? { ...t, overdueAlertSentAt: new Date().toISOString() } : t
                    ));
                } catch (err) { console.error("Auto-alert failed:", txn.id, err); }
            }
        }
        autoAlert();
        const interval = setInterval(autoAlert, 60_000);
        return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [transactions]);

    // ─── Countdown helper: "cancels in X h Y m" ──────────────────────────────
    function getCancelCountdown(txn) {
        // TESTING: 2 min after alert sent. PROD: change to 24 * 60 * 60 * 1000
        const CANCEL_DELAY_MS = 2 * 60 * 1000;
        if (!txn.overdueAlertSentAt) return null;
        const alertMs  = new Date(txn.overdueAlertSentAt).getTime();
        const cancelAt = alertMs + CANCEL_DELAY_MS;
        const remaining = cancelAt - Date.now();
        if (remaining <= 0) return "Cancelling now…";
        const totalSecs = Math.floor(remaining / 1000);
        const h = Math.floor(totalSecs / 3600);
        const m = Math.floor((totalSecs % 3600) / 60);
        const s = totalSecs % 60;
        if (h > 0) return `Cancels in ${h}h ${m}m`;
        if (m > 0) return `Cancels in ${m}m ${s}s`;
        return `Cancels in ${s}s`;
    }

    const handleBulkAlert = async (txns) => {
        setBulkActioning(true);
        try {
            for (const txn of txns) {
                if (txn.overdueAlertSentAt) continue;
                const type = isDropOffOverdue(txn) ? "drop_off" : "collection";
                await handleAlertOverdue(txn, type);
                setTransactions(prev => prev.map(t =>
                    t.id === txn.id ? { ...t, overdueAlertSentAt: new Date().toISOString() } : t
                ));
            }
        } finally {
            setBulkActioning(false);
            setSelectedOverdue(new Set());
        }
    };

    const handleBulkCancel = async (txns) => {
        setBulkActioning(true);
        try {
            for (const txn of txns) {
                const type = isDropOffOverdue(txn) ? "drop_off" : "collection";
                await handleCancelOverdue(txn, type);
            }
        } finally {
            setBulkActioning(false);
            setSelectedOverdue(new Set());
        }
    };

    const handleLogout = async () => {
        setIsLoggingOut(true);
        setTimeout(async () => {
            try {
                localStorage.removeItem("loggedInUserId");
                localStorage.removeItem("userData");
                await signOut(auth);
                navigate("/login");
            } catch { alert("Failed to logout."); }
            finally { setIsLoggingOut(false); }
        }, 1800);
    };

    const handleConfirmDropOff = async (id) => {
        const txn = transactions.find(t => t.id === id);

        setTransactions(prev =>
            prev.map(t => {
                if (t.id !== id) return t;
                const newChecklist = t.checklist.map(s => ({ ...s, done: true }));
                return { ...t, status: "awaiting_collection", checklist: newChecklist };
            })
        );

        if (txn) {
            try {
                await updateDoc(doc(db, "transactions", id), {
                    status:             "awaiting_collection",
                    dropOffConfirmed:   true,
                    dropOffConfirmedAt: serverTimestamp(),
                    dropOffConfirmedBy: auth.currentUser?.uid || null,
                    droppedOffAt:       serverTimestamp(),
                    releasedAt:         serverTimestamp(),
                    releasedByStaff:    true,
                });
                // Notify seller item received, notify buyer it's ready to collect
                await notifyBothParties(txn, "drop_off");
                await notifyBothParties(txn, "ready_to_collect");
            } catch (err) {
                console.error("Failed to confirm drop-off:", err);
            }
        }
    };

    const handleConfirmCollection = async (id) => {
        const txn = transactions.find(t => t.id === id);

        setTransactions(prev =>
            prev.map(t => {
                if (t.id !== id) return t;
                const newChecklist = [
                    ...t.checklist.map(s => ({ ...s, done: true })),
                    ...(!t.checklist.some(s => s.label === "Released to Buyer")
                        ? [{ label: "Released to Buyer", done: true }]
                        : []),
                ];
                return { ...t, status: "completed", checklist: newChecklist };
            })
        );

        if (txn) {
            try {
                await updateDoc(doc(db, "transactions", id), {
                    status:                "completed",
                    paymentStatus:         "Fully Paid",
                    cashShortfall:         0,
                    collectionConfirmed:   true,
                    collectionConfirmedAt: serverTimestamp(),
                    collectionConfirmedBy: auth.currentUser?.uid || null,
                    releasedAt:            serverTimestamp(),
                    releasedByStaff:       true,
                });
                await notifyBothParties(txn, "collection");
            } catch (err) {
                console.error("Failed to confirm collection:", err);
            }
        }
    };

    const handleRelease = async (id) => {
        const txn = transactions.find(t => t.id === id);

        setTransactions(prev =>
            prev.map(t => t.id === id ? { ...t, status: "awaiting_collection" } : t)
        );

        try {
            await updateDoc(doc(db, "transactions", id), {
                status:          "awaiting_collection",
                releasedAt:      serverTimestamp(),
                releasedByStaff: true,
            });
            // Notify buyer: item has passed inspection and is ready to collect
            if (txn) await notifyBothParties(txn, "ready_to_collect");
        } catch (err) {
            console.error("Failed to update release status:", err);
        }
    };

    const handleMarkStep = async (txnId, stepIdx) => {
        setTransactions(prev => prev.map(t => {
            if (t.id !== txnId) return t;
            const newChecklist = t.checklist.map((s, i) => i === stepIdx ? { ...s, done: true } : s);
            const allDone      = newChecklist.every(s => s.done);
            return { ...t, checklist: newChecklist };
        }));

        try {
            const txn = transactions.find(t => t.id === txnId);
            if (!txn) return;
            const newChecklist = txn.checklist.map((s, i) => i === stepIdx ? { ...s, done: true } : s);
            const allDone      = newChecklist.every(s => s.done);
            await updateDoc(doc(db, "transactions", txnId), {
                checklist: newChecklist,

            });
        } catch (err) {
            console.error("Failed to update checklist step:", err);
        }
    };

    const today = new Date().toISOString().split("T")[0];

    const isDueToday = (t) =>
        (t.dropOffDate === today && t.dropOffBooked) ||
        (t.collectionDate === today && t.collectionBooked);

    const todayTxns      = transactions.filter(t => isDueToday(t));
    const awaitingColl   = transactions.filter(t => t.status === "awaiting_collection");
    const completed      = transactions.filter(t => t.status === "completed");
    const pendingDropOff = transactions.filter(t => t.status === "pending");
    const overdueCount   = transactions.filter(t => isDropOffOverdue(t) || isCollectionOverdue(t)).length;

    const timeSlotToMinutes = (slot) => {
        if (!slot || slot === "TBD") return Infinity;
        const match = (slot || "").match(/(\d{1,2}):(\d{2})/);
        if (!match) return Infinity;
        return parseInt(match[1], 10) * 60 + parseInt(match[2], 10);
    };

    const visibleTxns = transactions
        .filter(t => {
            const matchSearch = !search ||
                t.item.toLowerCase().includes(search.toLowerCase())   ||
                t.seller.toLowerCase().includes(search.toLowerCase()) ||
                t.buyer.toLowerCase().includes(search.toLowerCase())  ||
                getReceiptRef(t).toLowerCase().includes(search.toLowerCase());
            const matchCampus = campus === "All Campuses" || t.campus === campus;
            const isOvDrop = isDropOffOverdue(t);
            const isOvColl = isCollectionOverdue(t);
            const isOverdueAny = isOvDrop || isOvColl;

            if (activeTab === "drop_offs") {
                // Pending drop-offs that are NOT yet overdue
                return matchSearch && matchCampus && t.status === "pending" && !isOvDrop;
            }
            if (activeTab === "collections") {
                // Items awaiting collection that are NOT yet overdue
                const matchColl = !collectionSearch ||
                    t.item.toLowerCase().includes(collectionSearch.toLowerCase())     ||
                    t.seller.toLowerCase().includes(collectionSearch.toLowerCase())   ||
                    t.buyer.toLowerCase().includes(collectionSearch.toLowerCase())    ||
                    (t.receiptId && t.receiptId.toLowerCase().includes(collectionSearch.toLowerCase()));
                return matchColl && matchCampus && t.status === "awaiting_collection" && !isOvColl;
            }
            if (activeTab === "overdue") {
                if (overdueSubTab === "drop_offs") return matchSearch && matchCampus && isOvDrop && t.status !== "overdue_cancelled";
                if (overdueSubTab === "collections") return matchSearch && matchCampus && isOvColl && t.status !== "overdue_cancelled";
                return false;
            }
            if (activeTab === "history")    return matchSearch && matchCampus && t.status === "completed";
            if (activeTab === "time_slots") return matchSearch && matchCampus && t.status !== "completed";
            if (activeTab === "all")        return matchSearch && matchCampus && t.status !== "completed";
            return matchSearch && matchCampus && t.status !== "completed";
        })
        .sort((a, b) => {
            if (activeTab === "drop_offs") {
                // Sort by drop-off date ascending, no date goes to bottom
                const dateA = a.dropOffDate || "9999-99-99";
                const dateB = b.dropOffDate || "9999-99-99";
                if (dateA !== dateB) return dateA.localeCompare(dateB);
                return timeSlotToMinutes(a.dropOffTimeSlot || a.timeSlot) - timeSlotToMinutes(b.dropOffTimeSlot || b.timeSlot);
            }
            if (activeTab === "collections") {
                // Sort by date released (most recent first)
                return b.date - a.date;
            }
            if (activeTab === "all" || activeTab === "time_slots") {
                const dateA = a.dropOffDate || "9999-99-99";
                const dateB = b.dropOffDate || "9999-99-99";
                if (dateA !== dateB) return dateA.localeCompare(dateB);
                return timeSlotToMinutes(a.dropOffTimeSlot || a.timeSlot) - timeSlotToMinutes(b.dropOffTimeSlot || b.timeSlot);
            }
            return b.date - a.date;
        });

    const STATS = [
        { label: "Pending Drop-off",    value: pendingDropOff.length, icon: "fa-truck-arrow-right",  color: "#f59e0b" },
        { label: "Awaiting Collection", value: awaitingColl.length,   icon: "fa-person-walking",     color: "#8b5cf6" },
        { label: "Overdue",             value: overdueCount,          icon: "fa-circle-exclamation", color: "#ef4444", onClick: () => setActiveTab("overdue") },
        { label: "Completed",           value: completed.length,      icon: "fa-circle-check",       color: "#10b981" },
    ];

    return (
        <div className={styles.shell}>
            <StaffNavbar />

            {(!authReady || (loadingTxns && transactions.length === 0)) ? (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "60vh", gap: "1rem", color: "#64748b" }}>
                    <i className="fa-solid fa-spinner fa-spin" style={{ fontSize: "2rem", color: "#6AA6DA" }} />
                    <p style={{ fontSize: "1rem", fontWeight: 500, margin: 0 }}>Loading Staff Dashboard…</p>
                </div>
            ) : (
            <main className={styles.main}>
                <div className={styles.pageTitle}>
                    <div className={styles.pageTitleLeft}>
                        <h1>Staff Dashboard</h1>
                        <p>Manage item handling, bookings &amp; transaction control</p>
                    </div>
                    <button className={styles.profileBtn} onClick={() => setShowProfile(true)}>
                        <div className={styles.profileBtnAvatar}>
                            {staffUser.photoURL
                                ? <img src={staffUser.photoURL} alt={staffUser.name} />
                                : <span>{staffUser.initials}</span>
                            }
                        </div>
                        <div className={styles.profileBtnInfo}>
                            <span className={styles.profileBtnName}>{staffUser.name}</span>
                            <span className={styles.profileBtnRole}>
                                <i className="fa-solid fa-shield-halved" /> Staff Member
                            </span>
                        </div>
                        <i className="fa-solid fa-chevron-right" style={{ color: "#bbb", fontSize: "0.75rem" }} />
                    </button>
                </div>

                <div className={styles.statsRow}>
                    {STATS.map(s => (
                        <div
                            key={s.label}
                            className={styles.statCard}
                            onClick={s.onClick}
                            style={s.onClick ? { cursor: "pointer" } : undefined}
                        >
                            <div className={styles.statIconWrap} style={{ background: `${s.color}18`, color: s.color }}>
                                <i className={`fa-solid ${s.icon}`} />
                            </div>
                            <div className={styles.statInfo}>
                                <span className={styles.statValue}>{s.value}</span>
                                <span className={styles.statLabel}>{s.label}</span>
                            </div>
                        </div>
                    ))}
                </div>

                <div className={styles.controlRow}>
                    <div className={styles.searchWrap}>
                        <i className="fa-solid fa-magnifying-glass" />
                        <input
                            className={styles.searchInput}
                            type="text"
                            placeholder="Search by item, buyer, seller or receipt ID..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                        />
                    </div>
                    <button
                        className={styles.refreshBtn}
                        onClick={fetchTransactions}
                        disabled={loadingTxns}
                        title="Refresh transactions"
                    >
                        <i className={`fa-solid fa-rotate-right ${loadingTxns ? "fa-spin" : ""}`} />
                        {lastFetched && (
                            <span className={styles.refreshTime}>
                                {lastFetched.toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" })}
                            </span>
                        )}
                    </button>
                </div>

                <div className={styles.tabs}>
                    {TABS.map(tab => (
                        <button
                            key={tab.key}
                            className={`${styles.tab} ${activeTab === tab.key ? styles.tabActive : ""} ${tab.key === "overdue" && overdueCount > 0 ? styles.tabOverdue : ""}`}
                            onClick={() => setActiveTab(tab.key)}
                        >
                            <i className={`fa-solid ${tab.icon}`} />
                            {tab.label}
                            {tab.key === "drop_offs" && transactions.filter(t => t.status === "pending" && !isDropOffOverdue(t)).length > 0 && (
                                <span className={styles.tabDot} />
                            )}
                            {tab.key === "collections" && transactions.filter(t => t.status === "awaiting_collection" && !isCollectionOverdue(t)).length > 0 && (
                                <span className={styles.tabDot} />
                            )}
                            {tab.key === "overdue" && overdueCount > 0 && (
                                <span className={styles.tabDot} />
                            )}
                            {tab.key === "collections" && transactions.filter(t => t.status === "awaiting_collection" && !isCollectionOverdue(t)).length > 0 && (
                                <span className={styles.tabDot} />
                            )}
                            {tab.key === "overdue" && overdueCount > 0 && (
                                <span className={styles.tabBadgeRed}>{overdueCount}</span>
                            )}
                        </button>
                    ))}
                </div>

                {/* Collections search bar */}
                {activeTab === "collections" && (
                    <div className={styles.controlRow} style={{ marginTop: 0 }}>
                        <div className={styles.searchWrap}>
                            <i className="fa-solid fa-magnifying-glass" />
                            <input
                                className={styles.searchInput}
                                type="text"
                                placeholder="Search by item, buyer, seller or receipt ID..."
                                value={collectionSearch}
                                onChange={e => setCollectionSearch(e.target.value)}
                                autoFocus
                            />
                            {collectionSearch && (
                                <button
                                    onClick={() => setCollectionSearch("")}
                                    style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8", padding: "0 4px" }}
                                    title="Clear search"
                                >
                                    <i className="fa-solid fa-xmark" />
                                </button>
                            )}
                        </div>
                    </div>
                )}

                {/* ── Overdue Tab ── */}
                {activeTab === "overdue" ? (() => {
                    const overdueDropOffs  = transactions.filter(t => isDropOffOverdue(t)    && t.status !== "overdue_cancelled");
                    const overdueCollects  = transactions.filter(t => isCollectionOverdue(t) && t.status !== "overdue_cancelled");
                    const subList = overdueSubTab === "drop_offs" ? overdueDropOffs : overdueCollects;
                    const allSelected = subList.length > 0 && subList.every(t => selectedOverdue.has(t.id));
                    const someSelected = subList.some(t => selectedOverdue.has(t.id));
                    const selectedTxns = subList.filter(t => selectedOverdue.has(t.id));
                    const allAlerted   = selectedTxns.length > 0 && selectedTxns.every(t => !!t.overdueAlertSentAt);
                    const noneAlerted  = selectedTxns.every(t => !t.overdueAlertSentAt);

                    function toggleAll() {
                        if (allSelected) {
                            setSelectedOverdue(prev => {
                                const next = new Set(prev);
                                subList.forEach(t => next.delete(t.id));
                                return next;
                            });
                        } else {
                            setSelectedOverdue(prev => {
                                const next = new Set(prev);
                                subList.forEach(t => next.add(t.id));
                                return next;
                            });
                        }
                    }

                    function toggleOne(id) {
                        setSelectedOverdue(prev => {
                            const next = new Set(prev);
                            next.has(id) ? next.delete(id) : next.add(id);
                            return next;
                        });
                    }

                    return (
                        <div>
                            {/* Sub-tab bar */}
                            <div style={{ display: "flex", gap: 8, margin: "12px 0 0" }}>
                                {[
                                    { key: "drop_offs",   label: "Overdue Drop-offs",   count: overdueDropOffs.length  },
                                    { key: "collections", label: "Overdue Collections", count: overdueCollects.length  },
                                ].map(st => (
                                    <button
                                        key={st.key}
                                        onClick={() => { setOverdueSubTab(st.key); setSelectedOverdue(new Set()); }}
                                        style={{
                                            display: "flex", alignItems: "center", gap: 8,
                                            padding: "8px 18px", borderRadius: 10, border: "none", cursor: "pointer",
                                            fontWeight: 700, fontSize: "0.85rem",
                                            background: overdueSubTab === st.key ? "#fef2f2" : "#f8fafc",
                                            color:      overdueSubTab === st.key ? "#dc2626"  : "#64748b",
                                            borderBottom: overdueSubTab === st.key ? "2px solid #dc2626" : "2px solid transparent",
                                        }}
                                    >
                                        {st.label}
                                        {st.count > 0 && (
                                            <span style={{ background: "#dc2626", color: "#fff", borderRadius: 99, fontSize: "0.72rem", fontWeight: 800, padding: "1px 7px", minWidth: 20, textAlign: "center" }}>
                                                {st.count}
                                            </span>
                                        )}
                                    </button>
                                ))}
                            </div>

                            {subList.length === 0 ? (
                                <div className={styles.emptyState} style={{ marginTop: 24 }}>
                                    <i className="fa-solid fa-circle-check" style={{ color: "#10b981" }} />
                                    <p>No overdue {overdueSubTab === "drop_offs" ? "drop-offs" : "collections"}</p>
                                </div>
                            ) : (
                                <>
                                    {/* Bulk action toolbar */}
                                    <div style={{
                                        display: "flex", alignItems: "center", gap: 10,
                                        margin: "12px 0 8px", padding: "10px 14px",
                                        background: "#fff", border: "1px solid #e2e8f0",
                                        borderRadius: 10,
                                    }}>
                                        {/* Select-all checkbox */}
                                        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", userSelect: "none", fontWeight: 600, fontSize: "0.85rem", color: "#374151" }}>
                                            <input
                                                type="checkbox"
                                                checked={allSelected}
                                                ref={el => { if (el) el.indeterminate = someSelected && !allSelected; }}
                                                onChange={toggleAll}
                                                style={{ width: 16, height: 16, accentColor: "#dc2626", cursor: "pointer" }}
                                            />
                                            {allSelected ? "Deselect all" : `Select all (${subList.length})`}
                                        </label>

                                        {someSelected && (
                                            <>
                                                <span style={{ color: "#cbd5e1", fontSize: "1.1rem" }}>|</span>
                                                <span style={{ fontSize: "0.82rem", color: "#64748b" }}>{selectedTxns.length} selected</span>

                                                {/* Send Alerts button — only for un-alerted */}
                                                {!allAlerted && (
                                                    <button
                                                        onClick={() => handleBulkAlert(selectedTxns.filter(t => !t.overdueAlertSentAt))}
                                                        disabled={bulkActioning}
                                                        style={{
                                                            marginLeft: "auto", display: "flex", alignItems: "center", gap: 6,
                                                            padding: "7px 16px", borderRadius: 8, border: "none", cursor: "pointer",
                                                            background: "#f59e0b", color: "#fff", fontWeight: 700, fontSize: "0.82rem",
                                                            opacity: bulkActioning ? 0.6 : 1,
                                                        }}
                                                    >
                                                        <i className={`fa-solid ${bulkActioning ? "fa-spinner fa-spin" : "fa-bell"}`} />
                                                        Send Alert{selectedTxns.filter(t => !t.overdueAlertSentAt).length > 1 ? "s" : ""}
                                                    </button>
                                                )}

                                                {/* Cancel button — only shown after alert sent on all selected */}
                                                {allAlerted && (
                                                    <button
                                                        onClick={() => {
                                                            if (!window.confirm(`Cancel ${selectedTxns.length} transaction${selectedTxns.length > 1 ? "s" : ""}? This cannot be undone.`)) return;
                                                            handleBulkCancel(selectedTxns);
                                                        }}
                                                        disabled={bulkActioning}
                                                        style={{
                                                            marginLeft: "auto", display: "flex", alignItems: "center", gap: 6,
                                                            padding: "7px 16px", borderRadius: 8,
                                                            border: "1.5px solid #dc2626", cursor: "pointer",
                                                            background: "#fff", color: "#dc2626", fontWeight: 700, fontSize: "0.82rem",
                                                            opacity: bulkActioning ? 0.6 : 1,
                                                        }}
                                                    >
                                                        <i className={`fa-solid ${bulkActioning ? "fa-spinner fa-spin" : "fa-ban"}`} />
                                                        Cancel Transaction{selectedTxns.length > 1 ? "s" : ""}
                                                    </button>
                                                )}

                                                {/* Mixed state — some alerted, some not */}
                                                {!allAlerted && !noneAlerted && (
                                                    <button
                                                        onClick={() => {
                                                            if (!window.confirm(`Cancel ${selectedTxns.filter(t => t.overdueAlertSentAt).length} alerted transaction(s)? This cannot be undone.`)) return;
                                                            handleBulkCancel(selectedTxns.filter(t => t.overdueAlertSentAt));
                                                        }}
                                                        disabled={bulkActioning}
                                                        style={{
                                                            display: "flex", alignItems: "center", gap: 6,
                                                            padding: "7px 16px", borderRadius: 8,
                                                            border: "1.5px solid #dc2626", cursor: "pointer",
                                                            background: "#fff", color: "#dc2626", fontWeight: 700, fontSize: "0.82rem",
                                                            opacity: bulkActioning ? 0.6 : 1,
                                                        }}
                                                    >
                                                        <i className={`fa-solid ${bulkActioning ? "fa-spinner fa-spin" : "fa-ban"}`} />
                                                        Cancel Alerted ({selectedTxns.filter(t => t.overdueAlertSentAt).length})
                                                    </button>
                                                )}
                                            </>
                                        )}
                                    </div>

                                    {/* Overdue transaction rows */}
                                    <div className={styles.txnList}>
                                        {subList.map(txn => {
                                            const alertSent   = !!txn.overdueAlertSentAt;
                                            const countdown   = getCancelCountdown(txn);
                                            const isSelected  = selectedOverdue.has(txn.id);
                                            const payConfig   = getPaymentConfig(txn);

                                            return (
                                                <div
                                                    key={txn.id}
                                                    style={{
                                                        display: "flex", alignItems: "center", gap: 12,
                                                        padding: "12px 14px",
                                                        background: isSelected ? "#fff5f5" : "#fff",
                                                        border: `1.5px solid ${isSelected ? "#fca5a5" : "#fee2e2"}`,
                                                        borderRadius: 12, marginBottom: 8,
                                                        transition: "background 0.15s",
                                                    }}
                                                >
                                                    {/* Checkbox */}
                                                    <input
                                                        type="checkbox"
                                                        checked={isSelected}
                                                        onChange={() => toggleOne(txn.id)}
                                                        style={{ width: 16, height: 16, accentColor: "#dc2626", cursor: "pointer", flexShrink: 0 }}
                                                    />

                                                    {/* Thumbnail */}
                                                    <div style={{ width: 44, height: 44, borderRadius: 8, overflow: "hidden", flexShrink: 0, background: "#f1f5f9", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                                        {txn.itemImage
                                                            ? <img src={txn.itemImage} alt={txn.item} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                                                            : <i className="fa-solid fa-box-open" style={{ color: "#94a3b8" }} />
                                                        }
                                                    </div>

                                                    {/* Info */}
                                                    <div style={{ flex: 1, minWidth: 0 }}>
                                                        <p style={{ margin: 0, fontWeight: 700, fontSize: "0.88rem", color: "#1e293b", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                                            {txn.item}
                                                        </p>
                                                        <p style={{ margin: "2px 0 0", fontSize: "0.78rem", color: "#64748b" }}>
                                                            {txn.seller} → {txn.buyer}
                                                        </p>
                                                        {txn.dropOffDate && (
                                                            <p style={{ margin: "2px 0 0", fontSize: "0.75rem", color: "#dc2626", fontWeight: 600 }}>
                                                                <i className="fa-solid fa-calendar-xmark" style={{ marginRight: 4 }} />
                                                                Due: {txn.dropOffDate}{txn.dropOffTimeSlot ? ` · ${txn.dropOffTimeSlot}` : ""}
                                                            </p>
                                                        )}
                                                    </div>

                                                    {/* Status chips */}
                                                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 5, flexShrink: 0 }}>
                                                        <span style={{ padding: "2px 8px", background: payConfig.bg, color: payConfig.color, borderRadius: 99, fontSize: "0.72rem", fontWeight: 700 }}>
                                                            <i className={`fa-solid ${payConfig.icon}`} style={{ marginRight: 3 }} />{payConfig.label}
                                                        </span>
                                                        {alertSent ? (
                                                            <>
                                                                <span style={{ padding: "2px 9px", background: "#dcfce7", color: "#16a34a", borderRadius: 99, fontSize: "0.72rem", fontWeight: 700 }}>
                                                                    <i className="fa-solid fa-bell" style={{ marginRight: 3 }} />Alert Sent
                                                                </span>
                                                                {countdown && (
                                                                    <span style={{ padding: "2px 9px", background: "#fef2f2", color: "#dc2626", borderRadius: 99, fontSize: "0.72rem", fontWeight: 700 }}>
                                                                        <i className="fa-solid fa-clock" style={{ marginRight: 3 }} />{countdown}
                                                                    </span>
                                                                )}
                                                            </>
                                                        ) : (
                                                            <span style={{ padding: "2px 9px", background: "#fef3c7", color: "#92400e", borderRadius: 99, fontSize: "0.72rem", fontWeight: 700 }}>
                                                                <i className="fa-solid fa-triangle-exclamation" style={{ marginRight: 3 }} />Alert Pending
                                                            </span>
                                                        )}
                                                    </div>

                                                    {/* Individual action buttons */}
                                                    <div style={{ display: "flex", flexDirection: "column", gap: 5, flexShrink: 0 }}>
                                                        {!alertSent && (
                                                            <button
                                                                onClick={() => handleBulkAlert([txn])}
                                                                disabled={bulkActioning}
                                                                style={{ padding: "5px 12px", background: "#f59e0b", color: "#fff", border: "none", borderRadius: 7, fontSize: "0.75rem", fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}
                                                            >
                                                                <i className="fa-solid fa-bell" style={{ marginRight: 4 }} />Send Alert
                                                            </button>
                                                        )}
                                                        {alertSent && (
                                                            <button
                                                                onClick={() => {
                                                                    if (!window.confirm(`Cancel transaction for "${txn.item}"? This cannot be undone.`)) return;
                                                                    handleBulkCancel([txn]);
                                                                }}
                                                                disabled={bulkActioning}
                                                                style={{ padding: "5px 12px", background: "#fff", color: "#dc2626", border: "1.5px solid #dc2626", borderRadius: 7, fontSize: "0.75rem", fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}
                                                            >
                                                                <i className="fa-solid fa-ban" style={{ marginRight: 4 }} />Cancel Txn
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </>
                            )}
                        </div>
                    );
                })() : activeTab === "time_slots" ? (
                    <TimeSlotsView transactions={visibleTxns} />
                ) : visibleTxns.length === 0 ? (
                    <div className={styles.emptyState}>
                        <i className="fa-solid fa-box-open" />
                        <p>No transactions found</p>
                        {search && (
                            <button className={styles.clearBtn} onClick={() => setSearch("")}>
                                Clear search
                            </button>
                        )}
                    </div>
                ) : (
                    <div className={styles.txnList}>
                        {visibleTxns.map(txn => (
                            <TransactionCard
                                key={txn.id}
                                txn={txn}
                                onConfirmDropOff={handleConfirmDropOff}
                                onConfirmCollection={handleConfirmCollection}
                                onRelease={handleRelease}
                                onMarkStep={handleMarkStep}
                                onAlertOverdue={handleAlertOverdue}
                                onCancelOverdue={handleCancelOverdue}
                            />
                        ))}
                    </div>
                )}
            </main>
            )}

            {showProfile && (
                <StaffProfilePanel
                    staffName={staffUser.name}
                    staffEmail={staffUser.email}
                    staffInitials={staffUser.initials}
                    staffPhoto={staffUser.photoURL}
                    onClose={() => setShowProfile(false)}
                    onLogout={handleLogout}
                    isLoggingOut={isLoggingOut}
                />
            )}

            {isLoggingOut && (
                <div className={styles.logoutOverlay}>
                    <div className={styles.logoutBox}>
                        <i className="fas fa-spinner fa-spin" />
                        <p>Logging out...</p>
                    </div>
                </div>
            )}
        </div>
    );
}