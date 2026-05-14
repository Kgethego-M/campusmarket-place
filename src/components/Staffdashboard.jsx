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
            message:       `The item "${title}" you purchased is now at the trade facility. Book a collection slot to pick it up.`,
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

// ─── Constants ────────────────────────────────────────────────────────────────

const TABS = [
    { key: "due_today",  label: "Due Today",        icon: "fa-calendar-day"      },
    { key: "all",        label: "All Transactions",  icon: "fa-list"              },
    { key: "history",    label: "History",           icon: "fa-clock-rotate-left" },
    { key: "time_slots", label: "Time Slots",        icon: "fa-clock"             },
];

const STATUS_META = {
    pending:             { label: "Pending Drop-off",    cls: "pending",  icon: "fa-hourglass-half"  },
    in_facility:         { label: "In Facility",         cls: "facility", icon: "fa-warehouse"       },
    ready_to_release:    { label: "Ready to Release",    cls: "ready",    icon: "fa-circle-check"    },
    awaiting_collection: { label: "Awaiting Collection", cls: "awaiting", icon: "fa-person-walking"  },
    completed:           { label: "Completed",           cls: "done",     icon: "fa-check-double"    },
};

// ─── Payment type configuration ───────────────────────────────────────────────
const PAYMENT_CONFIG = {
    full_online: { label: "Fully Online", icon: "fa-globe", color: "#10b981", bg: "#d1fae5", staffNote: "No cash to collect. Item can be released immediately." },
    partial:     { label: "Partial Online", icon: "fa-credit-card", color: "#f59e0b", bg: "#fed7aa", staffNote: "Collect remaining cash from buyer before releasing item." },
    cash:        { label: "Full Cash", icon: "fa-money-bill", color: "#ef4444", bg: "#fee2e2", staffNote: "Collect FULL cash payment from buyer before releasing item." },
    cod:         { label: "Cash on Delivery", icon: "fa-hand-holding-dollar", color: "#ef4444", bg: "#fee2e2", staffNote: "Collect FULL cash payment from buyer before releasing item." },
    unknown:     { label: "Unknown", icon: "fa-question", color: "#6b7280", bg: "#f3f4f6", staffNote: "Verify payment details with buyer before releasing." },
};

function getPaymentConfig(txn) {
    const method = txn.paymentMethod || txn.paymentType;
    if (method === "full_online" || method === "online") return PAYMENT_CONFIG.full_online;
    if (method === "partial") return PAYMENT_CONFIG.partial;
    if (method === "cash" || method === "cod") return PAYMENT_CONFIG.cash;
    return PAYMENT_CONFIG.unknown;
}

// ─── Date/Time helpers ────────────────────────────────────────────────────────

function parseSlotStart(timeSlot) {
    if (!timeSlot) return null;
    const match = timeSlot.match(/(\d{1,2}):(\d{2})/);
    if (!match) return null;
    return { hour: parseInt(match[1], 10), minute: parseInt(match[2], 10) };
}

