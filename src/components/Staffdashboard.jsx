
import { useState, useRef, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { auth, db } from "../firebase.js";
import { signOut, onAuthStateChanged } from "firebase/auth";
import {
    doc, getDoc, updateDoc, serverTimestamp,
    collection, addDoc, query, where, onSnapshot,
} from "firebase/firestore";
import styles from "./Staffdashboard.module.css";

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
        // Seller gets notified → they go to Trade Facility
        await sendNotification(txn.sellerId, {
            type:          "item_received_at_facility",
            listingId:     txn.listingId || null,
            transactionId: txn.id,
            listingTitle:  title,
            message:       `Your item "${title}" has been received at the trade facility.`,
        });
        // Buyer gets notified → they go to My Purchases to book collection
        await sendNotification(txn.buyerId, {
            type:          "item_at_facility",
            listingId:     txn.listingId || null,
            transactionId: txn.id,
            listingTitle:  title,
            message:       `The item "${title}" you purchased is now at the trade facility. Book a collection slot to pick it up.`,
        });
    } else {
        // Collection confirmed
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

const CAMPUSES = ["All Campuses", "Main Campus", "Education Campus", "Health Sciences Campus", "Business School Campus"];
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
function StaffNavbar({ staffName, staffInitials, staffPhoto }) {
    const navigate = useNavigate();
    const location = useLocation();
    const [notifOpen, setNotifOpen] = useState(false);
    const notifRef = useRef(null);

    useEffect(() => {
        function outside(e) {
            if (notifRef.current && !notifRef.current.contains(e.target)) setNotifOpen(false);
        }
        document.addEventListener("mousedown", outside);
        return () => document.removeEventListener("mousedown", outside);
    }, []);

    const STAFF_LINKS = [
        { label: "Dashboard", path: "/staff",  icon: "fa-gauge"    },
        { label: "Time Slots", path: null,      icon: "fa-clock"    },
        { label: "Reports",    path: null,      icon: "fa-chart-bar"},
    ];

    return (
        <header className={styles.navbar}>
            <div className={styles.logo} onClick={() => navigate("/staff-dashboard")}>
                <div className={styles.logoBox}>
                    <i className="fa-solid fa-shop" style={{ color: "#fff", fontSize: "1.1rem" }} />
                </div>
                <span className={styles.logoText}>CampusMarket</span>
            </div>
            <nav className={styles.navLinks}>
                {STAFF_LINKS.map((link) => {
                    const isActive = link.path && location.pathname === link.path;
                    return (
                        <button
                            key={link.label}
                            className={`${styles.navLink} ${isActive ? styles.navLinkActive : ""} ${!link.path ? styles.navLinkDisabled : ""}`}
                            onClick={() => link.path && navigate(link.path)}
                            disabled={!link.path}
                        >
                            {link.label}
                        </button>
                    );
                })}
            </nav>
            <div className={styles.navRight}>
                <span className={styles.staffPill}>
                    <i className="fa-solid fa-shield-halved" /> Staff
                </span>
                <div className={styles.notificationWrapper} ref={notifRef}>
                    <button className={styles.iconButton} onClick={() => setNotifOpen(v => !v)} title="Notifications">
                        <i className="fa-solid fa-bell" />
                        <span className={styles.notificationBadge}>2</span>
                    </button>
                    {notifOpen && (
                        <div className={styles.notificationDropdown}>
                            <div className={styles.notificationHeader}>
                                <span>Notifications</span>
                                <button className={styles.markAllRead}>Mark all read</button>
                            </div>
                            <div className={styles.notificationList}>
                                <div className={styles.notificationItem}>
                                    <i className="fas fa-box" />
                                    <div className={styles.notificationContent}>
                                        <p>New item drop-off: North Face Jacket</p>
                                        <span>10 minutes ago</span>
                                    </div>
                                </div>
                                <div className={styles.notificationItem}>
                                    <i className="fas fa-clock" />
                                    <div className={styles.notificationContent}>
                                        <p>Time slot starting in 30 minutes</p>
                                        <span>30 minutes ago</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </header>
    );
}

// ─── Transaction Card ─────────────────────────────────────────────────────────
function TransactionCard({ txn, onConfirmDropOff, onConfirmCollection, onRelease, onMarkStep }) {
    const meta       = STATUS_META[txn.status] || STATUS_META.pending;
    const allChecked = txn.checklist.every(c => c.done);

    const shortfall    = txn.cashShortfall ?? 0;
    const hasShortfall = shortfall > 0;
    const [cashConfirmed, setCashConfirmed] = useState(
        txn.paymentStatus === "Fully Paid" || shortfall === 0
    );
    const [saving, setSaving] = useState(false);

    const canConfirmCash = allChecked && hasShortfall && !cashConfirmed;
    const canRelease     = allChecked && (!hasShortfall || cashConfirmed);

    const [dropOffLoading,    setDropOffLoading]    = useState(false);
    const [collectionLoading, setCollectionLoading] = useState(false);

    // ── Waiting states ────────────────────────────────────────────────────────
    const waitingForDropOff = txn.status === "pending" && !txn.dropOffBooked;

    const waitingForCollection =
        ["in_facility", "ready_to_release"].includes(txn.status) &&
        !txn.collectionBooked;

    const showConfirmDropOff = txn.status === "pending" && txn.dropOffBooked;

    // ── FIXED: Only show Confirm Collection after buyer has booked
    //    a collection slot AND status is awaiting_collection ──────
    const showConfirmCollection =
        txn.status === "awaiting_collection" && txn.collectionBooked;

    async function handleConfirmCash() {
        setCashConfirmed(true);
        setSaving(true);
        try {
            await updateDoc(doc(db, "transactions", txn.id), {
                cashShortfall:   0,
                paymentStatus:   "Fully Paid",
                cashConfirmedAt: serverTimestamp(),
            });
        } catch (err) {
            console.error("Failed to update cash status:", err);
        } finally {
            setSaving(false);
        }
    }

    async function handleDropOff() {
        setDropOffLoading(true);
        try {
            await onConfirmDropOff(txn.id);
        } finally {
            setDropOffLoading(false);
        }
    }

    async function handleCollection() {
        setCollectionLoading(true);
        try {
            await onConfirmCollection(txn.id);
        } finally {
            setCollectionLoading(false);
        }
    }

    return (
        <div className={`${styles.txnCard} ${styles[`txnCard_${meta.cls}`]}`}>

            {/* Left thumb */}
            <div className={styles.txnThumb}>
                {txn.itemImage
                    ? <img src={txn.itemImage} alt={txn.item} />
                    : <i className="fa-solid fa-box-open" />
                }
            </div>

            {/* Main info */}
            <div className={styles.txnMain}>
                <div className={styles.txnTopRow}>
                    <span className={styles.txnTitle}>{txn.item}</span>
                    <div className={styles.txnBadges}>
                        <span className={styles.timeBadge}>
                            <i className="fa-regular fa-clock" /> {txn.timeSlot}
                        </span>
                        <span className={`${styles.statusBadge} ${styles[`status_${meta.cls}`]}`}>
                            <i className={`fa-solid ${meta.icon}`} /> {meta.label}
                        </span>
                    </div>
                </div>

                <div className={styles.txnParties}>
                    <span className={styles.txnParty}>{txn.seller}</span>
                    <i className="fa-solid fa-arrow-right" style={{ color: "#bbb", fontSize: "0.7rem" }} />
                    <span className={styles.txnParty}>{txn.buyer}</span>
                </div>

                <div className={styles.txnMeta}>
                    {txn.type === "Purchase" ? (
                        <span className={styles.txnTag}>
                            Purchase · R{txn.price?.toLocaleString()}
                            {cashConfirmed || !hasShortfall ? (
                                <span className={styles.paidChip}>
                                    <i className="fa-solid fa-circle-check" /> Paid
                                </span>
                            ) : (
                                <span className={styles.shortfallChip}>
                                    <i className="fa-solid fa-triangle-exclamation" /> Cash owed: R{shortfall.toLocaleString()}
                                </span>
                            )}
                        </span>
                    ) : (
                        <span className={styles.txnTag}>Trade · {txn.tradeFor}</span>
                    )}
                </div>

                {/* ── Waiting for seller to book drop-off ── */}
                {waitingForDropOff && (
                    <div className={styles.waitingBanner}>
                        <i className="fa-solid fa-hourglass-half" />
                        <span>
                            Waiting for <strong>{txn.seller}</strong> to book a drop-off slot.
                            No action required yet.
                        </span>
                    </div>
                )}

                {/* ── Drop-off booked — show scheduled info ── */}
                {txn.status === "pending" && txn.dropOffBooked && (
                    <div className={styles.bookedBanner}>
                        <i className="fa-solid fa-calendar-check" />
                        <span>
                            Drop-off booked by <strong>{txn.seller}</strong> for{" "}
                            <strong>{txn.dropOffDate}</strong> at <strong>{txn.dropOffTimeSlot}</strong>.
                            Click <strong>Confirm Drop-Off</strong> once item is received.
                        </span>
                    </div>
                )}

                {/* ── Waiting for buyer to book collection ── */}
                {waitingForCollection && (
                    <div className={styles.waitingBanner} style={{ marginTop: 6 }}>
                        <i className="fa-solid fa-hourglass-half" />
                        <span>
                            Waiting for <strong>{txn.buyer}</strong> to book a collection slot
                            before the item can be released.
                        </span>
                    </div>
                )}

                {/* ── Collection booked — show scheduled info ── */}
                {txn.collectionBooked && txn.collectionDate && (
                    <div className={styles.bookedBanner} style={{ marginTop: 6 }}>
                        <i className="fa-solid fa-calendar-check" />
                        <span>
                            Collection booked by <strong>{txn.buyer}</strong> for{" "}
                            <strong>{txn.collectionDate}</strong> at <strong>{txn.collectionTimeSlot}</strong>.
                        </span>
                    </div>
                )}

                {/* Pending drop-off notice */}
                {txn.status === "pending" && txn.dropOffBooked && (
                    <div className={styles.dropOffBanner}>
                        <i className="fa-solid fa-truck-arrow-right" />
                        <span>
                            Awaiting item drop-off from seller. Click <strong>Confirm Drop-Off</strong> once
                            you have physically received the item.
                        </span>
                    </div>
                )}

                {/* Cash shortfall banners */}
                {hasShortfall && !cashConfirmed && txn.status !== "pending" && (
                    <div className={styles.shortfallBanner}>
                        <i className="fa-solid fa-coins" />
                        <span>
                            Outstanding cash shortfall of <strong>R{shortfall.toLocaleString()}</strong>.
                            Collect from buyer before releasing the item.
                        </span>
                    </div>
                )}
                {hasShortfall && cashConfirmed && (
                    <div className={styles.cashConfirmedBanner}>
                        <i className="fa-solid fa-circle-check" />
                        <span>Cash of <strong>R{shortfall.toLocaleString()}</strong> confirmed received.</span>
                    </div>
                )}

                {/* Checklist — only show after drop-off confirmed */}
                {txn.status !== "pending" && (
                    <div className={styles.checklist}>
                        {txn.checklist.map((step, i) => (
                            <button
                                key={i}
                                className={`${styles.checkItem} ${step.done ? styles.checkDone : styles.checkPending}`}
                                onClick={() => onMarkStep && onMarkStep(txn.id, i)}
                                disabled={step.done}
                            >
                                <i className={`fa-solid ${step.done ? "fa-circle-check" : "fa-circle"}`} />
                                {step.label}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* Action buttons */}
            <div className={styles.txnAction}>

                {/* Confirm Drop-Off — only when seller has booked */}
                {showConfirmDropOff && (
                    <button
                        className={styles.dropOffBtn}
                        onClick={handleDropOff}
                        disabled={dropOffLoading}
                        title="Confirm you have physically received this item from the seller"
                    >
                        <i className={`fa-solid ${dropOffLoading ? "fa-spinner fa-spin" : "fa-box-archive"}`} />
                        {dropOffLoading ? "Confirming…" : "Confirm Drop-Off"}
                    </button>
                )}

                {/* Confirm Cash Received */}
                {!showConfirmDropOff && !waitingForDropOff && hasShortfall && (
                    <button
                        className={`${styles.confirmCashBtn} ${!canConfirmCash ? styles.confirmCashBtnDisabled : ""}`}
                        onClick={handleConfirmCash}
                        disabled={!canConfirmCash || saving}
                        title={
                            !allChecked   ? "Complete all checklist steps first" :
                            cashConfirmed ? "Cash already confirmed" :
                            "Confirm you have received the cash shortfall"
                        }
                    >
                        <i className={`fa-solid ${cashConfirmed ? "fa-circle-check" : "fa-hand-holding-dollar"}`} />
                        {saving ? "Saving…" : cashConfirmed ? "Cash Received" : "Confirm Cash Received"}
                    </button>
                )}

                {/* Release button — only when checklist done, cash settled,
                    AND buyer has already booked a collection slot */}
                {(txn.status === "ready_to_release" || txn.status === "in_facility") && txn.collectionBooked && (
                    <button
                        className={`${styles.releaseBtn} ${!canRelease ? styles.releaseBtnDisabled : ""}`}
                        onClick={() => canRelease && onRelease(txn.id)}
                        disabled={!canRelease}
                        title={
                            !allChecked                    ? "Complete all checklist steps first" :
                            hasShortfall && !cashConfirmed ? "Confirm cash received first" :
                            "Release to buyer"
                        }
                    >
                        <i className="fa-solid fa-arrow-up-from-bracket" />
                        Release for Collection
                    </button>
                )}

                {/* Confirm Collection — ONLY after buyer has booked a slot
                    AND status is awaiting_collection */}
                {showConfirmCollection && (
                    <button
                        className={styles.confirmCollectionBtn}
                        onClick={handleCollection}
                        disabled={collectionLoading}
                        title="Confirm the buyer has collected this item"
                    >
                        <i className={`fa-solid ${collectionLoading ? "fa-spinner fa-spin" : "fa-handshake"}`} />
                        {collectionLoading ? "Confirming…" : "Confirm Collection"}
                    </button>
                )}
            </div>
        </div>
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
                        return (
                            <div key={t.id} className={styles.slotItem}>
                                <div className={styles.slotItemLeft}>
                                    <span className={styles.slotItemTitle}>{t.item}</span>
                                    <span className={styles.slotItemParties}>{t.seller} → {t.buyer}</span>
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
    const [activeTab, setActiveTab]       = useState("due_today");
    const [search, setSearch]             = useState("");
    const [campus, setCampus]             = useState("All Campuses");
    const [transactions, setTransactions] = useState([]);
    const [isLoggingOut, setIsLoggingOut] = useState(false);
    const [showProfile, setShowProfile]   = useState(false);
    const [staffUser, setStaffUser]       = useState({
        name: "", email: "", photoURL: "", initials: "",
    });

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

    // ── Live Firestore listener ───────────────────────────────────────────────
    useEffect(() => {
        // FIX: Added "waiting" to the status list so transactions where the
        // seller has booked a drop-off (but status hasn't moved to "accepted")
        // are included in the dashboard query.
        const q = query(
            collection(db, "transactions"),
            where("status", "in", [
                "waiting",            // ← ADDED
                "accepted",
                "in_facility",
                "ready_to_release",
                "awaiting_collection",
                "completed",
            ])
        );

        const unsub = onSnapshot(q, async (snapshot) => {
            const base = snapshot.docs.map(d => ({ _ref: d.id, _data: d.data() }));

            const sellerIds  = [...new Set(base.map(b => b._data.sellerId).filter(Boolean))];
            const listingIds = [...new Set(base.map(b => b._data.listingId).filter(Boolean))];

            const [sellerSnaps, listingSnaps] = await Promise.all([
                Promise.all(sellerIds.map(id  => getDoc(doc(db, "users",    id)))),
                Promise.all(listingIds.map(id => getDoc(doc(db, "listings", id)))),
            ]);

            const sellerMap = {};
            sellerSnaps.forEach(snap => {
                if (snap.exists()) {
                    const d = snap.data();
                    sellerMap[snap.id] = `${d.firstName || ""} ${d.lastName || ""}`.trim() || "Seller";
                }
            });

            const listingImageMap = {};
            listingSnaps.forEach(snap => {
                if (snap.exists()) {
                    const d = snap.data();
                    listingImageMap[snap.id] =
                        (Array.isArray(d.photos) && d.photos[0]) ||
                        (Array.isArray(d.images) && d.images[0]) ||
                        d.imageUrl || d.image || d.itemImage || null;
                }
            });

            const live = base.map(({ _ref: id, _data: data }) => ({
                id,
                item:          data.listingTitle || "Item",
                itemImage:     listingImageMap[data.listingId] || data.itemImage || null,
                seller:        sellerMap[data.sellerId] || data.sellerName || "Seller",
                sellerId:      data.sellerId,
                buyer:         data.buyerName || "Buyer",
                buyerId:       data.buyerId,
                listingId:     data.listingId    || null,
                listingTitle:  data.listingTitle || "Item",
                type:          data.type === "sale" ? "Purchase" : "Trade",
                price:         data.agreedPrice  || data.price || 0,
                cashShortfall: data.cashShortfall ?? 0,
                paymentStatus: data.paymentStatus || (data.cashShortfall > 0 ? "Partially Paid" : "Fully Paid"),
                tradeFor:      data.tradeItem    || null,
                timeSlot:      data.dropOffTimeSlot || data.timeSlot || "TBD",

                // FIX: Map both "waiting" and "accepted" to the local "pending" status
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
        });
        return () => unsub();
    }, []);

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

    const visibleTxns = transactions
        .filter(t => {
            const matchSearch = !search ||
                t.item.toLowerCase().includes(search.toLowerCase())   ||
                t.seller.toLowerCase().includes(search.toLowerCase()) ||
                t.buyer.toLowerCase().includes(search.toLowerCase());
            const matchCampus = campus === "All Campuses" || t.campus === campus;
            if (activeTab === "due_today")  return matchSearch && matchCampus && isDueToday(t) && t.status !== "completed";
            if (activeTab === "history")    return matchSearch && matchCampus && t.status === "completed";
            if (activeTab === "time_slots") return matchSearch && matchCampus && t.status !== "completed";
            if (activeTab === "all")        return matchSearch && matchCampus && t.status !== "completed";
            return matchSearch && matchCampus && t.status !== "completed";
        })
        .sort((a, b) => b.date - a.date); // newest first

    const STATS = [
        { label: "Pending Drop-off",    value: pendingDropOff.length, icon: "fa-truck-arrow-right", color: "#f59e0b" },
        { label: "Items In Facility",   value: inFacility.length,     icon: "fa-warehouse",         color: "#6AA6DA" },
        { label: "Awaiting Collection", value: awaitingColl.length,   icon: "fa-person-walking",    color: "#8b5cf6" },
        { label: "Completed",           value: completed.length,      icon: "fa-circle-check",      color: "#10b981" },
    ];

    return (
        <div className={styles.shell}>
            <StaffNavbar
                staffName={staffUser.name}
                staffInitials={staffUser.initials}
                staffPhoto={staffUser.photoURL}
            />

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

                {/* Stats */}
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

                {/* Search + campus filter */}
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
                    <div className={styles.selectWrap}>
                        <i className="fa-solid fa-building" />
                        <select
                            className={styles.campusSelect}
                            value={campus}
                            onChange={e => setCampus(e.target.value)}
                        >
                            {CAMPUSES.map(c => <option key={c}>{c}</option>)}
                        </select>
                        <i className="fa-solid fa-chevron-down" style={{ pointerEvents: "none" }} />
                    </div>
                </div>

                {/* Tabs */}
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
                                <span className={styles.tabBadge}>
                                    {todayTxns.filter(t => t.status !== "completed").length}
                                </span>
                            )}
                        </button>
                    ))}
                </div>

                {/* Content */}
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
