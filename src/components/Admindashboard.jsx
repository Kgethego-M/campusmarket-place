import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { auth, db } from "../firebase";
import { signOut, onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, collection, getDocs, query, orderBy, updateDoc, where, setDoc, deleteDoc, onSnapshot, writeBatch } from "firebase/firestore";
import styles from "./Admindashboard.module.css";
import { validateFacilityConfig, generateTimeSlots, getTotalCapacity } from "../utils/facilityConfig.utils";
import UtilisationReport from "./UtilisationReport.jsx";

export default function AdminDashboard() {
    const navigate     = useNavigate();
    const dropdownRef  = useRef(null);

    const [activeTab,     setActiveTab]     = useState("users");
    const [dropdownOpen,  setDropdownOpen]  = useState(false);
    const [isLoggingOut,  setIsLoggingOut]  = useState(false);
    const [userSearch,    setUserSearch]    = useState("");
    const [listingSearch, setListingSearch] = useState("");
    const [reportSearch, setReportSearch]   = useState("");


    const [adminUser,     setAdminUser]     = useState({ name: "Admin", email: "", photoURL: "", initials: "A" });
    const [stats,         setStats]         = useState({ totalUsers: 0, openReports: 0, transactions: 0, revenue: 0 });
    const [pendingStaff,  setPendingStaff]  = useState([]);
    const [allUsers,      setAllUsers]      = useState([]);
    const [listings,      setListings]      = useState([]);
    const [reports, setReports]     = useState([]);
    const [loading,       setLoading]       = useState(true);

    // ── Facility config state ──────────────────────────────────────
    const [facilityConfig, setFacilityConfig] = useState({
        openTime:     "09:00",
        closeTime:    "16:00",
        slotsPerHour: 1,
    });
    const [configLoading,  setConfigLoading]  = useState(false);
    const [configSaving,   setConfigSaving]   = useState(false);
    const [configError,    setConfigError]    = useState("");
    const [configSuccess,  setConfigSuccess]  = useState("");

    // ── Auth guard + load admin profile ───────────────────────────
    useEffect(() => {
        const unsub = onAuthStateChanged(auth, async (user) => {
            if (!user) { navigate("/login"); return; }
            try {
                const snap = await getDoc(doc(db, "users", user.uid));
                const data = snap.exists() ? snap.data() : {};
                if (data.userType !== "admin") { navigate("/"); return; }

                const fn = data.firstName || user.displayName?.split(" ")[0] || "Admin";
                const ln = data.lastName  || user.displayName?.split(" ").slice(1).join(" ") || "";
                setAdminUser({
                    name:     `${fn} ${ln}`.trim(),
                    email:    data.email || user.email,
                    photoURL: data.photoURL || user.photoURL || "",
                    initials: `${fn[0] || "A"}${ln[0] || ""}`.toUpperCase(),
                });
            } catch (e) { console.error(e); }
        });
        return () => unsub();
    }, [navigate]);

    // ── Fetch dashboard data ───────────────────────────────────────
    useEffect(() => {
        async function load() {
            try {
                const usersSnap = await getDocs(collection(db, "users"));
                const users     = usersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
                setAllUsers(users);

                const pending = users.filter(u => u.userType === "staff" && !u.approved);
                setPendingStaff(pending);

                const listSnap = await getDocs(query(collection(db, "listings"), orderBy("timestamp", "desc")));
                const listData = listSnap.docs.map(d => ({ id: d.id, ...d.data() }));
                setListings(listData);

                const sold    = listData.filter(l => l.status === "sold");
                const revenue = sold.reduce((sum, l) => sum + (Number(l.price) || 0), 0);
                const reports = users.filter(u => u.suspended).length;

                setStats({
                    totalUsers:   users.length,
                    openReports:  reports,
                    transactions: sold.length,
                    revenue,
                });
            } catch (e) {
                console.error("Dashboard load error:", e);
            } finally {
                setLoading(false);
            }
        }
        load();
    }, []);

    // ── Real-time reports listener ───────────────────────────────────────────
    useEffect(() => {
        const q = query(collection(db, "reports"), orderBy("createdAt", "desc"));
        const unsub = onSnapshot(q, (snap) => {
            setReports(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        });
        return () => unsub();
    }, []);

    // ── Actions ─────────────────────────────────────────────────────────────
    // ── Load facility config when settings tab opens ───────────────
    useEffect(() => {
        if (activeTab !== "settings") return;
        (async () => {
            setConfigLoading(true);
            setConfigError("");
            try {
                const snap = await getDoc(doc(db, "facilityConfig", "default"));
                if (snap.exists()) {
                    const data = snap.data();
                    setFacilityConfig({
                        openTime:     data.openTime     ?? "09:00",
                        closeTime:    data.closeTime    ?? "16:00",
                        slotsPerHour: data.slotsPerHour ?? 1,
                    });
                }
            } catch (e) {
                setConfigError("Failed to load facility config.");
                console.error(e);
            } finally {
                setConfigLoading(false);
            }
        })();
    }, [activeTab]);

    // ── Save facility config ───────────────────────────────────────
    async function handleSaveConfig(e) {
        e.preventDefault();
        setConfigError("");
        setConfigSuccess("");

        const parsed = { ...facilityConfig, slotsPerHour: Number(facilityConfig.slotsPerHour) };
        const { valid, error } = validateFacilityConfig(parsed);
        if (!valid) { setConfigError(error); return; }

        setConfigSaving(true);
        try {
            await setDoc(doc(db, "facilityConfig", "default"), {
                openTime:     parsed.openTime,
                closeTime:    parsed.closeTime,
                slotsPerHour: parsed.slotsPerHour,
            });
            setConfigSuccess("Facility settings saved successfully.");
            setTimeout(() => setConfigSuccess(""), 3500);
        } catch (e) {
            setConfigError("Failed to save. Please try again.");
            console.error(e);
        } finally {
            setConfigSaving(false);
        }
    }

    // ── Actions ────────────────────────────────────────────────────
    const approveStaff = async (userId) => {
        await updateDoc(doc(db, "users", userId), { approved: true });
        setPendingStaff(prev => prev.filter(u => u.id !== userId));
        setAllUsers(prev => prev.map(u => u.id === userId ? { ...u, approved: true } : u));
    };

    const rejectStaff = async (userId) => {
        await updateDoc(doc(db, "users", userId), { userType: "student", approved: false });
        setPendingStaff(prev => prev.filter(u => u.id !== userId));
        setAllUsers(prev => prev.map(u => u.id === userId ? { ...u, userType: "student" } : u));
    };

    const toggleSuspend = async (userId, suspended) => {
        await updateDoc(doc(db, "users", userId), { suspended: !suspended });
        setAllUsers(prev => prev.map(u => u.id === userId ? { ...u, suspended: !suspended } : u));
        setStats(prev => ({
            ...prev,
            openReports: !suspended ? prev.openReports + 1 : Math.max(0, prev.openReports - 1),
        }));
    };

    const handleLogout = async () => {
        setIsLoggingOut(true);
        setTimeout(async () => {
            try {
                localStorage.removeItem("loggedInUserId");
                await signOut(auth);
                navigate("/login");
            } catch (e) { console.error(e); }
            finally { setIsLoggingOut(false); setDropdownOpen(false); }
        }, 1500);
    };

    useEffect(() => {
        const handler = (e) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target))
                setDropdownOpen(false);
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, []);

    const filteredUsers   = allUsers.filter(u =>
        `${u.firstName} ${u.lastName} ${u.email}`.toLowerCase().includes(userSearch.toLowerCase())
    );
    const previewSlots    = generateTimeSlots(facilityConfig.openTime, facilityConfig.closeTime);
    const previewCapacity = getTotalCapacity({ ...facilityConfig, slotsPerHour: Number(facilityConfig.slotsPerHour) });

    const suspendedUsers = allUsers.filter(u => u.suspended);

    const filteredListings = listings.filter(l =>
        `${l.title || ""} ${l.category || ""} ${l.status || ""}`.toLowerCase().includes(listingSearch.toLowerCase())
    );

    const filteredReports = reports.filter(r =>
        (r.reportedName || "").toLowerCase().includes(reportSearch.toLowerCase())
    );

    if (loading) return (
        <div className={styles.loadingScreen}>
            <div className={styles.spinner} />
            <p>Loading admin dashboard…</p>
        </div>
    );

    return (
        <div className={styles.shell}>

            {/* ── NavBar ── */}
            <header className={styles.navbar}>
                <div className={styles.navLeft}>
                    <div className={styles.logoBox}>
                        <i className="fa-solid fa-shop" />
                    </div>
                    <span className={styles.logoText}>CampusMarket</span>
                    <span className={styles.adminPill}>Admin</span>
                </div>

                <div className={styles.navCenter}>
                    <span className={styles.navActive}>
                        <i className="fas fa-th-large" /> Dashboard
                    </span>
                    <button
                        className={styles.navAnalyticsLink}
                        onClick={() => navigate("/admin/analytics")}
                    >
                        <i className="fas fa-chart-bar" /> Analytics
                    </button>
                    <span className={styles.navHandle}>@{adminUser.name.split(" ")[0] || "Admin"}</span>
                </div>

                <div className={styles.navRight}>
                    <button className={styles.bellBtn} title="Notifications">
                        <i className="fas fa-bell" />
                        {pendingStaff.length > 0 && (
                            <span className={styles.bellBadge}>{pendingStaff.length}</span>
                        )}
                    </button>

                    <div className={styles.menuWrap} ref={dropdownRef}>
                        <button
                            className={styles.iconButton}
                            onClick={() => !isLoggingOut && setDropdownOpen(v => !v)}
                            title={adminUser.name}
                        >
                            <i className="fa-solid fa-bars" />
                        </button>

                        {dropdownOpen && !isLoggingOut && (
                            <div className={styles.dropdown}>
                                <div className={styles.ddHeader}>
                                    <span className={styles.ddName}>{adminUser.name}</span>
                                    <span className={styles.ddRole}>Administrator</span>
                                </div>
                                <div className={styles.ddDivider} />
                                <button className={styles.ddItem}
                                    onClick={() => { navigate("/profile"); setDropdownOpen(false); }}>
                                    <i className="fas fa-user" /> My Profile
                                </button>
                                <button className={styles.ddItem}
                                    onClick={() => { navigate("/settings"); setDropdownOpen(false); }}>
                                    <i className="fas fa-cog" /> Settings
                                </button>
                                <div className={styles.ddDivider} />
                                <button className={`${styles.ddItem} ${styles.ddLogout}`} onClick={handleLogout}>
                                    <i className="fas fa-right-from-bracket" /> Logout
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </header>

            {/* ── Page body ── */}
            <main className={styles.main}>

                <div className={styles.pageTitle}>
                    <h1>Admin Dashboard</h1>
                    <p>System management, moderation &amp; oversight</p>
                </div>

                {/* ── Stat cards ── */}
                <div className={styles.statsRow}>
                    {[
                        { label: "Total Users",    value: stats.totalUsers,                            icon: "fas fa-users" },
                        { label: "Open Reports",   value: stats.openReports,                           icon: "fas fa-flag" },
                        { label: "Transactions",   value: stats.transactions,                          icon: "fas fa-exchange-alt" },
                        { label: "Revenue (Paid)", value: `R ${stats.revenue.toLocaleString()}`,       icon: "fas fa-wallet" },
                    ].map(({ label, value, icon }) => (
                        <div key={label} className={styles.statCard}>
                            <span className={styles.statLabel}>{label}</span>
                            <span className={styles.statValue}>{value}</span>
                            <i className={`${icon} ${styles.statIcon}`} />
                        </div>
                    ))}
                </div>

                {/* ── Tabs ── */}
                <div className={styles.tabs}>
                    {[
                        { id: "users",      icon: "fas fa-users",       label: "Users" },
                        { id: "moderation", icon: "fas fa-shield-alt",  label: "Moderation" },
                        { id: "reports",    icon: "fas fa-flag",        label: "Reports" },
                        { id: "payments",   icon: "fas fa-credit-card", label: "Payments" },
                        { id: "suspended",  icon: "fas fa-ban",         label: "Suspended" },
                    ].map(t => (
                        <button
                            key={t.id}
                            className={`${styles.tab} ${activeTab === t.id ? styles.tabActive : ""}`}
                            onClick={() => setActiveTab(t.id)}
                        >
                            <i className={t.icon} /> {t.label}
                        </button>
                    ))}
                </div>

                {/* ── USERS TAB ── */}
                {activeTab === "users" && (
                    <div className={styles.tabContent}>
                        {pendingStaff.length > 0 && (
                            <div className={styles.card}>
                                <h3 className={styles.cardTitle}>Pending Staff Approvals</h3>
                                <div className={styles.approvalList}>
                                    {pendingStaff.map(u => (
                                        <div key={u.id} className={styles.approvalRow}>
                                            <div className={styles.approvalAvatar}>
                                                {u.photoURL
                                                    ? <img src={u.photoURL} alt="" />
                                                    : <span>{(u.firstName?.[0] || "?").toUpperCase()}</span>
                                                }
                                            </div>
                                            <div className={styles.approvalInfo}>
                                                <span className={styles.approvalName}>
                                                    {u.firstName} {u.lastName}
                                                </span>
                                                <span className={styles.approvalEmail}>{u.email}</span>
                                            </div>
                                            <div className={styles.approvalActions}>
                                                <button className={styles.btnApprove} onClick={() => approveStaff(u.id)}>
                                                    Approve
                                                </button>
                                                <button className={styles.btnReject} onClick={() => rejectStaff(u.id)}>
                                                    Reject
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div className={styles.card}>
                            <div className={styles.cardHeader}>
                                <h3 className={styles.cardTitle}>All users</h3>
                                <div className={styles.searchWrap}>
                                    <i className="fas fa-search" />
                                    <input
                                        className={styles.searchInput}
                                        type="text"
                                        placeholder="Search users…"
                                        value={userSearch}
                                        onChange={e => setUserSearch(e.target.value)}
                                    />
                                </div>
                            </div>
                            <div className={styles.userList}>
                                {filteredUsers.length === 0 && (
                                    <p className={styles.emptyNote}>No users found.</p>
                                )}
                                {filteredUsers.map(u => (
                                    <div key={u.id} className={styles.userRow}>
                                        <div className={styles.userAvatar}>
                                            {u.photoURL
                                                ? <img src={u.photoURL} alt="" />
                                                : <span>{(u.firstName?.[0] || "?").toUpperCase()}</span>
                                            }
                                        </div>
                                        <div className={styles.userInfo}>
                                            <span className={styles.userName}>{u.firstName} {u.lastName}</span>
                                            {/* Only show rating for students, not for admin or staff */}
                                            {(u.userType === "student" || !u.userType) && (
                                                <span className={styles.userMeta}>
                                                    <i className="fas fa-star" style={{ color: "#fbbf24", fontSize: "0.65rem" }} />
                                                    {" "}{u.rating || 0} ({u.totalRatings || 0} Trades)
                                                </span>
                                            )}
                                        </div>
                                        <span className={styles.userType}>{u.userType || "Student"}</span>
                                        <button
                                            className={u.suspended ? styles.btnUnsuspend : styles.btnSuspend}
                                            onClick={() => toggleSuspend(u.id, u.suspended)}
                                        >
                                            {u.suspended ? "Unsuspend" : "Suspend"}
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {/* ── MODERATION TAB ── */}
                {activeTab === "moderation" && (
                    <div className={styles.tabContent}>
                        <div className={styles.card}>
                            <div className={styles.cardHeader}>
                                <h3 className={styles.cardTitle}>Listing Moderation</h3>
                                <div className={styles.searchWrap}>
                                    <i className="fas fa-search" />
                                    <input
                                        className={styles.searchInput}
                                        type="text"
                                        placeholder="Search listings…"
                                        value={listingSearch}
                                        onChange={e => setListingSearch(e.target.value)}
                                    />
                                </div>
                            </div>
                            {filteredListings.length === 0
                                ? <p className={styles.emptyNote}>{listingSearch ? "No listings match your search." : "No listings to moderate."}</p>
                                : (
                                    <div className={styles.modList}>
                                        {filteredListings.map(l => (
                                            <div key={l.id} className={styles.modRow}>
                                                <div className={styles.modThumb}>
                                                    {(l.imageUrl || l.photos?.[0])
                                                        ? <img src={l.imageUrl || l.photos[0]} alt="" />
                                                        : <i className="fas fa-image" />
                                                    }
                                                </div>
                                                <div className={styles.modInfo}>
                                                    <span className={styles.modTitle}>{l.title}</span>
                                                    <span className={styles.modMeta}>
                                                        {l.category} · R {Number(l.price || 0).toLocaleString()}
                                                    </span>
                                                </div>
                                                <span className={`${styles.modStatus} ${styles[l.status || "active"]}`}>
                                                    {l.status || "active"}
                                                </span>
                                                <button
                                                    className={styles.btnReject}
                                                    onClick={async () => {
                                                        const ok = window.confirm(
                                                            "Are you sure you want to remove this listing? " +
                                                            "This action is PERMANENT and cannot be undone."
                                                        );
                                                        if (!ok) return;
                                                        try {
                                                            await deleteDoc(doc(db, "listings", l.id));
                                                            setListings(prev => prev.filter(x => x.id !== l.id));
                                                        } catch (err) {
                                                            console.error("Error deleting listing:", err);
                                                            alert("Failed to delete listing. Please try again.");
                                                        }
                                                    }}
                                                    disabled={l.status === "removed"}
                                                >
                                                    Remove
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )
                            }
                        </div>
                    </div>
                )}

                {/* ── PAYMENTS TAB ── */}
                {activeTab === "payments" && (
                    <div className={styles.tabContent}>
                        <div className={styles.card}>
                            <h3 className={styles.cardTitle}>Completed Transactions</h3>
                            {listings.filter(l => l.status === "sold" || l.status === "traded").length === 0
                                ? <p className={styles.emptyNote}>No completed transactions yet.</p>
                                : (
                                    <div className={styles.payTable}>
                                        <div className={styles.payHeader}>
                                            <span>Item</span>
                                            <span>Type</span>
                                            <span>Amount</span>
                                            <span>Status</span>
                                        </div>
                                        {listings
                                            .filter(l => l.status === "sold" || l.status === "traded")
                                            .map(l => (
                                                <div key={l.id} className={styles.payRow}>
                                                    <span className={styles.payTitle}>{l.title}</span>
                                                    <span className={styles.payType}>{l.listingType || "—"}</span>
                                                    <span className={styles.payAmount}>
                                                        R {Number(l.price || 0).toLocaleString()}
                                                    </span>
                                                    <span className={`${styles.payStatus} ${styles[l.status]}`}>
                                                        {l.status}
                                                    </span>
                                                </div>
                                            ))
                                        }
                                    </div>
                                )
                            }
                        </div>
                    </div>
                )}

                {/* ── REPORTS TAB ── */}
                {activeTab === "reports" && (
                    <div className={styles.tabContent}>
                        <div className={styles.card}>
                            <div className={styles.cardHeader}>
                                <h3 className={styles.cardTitle}>
                                    Pending Reports
                                    {reports.filter(r => r.status === "pending").length > 0 && (
                                        <span style={{ marginLeft: 10, background: "#dc2626", color: "#fff", borderRadius: 20, padding: "2px 10px", fontSize: "0.72rem", fontWeight: 700 }}>
                                            {reports.filter(r => r.status === "pending").length}
                                        </span>
                                    )}
                                </h3>
                                <div className={styles.searchWrap}>
                                    <i className="fas fa-search" />
                                    <input
                                        className={styles.searchInput}
                                        type="text"
                                        placeholder="Search reported names…"
                                        value={reportSearch}
                                        onChange={e => setReportSearch(e.target.value)}
                                    />
                                </div>
                            </div>

                            {filteredReports.filter(r => r.status === "pending").length === 0 ? (
                                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: "32px 0" }}>
                                    <i className="fas fa-check-circle" style={{ fontSize: "2rem", color: "#16a34a" }} />
                                    <p className={styles.emptyNote}>{reportSearch ? "No reports match your search." : "No pending reports — all clear!"}</p>
                                </div>
                            ) : (
                                <div className={styles.modList}>
                                    {filteredReports.filter(r => r.status === "pending").map(r => (
                                        <div key={r.id} className={styles.modRow} style={{ alignItems: "flex-start", gap: 14 }}>
                                            <div style={{ fontSize: "1.4rem", flexShrink: 0, width: 36, textAlign: "center" }}>
                                                {r.reportType === "listing" ? "🛍️" : r.reportType === "review" ? "⭐" : "👤"}
                                            </div>
                                            <div className={styles.modInfo} style={{ flex: 1 }}>
                                                <span className={styles.modTitle}>
                                                    {r.reportedName || r.reportedId}
                                                    <span style={{ marginLeft: 8, fontSize: "0.68rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", background: "#eff6ff", color: "#2563eb", padding: "2px 8px", borderRadius: 20 }}>
                                                        {r.reportType}
                                                    </span>
                                                </span>
                                                <span className={styles.modMeta}>{r.reason}</span>
                                                {r.details && <span style={{ fontSize: "0.78rem", color: "#94a3b8", fontStyle: "italic" }}>"{r.details}"</span>}
                                                <span style={{ fontSize: "0.73rem", color: "#94a3b8", marginTop: 2 }}>
                                                    Reported by {r.reporterName} ·{" "}
                                                    {r.createdAt?.toDate
                                                        ? r.createdAt.toDate().toLocaleDateString("en-ZA", { day: "numeric", month: "short" })
                                                        : "Recently"}
                                                </span>
                                            </div>
                                            <div style={{ display: "flex", flexDirection: "column", gap: 6, flexShrink: 0 }}>
                                                <button className={styles.btnApprove} onClick={async () => {
                                                    await updateDoc(doc(db, "reports", r.id), { status: "resolved", resolution: "dismiss", resolvedAt: new Date() });
                                                }}>Dismiss</button>
                                                {r.reportType === "user" && (
                                                    <button className={styles.btnSuspend} onClick={async () => {
                                                        const batch = writeBatch(db);
                                                        batch.update(doc(db, "users", r.reportedId), { suspended: true });
                                                        batch.update(doc(db, "reports", r.id), { status: "resolved", resolution: "suspend_user", resolvedAt: new Date() });
                                                        await batch.commit();
                                                        setAllUsers(prev => prev.map(u => u.id === r.reportedId ? { ...u, suspended: true } : u));
                                                    }}>Suspend User</button>
                                                )}
                                                {r.reportType === "listing" && (
                                                    <button className={styles.btnReject} onClick={async () => {
                                                        const batch = writeBatch(db);
                                                        batch.delete(doc(db, "listings", r.reportedId));
                                                        batch.update(doc(db, "reports", r.id), { status: "resolved", resolution: "remove_listing", resolvedAt: new Date() });
                                                        await batch.commit();
                                                        setListings(prev => prev.filter(x => x.id !== r.reportedId));
                                                    }}>Remove Listing</button>
                                                )}
                                                {r.reportType === "review" && (
                                                    <button className={styles.btnReject} onClick={async () => {
                                                        const batch = writeBatch(db);
                                                        batch.delete(doc(db, "reviews", r.reportedId));
                                                        batch.update(doc(db, "reports", r.id), { status: "resolved", resolution: "remove_review", resolvedAt: new Date() });
                                                        await batch.commit();
                                                    }}>Remove Review</button>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Resolved reports */}
                        {filteredReports.filter(r => r.status !== "pending").length > 0 && (
                            <div className={styles.card}>
                                <h3 className={styles.cardTitle}>Resolved Reports</h3>
                                <div className={styles.modList}>
                                    {filteredReports.filter(r => r.status !== "pending").map(r => (
                                        <div key={r.id} className={styles.modRow} style={{ opacity: 0.6 }}>
                                            <div style={{ fontSize: "1.2rem", flexShrink: 0 }}>
                                                {r.reportType === "listing" ? "🛍️" : r.reportType === "review" ? "⭐" : "👤"}
                                            </div>
                                            <div className={styles.modInfo}>
                                                <span className={styles.modTitle}>{r.reportedName || r.reportedId}</span>
                                                <span className={styles.modMeta}>{r.reason}</span>
                                            </div>
                                            <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "#16a34a", background: "#f0fdf4", padding: "4px 10px", borderRadius: 20 }}>
                                                ✓ {r.resolution || "resolved"}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* ── SUSPENDED USERS TAB ── */}
                {activeTab === "suspended" && (
                    <div className={styles.tabContent}>
                        <div className={styles.card}>
                            <h3 className={styles.cardTitle}>
                                Suspended Users
                                {suspendedUsers.length > 0 && (
                                    <span style={{ marginLeft: 10, background: "#dc2626", color: "#fff", borderRadius: 20, padding: "2px 10px", fontSize: "0.72rem", fontWeight: 700 }}>
                                        {suspendedUsers.length}
                                    </span>
                                )}
                            </h3>
                            {suspendedUsers.length === 0 ? (
                                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: "32px 0" }}>
                                    <i className="fas fa-check-circle" style={{ fontSize: "2rem", color: "#16a34a" }} />
                                    <p className={styles.emptyNote}>No suspended users.</p>
                                </div>
                            ) : (
                                <div className={styles.userList}>
                                    {suspendedUsers.map(u => (
                                        <div key={u.id} className={styles.userRow} style={{ opacity: 0.85 }}>
                                            <div className={styles.userAvatar}>
                                                {u.photoURL
                                                    ? <img src={u.photoURL} alt="" />
                                                    : <span>{(u.firstName?.[0] || "?").toUpperCase()}</span>
                                                }
                                            </div>
                                            <div className={styles.userInfo}>
                                                <span className={styles.userName}>{u.firstName} {u.lastName}</span>
                                                <span className={styles.userMeta}>{u.email}</span>
                                            </div>
                                            <span style={{ fontSize: "0.72rem", color: "#dc2626", fontWeight: 700, background: "#fef2f2", padding: "3px 10px", borderRadius: 20 }}>SUSPENDED</span>
                                            <button
                                                className={styles.btnUnsuspend}
                                                onClick={() => toggleSuspend(u.id, true)}
                                            >
                                                Unsuspend
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                )}

            </main>

            {/* ── Logout overlay ── */}
            {isLoggingOut && (
                <div className={styles.logoutOverlay}>
                    <div className={styles.logoutBox}>
                        <i className="fas fa-spinner fa-spin" />
                        <p>Logging out…</p>
                    </div>
                </div>
            )}
        </div>
    );
}