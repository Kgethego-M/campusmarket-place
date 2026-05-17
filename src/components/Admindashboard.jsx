import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { auth, db } from "../firebase";
import { signOut, onAuthStateChanged } from "firebase/auth";
import {
  doc, getDoc, collection, getDocs, query, orderBy,
  updateDoc, deleteDoc, onSnapshot, writeBatch, setDoc,
} from "firebase/firestore";
import styles from "./Admindashboard.module.css";
import ConfirmModal from "./ConfirmModal";
import ReportCard from "./ReportCard";
import useExportReport from "../hooks/useExportReport";
import { validateFacilityConfig, generateTimeSlots, getTotalCapacity } from "../utils/facilityConfig.utils";
import UtilisationReport from "./UtilisationReport.jsx";
import AdminNavbar from "./AdminNavbar";
import { getRevenueAnalytics } from "../services/revenueService";

// ─────────────────────────────────────────────────────────────────────────────
// Small inline toast
// ─────────────────────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────────────────────
// Moderation Summary — E9
// ─────────────────────────────────────────────────────────────────────────────
const PERIODS = [
  { label: "Last 7 days",  days: 7  },
  { label: "Last 30 days", days: 30 },
  { label: "Last 90 days", days: 90 },
  { label: "All time",     days: null },
];

