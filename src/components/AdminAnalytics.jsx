import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { auth, db } from "../firebase";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, collection, getDocs } from "firebase/firestore";
import { getRevenueAnalytics } from "../services/revenueService";
import styles from "./AdminAnalytics.module.css";
import AdminNavbar from "./AdminNavbar";

export default function AdminAnalytics() {
    const navigate = useNavigate();

    const [data, setData] = useState(null);
    const [revenueData, setRevenueData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [adminUser, setAdminUser] = useState({ name: "Admin", email: "", initials: "A" });

    // ── Auth guard ────────────────────────────────────────────────
    useEffect(() => {
        const unsub = onAuthStateChanged(auth, async (user) => {
            if (!user) { navigate("/login"); return; }
            try {
                const snap = await getDoc(doc(db, "users", user.uid));
                const d = snap.exists() ? snap.data() : {};
                if (d.userType !== "admin") { navigate("/"); return; }
                const fn = d.firstName || user.displayName?.split(" ")[0] || "Admin";
                const ln = d.lastName || user.displayName?.split(" ").slice(1).join(" ") || "";
                setAdminUser({
                    name: `${fn} ${ln}`.trim(),
                    email: d.email || user.email,
                    initials: `${fn[0] || "A"}${ln[0] || ""}`.toUpperCase(),
                });
            } catch (e) { console.error(e); }
        });
        return () => unsub();
    }, [navigate]);

    // ── Load analytics data ───────────────────────────────────────
    useEffect(() => {
        (async () => {
            setLoading(true);
            setError("");
            try {
                const [usersSnap, listSnap, bookingsSnap, txnSnap, revenueStats] = await Promise.all([
                    getDocs(collection(db, "users")),
                    getDocs(collection(db, "listings")),
                    getDocs(collection(db, "bookings")),
                    getDocs(collection(db, "transactions")),
                    getRevenueAnalytics(),
                ]);

                const users = usersSnap.docs.map(d => d.data());
                const lists = listSnap.docs.map(d => d.data());
                const bookings = bookingsSnap.docs.map(d => d.data());
                const txns = txnSnap.docs.map(d => d.data());

                // Set revenue data from dedicated analytics collection
                setRevenueData(revenueStats);

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

                let avgUtilisation = 0;
                try {
                    const configSnap = await getDoc(doc(db, "facilityConfig", "default"));
                    const config = configSnap.exists() ? configSnap.data() : { slotsPerHour: 1 };
                    const slotsPerHour = config.slotsPerHour || 1;
                    const bookingsByDate = {};
                    bookings.forEach(b => {
                        if (b.date && b.timeSlot) {
                            if (!bookingsByDate[b.date]) bookingsByDate[b.date] = [];
                            bookingsByDate[b.date].push(b.timeSlot);
                        }
                    });
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

    // ── Chart components ──────────────────────────────────────────
    function HorizontalBarChart({ data: chartData, colors = ["#6AA6DA", "#34d399", "#f59e0b", "#a78bfa", "#f87171"] }) {
        const entries = Object.entries(chartData).sort((a, b) => b[1] - a[1]);
        if (!entries.length) return <p className={styles.emptyNote}>No data yet.</p>;
        const max = Math.max(...entries.map(([, v]) => v), 1);
        return (
            <div className={styles.horizontalChart}>
                {entries.map(([label, value], idx) => (
                    <div key={label} className={styles.horizRow}>
                        <span className={styles.horizLabel}>{label}</span>
                        <div className={styles.horizBarTrack}>
                            <div
                                className={styles.horizBarFill}
                                style={{ width: `${(value / max) * 100}%`, backgroundColor: colors[idx % colors.length] }}
                            />
                        </div>
                        <span className={styles.horizValue}>{value}</span>
                        <span className={styles.horizPct}>{Math.round((value / max) * 100)}%</span>
                    </div>
                ))}
            </div>
        );
    }

    function BarChart({ data: chartData, color = "#6AA6DA", height = 140 }) {
        const entries = Object.entries(chartData);
        if (!entries.length) return <p className={styles.emptyNote}>No data yet.</p>;
        const max = Math.max(...entries.map(([, v]) => v), 1);
        return (
            <div className={styles.barChart}>
                {entries.map(([label, value]) => (
                    <div key={label} className={styles.barGroup}>
                        <span className={styles.barValue}>R{value.toLocaleString()}</span>
                        <div className={styles.barTrack} style={{ height }}>
                            <div className={styles.barFill} style={{ height: `${(value / max) * 100}%`, background: color }} />
                        </div>
                        <span className={styles.barLabel}>{label}</span>
                    </div>
                ))}
            </div>
        );
    }

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
                            <div className={styles.bdFill} style={{ width: `${(value / total) * 100}%`, background: palette[i % palette.length] }} />
                        </div>
                        <span className={styles.bdCount}>{value}</span>
                        <span className={styles.bdPct}>{Math.round((value / total) * 100)}%</span>
                    </div>
                ))}
            </div>
        );
    }

    function RevenueMetricsCards() {
        if (!revenueData) return null;
        
        const cards = [
            { label: "Total Revenue", value: `R ${(revenueData.totalRevenue || 0).toLocaleString()}`, icon: "fas fa-chart-line", color: "#10b981" },
            { label: "Online Payments", value: `R ${(revenueData.onlineRevenue || 0).toLocaleString()}`, icon: "fas fa-credit-card", color: "#3b82f6" },
            { label: "Cash Collected", value: `R ${(revenueData.collectedCashRevenue || 0).toLocaleString()}`, icon: "fas fa-money-bill", color: "#f59e0b" },
            { label: "Pending Cash", value: `R ${(revenueData.pendingCashRevenue || 0).toLocaleString()}`, icon: "fas fa-hourglass-half", color: "#8b5cf6" },
            { label: "Total Payouts", value: `R ${(revenueData.totalPayouts || 0).toLocaleString()}`, icon: "fas fa-arrow-up", color: "#ef4444" },
            { label: "Total Refunds", value: `R ${(revenueData.totalRefunds || 0).toLocaleString()}`, icon: "fas fa-undo-alt", color: "#f97316" },
            { label: "Available Balance", value: `R ${(revenueData.availableBalance || 0).toLocaleString()}`, icon: "fas fa-wallet", color: "#06b6d4" },
        ];
        
        return (
            <div className={styles.revenueMetricsGrid}>
                {cards.map(({ label, value, icon, color }) => (
                    <div key={label} className={styles.revenueMetricCard}>
                        <div className={styles.revenueMetricIcon} style={{ backgroundColor: `${color}15`, color }}>
                            <i className={icon} />
                        </div>
                        <div className={styles.revenueMetricInfo}>
                            <span className={styles.revenueMetricValue}>{value}</span>
                            <span className={styles.revenueMetricLabel}>{label}</span>
                        </div>
                    </div>
                ))}
            </div>
        );
    }

    // ── Early returns ──
    if (loading) return (
        <div className={styles.loadingScreen}>
            <div className={styles.spinner} />
            <p>Loading analytics…</p>
        </div>
    );

    if (error) return (
        <div className={styles.shell}>
            <AdminNavbar activePage="analytics" adminUser={adminUser} />
            <main className={styles.main}>
                <div className={styles.errorBox}>{error}</div>
            </main>
        </div>
    );

    return (
        <div className={styles.shell}>
            <AdminNavbar activePage="analytics" adminUser={adminUser} />

            <main className={styles.main}>
                <div className={styles.pageTitle}>
                    <h1><i className="fas fa-chart-bar" style={{ marginRight: 10, color: "#6AA6DA" }} />Analytics</h1>
                    <p>Live platform overview — revenue, users, listings, bookings &amp; more</p>
                </div>

                {/* ── Revenue Metrics Section (NEW) ── */}
                <div className={styles.section}>
                    <h2 className={styles.sectionTitle}>
                        <i className="fas fa-wallet" style={{ marginRight: 8, color: "#10b981" }} />
                        Revenue Overview
                    </h2>
                    <RevenueMetricsCards />
                </div>

                {/* ── Summary stat cards ── */}
                <div className={styles.statsRow}>
                    {[
                        { label: "Total Listings", value: data.totalListings, icon: "fas fa-tag", color: "#6AA6DA" },
                        { label: "Total Bookings", value: data.totalBookings, icon: "fas fa-calendar-check", color: "#34d399" },
                        { label: "Total Transactions", value: data.totalTxns, icon: "fas fa-exchange-alt", color: "#f59e0b" },
                        { label: "Avg Utilisation", value: `${data.avgUtilisation || 0}%`, icon: "fas fa-chart-line", color: "#f97316" },
                    ].map(({ label, value, icon, color }) => (
                        <div key={label} className={styles.statCard} style={{ borderTop: `3px solid ${color}` }}>
                            <i className={icon} style={{ color, fontSize: "1.4rem", marginBottom: 8 }} />
                            <span className={styles.statValue}>{value}</span>
                            <span className={styles.statLabel}>{label}</span>
                        </div>
                    ))}
                </div>

                {/* ── User breakdown + Listing status ── */}
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
                        <Breakdown data={data.byStatus} colors={["#6AA6DA", "#34d399", "#a78bfa", "#f87171", "#f59e0b"]} />
                    </div>
                </div>

                {/* ── Bookings by day ── */}
                <div className={styles.card}>
                    <h3 className={styles.cardTitle}>
                        <i className="fas fa-calendar-alt" style={{ marginRight: 8, color: "#f59e0b" }} />
                        Drop-off bookings by day of week
                    </h3>
                    <div className={styles.revenueContainer}>
                        <BarChart data={data.bookingsByDay} color="#6AA6DA" height={160} />
                    </div>
                </div>

                {/* ── Popular Categories ── */}
                <div className={styles.card}>
                    <h3 className={styles.cardTitle}>
                        <i className="fas fa-layer-group" style={{ marginRight: 8, color: "#a78bfa" }} />
                        Popular Categories
                    </h3>
                    <HorizontalBarChart data={data.byCategory} />
                </div>

                {/* ── Revenue by month (from sold listings) ── */}
                <div className={styles.card}>
                    <h3 className={styles.cardTitle}>
                        <i className="fas fa-chart-line" style={{ marginRight: 8, color: "#34d399" }} />
                        Revenue by month (completed sales)
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
                    <Breakdown data={data.txnByStatus} colors={["#6AA6DA", "#34d399", "#f59e0b", "#f87171", "#a78bfa"]} />
                </div>
            </main>
        </div>
    );
}