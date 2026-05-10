import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { auth, db } from "../firebase";
import { onAuthStateChanged } from "firebase/auth";
import { collection, query, orderBy, onSnapshot, doc, getDoc } from "firebase/firestore";
import styles from "./ModerationSummaryPage.module.css";
import useExportReport from "../hooks/useExportReport";
import AdminNavbar from "./AdminNavbar";

const PERIODS = [
  { label: "Last 7 days",  days: 7 },
  { label: "Last 30 days", days: 30 },
  { label: "Last 90 days", days: 90 },
  { label: "All time",     days: null },
];

function Toast({ message, type = "success", onDismiss }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 3500);
    return () => clearTimeout(t);
  }, [onDismiss]);

  const bg =
    type === "error"   ? "#dc2626" :
    type === "warning" ? "#d97706" : "#16a34a";

  return (
    <div style={{
      position: "fixed", bottom: 24, right: 24, zIndex: 99999,
      background: bg, color: "#fff", padding: "12px 20px",
      borderRadius: 10, fontSize: "0.85rem", fontWeight: 600,
      boxShadow: "0 8px 24px rgba(0,0,0,0.18)", maxWidth: 320,
    }}>
      {message}
    </div>
  );
}

export default function ModerationSummaryPage() {
  const navigate = useNavigate();
  const [adminUser,      setAdminUser]      = useState({ name: "Admin", email: "", photoURL: "", initials: "A" });
  const [reports,        setReports]        = useState([]);
  const [users,          setUsers]          = useState([]);
  const [selectedDays,   setSelectedDays]   = useState(30);
  const [toast,          setToast]          = useState(null);

  // Track each data source separately so we only hide the loader
  // when ALL three are ready
  const [authReady,      setAuthReady]      = useState(false);
  const [usersReady,     setUsersReady]     = useState(false);
  const [reportsReady,   setReportsReady]   = useState(false);

  const loading = !authReady || !usersReady || !reportsReady;

  const hideToast = () => setToast(null);

  // ── Filter to selected period ──────────────────────────────────
  const filtered = React.useMemo(() => {
    if (selectedDays === null) return reports;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - selectedDays);
    return reports.filter(r => {
      const d = r.createdAt?.toDate ? r.createdAt.toDate() : new Date(r.createdAt);
      return d >= cutoff;
    });
  }, [reports, selectedDays]);

  // ── Totals ─────────────────────────────────────────────────────
  const totalReports    = filtered.length;
  const pendingCount    = filtered.filter(r => r.status === "pending").length;
  const resolvedCount   = filtered.filter(r => r.status === "resolved").length;
  const dismissedCount  = filtered.filter(r => r.resolution === "dismiss").length;
  const removedReviews  = filtered.filter(r => r.resolution === "remove_review").length;
  const removedListings = filtered.filter(r => r.resolution === "remove_listing").length;

