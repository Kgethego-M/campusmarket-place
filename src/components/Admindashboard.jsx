import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { auth, db } from "../firebase";
import { signOut, onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, collection, getDocs, query, orderBy, updateDoc, where } from "firebase/firestore";
import styles from "./Admindashboard.module.css";

export default function AdminDashboard() {
    const navigate = useNavigate();
    const dropdownRef = useRef(null);

    const [activeTab, setActiveTab] = useState("users");
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const [isLoggingOut, setIsLoggingOut] = useState(false);
    const [userSearch, setUserSearch] = useState("");

    const [adminUser, setAdminUser] = useState({ name: "Admin", email: "", photoURL: "", initials: "A" });
    const [stats, setStats] = useState({ totalUsers: 0, openReports: 0, transactions: 0, revenue: 0 });
    const [pendingStaff, setPendingStaff] = useState([]);
    const [allUsers, setAllUsers] = useState([]);
    const [listings, setListings] = useState([]);
    const [loading, setLoading] = useState(true);

    // ── Auth guard + load admin profile ────────────────────────────────────
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
                    name: `${fn} ${ln}`.trim(),
                    email: data.email || user.email,
                    photoURL: data.photoURL || user.photoURL || "",
                    initials: `${fn[0] || "A"}${ln[0] || ""}`.toUpperCase()
                });
            } catch (e) { console.error(e); }
        });
        return () => unsub();
    }, [navigate]);

    // ── Fetch dashboard data ────────────────────────────────────────────────
    useEffect(() => {
        async function load() {
            try {
                // All users
                const usersSnap = await getDocs(collection(db, "users"));
                const users = usersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
                setAllUsers(users);

                // Pending staff approvals (userType === "staff" && !approved)
                const pending = users.filter(u => u.userType === "staff" && !u.approved);
                setPendingStaff(pending);

                // Listings
                const listSnap = await getDocs(query(collection(db, "listings"), orderBy("timestamp", "desc")));
                const listData = listSnap.docs.map(d => ({ id: d.id, ...d.data() }));
                setListings(listData);

                // Stats
                const sold = listData.filter(l => l.status === "sold");
                const revenue = sold.reduce((sum, l) => sum + (Number(l.price) || 0), 0);
                const reports = users.filter(u => u.suspended).length; // open reports = suspended users as proxy

                setStats({
                    totalUsers: users.length,
                    openReports: reports,
                    transactions: sold.length,
                    revenue: revenue
                });
            } catch (e) {
                console.error("Dashboard load error:", e);
            } finally {
                setLoading(false);
            }
        }
        load();
    }, []);

    // ── Actions ─────────────────────────────────────────────────────────────
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
            openReports: !suspended ? prev.openReports + 1 : Math.max(0, prev.openReports - 1)
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

    // Close dropdown on outside click
    useEffect(() => {
        const handler = (e) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target))
                setDropdownOpen(false);
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, []);

    const filteredUsers = allUsers.filter(u =>
        `${u.firstName} ${u.lastName} ${u.email}`.toLowerCase().includes(userSearch.toLowerCase())
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
                    <span className={styles.navBreadcrumb}>
                        <i className="fas fa-th-large" /> Dashboard
                    </span>
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
                            <i className="fa-solid fa-bars"></i>
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
                                <button className={`${styles.ddItem} ${styles.ddLogout}`}
                                    onClick={handleLogout}>
                                    <i className="fas fa-right-from-bracket" /> Logout
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </header>

            {/* ── Page body ── */}
            <main className={styles.main}>

                {/* Page title */}
                <div className={styles.pageTitle}>
                    <h1>Admin DashBoard</h1>
                    <p>System management, moderation &amp; oversight</p>
                </div>

                {/* Stat cards */}
                <div className={styles.statsRow}>
                    {[
                        { label: "Total Users",     value: stats.totalUsers,    icon: "fas fa-users" },
                        { label: "Open Reports",    value: stats.openReports,   icon: "fas fa-flag" },
                        { label: "Transactions",    value: stats.transactions,  icon: "fas fa-exchange-alt" },
                        { label: "Revenue (Paid)",  value: `R ${stats.revenue.toLocaleString()}`, icon: "fas fa-wallet" },
                    ].map(({ label, value, icon }) => (
                        <div key={label} className={styles.statCard}>
                            <span className={styles.statLabel}>{label}</span>
                            <span className={styles.statValue}>{value}</span>
                            <i className={`${icon} ${styles.statIcon}`} />
                        </div>
                    ))}
                </div>

                {/* Tabs */}
                <div className={styles.tabs}>
                    {[
                        { id: "users",      icon: "fas fa-users",         label: "Users" },
                        { id: "moderation", icon: "fas fa-shield-alt",    label: "Moderation" },
                        { id: "payments",   icon: "fas fa-credit-card",   label: "Payments" },
                        { id: "settings",   icon: "fas fa-cog",           label: "Settings" },
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

                        {/* Pending Staff Approvals */}
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
                                                <button
                                                    className={styles.btnApprove}
                                                    onClick={() => approveStaff(u.id)}
                                                >
                                                    Approve
                                                </button>
                                                <button
                                                    className={styles.btnReject}
                                                    onClick={() => rejectStaff(u.id)}
                                                >
                                                    Reject
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* All users table */}
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
                                            <span className={styles.userName}>
                                                {u.firstName} {u.lastName}
                                            </span>
                                            <span className={styles.userMeta}>
                                                <i className="fas fa-star" style={{ color: "#fbbf24", fontSize: "0.65rem" }} />
                                                {" "}{u.rating || 0} ({u.totalRatings || 0} Trades)
                                            </span>
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
                            <h3 className={styles.cardTitle}>Listing Moderation</h3>
                            {listings.length === 0
                                ? <p className={styles.emptyNote}>No listings to moderate.</p>
                                : (
                                    <div className={styles.modList}>
                                        {listings.map(l => (
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
                                                        await updateDoc(doc(db, "listings", l.id), { status: "removed" });
                                                        setListings(prev => prev.map(x => x.id === l.id ? { ...x, status: "removed" } : x));
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

                {/* ── SETTINGS TAB ── */}
                {activeTab === "settings" && (
                    <div className={styles.tabContent}>
                        <div className={styles.card}>
                            <h3 className={styles.cardTitle}>Platform Settings</h3>
                            <p className={styles.emptyNote}>
                                Settings panel coming soon. Here you'll be able to configure allowed email domains, listing categories, and moderation rules.
                            </p>
                        </div>
                    </div>
                )}
            </main>

            {/* Logout overlay */}
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