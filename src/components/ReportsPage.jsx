import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { auth, db } from "../firebase";
import { signOut, onAuthStateChanged } from "firebase/auth";
import {
  collection, query, orderBy, onSnapshot,
  writeBatch, doc, getDoc, getDocs, updateDoc, deleteDoc,
} from "firebase/firestore";
import styles from "./ReportsPage.module.css";
import ConfirmModal from "./ConfirmModal";
import ReportCard from "./ReportCard";
import useExportReport from "../hooks/useExportReport";
import AdminNavbar from "./AdminNavbar";

// ─────────────────────────────────────────────────────────────────────────────
// Toast
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
// Main component
// ─────────────────────────────────────────────────────────────────────────────
export default function ReportsPage() {
  const navigate = useNavigate();
  const dropdownRef = useRef(null);

  const [dropdownOpen, setDropdownOpen]   = useState(false);
  const [isLoggingOut, setIsLoggingOut]   = useState(false);
  const [adminUser, setAdminUser]         = useState({ name: "Admin", email: "", photoURL: "", initials: "A" });
  const [reports, setReports]             = useState([]);
  const [authReady, setAuthReady]         = useState(false);
  const [reportsReady, setReportsReady]   = useState(false);
  const [unreadReports, setUnreadReports] = useState(0);
  const [reportSearch, setReportSearch]   = useState("");
  const [confirm, setConfirm]             = useState({ open: false, title: "", message: "", onConfirm: null, variant: "danger" });
  const [toast, setToast]                 = useState(null);
  const [allUsers, setAllUsers]           = useState([]);
  const [listings, setListings]           = useState([]);
  const [reviewsCache, setReviewsCache]   = useState({});  // reportedId → review data

  const showToast  = (message, type = "success") => setToast({ message, type });
  const hideToast  = () => setToast(null);

  const openConfirm = ({ title, message, variant = "danger", onConfirm }) =>
    setConfirm({ open: true, title, message, variant, onConfirm });
  const closeConfirm = () => setConfirm(c => ({ ...c, open: false }));

  // ── Helpers ───────────────────────────────────────────────────────────────
  const reportTypeIcon = (type) => {
    if (type === "listing") return "🛍️";
    if (type === "review")  return "⭐";
    return "👤";
  };

  const isNavigable = (reportType) => reportType === "listing" || reportType === "user" || reportType === "review";

  const handleNavigateToReported = (report) => {
    if (report.reportType === "listing") {
      navigate(`/listing/${report.reportedId}?preview=true`);
    } 
    else if (report.reportType === "user") {
      navigate(`/profile/${report.reportedId}?preview=true`);
    }
  };

  const navigableTitleStyle = (reportType) => ({
    color:          isNavigable(reportType) ? "#2563eb" : "inherit",
    cursor:         isNavigable(reportType) ? "pointer"  : "default",
    textDecoration: isNavigable(reportType) ? "underline dotted" : "none",
    textUnderlineOffset: "3px",
  });

  // ── Export ────────────────────────────────────────────────────────────────
  const filteredReports = reports.filter(r =>
    (r.reportedName || "").toLowerCase().includes(reportSearch.toLowerCase())
  );

  const reportsExportData = filteredReports.map(r => ({
    Type:         r.reportType || "",
    ReportedItem: r.reportedName || r.reportedId,
    Reason:       r.reason || "",
    Details:      r.details || "",
    ReportedBy:   r.reporterName || "",
    Status:       r.status || "pending",
    Resolution:   r.resolution || "",
    Date:         r.createdAt?.toDate ? r.createdAt.toDate().toLocaleDateString() : "",
  }));
  const reportsHeaders = ["Type", "ReportedItem", "Reason", "Details", "ReportedBy", "Status", "Resolution", "Date"];

  const { exportToCSV: exportReportsCSV, exportToPDF: exportReportsPDF } = useExportReport(
    "Reports_Data", reportsHeaders, reportsExportData
  );

  const pendingReports   = reports.filter(r => r.status === "pending");
  const resolvedReports  = reports.filter(r => r.status !== "pending");
  const removedListings  = reports.filter(r => r.resolution === "remove_listing").length;
  const removedReviews   = reports.filter(r => r.resolution === "remove_review").length;

  // ── Auth guard ────────────────────────────────────────────────────────────
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
          email:    data.email    || user.email,
          photoURL: data.photoURL || user.photoURL || "",
          initials: `${fn[0] || "A"}${ln[0] || ""}`.toUpperCase(),
        });
        setAuthReady(true);
      } catch (e) { console.error(e); setAuthReady(true); }
    });
    return () => unsub();
  }, [navigate]);

  // ── Fetch users & listings ────────────────────────────────────────────────
  useEffect(() => {
    async function fetchData() {
      try {
        const usersSnap = await getDocs(collection(db, "users"));
        setAllUsers(usersSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        const listSnap = await getDocs(collection(db, "listings"));
        setListings(listSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (e) { console.error(e); }
    }
    fetchData();
  }, []);

  // ── Real-time reports ─────────────────────────────────────────────────────
  useEffect(() => {
    const q = query(collection(db, "reports"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setReports(data);
      setUnreadReports(data.filter(r => r.status === "pending").length);
      setReportsReady(true);
    });
    return () => unsub();
  }, []);

  // ── Fetch actual review content for review-type reports ───────────────────
  useEffect(() => {
    if (!reports.length) return;
    const reviewReports = reports.filter(r => r.reportType === "review");
    if (!reviewReports.length) return;
    const uncached = reviewReports.filter(r => !(r.reportedId in reviewsCache));
    if (!uncached.length) return;
    const fetchReviews = async () => {
      const entries = await Promise.all(
        uncached.map(async (r) => {
          try {
            const snap = await getDoc(doc(db, "reviews", r.reportedId));
            return [r.reportedId, snap.exists() ? snap.data() : null];
          } catch {
            return [r.reportedId, null];
          }
        })
      );
      setReviewsCache(prev => ({ ...prev, ...Object.fromEntries(entries) }));
    };
    fetchReviews();
  }, [reports]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Resolve report ────────────────────────────────────────────────────────
  const handleResolveReport = async (report, action) => {
    const currentUser = auth.currentUser;
    if (!currentUser) return;

    const doResolve = async () => {
      closeConfirm();
      try {
        const batch = writeBatch(db);

        // ── Write resolution info to the REPORT document only.
        //    resolvedBy stores the admin's userId so it can be looked up later.
        //    We never touch the admin's own user document here.
        batch.update(doc(db, "reports", report.id), {
          status:          "resolved",
          resolution:      action,
          resolvedAt:      new Date(),
          resolvedBy:      currentUser.uid,   // admin userId — not the admin's profile
          resolvedByName:  adminUser.name,
        });

        if (action === "suspend_user") {
          // Write to the REPORTED user's doc — not the admin's own profile
          if (report.reportedId === currentUser.uid) {
            showToast("You cannot suspend your own account.", "error");
            return;
          }
          batch.update(doc(db, "users", report.reportedId), {
            suspended:       true,
            suspendedBy:     currentUser.uid,
            suspendedAt:     new Date(),
            suspendedByName: adminUser.name,
          });
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
        title:     "Dismiss Report",
        message:   "Mark this report as dismissed? No action will be taken against the reported content.",
        variant:   "info",
        onConfirm: doResolve,
      });
    } else if (action === "suspend_user") {
      openConfirm({
        title:     "Suspend Reported User",
        message:   `Suspend "${report.reportedName}"? This will block their access to the platform.`,
        variant:   "warning",
        onConfirm: doResolve,
      });
    } else if (action === "remove_listing") {
      openConfirm({
        title:     "Remove Reported Listing",
        message:   `Permanently remove the listing "${report.reportedName}"?`,
        variant:   "danger",
        onConfirm: doResolve,
      });
    } else if (action === "remove_review") {
      openConfirm({
        title:     "Remove Reported Review",
        message:   "Permanently delete this review? This cannot be undone.",
        variant:   "danger",
        onConfirm: doResolve,
      });
    }
  };

  // ── Logout ────────────────────────────────────────────────────────────────
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

            {/* ── Stats strip ── */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 16 }}>
              {[
                { icon: "fas fa-clock",        label: "Pending",          value: pendingReports.length,  color: pendingReports.length  > 0 ? "#d97706" : "#64748b", bg: pendingReports.length  > 0 ? "#fef3c7" : "#f1f5f9" },
                { icon: "fas fa-check-circle", label: "Resolved",         value: resolvedReports.length, color: "#16a34a",                                           bg: "#f0fdf4" },
                { icon: "fas fa-store",        label: "Listings Removed", value: removedListings,        color: removedListings > 0 ? "#dc2626" : "#64748b",         bg: removedListings > 0 ? "#fef2f2" : "#f1f5f9" },
                { icon: "fas fa-star",         label: "Reviews Removed",  value: removedReviews,         color: removedReviews  > 0 ? "#dc2626" : "#64748b",         bg: removedReviews  > 0 ? "#fef2f2" : "#f1f5f9" },
              ].map(({ icon, label, value, color, bg }) => (
                <div key={label} style={{ flex: "1 1 120px", background: bg, borderRadius: 10, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 4 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <i className={icon} style={{ color, fontSize: "0.78rem" }} />
                    <span style={{ fontSize: "0.68rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</span>
                  </div>
                  <span style={{ fontSize: "1.6rem", fontWeight: 800, color, lineHeight: 1 }}>{value}</span>
                </div>
              ))}
            </div>

            {/* Search */}
            <div className={styles.cardHeader}>
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

            {/* ── Pending Reports ── */}
            <h3 className={styles.cardTitle} style={{ marginTop: 12 }}>
              Pending Reports
              {pendingReports.length > 0 && (
                <span className={styles.pendingBadge}>{pendingReports.length}</span>
              )}
            </h3>

            {filteredReports.filter(r => r.status === "pending").length === 0 ? (
              <div className={styles.emptyState}>
                <i className="fas fa-check-circle" />
                <p>{reportSearch ? "No reports match your search." : "No pending reports — all clear!"}</p>
              </div>
            ) : (
              <div className={styles.modList}>
                {filteredReports.filter(r => r.status === "pending").map(r => {
                  const review = r.reportType === "review" ? reviewsCache[r.reportedId] : null;
                  return (
                    <div key={r.id} className={styles.modRow}>
                      <div className={styles.reportIcon}>{reportTypeIcon(r.reportType)}</div>

                      <div className={styles.modInfo}>
                        <span className={styles.modTitle}>
                          <span
                            onClick={isNavigable(r.reportType) ? () => handleNavigateToReported(r) : undefined}
                            title={
                              r.reportType === "listing" ? "View listing →" :
                              r.reportType === "user"    ? "View profile →" : undefined
                            }
                            style={navigableTitleStyle(r.reportType)}
                          >
                            {r.reportedName || r.reportedId}
                          </span>
                          <span className={styles.reportTypePill}>{r.reportType}</span>
                        </span>
                        <span className={styles.modMeta}>{r.reason}</span>
                        {r.details && <span className={styles.reportDetails}>"{r.details}"</span>}

                        {/* ── Inline review content ── */}
                        {r.reportType === "review" && review && (
                          <div style={{
                            marginTop: 6, background: "#f8fafc", border: "1px solid #e2e8f0",
                            borderRadius: 8, padding: "8px 12px", fontSize: "0.8rem", color: "#374151",
                          }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                              <span style={{ color: "#f59e0b", fontSize: "0.85rem" }}>
                                {"★".repeat(review.rating || 0)}{"☆".repeat(5 - (review.rating || 0))}
                              </span>
                              <span style={{ fontWeight: 600, color: "#0f172a", fontSize: "0.78rem" }}>
                                {review.reviewerName || "Unknown reviewer"}
                              </span>
                            </div>
                            {review.comment && (
                              <p style={{ margin: 0, fontStyle: "italic", color: "#4b5563", lineHeight: 1.45 }}>
                                "{review.comment}"
                              </p>
                            )}
                          </div>
                        )}
                        {r.reportType === "review" && review === undefined && (
                          <span style={{ fontSize: "0.75rem", color: "#94a3b8", marginTop: 4, display: "block" }}>
                            Loading review…
                          </span>
                        )}
                        {r.reportType === "review" && review === null && (
                          <span style={{ fontSize: "0.75rem", color: "#94a3b8", marginTop: 4, display: "block" }}>
                            Review no longer exists.
                          </span>
                        )}

                        <span className={styles.reportMeta}>
                          Reported by {r.reporterName} ·{" "}
                          {r.createdAt?.toDate ? r.createdAt.toDate().toLocaleDateString() : "Recently"}
                        </span>
                      </div>

                      <div className={styles.reportActions}>
                        <button className={styles.btnDismiss} onClick={() => handleResolveReport(r, "dismiss")}>
                          Dismiss
                        </button>
                        {r.reportType === "user" && (
                          <button className={styles.btnSuspend} onClick={() => handleResolveReport(r, "suspend_user")}>
                            Suspend User
                          </button>
                        )}
                        {r.reportType === "listing" && (
                          <button className={styles.btnRemove} onClick={() => handleResolveReport(r, "remove_listing")}>
                            Remove Listing
                          </button>
                        )}
                        {r.reportType === "review" && (
                          <button className={styles.btnRemove} onClick={() => handleResolveReport(r, "remove_review")}>
                            Remove Review
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* ── Resolved Reports ── */}
            {resolvedReports.length > 0 && (
              <>
                <h3 className={styles.cardTitle} style={{ marginTop: 24 }}>Resolved Reports</h3>
                <div className={styles.modList}>
                  {filteredReports.filter(r => r.status !== "pending").map(r => {
                    const review = r.reportType === "review" ? reviewsCache[r.reportedId] : null;
                    return (
                      <div key={r.id} className={`${styles.modRow} ${styles.resolvedRow}`}>
                        <div className={styles.reportIcon}>{reportTypeIcon(r.reportType)}</div>
                        <div className={styles.modInfo}>
                          <span
                            className={styles.modTitle}
                            onClick={isNavigable(r.reportType) ? () => handleNavigateToReported(r) : undefined}
                            title={
                              r.reportType === "listing" ? "View listing →" :
                              r.reportType === "user"    ? "View profile →" : undefined
                            }
                            style={navigableTitleStyle(r.reportType)}
                          >
                            {r.reportedName || r.reportedId}
                          </span>
                          <span className={styles.modMeta}>{r.reason}</span>

                          {/* ── Inline review content for resolved reviews ── */}
                          {r.reportType === "review" && review && (
                            <div style={{
                              marginTop: 6, background: "#f8fafc", border: "1px solid #e2e8f0",
                              borderRadius: 8, padding: "8px 12px", fontSize: "0.8rem", color: "#374151",
                              opacity: 0.75,
                            }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                                <span style={{ color: "#f59e0b", fontSize: "0.8rem" }}>
                                  {"★".repeat(review.rating || 0)}{"☆".repeat(5 - (review.rating || 0))}
                                </span>
                                <span style={{ fontWeight: 600, color: "#0f172a", fontSize: "0.75rem" }}>
                                  {review.reviewerName || "Unknown reviewer"}
                                </span>
                              </div>
                              {review.comment && (
                                <p style={{ margin: 0, fontStyle: "italic", color: "#6b7280", fontSize: "0.78rem" }}>
                                  "{review.comment}"
                                </p>
                              )}
                            </div>
                          )}
                          {r.reportType === "review" && review === null && (
                            <span style={{ fontSize: "0.73rem", color: "#94a3b8", marginTop: 3, display: "block" }}>
                              Review was removed.
                            </span>
                          )}

                          {r.resolvedByName && (
                            <span className={styles.reportMeta}>
                              Resolved by {r.resolvedByName}
                              {r.resolvedAt?.toDate
                                ? ` · ${r.resolvedAt.toDate().toLocaleDateString()}`
                                : ""}
                            </span>
                          )}
                        </div>
                        <span className={styles.resolvedBadge}>✓ {r.resolution || "resolved"}</span>
                      </div>
                    );
                  })}
                </div>
              </>
            )}

          </ReportCard>
        </div>
      </main>
    </div>
  );
}