// Suspended count — reads directly from the users collection
const suspendedUsers = users.filter(u => u.suspended === true).length;

  // ── Breakdown by report type ───────────────────────────────────
  const byType = ["user", "listing", "review"].map(type => {
    const rows = filtered.filter(r => r.reportType === type);
    return {
      type,
      total:     rows.length,
      pending:   rows.filter(r => r.status === "pending").length,
      resolved:  rows.filter(r => r.status === "resolved").length,
      dismissed: rows.filter(r => r.resolution === "dismiss").length,
    };
  });

  // ── Top reasons ────────────────────────────────────────────────
  const reasonCounts = {};
  filtered.forEach(r => {
    if (r.reason) reasonCounts[r.reason] = (reasonCounts[r.reason] || 0) + 1;
  });
  const topReasons = Object.entries(reasonCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  // ── Export ─────────────────────────────────────────────────────
  const summaryRows = [
    { Metric: "Total Reports",    Value: totalReports },
    { Metric: "Pending Reports",  Value: pendingCount },
    { Metric: "Resolved Reports", Value: resolvedCount },
    { Metric: "Dismissed",        Value: dismissedCount },
    { Metric: "Reviews Removed",  Value: removedReviews },
    { Metric: "Listings Removed", Value: removedListings },
    { Metric: "Users Suspended",  Value: suspendedUsers },
  ];
  const { exportToCSV, exportToPDF } = useExportReport(
    "Moderation_Summary", ["Metric", "Value"], summaryRows
  );

  // ── Auth guard ─────────────────────────────────────────────────
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) { navigate("/login"); return; }
      try {
        const snap = await getDoc(doc(db, "users", user.uid));
        const data = snap.exists() ? snap.data() : {};
        if (data.userType !== "admin") { navigate("/"); return; }
        const fn = data.firstName || user.displayName?.split(" ")[0]                 || "Admin";
        const ln = data.lastName  || user.displayName?.split(" ").slice(1).join(" ") || "";
        setAdminUser({
          name:     `${fn} ${ln}`.trim(),
          email:    data.email    || user.email,
          photoURL: data.photoURL || user.photoURL || "",
          initials: `${fn[0] || "A"}${ln[0] || ""}`.toUpperCase(),
        });
      } catch (e) { console.error(e); }
      finally { setAuthReady(true); }
    });
    return () => unsub();
  }, [navigate]);

  // ── Live users — for accurate suspended count ──────────────────
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "users"), snap => {
      setUsers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setUsersReady(true);
    });
    return () => unsub();
  }, []);

  // ── Live reports ───────────────────────────────────────────────
  useEffect(() => {
    const q = query(collection(db, "reports"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, snap => {
      setReports(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setReportsReady(true);
    });
    return () => unsub();
  }, []);

  // ── Helpers ────────────────────────────────────────────────────
  const statCard = (icon, label, value, color = "#1e293b") => (
    <div className={styles.statCard}>
      <div className={styles.statCardHeader}>
        <i className={icon} />
        <span className={styles.statLabel}>{label}</span>
      </div>
      <span className={styles.statValue} style={{ color }}>{value}</span>
    </div>
  );

  const typeIcon = {
    user:    "fas fa-user",
    listing: "fas fa-store",
    review:  "fas fa-star",
  };

  // Show spinner until auth + users + reports are all fetched
  if (loading) return (
    <div className={styles.loadingScreen}>
      <div className={styles.spinner} />
      <p>Loading moderation summary...</p>
    </div>
  );

  return (
    <div className={styles.shell}>
      {toast && <Toast message={toast.message} type={toast.type} onDismiss={hideToast} />}

      <AdminNavbar activePage="moderation" adminUser={adminUser} />

      <main className={styles.main}>
        <div className={styles.pageTitle}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
            <div>
              <h1>Moderation Summary</h1>
              <p>Overview of flagged content, actions taken and dismissals</p>
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              <button onClick={exportToCSV} className={styles.exportBtn}>Export CSV</button>
              <button onClick={exportToPDF} className={styles.exportBtn}>Export PDF</button>
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
          {statCard("fas fa-flag",        "Total Reports",    totalReports)}
          {statCard("fas fa-clock",        "Pending",          pendingCount,    pendingCount    > 0 ? "#d97706" : "#1e293b")}
          {statCard("fas fa-check-circle", "Resolved",         resolvedCount,   "#16a34a")}
          {statCard("fas fa-times-circle", "Dismissed",        dismissedCount)}
          {statCard("fas fa-star",         "Reviews Removed",  removedReviews,  removedReviews  > 0 ? "#dc2626" : "#1e293b")}
          {statCard("fas fa-store",        "Listings Removed", removedListings, removedListings > 0 ? "#dc2626" : "#1e293b")}
          {statCard("fas fa-ban",          "Users Suspended",  suspendedUsers,  suspendedUsers  > 0 ? "#dc2626" : "#1e293b")}
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
                  <td className={styles.typeCell}>
                    <i className={`${typeIcon[row.type]} ${styles.typeIcon}`} />
                    {row.type.charAt(0).toUpperCase() + row.type.slice(1)}
                  </td>
                  <td className={styles.totalCell}>{row.total}</td>
                  <td>
                    {row.pending > 0
                      ? <span className={styles.pendingBadge}>{row.pending}</span>
                      : <span className={styles.zeroText}>0</span>}
                  </td>
                  <td>
                    {row.resolved > 0
                      ? <span className={styles.resolvedBadge}>{row.resolved}</span>
                      : <span className={styles.zeroText}>0</span>}
                  </td>
                  <td className={row.dismissed > 0 ? styles.dismissedText : styles.zeroText}>
                    {row.dismissed}
                  </td>
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
    </div>
  );
}