function ModerationSummaryTab({ reports }) {
  const [selectedDays, setSelectedDays] = React.useState(30);

  const filtered = React.useMemo(() => {
    if (selectedDays === null) return reports;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - selectedDays);
    return reports.filter(r => {
      const d = r.createdAt?.toDate ? r.createdAt.toDate() : new Date(r.createdAt);
      return d >= cutoff;
    });
  }, [reports, selectedDays]);

  const total = filtered.length;
  const pending = filtered.filter(r => r.status === "pending").length;
  const resolved = filtered.filter(r => r.status === "resolved").length;
  const dismissed = filtered.filter(r => r.resolution === "dismiss").length;
  const removedReviews = filtered.filter(r => r.resolution === "remove_review").length;
  const removedList = filtered.filter(r => r.resolution === "remove_listing").length;
  const suspended = filtered.filter(r => r.resolution === "suspend_user").length;

  const byType = ["user", "listing", "review"].map(type => {
    const rows = filtered.filter(r => r.reportType === type);
    return { 
      type, 
      total: rows.length, 
      pending: rows.filter(r => r.status === "pending").length, 
      resolved: rows.filter(r => r.status === "resolved").length, 
      dismissed: rows.filter(r => r.resolution === "dismiss").length 
    };
  });

  const reasonCounts = {};
  filtered.forEach(r => { if (r.reason) reasonCounts[r.reason] = (reasonCounts[r.reason] || 0) + 1; });
  const topReasons = Object.entries(reasonCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);

  const card = (icon, label, value, color = "#1e293b") => (
    <div style={{ flex: "1 1 130px", background: "#fff", border: "1.5px solid #e2e8f0", borderRadius: 12, padding: "16px 14px", display: "flex", flexDirection: "column", gap: 5 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
        <i className={icon} style={{ color: "#6AA6DA", fontSize: "0.85rem" }} />
        <span style={{ fontSize: "0.72rem", fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</span>
      </div>
      <span style={{ fontSize: "1.7rem", fontWeight: 800, color, lineHeight: 1 }}>{value}</span>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Period selector */}
      <div style={{ background: "#fff", border: "1.5px solid #e2e8f0", borderRadius: 12, padding: "14px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: "0.95rem", fontWeight: 700, color: "#0f172a" }}><i className="fas fa-chart-bar" style={{ marginRight: 7, color: "#6AA6DA" }} />Moderation Summary</h3>
          <p style={{ margin: "2px 0 0", fontSize: "0.78rem", color: "#64748b" }}>Overview of flagged content, actions taken and dismissals</p>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {PERIODS.map(p => (
            <button key={p.label} onClick={() => setSelectedDays(p.days)} style={{ padding: "5px 13px", borderRadius: 20, border: "1.5px solid", fontSize: "0.76rem", fontWeight: 600, cursor: "pointer", fontFamily: "inherit", borderColor: selectedDays === p.days ? "#6AA6DA" : "#e2e8f0", background: selectedDays === p.days ? "#6AA6DA" : "#fff", color: selectedDays === p.days ? "#fff" : "#64748b" }}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Stat cards */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
        {card("fas fa-flag", "Total Reports", total)}
        {card("fas fa-clock", "Pending", pending, pending > 0 ? "#d97706" : "#1e293b")}
        {card("fas fa-check-circle", "Resolved", resolved, "#16a34a")}
        {card("fas fa-times-circle", "Dismissed", dismissed)}
        {card("fas fa-star", "Reviews Removed", removedReviews, removedReviews > 0 ? "#dc2626" : "#1e293b")}
        {card("fas fa-store", "Listings Removed", removedList, removedList > 0 ? "#dc2626" : "#1e293b")}
        {card("fas fa-ban", "Users Suspended", suspended, suspended > 0 ? "#dc2626" : "#1e293b")}
      </div>

      {/* Breakdown table */}
      <div style={{ background: "#fff", border: "1.5px solid #e2e8f0", borderRadius: 12, overflow: "hidden" }}>
        <div style={{ padding: "12px 18px", borderBottom: "1px solid #f1f5f9" }}>
          <h4 style={{ margin: 0, fontSize: "0.85rem", fontWeight: 700, color: "#0f172a" }}>Breakdown by Report Type</h4>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
          <thead>
            <tr style={{ background: "#f8fafc" }}>
              <th style={{ padding: "9px 14px", textAlign: "left", fontWeight: 700, color: "#64748b", fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: "1px solid #f1f5f9" }}>Type</th>
              <th style={{ padding: "9px 14px", textAlign: "left", fontWeight: 700, color: "#64748b", fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: "1px solid #f1f5f9" }}>Total</th>
              <th style={{ padding: "9px 14px", textAlign: "left", fontWeight: 700, color: "#64748b", fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: "1px solid #f1f5f9" }}>Pending</th>
              <th style={{ padding: "9px 14px", textAlign: "left", fontWeight: 700, color: "#64748b", fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: "1px solid #f1f5f9" }}>Resolved</th>
              <th style={{ padding: "9px 14px", textAlign: "left", fontWeight: 700, color: "#64748b", fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: "1px solid #f1f5f9" }}>Dismissed</th>
            </tr>
          </thead>
          <tbody>
            {byType.map(row => (
              <tr key={row.type} style={{ borderBottom: "1px solid #f8fafc" }}>
                <td style={{ padding: "11px 14px", fontWeight: 600, color: "#1e293b" }}>
                  <i className={`fas ${row.type === "user" ? "fa-user" : row.type === "listing" ? "fa-tag" : "fa-star"}`} style={{ marginRight: 6, color: "#6AA6DA" }} />
                  {row.type.charAt(0).toUpperCase() + row.type.slice(1)}
                </td>
                <td style={{ padding: "11px 14px", fontWeight: 700, color: row.total > 0 ? "#1e293b" : "#94a3b8" }}>{row.total}</td>
                <td style={{ padding: "11px 14px" }}>
                  {row.pending > 0 ? (
                    <span style={{ background: "#fef3c7", color: "#d97706", borderRadius: 20, padding: "2px 9px", fontWeight: 700, fontSize: "0.72rem" }}>{row.pending}</span>
                  ) : (
                    <span style={{ color: "#94a3b8" }}>0</span>
                  )}
                </td>
                <td style={{ padding: "11px 14px" }}>
                  {row.resolved > 0 ? (
                    <span style={{ background: "#f0fdf4", color: "#16a34a", borderRadius: 20, padding: "2px 9px", fontWeight: 700, fontSize: "0.72rem" }}>{row.resolved}</span>
                  ) : (
                    <span style={{ color: "#94a3b8" }}>0</span>
                  )}
                </td>
                <td style={{ padding: "11px 14px", color: row.dismissed > 0 ? "#64748b" : "#94a3b8", fontWeight: row.dismissed > 0 ? 600 : 400 }}>{row.dismissed}</td>
              </tr>
            ))}
            <tr style={{ background: "#f8fafc", borderTop: "2px solid #e2e8f0" }}>
              <td style={{ padding: "11px 14px", fontWeight: 800, color: "#0f172a" }}>Total</td>
              <td style={{ padding: "11px 14px", fontWeight: 800 }}>{total}</td>
              <td style={{ padding: "11px 14px", fontWeight: 800, color: "#d97706" }}>{pending}</td>
              <td style={{ padding: "11px 14px", fontWeight: 800, color: "#16a34a" }}>{resolved}</td>
              <td style={{ padding: "11px 14px", fontWeight: 800, color: "#64748b" }}>{dismissed}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Top reasons bar chart */}
      {topReasons.length > 0 && (
        <div style={{ background: "#fff", border: "1.5px solid #e2e8f0", borderRadius: 12, overflow: "hidden" }}>
          <div style={{ padding: "12px 18px", borderBottom: "1px solid #f1f5f9" }}>
            <h4 style={{ margin: 0, fontSize: "0.85rem", fontWeight: 700, color: "#0f172a" }}>Top Report Reasons</h4>
          </div>
          <div style={{ padding: "12px 18px", display: "flex", flexDirection: "column", gap: 10 }}>
            {topReasons.map(([reason, count]) => {
              const pct = total > 0 ? Math.round((count / total) * 100) : 0;
              return (
                <div key={reason} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ flex: 1, fontSize: "0.8rem", color: "#374151", fontWeight: 500 }}>{reason}</span>
                  <div style={{ width: 100, background: "#f1f5f9", borderRadius: 20, height: 7, overflow: "hidden", flexShrink: 0 }}>
                    <div style={{ width: `${pct}%`, height: "100%", background: "#6AA6DA", borderRadius: 20 }} />
                  </div>
                  <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "#64748b", minWidth: 24, textAlign: "right" }}>{count}</span>
                  <span style={{ fontSize: "0.7rem", color: "#94a3b8", minWidth: 32, textAlign: "right" }}>{pct}%</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {total === 0 && (
        <div style={{ background: "#fff", border: "1.5px solid #e2e8f0", borderRadius: 12, padding: "40px 20px", display: "flex", flexDirection: "column", alignItems: "center", gap: 8, color: "#94a3b8" }}>
          <i className="fas fa-chart-bar" style={{ fontSize: "2.2rem" }} />
          <p style={{ margin: 0, fontWeight: 600 }}>No reports in this period</p>
          <p style={{ margin: 0, fontSize: "0.8rem" }}>Try selecting a wider time range.</p>
        </div>
      )}
    </div>
  );
}

export default function AdminDashboard() {
  const navigate = useNavigate();
  const dropdownRef = useRef(null);

  // ── UI state ─────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState("users");
  const [modSubTab, setModSubTab] = useState("listings");
  const [reportSearch, setReportSearch] = useState("");
  const [expandedReport, setExpandedReport] = useState(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [userSearch, setUserSearch] = useState("");
  const [listingSearch, setListingSearch] = useState("");

  // ── Data state ───────────────────────────────────────────────────────────
  const [adminUser, setAdminUser] = useState({ name: "Admin", email: "", photoURL: "", initials: "A" });
  const [stats, setStats] = useState({ totalUsers: 0, openReports: 0, transactions: 0, revenue: 0 });
  const [revenueData, setRevenueData] = useState(null);
  const [pendingStaff, setPendingStaff] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [listings, setListings] = useState([]);
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [unreadReports, setUnreadReports] = useState(0);

  // ── Facility config state ─────────────────────────────────────────────────
  const [facilityConfig, setFacilityConfig] = useState({
    openTime: "09:00",
    closeTime: "16:00",
    slotsPerHour: 1,
  });
  const [configLoading, setConfigLoading] = useState(false);
  const [configSaving, setConfigSaving] = useState(false);
  const [configError, setConfigError] = useState("");
  const [configSuccess, setConfigSuccess] = useState("");

  // ── Confirm modal & toast ────────────────────────────────────────────────
  const [confirm, setConfirm] = useState({ open: false, title: "", message: "", onConfirm: null, variant: "danger" });
  const [toast, setToast] = useState(null);

  const showToast = (message, type = "success") => setToast({ message, type });
  const hideToast = () => setToast(null);

  const openConfirm = ({ title, message, variant = "danger", onConfirm }) =>
    setConfirm({ open: true, title, message, variant, onConfirm });
  const closeConfirm = () => setConfirm(c => ({ ...c, open: false }));

  // ── Export hooks ─────────────────────────────────────────────────────────
  const summaryHeaders = ["Metric", "Value"];
  const summaryRows = [
    { Metric: "Total Users", Value: stats.totalUsers },
    { Metric: "Open Reports", Value: stats.openReports },
    { Metric: "Transactions", Value: stats.transactions },
    { Metric: "Total Revenue", Value: `R ${(revenueData?.totalRevenue || 0).toLocaleString()}` },
  ];
  const { exportToCSV: exportSummaryCSV, exportToPDF: exportSummaryPDF } = useExportReport("Admin_Summary", summaryHeaders, summaryRows);

  // Prepare data
  const filteredUsers = allUsers.filter(u =>
    `${u.firstName} ${u.lastName} ${u.email}`.toLowerCase().includes(userSearch.toLowerCase())
  );
  const userExportData = filteredUsers.map(u => ({
    Name: `${u.firstName || ""} ${u.lastName || ""}`.trim(),
    Email: u.email || "",
    Role: u.userType || "student",
    Rating: u.rating || 0,
    Trades: u.totalRatings || 0,
    Suspended: u.suspended ? "Yes" : "No",
  }));
  const userHeaders = ["Name", "Email", "Role", "Rating", "Trades", "Suspended"];

  const filteredListings = listings.filter(l =>
    `${l.title || ""} ${l.category || ""} ${l.status || ""}`.toLowerCase().includes(listingSearch.toLowerCase())
  );
  const listingsExportData = filteredListings.map(l => ({
    Title: l.title || "",
    Category: l.category || "",
    Price: l.price || 0,
    Status: l.status || "active",
    Condition: l.condition || "",
    ListingType: l.listingType || "",
  }));
  const listingsHeaders = ["Title", "Category", "Price", "Status", "Condition", "ListingType"];

  const paymentsExportData = listings
    .filter(l => l.status === "sold" || l.status === "traded")
    .map(l => ({
      Item: l.title || "",
      Type: l.listingType || "—",
      Amount: l.price || 0,
      Status: l.status || "",
    }));
  const paymentsHeaders = ["Item", "Type", "Amount", "Status"];

  const suspendedUsers = allUsers.filter(u => u.suspended);

  const filteredReports = reports.filter(r =>
    (r.reportedName || "").toLowerCase().includes(reportSearch.toLowerCase())
  );
  const reportsExportData = filteredReports.map(r => ({
    Type: r.reportType || "",
    ReportedItem: r.reportedName || r.reportedId,
    Reason: r.reason || "",
    Details: r.details || "",
    ReportedBy: r.reporterName || "",
    Status: r.status || "pending",
    Resolution: r.resolution || "",
    Date: r.createdAt?.toDate ? r.createdAt.toDate().toLocaleDateString() : "",
  }));
  const reportsHeaders = ["Type", "ReportedItem", "Reason", "Details", "ReportedBy", "Status", "Resolution", "Date"];

  // ── Helper: navigate to the reported item ─────────────────────────────────
  const navigateToReported = (e, report) => {
    e.stopPropagation();
    if (report.reportType === "listing") navigate(`/listing/${report.reportedId}?preview=true`);
    else if (report.reportType === "user") navigate(`/profile/${report.reportedId}`);
  };

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

  // ── Real-time users listener ────────────────────────────────────────────
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "users"), (snap) => {
      const users = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setAllUsers(users);
      setPendingStaff(users.filter(u => u.userType === "staff" && !u.approved));
      setStats(prev => ({
        ...prev,
        totalUsers: users.length,
      }));
    });
    return () => unsub();
  }, []);

  // ── Real-time listings listener ──────────────────────────────────────────
  useEffect(() => {
    const q = query(collection(db, "listings"), orderBy("timestamp", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      const listData = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setListings(listData);
      const sold = listData.filter(l => l.status === "sold" || l.status === "traded");
      setStats(prev => ({
        ...prev,
        transactions: sold.length,
      }));
    });
    return () => unsub();
  }, []);

  // ── Fetch revenue analytics ──────────────────────────────────────────────
  useEffect(() => {
    async function fetchRevenue() {
      try {
        const analytics = await getRevenueAnalytics();
        setRevenueData(analytics);
      } catch (err) {
        console.error("Failed to fetch revenue analytics:", err);
      }
    }
    fetchRevenue();
  }, []);

  // ── Real-time reports listener ───────────────────────────────────────────
  useEffect(() => {
    const q = query(collection(db, "reports"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setReports(data);
      const pending = data.filter(r => r.status === "pending").length;
      setUnreadReports(pending);
      setStats(prev => ({ ...prev, openReports: pending }));
    });
    return () => unsub();
  }, []);

  // ── Load facility config ─────────────────────────────────────────────────
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
            openTime: data.openTime ?? "09:00",
            closeTime: data.closeTime ?? "16:00",
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

  // ── Save facility config ─────────────────────────────────────────────────
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
        openTime: parsed.openTime,
        closeTime: parsed.closeTime,
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

  // ── Actions ──────────────────────────────────────────────────────────────
  const approveStaff = async (userId) => {
    await updateDoc(doc(db, "users", userId), { approved: true });
    showToast("Staff member approved.");
  };

  const rejectStaff = async (userId) => {
    await updateDoc(doc(db, "users", userId), { userType: "student", approved: false });
    showToast("Staff request rejected.", "warning");
  };

  const handleToggleSuspend = (user) => {
    if (user.suspended) {
      doToggleSuspend(user.id, true);
      return;
    }
    openConfirm({
      title: "Suspend User",
      message: `Suspend ${user.firstName} ${user.lastName}? They will no longer be able to log in or access the marketplace.`,
      variant: "warning",
      onConfirm: async () => {
        closeConfirm();
        await doToggleSuspend(user.id, false);
      },
    });
  };

  const doToggleSuspend = async (userId, currentlySuspended) => {
    const adminUid = auth.currentUser?.uid;
    try {
      const update = currentlySuspended
        ? { suspended: false, suspendedBy: null, suspendedAt: null }
        : { suspended: true, suspendedBy: adminUid, suspendedAt: new Date() };
      await updateDoc(doc(db, "users", userId), update);
      showToast(currentlySuspended ? "User unsuspended." : "User suspended.", currentlySuspended ? "success" : "warning");
    } catch (err) {
      console.error(err);
      showToast("Failed to update user status.", "error");
    }
  };

  const handleRemoveListing = (listing) => {
    openConfirm({
      title: "Remove Listing",
      message: `Permanently remove "${listing.title}"? This cannot be undone.`,
      variant: "danger",
      onConfirm: async () => {
        closeConfirm();
        try {
          await deleteDoc(doc(db, "listings", listing.id));
          showToast("Listing removed.");
        } catch (err) {
          console.error(err);
          showToast("Failed to remove listing.", "error");
        }
      },
    });
  };

  const handleResolveReport = async (report, resolution) => {
    const adminUid = auth.currentUser?.uid;
    if (!adminUid) return;
    try {
      await updateDoc(doc(db, "reports", report.id), {
        status: "resolved",
        resolution,
        resolvedBy: adminUid,
        resolvedAt: new Date(),
      });
      showToast("Report resolved.");
    } catch (err) {
      console.error(err);
      showToast("Failed to resolve report.", "error");
    }
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

  // ── Close dropdown on outside click ──────────────────────────────────────
  useEffect(() => {
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target))
        setDropdownOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const previewSlots = generateTimeSlots(facilityConfig.openTime, facilityConfig.closeTime);
  const previewCapacity = getTotalCapacity({ ...facilityConfig, slotsPerHour: Number(facilityConfig.slotsPerHour) });

  if (loading && allUsers.length === 0) {
    return (
      <div className={styles.loadingScreen}>
        <div className={styles.spinner} />
        <p>Loading admin dashboard…</p>
      </div>
    );
  }

  return (
    <div className={styles.shell}>
      <ConfirmModal
        open={confirm.open}
        title={confirm.title}
        message={confirm.message}
        variant={confirm.variant}
        confirmLabel={confirm.variant === "info" ? "Yes, dismiss" : confirm.variant === "warning" ? "Suspend" : "Remove"}
        onConfirm={confirm.onConfirm}
        onCancel={closeConfirm}
      />
      {toast && <Toast message={toast.message} type={toast.type} onDismiss={hideToast} />}

      <AdminNavbar activePage="dashboard" adminUser={adminUser} unreadReports={unreadReports} />

      <main className={styles.main}>
        <div className={styles.pageTitle}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
            <div>
              <h1>Admin Dashboard</h1>
              <p>System management, moderation &amp; oversight</p>
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              <button onClick={exportSummaryCSV} style={{ background: "#4a90d9", color: "white", border: "none", padding: "8px 16px", borderRadius: "8px", cursor: "pointer", fontWeight: "500", fontSize: "0.85rem" }}> Export Summary CSV</button>
              <button onClick={exportSummaryPDF} style={{ background: "#4a90d9", color: "white", border: "none", padding: "8px 16px", borderRadius: "8px", cursor: "pointer", fontWeight: "500", fontSize: "0.85rem" }}> Export Summary PDF</button>
            </div>
          </div>
        </div>

        {/* Stat cards */}
        <div className={styles.statsRow}>
          <div className={styles.statCard}>
            <span className={styles.statLabel}>Total Users</span>
            <span className={styles.statValue}>{stats.totalUsers}</span>
            <i className="fas fa-users" />
          </div>
          <div className={`${styles.statCard} ${stats.openReports > 0 ? styles.statCardAlert : ""}`}>
            <span className={styles.statLabel}>Open Reports</span>
            <span className={styles.statValue}>{stats.openReports}</span>
            <i className="fas fa-flag" />
          </div>
          <div className={styles.statCard}>
            <span className={styles.statLabel}>Completed Transactions</span>
            <span className={styles.statValue}>{stats.transactions}</span>
            <i className="fas fa-exchange-alt" />
          </div>
          <div className={styles.statCard}>
            <span className={styles.statLabel}>Total Revenue</span>
            <span className={styles.statValue}>R {(revenueData?.totalRevenue || 0).toLocaleString()}</span>
            <i className="fas fa-wallet" />
          </div>
        </div>

        {/* Tabs */}
        <div className={styles.tabs}>
          <button className={`${styles.tab} ${activeTab === "users" ? styles.tabActive : ""}`} onClick={() => setActiveTab("users")}>
            <i className="fas fa-users" /> Users
          </button>
          <button className={`${styles.tab} ${activeTab === "suspended" ? styles.tabActive : ""}`} onClick={() => setActiveTab("suspended")}>
            <i className="fas fa-ban" /> Suspended
          </button>
          <button className={`${styles.tab} ${activeTab === "moderation" ? styles.tabActive : ""}`} onClick={() => setActiveTab("moderation")}>
            <i className="fas fa-shield-alt" /> Moderation
          </button>
          <button className={`${styles.tab} ${activeTab === "payments" ? styles.tabActive : ""}`} onClick={() => setActiveTab("payments")}>
            <i className="fas fa-credit-card" /> Payments
          </button>
          <button className={`${styles.tab} ${activeTab === "utilisation" ? styles.tabActive : ""}`} onClick={() => setActiveTab("utilisation")}>
            <i className="fas fa-calendar-alt" /> Utilisation Reports
          </button>
          <button className={`${styles.tab} ${activeTab === "settings" ? styles.tabActive : ""}`} onClick={() => setActiveTab("settings")}>
            <i className="fas fa-cog" /> Settings
          </button>
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
                        {u.photoURL ? <img src={u.photoURL} alt="" /> : <span>{(u.firstName?.[0] || "?").toUpperCase()}</span>}
                      </div>
                      <div className={styles.approvalInfo}>
                        <span className={styles.approvalName}>{u.firstName} {u.lastName}</span>
                        <span className={styles.approvalEmail}>{u.email}</span>
                      </div>
                      <div className={styles.approvalActions}>
                        <button className={styles.btnApprove} onClick={() => approveStaff(u.id)}>Approve</button>
                        <button className={styles.btnReject} onClick={() => rejectStaff(u.id)}>Reject</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <ReportCard title="All Users" headers={userHeaders} data={userExportData}>
              <div className={styles.cardHeader} style={{ marginBottom: "16px" }}>
                <div className={styles.searchWrap}>
                  <i className="fas fa-search" />
                  <input className={styles.searchInput} type="text" placeholder="Search users…" value={userSearch} onChange={e => setUserSearch(e.target.value)} />
                </div>
              </div>
              <div className={styles.userList}>
                {filteredUsers.length === 0 && <p className={styles.emptyNote}>No users found.</p>}
                {filteredUsers.map(u => (
                  <div key={u.id} className={`${styles.userRow} ${u.suspended ? styles.userRowSuspended : ""}`}>
                    <div className={styles.userAvatar}>
                      {u.photoURL ? <img src={u.photoURL} alt="" /> : <span>{(u.firstName?.[0] || "?").toUpperCase()}</span>}
                    </div>
                    <div className={styles.userInfo}>
                      <span className={styles.userName}>{u.firstName} {u.lastName}</span>
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
                      onClick={() => handleToggleSuspend(u)}
                    >
                      {u.suspended ? "Unsuspend" : "Suspend"}
                    </button>
                  </div>
                ))}
              </div>
            </ReportCard>
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
                        {u.photoURL ? <img src={u.photoURL} alt="" /> : <span>{(u.firstName?.[0] || "?").toUpperCase()}</span>}
                      </div>
                      <div className={styles.userInfo}>
                        <span className={styles.userName}>{u.firstName} {u.lastName}</span>
                        <span className={styles.userMeta}>{u.email}</span>
                      </div>
                      <button className={styles.btnUnsuspend} onClick={() => handleToggleSuspend(u)}>Unsuspend</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── MODERATION TAB */}
        {activeTab === "moderation" && (
          <div className={styles.tabContent}>
            <ReportCard title="Listing Moderation" headers={listingsHeaders} data={listingsExportData}>
              <div className={styles.cardHeader}>
                <div className={styles.searchWrap}>
                  <i className="fas fa-search" />
                  <input className={styles.searchInput} type="text" placeholder="Search listings…" value={listingSearch} onChange={e => setListingSearch(e.target.value)} />
                </div>
              </div>
              {filteredListings.length === 0 ? (
                <p className={styles.emptyNote}>{listingSearch ? "No listings match your search." : "No listings to moderate."}</p>
              ) : (
                <div className={styles.modList}>
                  {filteredListings.map(l => {
                    const img = l.imageUrl || l.photos?.[0] || null;
                    return (
                      <div key={l.id} className={styles.modRow}>
                        <div className={styles.modThumb}>
                          {img ? (
                            <img src={img} alt={l.title || "listing"} style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: 8 }} />
                          ) : (
                            <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#f1f5f9", borderRadius: 8, color: "#94a3b8" }}>
                              <i className="fas fa-image" style={{ fontSize: "1.4rem" }} />
                            </div>
                          )}
                        </div>
                        <div className={styles.modInfo}>
                          <span className={styles.modTitle}>{l.title}</span>
                          <span className={styles.modMeta}>{l.category} · R {Number(l.price || 0).toLocaleString()}</span>
                        </div>
                        <span className={`${styles.modStatus} ${styles[l.status || "active"]}`}>{l.status || "active"}</span>
                        <button className={styles.btnReject} onClick={() => handleRemoveListing(l)} disabled={l.status === "removed"}>Remove</button>
                      </div>
                    );
                  })}
                </div>
              )}
            </ReportCard>
          </div>
        )}

        {/* ── PAYMENTS TAB ── */}
        {activeTab === "payments" && (
          <div className={styles.tabContent}>
            <ReportCard title="Completed Transactions" headers={paymentsHeaders} data={paymentsExportData}>
              {listings.filter(l => l.status === "sold" || l.status === "traded").length === 0 ? (
                <p className={styles.emptyNote}>No completed transactions yet.</p>
              ) : (
                <div className={styles.payTable}>
                  <div className={styles.payHeader}>
                    <span>Item</span><span>Type</span><span>Amount</span><span>Status</span>
                  </div>
                  {listings.filter(l => l.status === "sold" || l.status === "traded").map(l => (
                    <div key={l.id} className={styles.payRow}>
                      <span className={styles.payTitle}>{l.title}</span>
                      <span className={styles.payType}>{l.listingType || "—"}</span>
                      <span className={styles.payAmount}>R {Number(l.price || 0).toLocaleString()}</span>
                      <span className={`${styles.payStatus} ${styles[l.status]}`}>{l.status}</span>
                    </div>
                  ))}
                </div>
              )}
            </ReportCard>
          </div>
        )}

        {/* ── UTILISATION REPORTS TAB ── */}
        {activeTab === "utilisation" && (
          <div className={styles.tabContent}>
            <div className={styles.card}>
              <UtilisationReport />
            </div>
          </div>
        )}

        {/* ── SETTINGS TAB ── */}
        {activeTab === "settings" && (
          <div className={styles.tabContent}>
            <div className={styles.card}>
              <h3 className={styles.cardTitle}>
                <i className="fas fa-clock" style={{ marginRight: 8, color: "#6AA6DA" }} />
                Trade Facility Operating Hours &amp; Capacity
              </h3>

              {configLoading ? (
                <div className={styles.configLoading}>
                  <div className={styles.spinner} />
                  <span>Loading facility settings…</span>
                </div>
              ) : (
                <form className={styles.configForm} onSubmit={handleSaveConfig}>
                  <div className={styles.configRow}>
                    <div className={styles.configField}>
                      <label className={styles.configLabel}><i className="fas fa-door-open" /> Opening time</label>
                      <input type="time" className={styles.configInput} value={facilityConfig.openTime} onChange={e => setFacilityConfig(prev => ({ ...prev, openTime: e.target.value }))} required />
                    </div>
                    <div className={styles.configField}>
                      <label className={styles.configLabel}><i className="fas fa-door-closed" /> Closing time</label>
                      <input type="time" className={styles.configInput} value={facilityConfig.closeTime} onChange={e => setFacilityConfig(prev => ({ ...prev, closeTime: e.target.value }))} required />
                    </div>
                    <div className={styles.configField}>
                      <label className={styles.configLabel}><i className="fas fa-layer-group" /> Slots per hour</label>
                      <select className={styles.configInput} value={facilityConfig.slotsPerHour} onChange={e => setFacilityConfig(prev => ({ ...prev, slotsPerHour: Number(e.target.value) }))}>
                        {[1, 2, 3, 4].map(n => <option key={n} value={n}>{n}</option>)}
                      </select>
                    </div>
                  </div>

                  {previewSlots.length > 0 && (
                    <div className={styles.configPreview}>
                      <p className={styles.configPreviewTitle}>
                        Preview — {previewSlots.length} slot{previewSlots.length !== 1 ? "s" : ""},&nbsp;
                        {previewCapacity} booking{previewCapacity !== 1 ? "s" : ""} max per day
                      </p>
                      <div className={styles.slotGrid}>
                        {previewSlots.map(s => <span key={s} className={styles.slotChip}>{s}</span>)}
                      </div>
                    </div>
                  )}

                  {configError && (
                    <div className={styles.configError}>
                      <i className="fas fa-exclamation-circle" /> {configError}
                    </div>
                  )}
                  {configSuccess && (
                    <div className={styles.configSuccess}>
                      <i className="fas fa-check-circle" /> {configSuccess}
                    </div>
                  )}

                  <button type="submit" className={styles.btnApprove} disabled={configSaving} style={{ marginTop: 4, width: "fit-content" }}>
                    {configSaving ? <><i className="fas fa-spinner fa-spin" /> Saving…</> : <><i className="fas fa-save" /> Save facility settings</>}
                  </button>
                </form>
              )}
            </div>

            <div className={styles.card}>
              <h3 className={styles.cardTitle}>
                <i className="fas fa-sliders-h" style={{ marginRight: 8, color: "#6AA6DA" }} />
                Platform Settings
              </h3>
              <p className={styles.emptyNote}>
                Coming soon — configure allowed email domains, listing categories, and moderation rules.
              </p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}