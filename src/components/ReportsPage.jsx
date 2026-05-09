import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { auth, db } from "../firebase";
import { signOut, onAuthStateChanged } from "firebase/auth";
import { collection, query, orderBy, onSnapshot, writeBatch, doc, updateDoc, deleteDoc } from "firebase/firestore";
import styles from "./ReportsPage.module.css";
import ConfirmModal from "./ConfirmModal";
import ReportCard from "./ReportCard";
import useExportReport from "../hooks/useExportReport";
import AdminNavbar from "./AdminNavbar";

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

export default function ReportsPage() {
  const navigate = useNavigate();
  const dropdownRef = useRef(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [adminUser, setAdminUser] = useState({ name: "Admin", email: "", photoURL: "", initials: "A" });
  const [reports, setReports] = useState([]);
  const [authReady, setAuthReady] = useState(false);
  const [reportsReady, setReportsReady] = useState(false);
  const [unreadReports, setUnreadReports] = useState(0);
  const [reportSearch, setReportSearch] = useState("");
  const [confirm, setConfirm] = useState({ open: false, title: "", message: "", onConfirm: null, variant: "danger" });
  const [toast, setToast] = useState(null);
  const [allUsers, setAllUsers] = useState([]);
  const [listings, setListings] = useState([]);

  const showToast = (message, type = "success") => setToast({ message, type });
  const hideToast = () => setToast(null);

  const openConfirm = ({ title, message, variant = "danger", onConfirm }) =>
    setConfirm({ open: true, title, message, variant, onConfirm });
  const closeConfirm = () => setConfirm(c => ({ ...c, open: false }));

  const reportTypeIcon = (type) => {
    if (type === "listing") return "🛍️";
    if (type === "review") return "⭐";
    return "👤";
  };

  // Export data
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
  
  const { exportToCSV: exportReportsCSV, exportToPDF: exportReportsPDF } = useExportReport(
    "Reports_Data", reportsHeaders, reportsExportData
  );

  const pendingReports = reports.filter(r => r.status === "pending");
  const resolvedReports = reports.filter(r => r.status !== "pending");

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
        setAuthReady(true);
      } catch (e) { console.error(e); setAuthReady(true); }
    });
    return () => unsub();
  }, [navigate]);

  // Fetch users and listings
  useEffect(() => {
    async function fetchData() {
      try {
        const usersSnap = await getDocs(collection(db, "users"));
        setAllUsers(usersSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        const listSnap = await getDocs(collection(db, "listings"));
        setListings(listSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (e) {
        console.error(e);
      }
    }
    fetchData();
  }, []);

  // Real-time reports
  useEffect(() => {
    const q = query(collection(db, "reports"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setReports(data);
      const pending = data.filter(r => r.status === "pending").length;
      setUnreadReports(pending);
      setReportsReady(true);
    });
    return () => unsub();
  }, []);

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
        }
        if (action === "remove_listing") {
          batch.delete(doc(db, "listings", report.reportedId));
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

  useEffect(() => {
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target))
        setDropdownOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const loading = !authReady || !reportsReady;

  if (loading) return (
    <div className={styles.loadingScreen}>
      <div className={styles.spinner} />
      <p>Loading reports…</p>
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

      <AdminNavbar activePage="reports" adminUser={adminUser} unreadReports={unreadReports} />

      <main className={styles.main}>
        <div className={styles.pageTitle}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
            <div>
              <h1>Reports</h1>
              <p>Manage reported content from users</p>
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              <button onClick={exportReportsCSV} className={styles.exportBtn}>Export CSV</button>
              <button onClick={exportReportsPDF} className={styles.exportBtn}>Export PDF</button>
            </div>
          </div>
        </div>

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
                <span className={styles.pendingBadge}>{pendingReports.length}</span>
              )}
            </h3>

            {pendingReports.length === 0 ? (
              <div className={styles.emptyState}>
                <i className="fas fa-check-circle" />
                <p>No pending reports — all clear!</p>
              </div>
            ) : (
              <div className={styles.modList}>
                {filteredReports.filter(r => r.status === "pending").map(r => (
                  <div key={r.id} className={styles.modRow}>
                    <div className={styles.reportIcon}>{reportTypeIcon(r.reportType)}</div>
                    <div className={styles.modInfo}>
                      <span className={styles.modTitle}>
                        {r.reportedName || r.reportedId}
                        <span className={styles.reportTypePill}>{r.reportType}</span>
                      </span>
                      <span className={styles.modMeta}>{r.reason}</span>
                      {r.details && <span className={styles.reportDetails}>"{r.details}"</span>}
                      <span className={styles.reportMeta}>
                        Reported by {r.reporterName} ·{" "}
                        {r.createdAt?.toDate ? r.createdAt.toDate().toLocaleDateString() : "Recently"}
                      </span>
                    </div>
                    <div className={styles.reportActions}>
                      <button className={styles.btnDismiss} onClick={() => handleResolveReport(r, "dismiss")}>Dismiss</button>
                      {r.reportType === "user" && (
                        <button className={styles.btnSuspend} onClick={() => handleResolveReport(r, "suspend_user")}>Suspend User</button>
                      )}
                      {r.reportType === "listing" && (
                        <button className={styles.btnRemove} onClick={() => handleResolveReport(r, "remove_listing")}>Remove Listing</button>
                      )}
                      {r.reportType === "review" && (
                        <button className={styles.btnRemove} onClick={() => handleResolveReport(r, "remove_review")}>Remove Review</button>
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
                    <div key={r.id} className={`${styles.modRow} ${styles.resolvedRow}`}>
                      <div className={styles.reportIcon}>{reportTypeIcon(r.reportType)}</div>
                      <div className={styles.modInfo}>
                        <span className={styles.modTitle}>{r.reportedName || r.reportedId}</span>
                        <span className={styles.modMeta}>{r.reason}</span>
                      </div>
                      <span className={styles.resolvedBadge}>✓ {r.resolution || "resolved"}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </ReportCard>
        </div>
      </main>


    </div>
  );
}