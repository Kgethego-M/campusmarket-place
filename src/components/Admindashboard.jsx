import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { auth, db } from "../firebase";
import { signOut, onAuthStateChanged } from "firebase/auth";
import {
  doc, getDoc, collection, getDocs, query, orderBy,
  updateDoc, where, deleteDoc, onSnapshot, writeBatch, setDoc,
} from "firebase/firestore";
import styles from "./Admindashboard.module.css";
import ConfirmModal from "./ConfirmModal";
import ReportCard from "./ReportCard";
import useExportReport from "../hooks/useExportReport";
import { validateFacilityConfig, generateTimeSlots, getTotalCapacity } from "../utils/facilityConfig.utils";
import UtilisationReport from "./UtilisationReport.jsx";

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

export default function AdminDashboard() {
  const navigate = useNavigate();
  const dropdownRef = useRef(null);

  // ── UI state ─────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState("users");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [userSearch, setUserSearch] = useState("");
  const [listingSearch, setListingSearch] = useState("");
  const [reportSearch, setReportSearch] = useState("");

  // ── Data state ───────────────────────────────────────────────────────────
  const [adminUser, setAdminUser] = useState({ name: "Admin", email: "", photoURL: "", initials: "A" });
  const [stats, setStats] = useState({ totalUsers: 0, openReports: 0, transactions: 0, revenue: 0 });
  const [pendingStaff, setPendingStaff] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [listings, setListings] = useState([]);
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [unreadReports, setUnreadReports] = useState(0);

  // ── Facility config state (settings tab) ─────────────────────────────────
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

  // ── Export (CSV/PDF) hooks – your modular export ─────────────────────────
  const summaryHeaders = ["Metric", "Value"];
  const summaryRows = [
    { Metric: "Total Users", Value: stats.totalUsers },
    { Metric: "Open Reports", Value: stats.openReports },
    { Metric: "Transactions", Value: stats.transactions },
    { Metric: "Revenue (Paid)", Value: `R ${stats.revenue.toLocaleString()}` },
  ];
  const { exportToCSV: exportSummaryCSV, exportToPDF: exportSummaryPDF } = useExportReport(
    "Admin_Summary", summaryHeaders, summaryRows
  );

  // Prepare data for ReportCard components (exportable datasets)
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

  const suspendedUsers = allUsers.filter(u => u.suspended);
  const pendingReports = reports.filter(r => r.status === "pending");
  const resolvedReports = reports.filter(r => r.status !== "pending");

  const reportTypeIcon = (type) => {
    if (type === "listing") return "🛍️";
    if (type === "review") return "⭐";
    return "👤";
  };

  // ── Auth guard ───────────────────────────────────────────────────────────
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

  // ── Fetch dashboard data (users, listings, stats) ─────────────────────────
  useEffect(() => {
    async function load() {
      try {
        const usersSnap = await getDocs(collection(db, "users"));
        const users = usersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        setAllUsers(users);
        setPendingStaff(users.filter(u => u.userType === "staff" && !u.approved));

        const listSnap = await getDocs(query(collection(db, "listings"), orderBy("timestamp", "desc")));
        const listData = listSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        setListings(listData);

        const sold = listData.filter(l => l.status === "sold");
        const revenue = sold.reduce((sum, l) => sum + (Number(l.price) || 0), 0);

        setStats(prev => ({
          ...prev,
          totalUsers: users.length,
          transactions: sold.length,
          revenue,
        }));
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
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setReports(data);
      const pending = data.filter(r => r.status === "pending").length;
      setUnreadReports(pending);
      setStats(prev => ({ ...prev, openReports: pending }));
    });
    return () => unsub();
  }, []);

  // ── Load facility config when settings tab opens ─────────────────────────
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

  // ── Actions (staff approval, suspend, remove listing, resolve reports) ───
  const approveStaff = async (userId) => {
    await updateDoc(doc(db, "users", userId), { approved: true });
    setPendingStaff(prev => prev.filter(u => u.id !== userId));
    setAllUsers(prev => prev.map(u => u.id === userId ? { ...u, approved: true } : u));
    showToast("Staff member approved.");
  };

  const rejectStaff = async (userId) => {
    await updateDoc(doc(db, "users", userId), { userType: "student", approved: false });
    setPendingStaff(prev => prev.filter(u => u.id !== userId));
    setAllUsers(prev => prev.map(u => u.id === userId ? { ...u, userType: "student" } : u));
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
    try {
      await updateDoc(doc(db, "users", userId), { suspended: !currentlySuspended });
      setAllUsers(prev => prev.map(u => u.id === userId ? { ...u, suspended: !currentlySuspended } : u));
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
          setListings(prev => prev.filter(x => x.id !== listing.id));
          showToast("Listing removed.");
        } catch (err) {
          console.error(err);
          showToast("Failed to remove listing.", "error");
        }
      },
    });
  };

  const handleResolveReport = async (report, action) => {
    const doResolve = async () => {
      closeConfirm();
      try {
        const batch = writeBatch(db);
        batch.update(doc(db, "reports", report.id), {
          status: "resolved",
          resolution: action,
          resolvedAt: new Date(),
        });
        if (action === "suspend_user") {
          batch.update(doc(db, "users", report.reportedId), { suspended: true });
          setAllUsers(prev => prev.map(u => u.id === report.reportedId ? { ...u, suspended: true } : u));
        }
        if (action === "remove_listing") {
          batch.delete(doc(db, "listings", report.reportedId));
          setListings(prev => prev.filter(x => x.id !== report.reportedId));
        }
        if (action === "remove_review") {
          batch.delete(doc(db, "reviews", report.reportedId));
        }
        await batch.commit();
        showToast(action === "dismiss" ? "Report dismissed." : "Report resolved & action taken.");
      } catch (err) {
        console.error(err);
        showToast("Failed to resolve report.", "error");
      }
    };

    if (action === "dismiss") {
      openConfirm({
        title: "Dismiss Report",
        message: "Mark this report as dismissed? No action will be taken against the reported content.",
        variant: "info",
        onConfirm: doResolve,
      });
    } else if (action === "suspend_user") {
      openConfirm({
        title: "Suspend Reported User",
        message: `Suspend "${report.reportedName}"? This will block their access to the platform.`,
        variant: "warning",
        onConfirm: doResolve,
      });
    } else if (action === "remove_listing") {
      openConfirm({
        title: "Remove Reported Listing",
        message: `Permanently remove the listing "${report.reportedName}"?`,
        variant: "danger",
        onConfirm: doResolve,
      });
    } else if (action === "remove_review") {
      openConfirm({
        title: "Remove Reported Review",
        message: "Permanently delete this review? This cannot be undone.",
        variant: "danger",
        onConfirm: doResolve,
      });
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

  if (loading) return (
    <div className={styles.loadingScreen}>
      <div className={styles.spinner} />
      <p>Loading admin dashboard…</p>
    </div>
  );

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

      {/* ── Navbar ── */}
      <header className={styles.navbar}>
        <div className={styles.navLeft}>
          <div className={styles.logoBox}><i className="fa-solid fa-shop" /></div>
          <span className={styles.logoText}>CampusMarket</span>
          <span className={styles.adminPill}>Admin</span>
        </div>
        <div className={styles.navCenter}>
          <span className={styles.navActive}><i className="fas fa-th-large" /> Dashboard</span>
          <button className={styles.navAnalyticsLink} onClick={() => navigate("/admin/analytics")}>
            <i className="fas fa-chart-bar" /> Analytics
          </button>
          <span className={styles.navHandle}>@{adminUser.name.split(" ")[0] || "Admin"}</span>
        </div>
        <div className={styles.navRight}>
          <button className={styles.bellBtn} title="Pending reports" onClick={() => setActiveTab("reports")}>
            <i className="fas fa-flag" />
            {unreadReports > 0 && <span className={styles.bellBadge}>{unreadReports}</span>}
          </button>
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
              <h1>Admin Dashboard</h1>
              <p>System management, moderation &amp; oversight</p>
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              <button onClick={exportSummaryCSV} style={{ background: "#4a90d9", color: "white", border: "none", padding: "8px 16px", borderRadius: "8px", cursor: "pointer", fontWeight: "500", fontSize: "0.85rem" }}>📄 Export Summary CSV</button>
              <button onClick={exportSummaryPDF} style={{ background: "#4a90d9", color: "white", border: "none", padding: "8px 16px", borderRadius: "8px", cursor: "pointer", fontWeight: "500", fontSize: "0.85rem" }}>📑 Export Summary PDF</button>
            </div>
          </div>
        </div>

        {/* Stat cards */}
        <div className={styles.statsRow}>
          {[
            { label: "Total Users", value: stats.totalUsers, icon: "fas fa-users" },
            { label: "Open Reports", value: stats.openReports, icon: "fas fa-flag", highlight: stats.openReports > 0 },
            { label: "Completed Transactions", value: stats.transactions, icon: "fas fa-exchange-alt" },
            { label: "Revenue (Paid)", value: `R ${stats.revenue.toLocaleString()}`, icon: "fas fa-wallet" },
          ].map(({ label, value, icon, highlight }) => (
            <div key={label} className={`${styles.statCard} ${highlight ? styles.statCardAlert : ""}`}>
              <span className={styles.statLabel}>{label}</span>
              <span className={styles.statValue}>{value}</span>
              <i className={`${icon} ${styles.statIcon}`} />
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className={styles.tabs}>
          {[
            { id: "users", icon: "fas fa-users", label: "Users" },
            { id: "suspended", icon: "fas fa-ban", label: "Suspended" },
            { id: "moderation", icon: "fas fa-shield-alt", label: "Moderation" },
            { id: "reports", icon: "fas fa-flag", label: "Reports", badge: unreadReports > 0 ? unreadReports : null },
            { id: "payments", icon: "fas fa-credit-card", label: "Payments" },
            { id: "utilisation", icon: "fas fa-calendar-alt", label: "Utilisation Reports" },
            { id: "settings", icon: "fas fa-cog", label: "Settings" },
          ].map(t => (
            <button
              key={t.id}
              className={`${styles.tab} ${activeTab === t.id ? styles.tabActive : ""}`}
              onClick={() => setActiveTab(t.id)}
              style={{ position: "relative" }}
            >
              <i className={t.icon} /> {t.label}
              {t.badge && (
                <span style={{
                  position: "absolute", top: 4, right: 4,
                  background: "#dc2626", color: "#fff",
                  borderRadius: "50%", width: 17, height: 17,
                  fontSize: "0.65rem", fontWeight: 700,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>{t.badge}</span>
              )}
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
                      <span style={{ fontSize: "0.72rem", color: "#dc2626", fontWeight: 700, background: "#fef2f2", padding: "3px 10px", borderRadius: 20 }}>SUSPENDED</span>
                      <button className={styles.btnUnsuspend} onClick={() => handleToggleSuspend(u)}>Unsuspend</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── MODERATION TAB ── */}
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
                  {filteredListings.map(l => (
                    <div key={l.id} className={styles.modRow}>
                      <div className={styles.modThumb}>
                        {(l.imageUrl || l.photos?.[0]) ? <img src={l.imageUrl || l.photos[0]} alt="" /> : <i className="fas fa-image" />}
                      </div>
                      <div className={styles.modInfo}>
                        <span className={styles.modTitle}>{l.title}</span>
                        <span className={styles.modMeta}>{l.category} · R {Number(l.price || 0).toLocaleString()}</span>
                      </div>
                      <span className={`${styles.modStatus} ${styles[l.status || "active"]}`}>{l.status || "active"}</span>
                      <button className={styles.btnReject} onClick={() => handleRemoveListing(l)} disabled={l.status === "removed"}>Remove</button>
                    </div>
                  ))}
                </div>
              )}
            </ReportCard>
          </div>
        )}

        {/* ── REPORTS TAB ── */}
        {activeTab === "reports" && (
          <div className={styles.tabContent}>
            <ReportCard title="Reports" headers={reportsHeaders} data={reportsExportData}>
              <div className={styles.cardHeader}>
                <div className={styles.searchWrap}>
                  <i className="fas fa-search" />
                  <input className={styles.searchInput} type="text" placeholder="Search reported names…" value={reportSearch} onChange={e => setReportSearch(e.target.value)} />
                </div>
              </div>

              <h3 className={styles.cardTitle} style={{ marginTop: 12 }}>
                Pending Reports
                {pendingReports.length > 0 && (
                  <span style={{ marginLeft: 10, background: "#dc2626", color: "#fff", borderRadius: 20, padding: "2px 10px", fontSize: "0.72rem", fontWeight: 700 }}>
                    {pendingReports.length}
                  </span>
                )}
              </h3>

              {pendingReports.length === 0 ? (
                <div className={styles.emptyNote} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: "32px 0" }}>
                  <i className="fas fa-check-circle" style={{ fontSize: "2rem", color: "#16a34a" }} />
                  <p>No pending reports — all clear!</p>
                </div>
              ) : (
                <div className={styles.modList}>
                  {filteredReports.filter(r => r.status === "pending").map(r => (
                    <div key={r.id} className={styles.modRow} style={{ alignItems: "flex-start", gap: 14 }}>
                      <div style={{ fontSize: "1.4rem", flexShrink: 0, width: 36, textAlign: "center" }}>{reportTypeIcon(r.reportType)}</div>
                      <div className={styles.modInfo} style={{ flex: 1 }}>
                        {/* Title + type pill */}
                        <span className={styles.modTitle}>
                          {r.reportedName || r.reportedId}
                          <span style={{ marginLeft: 8, fontSize: "0.68rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", background: "#eff6ff", color: "#2563eb", padding: "2px 8px", borderRadius: 20 }}>
                            {r.reportType}
                          </span>
                        </span>
                        {/* Reason — highlighted in red */}
                        <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: "0.8rem", color: "#dc2626", fontWeight: 600, marginTop: 2 }}>
                          <i className="fas fa-flag" style={{ fontSize: "0.7rem" }} />
                          {r.reason}
                        </span>
                        {/* For review reports: show the actual review comment */}
                        {r.reportType === "review" && r.reviewComment && (
                          <div style={{ margin: "6px 0", padding: "8px 12px", background: "#fef9f0", border: "1px solid #fed7aa", borderLeft: "3px solid #f97316", borderRadius: 8 }}>
                            <p style={{ margin: "0 0 3px", fontSize: "0.7rem", fontWeight: 700, color: "#c2410c", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                              Reported review content
                            </p>
                            <p style={{ margin: 0, fontSize: "0.82rem", color: "#374151", fontStyle: "italic", lineHeight: 1.5 }}>
                              "{r.reviewComment}"
                            </p>
                            {r.reviewRating && (
                              <p style={{ margin: "4px 0 0", fontSize: "0.75rem", color: "#f59e0b" }}>
                                {"★".repeat(r.reviewRating)}{"☆".repeat(5 - r.reviewRating)} ({r.reviewRating}/5)
                              </p>
                            )}
                          </div>
                        )}
                        {/* Additional details from reporter */}
                        {r.details && (
                          <span style={{ fontSize: "0.78rem", color: "#64748b", fontStyle: "italic" }}>
                            Reporter notes: "{r.details}"
                          </span>
                        )}
                        {/* Meta */}
                        <span style={{ fontSize: "0.73rem", color: "#94a3b8", marginTop: 2 }}>
                          Reported by {r.reporterName} ·{" "}
                          {r.createdAt?.toDate ? r.createdAt.toDate().toLocaleDateString("en-ZA", { day: "numeric", month: "short" }) : "Recently"}
                        </span>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 6, flexShrink: 0 }}>
                        <button className={styles.btnApprove} onClick={() => handleResolveReport(r, "dismiss")}>Dismiss</button>
                        {r.reportType === "user" && (
                          <button className={styles.btnSuspend} onClick={() => handleResolveReport(r, "suspend_user")}>Suspend User</button>
                        )}
                        {r.reportType === "listing" && (
                          <button className={styles.btnReject} onClick={() => handleResolveReport(r, "remove_listing")}>Remove Listing</button>
                        )}
                        {r.reportType === "review" && (
                          <button className={styles.btnReject} onClick={() => handleResolveReport(r, "remove_review")}>Delete Review</button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {resolvedReports.length > 0 && (
                <>
                  <h3 className={styles.cardTitle} style={{ marginTop: 24 }}>Resolved Reports</h3>
                  <div className={styles.modList}>
                    {filteredReports.filter(r => r.status !== "pending").map(r => (
                      <div key={r.id} className={styles.modRow} style={{ opacity: 0.6 }}>
                        <div style={{ fontSize: "1.2rem", flexShrink: 0 }}>{reportTypeIcon(r.reportType)}</div>
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
                </>
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
                <div className={styles.modList}>
                  {listings.filter(l => l.status === "sold" || l.status === "traded").map(l => {
                    const img = l.imageUrl || l.photos?.[0] || null;
                    return (
                      <div key={l.id} className={styles.modRow} style={{ alignItems: "center", gap: 14 }}>
                        {/* Item image */}
                        <div className={styles.modThumb}>
                          {img
                            ? <img src={img} alt={l.title} style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: 8 }} />
                            : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#f1f5f9", borderRadius: 8, color: "#94a3b8" }}>
                                <i className="fas fa-image" style={{ fontSize: "1.4rem" }} />
                              </div>
                          }
                        </div>
                        {/* Item info */}
                        <div className={styles.modInfo} style={{ flex: 1 }}>
                          <span className={styles.modTitle}>{l.title}</span>
                          <span className={styles.modMeta}>
                            {l.category && <>{l.category} · </>}
                            {l.listingType || "—"}
                          </span>
                        </div>
                        {/* Amount */}
                        <span style={{ fontWeight: 700, color: "#16a34a", fontSize: "0.95rem", flexShrink: 0 }}>
                          R {Number(l.price || 0).toLocaleString()}
                        </span>
                        {/* Status badge */}
                        <span className={`${styles.modStatus} ${styles[l.status]}`} style={{ flexShrink: 0 }}>
                          {l.status}
                        </span>
                      </div>
                    );
                  })}
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