import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { auth, db } from "../firebase";
import { signOut, onAuthStateChanged } from "firebase/auth";
import { collection, query, orderBy, onSnapshot, getDocs, doc, getDoc } from "firebase/firestore";
import styles from "./ModerationSummaryPage.module.css";
import useExportReport from "../hooks/useExportReport";

const PERIODS = [
  { label: "Last 7 days", days: 7 },
  { label: "Last 30 days", days: 30 },
  { label: "Last 90 days", days: 90 },
  { label: "All time", days: null },
];

function Toast({ message, type = "success", onDismiss }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 3500);
    return () => clearTimeout(t);
  }, [onDismiss]);

  const bg = type === "error" ? "#dc2626" : type === "warning" ? "#d97706" : "#16a34a";
  return (
    <div style={{
      position: "fixed", bottom: 24, right: 24, zIndex: 99999,
      background: bg, color: "#fff", padding: "12px 20px",
      borderRadius: 10, fontSize: "0.85rem", fontWeight: 600,
      boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
      maxWidth: 320,
    }}>
      {message}
    </div>
  );
}

export default function ModerationSummaryPage() {
  const navigate = useNavigate();
  const dropdownRef = useRef(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [adminUser, setAdminUser] = useState({ name: "Admin", email: "", photoURL: "", initials: "A" });
  const [reports, setReports] = useState([]);
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDays, setSelectedDays] = useState(30);
  const [toast, setToast] = useState(null);

  const showToast = (message, type = "success") => setToast({ message, type });
  const hideToast = () => setToast(null);

  // Filter reports to the selected period
  const filtered = React.useMemo(() => {
    if (selectedDays === null) return reports;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - selectedDays);
    return reports.filter(r => {
      const d = r.createdAt?.toDate ? r.createdAt.toDate() : new Date(r.createdAt);
      return d >= cutoff;
    });
  }, [reports, selectedDays]);

  // Totals
  const totalReports = filtered.length;
  const pendingCount = filtered.filter(r => r.status === "pending").length;
  const resolvedCount = filtered.filter(r => r.status === "resolved").length;
  const dismissedCount = filtered.filter(r => r.resolution === "dismiss").length;
  const removedReviews = filtered.filter(r => r.resolution === "remove_review").length;
  const removedListings = filtered.filter(r => r.resolution === "remove_listing").length;
  const suspendedUsers = filtered.filter(r => r.resolution === "suspend_user").length;

  // Breakdown by report type
  const byType = ["user", "listing", "review"].map(type => {
    const rows = filtered.filter(r => r.reportType === type);
    return {
      type,
      total: rows.length,
      pending: rows.filter(r => r.status === "pending").length,
      resolved: rows.filter(r => r.status === "resolved").length,
      dismissed: rows.filter(r => r.resolution === "dismiss").length,
    };
  });

  // Top reasons
  const reasonCounts = {};
  filtered.forEach(r => {
    if (r.reason) reasonCounts[r.reason] = (reasonCounts[r.reason] || 0) + 1;
  });
  const topReasons = Object.entries(reasonCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  // Export data
  const summaryRows = [
    { Metric: "Total Reports", Value: totalReports },
    { Metric: "Pending Reports", Value: pendingCount },
    { Metric: "Resolved Reports", Value: resolvedCount },
    { Metric: "Dismissed Reports", Value: dismissedCount },
    { Metric: "Reviews Removed", Value: removedReviews },
    { Metric: "Listings Removed", Value: removedListings },
    { Metric: "Users Suspended", Value: suspendedUsers },
  ];
  const summaryHeaders = ["Metric", "Value"];
  const { exportToCSV, exportToPDF } = useExportReport("Moderation_Summary", summaryHeaders, summaryRows);

  // Auth guard
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) { navigate("/login"); return; }
      try {
        const snap = await getDoc(doc(db, "users", user.uid));
        const data = snap.exists() ? snap.data() : {};
        if (data.userType !== "admin") { navigate("/"); return; }
        const fn = data.firstName || user.displayName?.split(" ")[0] || "Admin";
        const ln = data.lastName || user.displayName?.split(" ").slice(1).join(" ") || "";
        setAdminUser({
          name: `${fn} ${ln}`.trim(),
          email: data.email || user.email,
          photoURL: data.photoURL || user.photoURL || "",
          initials: `${fn[0] || "A"}${ln[0] || ""}`.toUpperCase(),
        });
      } catch (e) { console.error(e); }
    });
    return () => unsub();
  }, [navigate]);

  // Fetch listings
  useEffect(() => {
    async function fetchListings() {
      try {
        const listSnap = await getDocs(collection(db, "listings"));
        setListings(listSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (e) {
        console.error(e);
      }
    }
    fetchListings();
  }, []);

  // Real-time reports
  useEffect(() => {
    const q = query(collection(db, "reports"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setReports(data);
      setLoading(false);
    });
    return () => unsub();
  }, []);

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

  const statCard = (icon, label, value, color = "#1e293b") => (
    <div className={styles.statCard}>
      <div className={styles.statCardHeader}>
        <i className={icon} />
        <span className={styles.statLabel}>{label}</span>
      </div>
      <span className={styles.statValue} style={{ color }}>{value}</span>
    </div>
  );

  const typeIcon = { user: "👤", listing: "🛍️", review: "⭐" };

  if (loading) return (
    <div className={styles.loadingScreen}>
      <div className={styles.spinner} />
      <p>Loading moderation summary...</p>
    </div>
  );

  return (
    <div className={styles.shell}>
      {toast && <Toast message={toast.message} type={toast.type} onDismiss={hideToast} />}

      {/* Navbar */}
      <header className={styles.navbar}>
        <div className={styles.navLeft}>
          <div className={styles.logoBox}><i className="fa-solid fa-shop" /></div>
          <span className={styles.logoText}>CampusMarket</span>
          <span className={styles.adminPill}>Admin</span>
        </div>
        <div className={styles.navCenter}>
          <button className={styles.navLink} onClick={() => navigate("/admin")}>
            <i className="fas fa-th-large" /> Dashboard
          </button>
          <button className={styles.navLink} onClick={() => navigate("/admin/analytics")}>
            <i className="fas fa-chart-bar" /> Analytics
          </button>
          <button className={styles.navLink} onClick={() => navigate("/admin/reports")}>
            <i className="fas fa-flag" /> Reports
          </button>
          <button className={`${styles.navLink} ${styles.navLinkActive}`}>
            <i className="fas fa-chart-simple" /> Moderation Summary
          </button>
        </div>
        <div className={styles.navRight}>
          <div className={styles.menuWrap} ref={dropdownRef}>
            <button className={styles.iconButton} onClick={() => !isLoggingOut && setDropdownOpen(v => !v)} title={adminUser.name}>
              <i className="fa-solid fa-bars" />
            </button>
            {dropdownOpen && !isLoggingOut && (
              <div className={styles.dropdown}>
                <div className={styles.ddHeader}>
                  <span className={styles.ddName}>{adminUser.name}</span>
                  <span className={styles.ddRole}>Administrator</span>
                </div>
                <div className={styles.ddDivider} />
                <button className={styles.ddItem} onClick={() => { navigate("/profile"); setDropdownOpen(false); }}>
                  <i className="fas fa-user" /> My Profile
                </button>
                <button className={styles.ddItem} onClick={() => { navigate("/settings"); setDropdownOpen(false); }}>
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

      <main className={styles.main}>
        <div className={styles.pageTitle}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
            <div>
              <h1>Moderation Summary</h1>
              <p>Overview of flagged content, actions taken and dismissals</p>
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              <button onClick={exportToCSV} className={styles.exportBtn}>📄 Export CSV</button>
              <button onClick={exportToPDF} className={styles.exportBtn}>📑 Export PDF</button>
            </div>
          </div>
        </div>

        {/* Period selector */}
        <div className={styles.periodSelector}>
          <div>
            <h3 className={styles.sectionTitle}>
              <i className="fas fa-chart-bar" /> Moderation Summary Report
            </h3>
            <p className={styles.sectionSub}>Overview of flagged content, actions taken and dismissals</p>
          </div>
          <div className={styles.periodButtons}>
            {PERIODS.map(p => (
              <button
                key={p.label}
                onClick={() => setSelectedDays(p.days)}
                className={`${styles.periodBtn} ${selectedDays === p.days ? styles.periodBtnActive : ""}`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Stat cards */}
        <div className={styles.statsGrid}>
          {statCard("fas fa-flag", "Total Reports", totalReports)}
          {statCard("fas fa-clock", "Pending", pendingCount, pendingCount > 0 ? "#d97706" : "#1e293b")}
          {statCard("fas fa-check-circle", "Resolved", resolvedCount, "#16a34a")}
          {statCard("fas fa-times-circle", "Dismissed", dismissedCount)}
          {statCard("fas fa-star", "Reviews Removed", removedReviews, removedReviews > 0 ? "#dc2626" : "#1e293b")}
          {statCard("fas fa-store", "Listings Removed", removedListings, removedListings > 0 ? "#dc2626" : "#1e293b")}
          {statCard("fas fa-ban", "Users Suspended", suspendedUsers, suspendedUsers > 0 ? "#dc2626" : "#1e293b")}
        </div>

        {/* Breakdown table */}
        <div className={styles.tableCard}>
          <div className={styles.tableHeader}>
            <h4>Breakdown by Report Type</h4>
          </div>
          <table className={styles.table}>
            <thead>
              <tr>
                {["Type", "Total Reports", "Pending", "Resolved", "Dismissed"].map(h => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {byType.map(row => (
                <tr key={row.type}>
                  <td className={styles.typeCell}>{typeIcon[row.type]} {row.type.charAt(0).toUpperCase() + row.type.slice(1)}</td>
                  <td className={styles.totalCell}>{row.total}</td>
                  <td>{row.pending > 0 ? <span className={styles.pendingBadge}>{row.pending}</span> : <span className={styles.zeroText}>0</span>}</td>
                  <td>{row.resolved > 0 ? <span className={styles.resolvedBadge}>{row.resolved}</span> : <span className={styles.zeroText}>0</span>}</td>
                  <td className={row.dismissed > 0 ? styles.dismissedText : styles.zeroText}>{row.dismissed}</td>
                </tr>
              ))}
              <tr className={styles.totalRow}>
                <td className={styles.totalLabel}>Total</td>
                <td className={styles.totalValue}>{totalReports}</td>
                <td className={styles.totalPending}>{pendingCount}</td>
                <td className={styles.totalResolved}>{resolvedCount}</td>
                <td className={styles.totalDismissed}>{dismissedCount}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Top reasons */}
        {topReasons.length > 0 && (
          <div className={styles.reasonsCard}>
            <div className={styles.reasonsHeader}>
              <h4>Top Report Reasons</h4>
            </div>
            <div className={styles.reasonsList}>
              {topReasons.map(([reason, count]) => {
                const pct = totalReports > 0 ? Math.round((count / totalReports) * 100) : 0;
                return (
                  <div key={reason} className={styles.reasonRow}>
                    <span className={styles.reasonLabel}>{reason}</span>
                    <div className={styles.reasonBarTrack}>
                      <div className={styles.reasonBarFill} style={{ width: `${pct}%` }} />
                    </div>
                    <span className={styles.reasonCount}>{count}</span>
                    <span className={styles.reasonPct}>{pct}%</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Empty state */}
        {totalReports === 0 && (
          <div className={styles.emptyState}>
            <i className="fas fa-chart-bar" />
            <p>No reports in this period</p>
            <p className={styles.emptyStateSub}>Try selecting a wider time range above.</p>
          </div>
        )}
      </main>

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