function isBookingTimeReached(dateStr, timeSlot) {
    if (!dateStr) return false;
    const slotStart = parseSlotStart(timeSlot);
    const now = new Date();
    const booked = new Date(dateStr + "T00:00:00");
    if (slotStart) {
        booked.setHours(slotStart.hour, slotStart.minute, 0, 0);
    }
    return now >= booked;
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
function TransactionDetailPanel({ txn, onClose, onConfirmDropOff, onConfirmCollection, onRelease, onMarkStep, onAlertOverdue }) {
    const todayStr = new Date().toISOString().split("T")[0];
    const isOverdueDropOff    = txn.status === "pending"             && !!txn.dropOffDate && txn.dropOffDate < todayStr;
    const isOverdueCollection = (txn.status === "awaiting_collection" || txn.status === "ready_to_release")
                                 && !!txn.dropOffDate && txn.dropOffDate < todayStr;
    const isOverdue = isOverdueDropOff || isOverdueCollection;

    const meta = isOverdue
        ? { ...STATUS_META[txn.status] || STATUS_META.pending, label: "Overdue", cls: (STATUS_META[txn.status] || STATUS_META.pending).cls }
        : (STATUS_META[txn.status] || STATUS_META.pending);

    const paymentConfig = getPaymentConfig(txn);
    const allChecked    = txn.checklist.every(c => c.done);
    const shortfall     = txn.cashShortfall ?? 0;
    const hasShortfall  = shortfall > 0;
    
    const isFullOnline = paymentConfig.label === "Fully Online";
    const isFullCash = paymentConfig.label === "Full Cash";
    const [cashConfirmed, setCashConfirmed] = useState(isFullOnline || shortfall === 0);
    const [saving,        setSaving]        = useState(false);
    const [alertSending,  setAlertSending]  = useState(false);
    const [alertSent,     setAlertSent]     = useState(false);
    const [dropOffLoading,    setDropOffLoading]    = useState(false);
    const [collectionLoading, setCollectionLoading] = useState(false);

    const canConfirmCash = allChecked && hasShortfall && !cashConfirmed && !isFullOnline;
    const canRelease     = allChecked && (!hasShortfall || cashConfirmed);

    const waitingForDropOff    = txn.status === "pending" && !txn.dropOffBooked;
    const waitingForCollection = ["in_facility", "ready_to_release"].includes(txn.status) && !txn.collectionBooked;
    const showConfirmDropOff   = txn.status === "pending" && txn.dropOffBooked;
    const showConfirmCollection = txn.status === "awaiting_collection" && txn.collectionBooked;

    const dropOffTimeReached    = isBookingTimeReached(txn.dropOffDate,    txn.dropOffTimeSlot);
    const collectionTimeReached = isBookingTimeReached(txn.collectionDate, txn.collectionTimeSlot);

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
            const cashAmount = txn.cashShortfall || txn.price || 0;
            
            // Update transaction
            await updateDoc(doc(db, "transactions", txn.id), { 
                cashShortfall: 0, 
                paymentStatus: "Fully Paid", 
                cashConfirmedAt: serverTimestamp() 
            });
            
            // ─── RECORD CASH COLLECTED FOR REVENUE ───
            await recordCashCollected(txn.id, cashAmount);
            
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
                                <button className={styles.alertBtn} onClick={handleAlertOverdue} disabled={alertSending}>
                                    <i className={`fa-solid ${alertSending ? "fa-spinner fa-spin" : "fa-bell"}`} />
                                    {alertSending ? "Sending…" : "Send Alert"}
                                </button>
                            ) : (
                                <span className={styles.alertSentChip}><i className="fa-solid fa-circle-check" /> Alert sent</span>
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
                                <div className={styles.detailInfoRow}>
                                    <span className={styles.detailInfoLabel}>Amount</span>
                                    <span className={styles.detailInfoValue}>
                                        R{txn.price?.toLocaleString()}
                                        {isFullOnline && (
                                            <span className={styles.paidChip}><i className="fa-solid fa-circle-check" /> Paid Online</span>
                                        )}
                                        {!isFullOnline && !isFullCash && cashConfirmed && (
                                            <span className={styles.paidChip}><i className="fa-solid fa-circle-check" /> Paid (Cash+Online)</span>
                                        )}
                                        {!isFullOnline && !isFullCash && !cashConfirmed && hasShortfall && (
                                            <span className={styles.shortfallChip}><i className="fa-solid fa-triangle-exclamation" /> Cash Owed: R{shortfall.toLocaleString()}</span>
                                        )}
                                        {isFullCash && !cashConfirmed && (
                                            <span className={styles.cashDueChip}><i className="fa-solid fa-money-bill" /> Cash due: R{txn.price?.toLocaleString()}</span>
                                        )}
                                    </span>
                                </div>
                            ) : (
                                <div className={styles.detailInfoRow}>
                                    <span className={styles.detailInfoLabel}>Trade For</span>
                                    <span className={styles.detailInfoValue}>{txn.tradeFor}</span>
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
                                <span className={styles.detailInfoLabel}>Date</span>
                                <span className={styles.detailInfoValue}>{txn.collectionDate || "—"}</span>
                            </div>
                            <div className={styles.detailInfoRow}>
                                <span className={styles.detailInfoLabel}>Time Slot</span>
                                <span className={styles.detailInfoValue}>{txn.collectionTimeSlot || "—"}</span>
                            </div>
                            <div className={styles.detailInfoRow}>
                                <span className={styles.detailInfoLabel}>Booked</span>
                                <span className={styles.detailInfoValue}>{txn.collectionBooked ? "Yes" : "Not yet"}</span>
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
                            <i className="fa-solid fa-hourglass-half" />
                            <span>Waiting for <strong>{txn.buyer}</strong> to book a collection slot before the item can be released.</span>
                        </div>
                    )}
                    {txn.collectionBooked && txn.collectionDate && (
                        <div className={styles.bookedBanner}>
                            <i className="fa-solid fa-calendar-check" />
                            <span>Collection booked by <strong>{txn.buyer}</strong> for <strong>{txn.collectionDate}</strong> at <strong>{txn.collectionTimeSlot}</strong>.</span>
                        </div>
                    )}
                    {txn.status === "pending" && txn.dropOffBooked && (
                        <div className={styles.dropOffBanner}>
                            <i className="fa-solid fa-truck-arrow-right" />
                            <span>Awaiting item drop-off from seller. Click <strong>Confirm Drop-Off</strong> once you have physically received the item.</span>
                        </div>
                    )}
                    {hasShortfall && !cashConfirmed && txn.status !== "pending" && !isFullOnline && !isFullCash && (
                        <div className={styles.shortfallBanner}>
                            <i className="fa-solid fa-coins" />
                            <span>Outstanding cash shortfall of <strong>R{shortfall.toLocaleString()}</strong>. Collect from buyer before releasing the item.</span>
                        </div>
                    )}
                    {isFullCash && !cashConfirmed && txn.status !== "pending" && (
                        <div className={styles.shortfallBanner}>
                            <i className="fa-solid fa-coins" />
                            <span>Full cash payment of <strong>R{txn.price?.toLocaleString()}</strong> due from buyer. Collect before releasing the item.</span>
                        </div>
                    )}
                    {hasShortfall && cashConfirmed && (
                        <div className={styles.cashConfirmedBanner}>
                            <i className="fa-solid fa-circle-check" />
                            <span>Cash of <strong>R{shortfall.toLocaleString()}</strong> confirmed received.</span>
                        </div>
                    )}

                    {(txn.status !== "pending" || (txn.status === "pending" && txn.dropOffBooked)) && (
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
                    {!showConfirmDropOff && !waitingForDropOff && hasShortfall && !isFullOnline && !isFullCash && (
                        <button
                            className={`${styles.confirmCashBtn} ${!canConfirmCash ? styles.confirmCashBtnDisabled : ""}`}
                            onClick={handleConfirmCash}
                            disabled={!canConfirmCash || saving}
                        >
                            <i className={`fa-solid ${cashConfirmed ? "fa-circle-check" : "fa-hand-holding-dollar"}`} />
                            {saving ? "Saving…" : cashConfirmed ? "Cash Received" : "Confirm Cash Received"}
                        </button>
                    )}
                    {!showConfirmDropOff && !waitingForDropOff && isFullCash && !cashConfirmed && (
                        <button
                            className={`${styles.confirmCashBtn} ${!canConfirmCash ? styles.confirmCashBtnDisabled : ""}`}
                            onClick={handleConfirmCash}
                            disabled={!canConfirmCash || saving}
                        >
                            <i className={`fa-solid ${cashConfirmed ? "fa-circle-check" : "fa-hand-holding-dollar"}`} />
                            {saving ? "Saving…" : cashConfirmed ? "Cash Received" : "Confirm Full Cash Received"}
                        </button>
                    )}
                    {(txn.status === "ready_to_release" || txn.status === "in_facility") && txn.collectionBooked && (
                        <button
                            className={`${styles.releaseBtn} ${!canRelease ? styles.releaseBtnDisabled : ""}`}
                            onClick={() => canRelease && onRelease(txn.id)}
                            disabled={!canRelease}
                        >
                            <i className="fa-solid fa-arrow-up-from-bracket" />
                            Release for Collection
                        </button>
                    )}
                    {showConfirmCollection && (
                        <>
                            {!collectionTimeReached && (
                                <div className={styles.timeGateBanner} style={{ marginBottom: 8 }}>
                                    <i className="fa-solid fa-lock" />
                                    <span>Collection confirmation unlocks on <strong>{txn.collectionDate}</strong>{txn.collectionTimeSlot && <> at <strong>{txn.collectionTimeSlot}</strong></>}.</span>
                                </div>
                            )}
                            <button
                                className={styles.confirmCollectionBtn}
                                onClick={handleCollection}
                                disabled={collectionLoading || !collectionTimeReached}
                                style={!collectionTimeReached ? { opacity: 0.45, cursor: "not-allowed" } : undefined}
                            >
                                <i className={`fa-solid ${collectionLoading ? "fa-spinner fa-spin" : !collectionTimeReached ? "fa-lock" : "fa-handshake"}`} />
                                {collectionLoading ? "Confirming…" : !collectionTimeReached ? "Confirm Collection (Locked)" : "Confirm Collection"}
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
function TransactionCard({ txn, onConfirmDropOff, onConfirmCollection, onRelease, onMarkStep, onAlertOverdue }) {
    const [panelOpen, setPanelOpen] = useState(false);
    const paymentConfig = getPaymentConfig(txn);

    const todayStr = new Date().toISOString().split("T")[0];
    const isOverdueDropOff    = txn.status === "pending"             && !!txn.dropOffDate && txn.dropOffDate < todayStr;
    const isOverdueCollection = (txn.status === "awaiting_collection" || txn.status === "ready_to_release")
                                 && !!txn.dropOffDate && txn.dropOffDate < todayStr;
    const isOverdue = isOverdueDropOff || isOverdueCollection;

    const meta = isOverdue
        ? { ...STATUS_META[txn.status] || STATUS_META.pending, label: "Overdue", cls: (STATUS_META[txn.status] || STATUS_META.pending).cls }
        : (STATUS_META[txn.status] || STATUS_META.pending);

    const shortfall    = txn.cashShortfall ?? 0;
    const hasShortfall = shortfall > 0;
    
    // ─── FIXED PAYMENT STATUS LOGIC ───
    const isFullOnline = paymentConfig.label === "Fully Online";
    const isFullCash = paymentConfig.label === "Full Cash";
    const isPartial = paymentConfig.label === "Partial Online";
    
    // Full Online: always considered paid (no cash to collect)
    // Full Cash: NOT paid until staff confirms cash
    // Partial: paid only if shortfall is 0
    const isPaid = isFullOnline || (isPartial && shortfall === 0);

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
                                    Purchase · R{txn.price?.toLocaleString()}
                                    {isFullOnline && (
                                        <span className={styles.paidChip}>
                                            <i className="fa-solid fa-circle-check" /> Paid Online
                                        </span>
                                    )}
                                    {isPartial && isPaid && (
                                        <span className={styles.paidChip}>
                                            <i className="fa-solid fa-circle-check" /> Paid (Cash+Online)
                                        </span>
                                    )}
                                    {isPartial && !isPaid && (
                                        <span className={styles.shortfallChip}>
                                            <i className="fa-solid fa-triangle-exclamation" /> Cash owed: R{shortfall.toLocaleString()}
                                        </span>
                                    )}
                                    {isFullCash && (
                                        <span className={styles.cashDueChip}>
                                            <i className="fa-solid fa-money-bill" /> Cash due at drop-off: R{txn.price?.toLocaleString()}
                                        </span>
                                    )}
                                </span>
                            ) : (
                                <span className={styles.txnTag}>Trade · {txn.tradeFor}</span>
                            )}
                        </div>
                    </div>

                    <div className={styles.txnChevron}>
                        <i className="fa-solid fa-chevron-right" />
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
    const [activeTab, setActiveTab]           = useState("due_today");
    const [dueTodaySubTab, setDueTodaySubTab] = useState("drop_off");
    const [search, setSearch]                 = useState("");
    const [transactions, setTransactions]     = useState([]);
    const [campus, setCampus]                 = useState("All Campuses");
    const [isLoggingOut, setIsLoggingOut] = useState(false);
    const [showProfile, setShowProfile]   = useState(false);
    const [staffUser, setStaffUser]       = useState({
        name: "", email: "", photoURL: "", initials: "",
    });
    const [loadingTxns, setLoadingTxns]   = useState(false);
    const [lastFetched, setLastFetched]   = useState(null);
    const sellerCacheRef  = useRef({});
    const listingCacheRef = useRef({});

    useEffect(() => {
        const unsub = onAuthStateChanged(auth, async (user) => {
            if (!user) return;
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
            } catch {}
        });
        return () => unsub();
    }, []);

    useEffect(() => {
        const q = query(
            collection(db, "transactions"),
            where("status", "in", [
                "waiting",
                "accepted",
                "in_facility",
                "ready_to_release",
                "awaiting_collection",
                "completed",
            ])
        );

        const unsub = onSnapshot(q, async (snapshot) => {
            try {
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
                    item:          data.listingTitle || "Item",
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
                    paymentMethod: data.paymentType || data.paymentMethod || "unknown",
                    paymentType:   data.paymentType || data.paymentMethod || "unknown",
                    tradeFor:      data.tradeItem    || null,
                    timeSlot:      data.dropOffTimeSlot || data.timeSlot || "TBD",
                    status: (data.status === "accepted" || data.status === "waiting")
                        ? "pending"
                        : (data.status || "pending"),
                    campus: data.campus || "Main Campus",
                    dropOffBooked:   !!(data.bookingId || data.dropOffStatus === "scheduled"),
                    dropOffDate:     data.dropOffDate     || null,
                    dropOffTimeSlot: data.dropOffTimeSlot || null,
                    collectionBooked:   !!(data.collectionBookingId || data.collectionStatus === "scheduled"),
                    collectionDate:     data.collectionDate     || null,
                    collectionTimeSlot: data.collectionTimeSlot || null,
                    checklist: data.checklist || [
                        { label: "Confirmed Drop-off", done: data.dropOffConfirmed || false },
                        { label: "Inspected Item",     done: data.itemInspected    || false },
                        { label: "Confirmed Payment",  done: data.paymentConfirmed || false },
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
                    "waiting", "accepted", "in_facility",
                    "ready_to_release", "awaiting_collection", "completed",
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
                item:          data.listingTitle || "Item",
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
                paymentMethod: data.paymentType || data.paymentMethod || "unknown",
                paymentType:   data.paymentType || data.paymentMethod || "unknown",
                tradeFor:      data.tradeItem    || null,
                timeSlot:      data.dropOffTimeSlot || data.timeSlot || "TBD",
                status: (data.status === "accepted" || data.status === "waiting")
                    ? "pending"
                    : (data.status || "pending"),
                campus:            data.campus || "Main Campus",
                dropOffBooked:     !!(data.bookingId || data.dropOffStatus === "scheduled"),
                dropOffDate:       data.dropOffDate     || null,
                dropOffTimeSlot:   data.dropOffTimeSlot || null,
                collectionBooked:  !!(data.collectionBookingId || data.collectionStatus === "scheduled"),
                collectionDate:    data.collectionDate     || null,
                collectionTimeSlot: data.collectionTimeSlot || null,
                checklist: data.checklist || [
                    { label: "Confirmed Drop-off", done: data.dropOffConfirmed || false },
                    { label: "Inspected Item",     done: data.itemInspected    || false },
                    { label: "Confirmed Payment",  done: data.paymentConfirmed || false },
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
        } catch (err) {
            console.error("Failed to record overdue alert:", err);
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
                const newChecklist = t.checklist.map((s, i) =>
                    i === 0 ? { ...s, done: true } : s
                );
                return { ...t, status: "in_facility", checklist: newChecklist };
            })
        );

        if (txn) {
            try {
                await updateDoc(doc(db, "transactions", id), {
                    status:             "in_facility",
                    dropOffConfirmed:   true,
                    dropOffConfirmedAt: serverTimestamp(),
                    dropOffConfirmedBy: auth.currentUser?.uid || null,
                });
                await notifyBothParties(txn, "drop_off");
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
            if (txn) await notifyBothParties(txn, "collection");
        } catch (err) {
            console.error("Failed to update release status:", err);
        }
    };

    const handleMarkStep = async (txnId, stepIdx) => {
        setTransactions(prev => prev.map(t => {
            if (t.id !== txnId) return t;
            const newChecklist = t.checklist.map((s, i) => i === stepIdx ? { ...s, done: true } : s);
            const allDone      = newChecklist.every(s => s.done);
            return { ...t, checklist: newChecklist, status: allDone && t.status === "in_facility" ? "ready_to_release" : t.status };
        }));

        try {
            const txn = transactions.find(t => t.id === txnId);
            if (!txn) return;
            const newChecklist = txn.checklist.map((s, i) => i === stepIdx ? { ...s, done: true } : s);
            const allDone      = newChecklist.every(s => s.done);
            await updateDoc(doc(db, "transactions", txnId), {
                checklist: newChecklist,
                ...(allDone && txn.status === "in_facility" ? { status: "ready_to_release" } : {}),
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
    const inFacility     = transactions.filter(t => t.status === "in_facility" || t.status === "ready_to_release");
    const awaitingColl   = transactions.filter(t => t.status === "awaiting_collection");
    const completed      = transactions.filter(t => t.status === "completed");
    const pendingDropOff = transactions.filter(t => t.status === "pending");

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
                t.buyer.toLowerCase().includes(search.toLowerCase());
            const matchCampus = campus === "All Campuses" || t.campus === campus;
            if (activeTab === "due_today") {
                if (!matchSearch || !matchCampus) return false;
                if (t.status === "completed") return false;
                if (dueTodaySubTab === "drop_off") {
                    return t.dropOffDate === today && t.dropOffBooked &&
                        (t.status === "pending" || t.status === "waiting" || t.status === "accepted");
                }
                if (dueTodaySubTab === "collection") {
                    return t.status === "awaiting_collection" ||
                        t.status === "ready_to_release" ||
                        (t.status === "in_facility" && t.collectionBooked && t.collectionDate === today);
                }
                return false;
            }
            if (activeTab === "history")    return matchSearch && matchCampus && t.status === "completed";
            if (activeTab === "time_slots") return matchSearch && matchCampus && t.status !== "completed";
            if (activeTab === "all")        return matchSearch && matchCampus && t.status !== "completed";
            return matchSearch && matchCampus && t.status !== "completed";
        })
        .sort((a, b) => {
            if (activeTab === "due_today") {
                const slotA = dueTodaySubTab === "drop_off" ? a.dropOffTimeSlot : (a.collectionTimeSlot || a.timeSlot);
                const slotB = dueTodaySubTab === "drop_off" ? b.dropOffTimeSlot : (b.collectionTimeSlot || b.timeSlot);
                return timeSlotToMinutes(slotA) - timeSlotToMinutes(slotB);
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
        { label: "Pending Drop-off",    value: pendingDropOff.length, icon: "fa-truck-arrow-right", color: "#f59e0b" },
        { label: "Items In Facility",   value: inFacility.length,     icon: "fa-warehouse",         color: "#6AA6DA" },
        { label: "Awaiting Collection", value: awaitingColl.length,   icon: "fa-person-walking",    color: "#8b5cf6" },
        { label: "Completed",           value: completed.length,      icon: "fa-circle-check",      color: "#10b981" },
    ];

    return (
        <div className={styles.shell}>
            <StaffNavbar />

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
                        <div key={s.label} className={styles.statCard}>
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
                            placeholder="Search by item, buyer or seller..."
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
                            className={`${styles.tab} ${activeTab === tab.key ? styles.tabActive : ""}`}
                            onClick={() => setActiveTab(tab.key)}
                        >
                            <i className={`fa-solid ${tab.icon}`} />
                            {tab.label}
                            {tab.key === "due_today" && todayTxns.filter(t => t.status !== "completed").length > 0 && (
                                <span className={styles.tabDot} />
                            )}
                        </button>
                    ))}
                </div>

                {activeTab === "due_today" && (
                    <div className={styles.subTabs}>
                        <button
                            className={`${styles.subTab} ${dueTodaySubTab === "drop_off" ? styles.subTabActive : ""}`}
                            onClick={() => setDueTodaySubTab("drop_off")}
                        >
                            <i className="fa-solid fa-truck-arrow-right" />
                            Drop-offs
                            {(() => {
                                const count = transactions.filter(t =>
                                    t.dropOffDate === today && t.dropOffBooked &&
                                    (t.status === "pending" || t.status === "waiting" || t.status === "accepted")
                                ).length;
                                return count > 0 ? <span className={styles.subTabBadge}>{count}</span> : null;
                            })()}
                        </button>
                        <button
                            className={`${styles.subTab} ${dueTodaySubTab === "collection" ? styles.subTabActive : ""}`}
                            onClick={() => setDueTodaySubTab("collection")}
                        >
                            <i className="fa-solid fa-person-walking" />
                            Collections
                            {(() => {
                                const count = transactions.filter(t =>
                                    t.status === "awaiting_collection" ||
                                    t.status === "ready_to_release" ||
                                    (t.status === "in_facility" && t.collectionBooked && t.collectionDate === today)
                                ).length;
                                return count > 0 ? <span className={styles.subTabBadge}>{count}</span> : null;
                            })()}
                        </button>
                    </div>
                )}

                {activeTab === "time_slots" ? (
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
                            />
                        ))}
                    </div>
                )}
            </main>

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