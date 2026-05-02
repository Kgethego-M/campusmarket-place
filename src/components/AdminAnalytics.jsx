import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { auth, db } from "../firebase";
import { signOut, onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, collection, getDocs, query, where, orderBy, onSnapshot } from "firebase/firestore";
import styles from "./AdminAnalytics.module.css";

export default function AdminAnalytics() {
    const navigate = useNavigate();
    const dropdownRef = useRef(null);

    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [adminName, setAdminName] = useState("Admin");
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const [isLoggingOut, setIsLoggingOut] = useState(false);
    const [unreadReports, setUnreadReports] = useState(0); // Add this state

    // ── Auth guard ────────────────────────────────────────────────
    useEffect(() => {
        const unsub = onAuthStateChanged(auth, async (user) => {
            if (!user) { navigate("/login"); return; }
            try {
                const snap = await getDoc(doc(db, "users", user.uid));
                const d = snap.exists() ? snap.data() : {};
                if (d.userType !== "admin") { navigate("/"); return; }
                setAdminName(d.firstName || user.displayName?.split(" ")[0] || "Admin");
            } catch (e) { console.error(e); }
        });
        return () => unsub();
    }, [navigate]);

    // ── Real-time reports listener for unread count ──
    useEffect(() => {
        const q = query(collection(db, "reports"), orderBy("createdAt", "desc"));
        const unsub = onSnapshot(q, (snap) => {
            const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            const pending = data.filter(r => r.status === "pending").length;
            setUnreadReports(pending);
        });
        return () => unsub();
    }, []);

    // ── Load analytics data ───────────────────────────────────────
    useEffect(() => {
        (async () => {
            setLoading(true);
            setError("");
            try {
                const [usersSnap, listSnap, bookingsSnap, txnSnap, reviewsSnap] = await Promise.all([
                    getDocs(collection(db, "users")),
                    getDocs(collection(db, "listings")),
                    getDocs(collection(db, "bookings")),
                    getDocs(collection(db, "transactions")),
                    getDocs(collection(db, "reviews")),
                ]);

                const users = usersSnap.docs.map(d => d.data());
                const lists = listSnap.docs.map(d => d.data());
                const bookings = bookingsSnap.docs.map(d => d.data());
                const txns = txnSnap.docs.map(d => d.data());
                const reviews = reviewsSnap.docs.map(d => d.data());

                const userTypes = users.reduce((acc, u) => {
                    const t = u.userType || "student";
                    acc[t] = (acc[t] || 0) + 1;
                    return acc;
                }, {});

                const byCategory = lists.reduce((acc, l) => {
                    const c = l.category || "Uncategorised";
                    acc[c] = (acc[c] || 0) + 1;
                    return acc;
                }, {});

                const byStatus = lists.reduce((acc, l) => {
                    const s = l.status || "active";
                    acc[s] = (acc[s] || 0) + 1;
                    return acc;
                }, {});

                const revenueByMonth = {};
                lists
                    .filter(l => l.status === "sold" && l.timestamp)
                    .forEach(l => {
                        const d = l.timestamp?.toDate?.() || new Date(l.timestamp);
                        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
                        revenueByMonth[key] = (revenueByMonth[key] || 0) + (Number(l.price) || 0);
                    });

                const bookingsByDay = { Mon: 0, Tue: 0, Wed: 0, Thu: 0, Fri: 0, Sat: 0, Sun: 0 };
                const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
                bookings.forEach(b => {
                    if (b.date) {
                        const day = dayNames[new Date(b.date + "T00:00:00").getDay()];
                        if (bookingsByDay[day] !== undefined) bookingsByDay[day]++;
                    }
                });

                const txnByStatus = txns.reduce((acc, t) => {
                    const s = t.status || "unknown";
                    acc[s] = (acc[s] || 0) + 1;
                    return acc;
                }, {});

                const soldListings = lists.filter(l => l.status === "sold");

                // ── Moderation summary data ──
                const abusiveReviews = reviews.filter(r => r.flagged || r.abusive === true).length;
                const suspiciousListings = lists.filter(l => l.flagged || l.reported === true).length;
                const reportedUsers = users.filter(u => u.reported || u.flagged === true).length;

                // ── Average utilisation (from bookings) ──
                let avgUtilisation = 0;
                try {
                    const configSnap = await getDoc(doc(db, "facilityConfig", "default"));
                    const config = configSnap.exists() ? configSnap.data() : { slotsPerHour: 1 };
                    const slotsPerHour = config.slotsPerHour || 1;

                    // Group bookings by date to calculate daily utilisation
                    const bookingsByDate = {};
                    bookings.forEach(b => {
                        if (b.date && b.timeSlot) {
                            if (!bookingsByDate[b.date]) bookingsByDate[b.date] = [];
                            bookingsByDate[b.date].push(b.timeSlot);
                        }
                    });

                    // Get unique dates with bookings
                    const datesWithBookings = Object.keys(bookingsByDate);
                    if (datesWithBookings.length > 0) {
                        let totalUtilisation = 0;
                        for (const date of datesWithBookings) {
                            const uniqueSlots = new Set(bookingsByDate[date]);
                            const dailyUtilisation = (uniqueSlots.size / slotsPerHour) * 100;
                            totalUtilisation += Math.min(dailyUtilisation, 100);
                        }
                        avgUtilisation = Math.round(totalUtilisation / datesWithBookings.length);
                    }
                } catch (e) {
                    console.error("Error calculating utilisation:", e);
                }

                setData({
                    userTypes,
                    byCategory,
                    byStatus,
                    revenueByMonth,
                    bookingsByDay,
                    txnByStatus,
                    totalListings: lists.length,
                    totalBookings: bookings.length,
                    totalTxns: txns.length,
                    totalRevenue: soldListings.reduce((s, l) => s + (Number(l.price) || 0), 0),
                    abusiveReviews,
                    suspiciousListings,
                    reportedUsers,
                    avgUtilisation,
                });
            } catch (e) {
                console.error(e);
                setError("Failed to load analytics: " + e.message);
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    // ── Horizontal Bar Chart (left to right) ──
    function HorizontalBarChart({ data: chartData, colors = ["#6AA6DA", "#34d399", "#f59e0b", "#a78bfa", "#f87171"] }) {
        const entries = Object.entries(chartData).sort((a, b) => b[1] - a[1]);
        if (!entries.length) return <p className={styles.emptyNote}>No data yet.</p>;
        const max = Math.max(...entries.map(([, v]) => v), 1);
        const palette = colors;

        return (
            <div className={styles.horizontalChart}>
                {entries.map(([label, value], idx) => (
                    <div key={label} className={styles.horizRow}>
                        <span className={styles.horizLabel}>{label}</span>
                        <div className={styles.horizBarTrack}>
                            <div
                                className={styles.horizBarFill}
                                style={{
                                    width: `${(value / max) * 100}%`,
                                    backgroundColor: palette[idx % palette.length]
                                }}
                            />
                        </div>
                        <span className={styles.horizValue}>{value}</span>
                        <span className={styles.horizPct}>
                            {Math.round((value / max) * 100)}%
                        </span>
                    </div>
                ))}
            </div>
        );
    }

    // ── Bar chart ─────────────────────────────────────────────────
    function BarChart({ data: chartData, color = "#6AA6DA", height = 140 }) {
        const entries = Object.entries(chartData);
        if (!entries.length) return <p className={styles.emptyNote}>No data yet.</p>;
        const max = Math.max(...entries.map(([, v]) => v), 1);
        return (
            <div className={styles.barChart}>
                {entries.map(([label, value]) => (
                    <div key={label} className={styles.barGroup}>
                        <span className={styles.barValue}>{value}</span>
                        <div className={styles.barTrack} style={{ height }}>
                            <div
                                className={styles.barFill}
                                style={{ height: `${(value / max) * 100}%`, background: color }}
                            />
                        </div>
                        <span className={styles.barLabel}>{label}</span>
                    </div>
                ))}
            </div>
        );
    }

    // ── Breakdown rows ────────────────────────────────────────────
    function Breakdown({ data: bdData, colors }) {
        const entries = Object.entries(bdData);
        const total = entries.reduce((s, [, v]) => s + v, 0) || 1;
        const palette = colors || ["#6AA6DA", "#34d399", "#f59e0b", "#f87171", "#a78bfa", "#fb923c"];
        return (
            <div className={styles.breakdown}>
                {entries.map(([label, value], i) => (
                    <div key={label} className={styles.bdRow}>
                        <span className={styles.bdDot} style={{ background: palette[i % palette.length] }} />
                        <span className={styles.bdLabel}>{label}</span>
                        <div className={styles.bdBar}>
                            <div
                                className={styles.bdFill}
                                style={{ width: `${(value / total) * 100}%`, background: palette[i % palette.length] }}
                            />
                        </div>
                        <span className={styles.bdCount}>{value}</span>
                        <span className={styles.bdPct}>{Math.round((value / total) * 100)}%</span>
                    </div>
                ))}
            </div>
        );
    }

    const handleLogout = async () => {
        setIsLoggingOut(true);
        setTimeout(async () => {
            try {
                localStorage.removeItem("loggedInUserId");
                await auth.signOut();
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

    function renderNav() {
        return (
            <header className={styles.navbar}>
                <div className={styles.navLeft}>
                    <div className={styles.logoBox}>
                        <i className="fa-solid fa-shop" />
                    </div>
                    <span className={styles.logoText}>CampusMarket</span>
                    <span className={styles.adminPill}>Admin</span>
                </div>

                <div className={styles.navCenter}>
                    <button className={styles.navLink} onClick={() => navigate("/admin")}>
                        <i className="fas fa-th-large" /> Dashboard
                    </button>
                    <span className={styles.navActive}>
                        <i className="fas fa-chart-bar" /> Analytics
                    </span>
                    <button className={styles.navLink} onClick={() => navigate("/admin/reports")}>
                        <i className="fas fa-flag" /> Reports
                        {unreadReports > 0 && (
                            <span className={styles.reportBadge}>{unreadReports}</span>
                        )}
                    </button>
                    <button className={styles.navLink} onClick={() => navigate("/admin/moderation-summary")}>
                        <i className="fas fa-chart-simple" /> Moderation Summary
                    </button>
                </div>

                <div className={styles.navRight}>
                    <div className={styles.menuWrap} ref={dropdownRef}>
                        <button
                            className={styles.iconButton}
                            onClick={() => !isLoggingOut && setDropdownOpen(v => !v)}
                            title={adminName}
                        >
                            <i className="fa-solid fa-bars" />
                        </button>

                        {dropdownOpen && !isLoggingOut && (
                            <div className={styles.dropdown}>
                                <div className={styles.ddHeader}>
                                    <span className={styles.ddName}>{adminName}</span>
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
        );
    }

    // ── Loading ───────────────────────────────────────────────────
    if (loading) return (
        <div className={styles.shell}>
            {renderNav()}
            <main className={styles.main}>
                <div className={styles.loadingWrap}>
                    <div className={styles.spinner} />
                    <p>Loading analytics…</p>
                </div>
            </main>
        </div>
    );

    // ── Error ─────────────────────────────────────────────────────
    if (error) return (
        <div className={styles.shell}>
            {renderNav()}
            <main className={styles.main}>
                <div className={styles.errorBox}>{error}</div>
            </main>
        </div>
    );

    return (
        <div className={styles.shell}>
            {renderNav()}
            <main className={styles.main}>

                <div className={styles.pageTitle}>
                    <h1><i className="fas fa-chart-bar" style={{ marginRight: 10, color: "#6AA6DA" }} />Analytics</h1>
                    <p>Live platform overview — users, listings, bookings &amp; revenue</p>
                </div>

                {/* ── Summary stat cards ── */}
                <div className={styles.statsRow}>
                    {[
                        { label: "Total Listings", value: data.totalListings, icon: "fas fa-tag", color: "#6AA6DA" },
                        { label: "Total Bookings", value: data.totalBookings, icon: "fas fa-calendar-check", color: "#34d399" },
                        { label: "Total Transactions", value: data.totalTxns, icon: "fas fa-exchange-alt", color: "#f59e0b" },
                        { label: "Total Revenue", value: `R ${data.totalRevenue.toLocaleString()}`, icon: "fas fa-wallet", color: "#a78bfa" },
                        { label: "Avg Utilisation", value: `${data.avgUtilisation || 0}%`, icon: "fas fa-chart-line", color: "#f97316" },
                    ].map(({ label, value, icon, color }) => (
                        <div key={label} className={styles.statCard} style={{ borderTop: `3px solid ${color}` }}>
                            <i className={icon} style={{ color, fontSize: "1.4rem", marginBottom: 8 }} />
                            <span className={styles.statValue}>{value}</span>
                            <span className={styles.statLabel}>{label}</span>
                        </div>
                    ))}
                </div>

                {/* ── Row 1: User breakdown + Listing status ── */}
                <div className={styles.grid2}>
                    <div className={styles.card}>
                        <h3 className={styles.cardTitle}>
                            <i className="fas fa-users" style={{ marginRight: 8, color: "#6AA6DA" }} />
                            User breakdown
                        </h3>
                        <Breakdown data={data.userTypes} />
                    </div>
                    <div className={styles.card}>
                        <h3 className={styles.cardTitle}>
                            <i className="fas fa-tag" style={{ marginRight: 8, color: "#34d399" }} />
                            Listing status
                        </h3>
                        <Breakdown
                            data={data.byStatus}
                            colors={["#6AA6DA", "#34d399", "#a78bfa", "#f87171", "#f59e0b"]}
                        />
                    </div>
                </div>

                {/* ── Moderation Summary Row ── */}
                <div className={styles.moderationRow}>
                    <div className={styles.card}>
                        <h3 className={styles.cardTitle}>
                            <i className="fas fa-shield-alt" style={{ marginRight: 8, color: "#ef4444" }} />
                            Moderation Summary
                        </h3>
                        <div className={styles.modStats}>
                            <div className={styles.modStat}>
                                <i className="fas fa-flag" style={{ color: "#f97316" }} />
                                <span className={styles.modStatValue}>{data.abusiveReviews}</span>
                                <span className={styles.modStatLabel}>Abusive Reviews</span>
                            </div>
                            <div className={styles.modStat}>
                                <i className="fas fa-exclamation-triangle" style={{ color: "#eab308" }} />
                                <span className={styles.modStatValue}>{data.suspiciousListings}</span>
                                <span className={styles.modStatLabel}>Suspicious Listings</span>
                            </div>
                            <div className={styles.modStat}>
                                <i className="fas fa-user-slash" style={{ color: "#ef4444" }} />
                                <span className={styles.modStatValue}>{data.reportedUsers}</span>
                                <span className={styles.modStatLabel}>Reported Users</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* ── Drop-off bookings by day ── */}
                <div className={styles.card}>
                    <h3 className={styles.cardTitle}>
                        <i className="fas fa-calendar-alt" style={{ marginRight: 8, color: "#f59e0b" }} />
                        Drop-off bookings by day of week
                    </h3>
                    <BarChart data={data.bookingsByDay} color="#6AA6DA" height={160} />
                </div>

                {/* ── Popular Categories (Horizontal) ── */}
                <div className={styles.card}>
                    <h3 className={styles.cardTitle}>
                        <i className="fas fa-layer-group" style={{ marginRight: 8, color: "#a78bfa" }} />
                        Popular Categories
                    </h3>
                    <HorizontalBarChart data={data.byCategory} />
                </div>

                {/* ── Revenue by month ── */}
                <div className={styles.card}>
                    <h3 className={styles.cardTitle}>
                        <i className="fas fa-chart-line" style={{ marginRight: 8, color: "#34d399" }} />
                        Revenue by month
                    </h3>
                    <div className={styles.revenueContainer}>
                        {Object.keys(data.revenueByMonth).length === 0
                            ? <p className={styles.emptyNote}>No revenue data yet.</p>
                            : <BarChart
                                data={Object.fromEntries(
                                    Object.entries(data.revenueByMonth)
                                        .sort(([a], [b]) => a.localeCompare(b))
                                        .map(([k, v]) => [k.slice(5), v])
                                )}
                                color="#34d399"
                                height={140}
                            />
                        }
                    </div>
                </div>

                {/* ── Transaction status breakdown ── */}
                <div className={styles.card}>
                    <h3 className={styles.cardTitle}>
                        <i className="fas fa-exchange-alt" style={{ marginRight: 8, color: "#f87171" }} />
                        Transaction status breakdown
                    </h3>
                    <Breakdown
                        data={data.txnByStatus}
                        colors={["#6AA6DA", "#34d399", "#f59e0b", "#f87171", "#a78bfa"]}
                    />
                </div>

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