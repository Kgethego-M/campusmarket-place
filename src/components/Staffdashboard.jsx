import { useState, useRef, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { auth, db } from "../firebase";
import { signOut, onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, collection, getDocs, query, orderBy, where } from "firebase/firestore";
import styles from "./Staffdashboard.module.css";

// ─── Mock Data ────────────────────────────────────────────────────────────────
const MOCK_TRANSACTIONS = [
    {
        id: "txn001",
        item: "Coach bag",
        itemImage: null,
        seller: "Mpeane Mphelane",
        buyer: "James van der Merwe",
        type: "Purchase",
        price: 3000,
        tradeFor: null,
        timeSlot: "09:00 - 10:00",
        status: "ready_to_release",
        campus: "Main Campus",
        checklist: [
            { label: "Confirmed Drop-off by Nontokozo Mbatha", done: true },
            { label: "Inspected Item by Nontokozo Mbatha", done: true },
            { label: "Confirmed Payment by Nontokozo Mbatha", done: true },
        ],
        date: new Date(),
    },
    {
        id: "txn002",
        item: "Headphones",
        itemImage: null,
        seller: "Tshepang Legodi",
        buyer: "Samkelisiwe Mofokeng",
        type: "Purchase",
        price: 1500,
        tradeFor: null,
        timeSlot: "10:00 - 11:00",
        status: "ready_to_release",
        campus: "Main Campus",
        checklist: [
            { label: "Confirmed Drop-off by Nontokozo Mbatha", done: true },
            { label: "Inspected Item by Nontokozo Mbatha", done: true },
            { label: "Confirmed Payment by Nontokozo Mbatha", done: false },
        ],
        date: new Date(),
    },
    {
        id: "txn003",
        item: "X-Ray Glasses",
        itemImage: null,
        seller: "Victor Hyginus",
        buyer: "Wendy Khumalo",
        type: "Purchase",
        price: 200,
        tradeFor: null,
        timeSlot: "11:00 - 12:00",
        status: "in_facility",
        campus: "Education Campus",
        checklist: [
            { label: "Confirmed Drop-off by Nontokozo Matha", done: true },
            { label: "Inspected Item by Nontokozo Matha", done: false },
            { label: "Confirmed Payment by Nontokozo Matha", done: false },
        ],
        date: new Date(),
    },
    {
        id: "txn004",
        item: "ERD Textbook",
        itemImage: null,
        seller: "Tebogo sebopela",
        buyer: "Sduduzo Mdlalose",
        type: "Purchase",
        price: 200,
        tradeFor: null,
        timeSlot: "14:00 - 15:00",
        status: "completed",
        campus: "Main Campus",
        checklist: [
            { label: "Confirmed Drop-off", done: true },
            { label: "Inspected Item", done: true },
            { label: "Confirmed Payment", done: true },
            { label: "Released to Buyer", done: true },
        ],
        date: new Date(Date.now() - 86400000),
    },
    {
        id: "txn005",
        item: "Wired Earphones",
        itemImage: null,
        seller: "Ikho Nxazonke",
        buyer: "Zanenkosi Mbatha",
        type: "Purchase",
        price: 100,
        tradeFor: null,
        timeSlot: "15:00 - 16:00",
        status: "awaiting_collection",
        campus: "Health Sciences Campus",
        checklist: [
            { label: "Confirmed Drop-off", done: true },
            { label: "Inspected Item", done: true },
            { label: "Confirmed Payment", done: true },
        ],
        date: new Date(),
    },
];

const CAMPUSES = ["All Campuses", "Main Campus", "Education Campus", "Health Sciences Campus", "Business School Campus"];
const TABS = [
    { key: "due_today",       label: "Due Today",        icon: "fa-calendar-day" },
    { key: "all",             label: "All Transactions", icon: "fa-list" },
    { key: "history",         label: "History",          icon: "fa-clock-rotate-left" },
    { key: "time_slots",      label: "Time Slots",       icon: "fa-clock" },
];

const STATUS_META = {
    ready_to_release: { label: "Ready to Release", cls: "ready",    icon: "fa-circle-check" },
    in_facility:      { label: "In Facility",       cls: "facility", icon: "fa-warehouse" },
    awaiting_collection: { label: "Awaiting Collection", cls: "awaiting", icon: "fa-person-walking" },
    completed:        { label: "Completed",         cls: "done",     icon: "fa-check-double" },
    pending:          { label: "Pending",           cls: "pending",  icon: "fa-hourglass-half" },
};

// ─── Navbar (without profile dropdown) ───────────────────────────────────────────────────
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
        { label: "Dashboard", path: "/staff",  icon: "fa-gauge" },
        { label: "Time Slots", path: null, icon: "fa-clock" },
        { label: "Reports",  path: null, icon: "fa-chart-bar" },
    ];

    return (
        <header className={styles.navbar}>
            {/* Logo */}
            <div className={styles.logo} onClick={() => navigate("/staff-dashboard")}>
                <div className={styles.logoBox}>
                    <i className="fa-solid fa-shop" style={{ color: "#fff", fontSize: "1.1rem" }} />
                </div>
                <span className={styles.logoText}>CampusMarket</span>
            </div>

            {/* Nav links */}
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
                {/* Staff badge */}
                <span className={styles.staffPill}>
                    <i className="fa-solid fa-shield-halved" /> Staff
                </span>

                {/* Notifications */}
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
function TransactionCard({ txn, onRelease, onMarkStep }) {
    const meta = STATUS_META[txn.status] || STATUS_META.pending;
    const allChecked = txn.checklist.every(c => c.done);

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
                        <span className={`${styles.timeBadge}`}>
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
                            <span className={styles.paidChip}><i className="fa-solid fa-circle-check" /> Paid</span>
                        </span>
                    ) : (
                        <span className={styles.txnTag}>Trade · {txn.tradeFor}</span>
                    )}
                </div>

                {/* Checklist */}
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
            </div>

            {/* Action */}
            {(txn.status === "ready_to_release" || txn.status === "in_facility") && (
                <div className={styles.txnAction}>
                    <button
                        className={`${styles.releaseBtn} ${!allChecked ? styles.releaseBtnDisabled : ""}`}
                        onClick={() => allChecked && onRelease(txn.id)}
                        disabled={!allChecked}
                        title={!allChecked ? "Complete all checklist steps first" : "Release to buyer"}
                    >
                        <i className="fa-solid fa-arrow-up-from-bracket" />
                        Release for Collection
                    </button>
                </div>
            )}
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

// ─── Staff Profile Panel (with logout button) ─────────────────────────────────
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

                {/* Logout Button */}
                <div className={styles.profileLogoutSection}>
                    <button 
                        className={styles.profileLogoutBtn} 
                        onClick={onLogout}
                        disabled={isLoggingOut}
                    >
                        {isLoggingOut ? (
                            <><i className="fas fa-spinner fa-spin" /> Logging out...</>
                        ) : (
                            <><i className="fas fa-right-from-bracket" /> Logout</>
                        )}
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
    const [transactions, setTransactions] = useState(MOCK_TRANSACTIONS);
    const [isLoggingOut, setIsLoggingOut] = useState(false);
    const [showProfile, setShowProfile]   = useState(false);
    const [staffUser, setStaffUser]       = useState({
        name: "Sipho Ndaba",
        email: "s.ndaba@campus.ac.za",
        photoURL: "",
        initials: "SN",
    });

    // Load real auth user
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
                        name: `${f} ${l}`.trim() || user.displayName || "Staff",
                        email: d.email || user.email || "",
                        photoURL: d.photoURL || user.photoURL || "",
                        initials: `${f[0] || ""}${l[0] || ""}`.toUpperCase() || "S",
                    });
                }
            } catch {}
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

    const handleRelease = (id) => {
        setTransactions(prev => prev.map(t => t.id === id ? { ...t, status: "completed" } : t));
    };

    const handleMarkStep = (txnId, stepIdx) => {
        setTransactions(prev => prev.map(t => {
            if (t.id !== txnId) return t;
            const newChecklist = t.checklist.map((s, i) => i === stepIdx ? { ...s, done: true } : s);
            const allDone = newChecklist.every(s => s.done);
            return { ...t, checklist: newChecklist, status: allDone ? "ready_to_release" : t.status };
        }));
    };

    // Stats
    const today = new Date().toDateString();
    const todayTxns       = transactions.filter(t => new Date(t.date).toDateString() === today);
    const inFacility      = transactions.filter(t => t.status === "in_facility" || t.status === "ready_to_release");
    const awaitingColl    = transactions.filter(t => t.status === "awaiting_collection");
    const completed       = transactions.filter(t => t.status === "completed");

    // Filter
    const visibleTxns = transactions.filter(t => {
        const matchSearch = !search ||
            t.item.toLowerCase().includes(search.toLowerCase()) ||
            t.seller.toLowerCase().includes(search.toLowerCase()) ||
            t.buyer.toLowerCase().includes(search.toLowerCase());
        const matchCampus = campus === "All Campuses" || t.campus === campus;

        if (activeTab === "due_today")  return matchSearch && matchCampus && new Date(t.date).toDateString() === today && t.status !== "completed";
        if (activeTab === "history")    return matchSearch && matchCampus && t.status === "completed";
        if (activeTab === "time_slots") return matchSearch && matchCampus;
        return matchSearch && matchCampus;
    });

    const STATS = [
        { label: "Due Today",           value: todayTxns.filter(t => t.status !== "completed").length, icon: "fa-calendar-day",   color: "#f59e0b" },
        { label: "Items In Facility",   value: inFacility.length,   icon: "fa-warehouse",         color: "#6AA6DA" },
        { label: "Awaiting Collection", value: awaitingColl.length, icon: "fa-person-walking",    color: "#8b5cf6" },
        { label: "Completed",           value: completed.length,    icon: "fa-circle-check",      color: "#10b981" },
    ];

    return (
        <div className={styles.shell}>
            <StaffNavbar
                staffName={staffUser.name}
                staffInitials={staffUser.initials}
                staffPhoto={staffUser.photoURL}
            />

            <main className={styles.main}>
                {/* Page title */}
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
                                <span className={styles.tabBadge}>{todayTxns.filter(t => t.status !== "completed").length}</span>
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
                        {search && <button className={styles.clearBtn} onClick={() => setSearch("")}>Clear search</button>}
                    </div>
                ) : (
                    <div className={styles.txnList}>
                        {visibleTxns.map(txn => (
                            <TransactionCard
                                key={txn.id}
                                txn={txn}
                                onRelease={handleRelease}
                                onMarkStep={handleMarkStep}
                            />
                        ))}
                    </div>
                )}
            </main>

            {/* Staff profile slide panel with logout button */}
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

            {/* Logout overlay */}
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