import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { auth, db } from "../firebase";
import { signOut, onAuthStateChanged } from "firebase/auth";
import {
  collection, query, orderBy, onSnapshot,
  writeBatch, doc, getDoc, getDocs, updateDoc, deleteDoc, arrayUnion,
} from "firebase/firestore";
import styles from "./ReportsPage.module.css";
import ConfirmModal from "./ConfirmModal";
import ReportCard from "./ReportCard";
import useExportReport from "../hooks/useExportReport";
import AdminNavbar from "./AdminNavbar";

// ─────────────────────────────────────────────────────────────────────────────
// Proof Photo Lightbox
// ─────────────────────────────────────────────────────────────────────────────
function ProofLightbox({ photos, startIndex = 0, onClose }) {
  const [idx, setIdx] = React.useState(startIndex);
  React.useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') setIdx(i => Math.min(i + 1, photos.length - 1));
      if (e.key === 'ArrowLeft')  setIdx(i => Math.max(i - 1, 0));
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose, photos.length]);

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 99999,
        background: 'rgba(0,0,0,0.88)', backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
    >
      <div onClick={e => e.stopPropagation()} style={{ position: 'relative', maxWidth: 780, width: '100%' }}>
        <button
          onClick={onClose}
          style={{
            position: 'absolute', top: -40, right: 0,
            background: 'none', border: 'none', color: '#fff',
            fontSize: '1.5rem', cursor: 'pointer', lineHeight: 1,
          }}
        >&times;</button>

        <img
          src={photos[idx]}
          alt={`Proof ${idx + 1}`}
          style={{
            width: '100%', maxHeight: '75vh', objectFit: 'contain',
            borderRadius: 12, display: 'block',
          }}
        />

        <div style={{ textAlign: 'center', color: '#cbd5e1', fontSize: '0.82rem', marginTop: 10, fontFamily: 'inherit' }}>
          {idx + 1} / {photos.length}
        </div>

        {photos.length > 1 && (
          <>
            <button
              onClick={() => setIdx(i => Math.max(i - 1, 0))}
              disabled={idx === 0}
              style={{
                position: 'absolute', top: '50%', left: -48, transform: 'translateY(-50%)',
                background: 'rgba(255,255,255,0.12)', border: 'none', borderRadius: '50%',
                width: 38, height: 38, color: '#fff', fontSize: '1.1rem', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                opacity: idx === 0 ? 0.3 : 1,
              }}
            >‹</button>
            <button
              onClick={() => setIdx(i => Math.min(i + 1, photos.length - 1))}
              disabled={idx === photos.length - 1}
              style={{
                position: 'absolute', top: '50%', right: -48, transform: 'translateY(-50%)',
                background: 'rgba(255,255,255,0.12)', border: 'none', borderRadius: '50%',
                width: 38, height: 38, color: '#fff', fontSize: '1.1rem', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                opacity: idx === photos.length - 1 ? 0.3 : 1,
              }}
            >›</button>
          </>
        )}

        {photos.length > 1 && (
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 12, flexWrap: 'wrap' }}>
            {photos.map((src, i) => (
              <button
                key={i}
                onClick={() => setIdx(i)}
                style={{
                  width: 52, height: 52, borderRadius: 7, overflow: 'hidden',
                  border: i === idx ? '2.5px solid #6AA6DA' : '2px solid rgba(255,255,255,0.2)',
                  padding: 0, cursor: 'pointer', background: 'none', flexShrink: 0,
                  transition: 'border-color 0.15s',
                }}
              >
                <img src={src} alt={`thumb ${i + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Warn User Modal
// ─────────────────────────────────────────────────────────────────────────────
function WarnModal({ open, reportedName, onConfirm, onCancel }) {
  const [reason, setReason] = React.useState('');
  const [error, setError]   = React.useState('');

  React.useEffect(() => {
    if (!open) { setReason(''); setError(''); }
  }, [open]);

  if (!open) return null;

  const handleConfirm = () => {
    if (!reason.trim()) { setError('Please provide a reason for the warning.'); return; }
    onConfirm(reason.trim());
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 99998,
      background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(3px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }}>
      <div style={{
        background: '#fff', borderRadius: 14, width: '100%', maxWidth: 420,
        boxShadow: '0 20px 60px rgba(0,0,0,0.18)', overflow: 'hidden',
      }}>
        <div style={{ padding: '18px 20px 14px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 38, height: 38, borderRadius: 9, background: '#fffbeb', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <i className="fas fa-exclamation-triangle" style={{ color: '#d97706', fontSize: '1rem' }} />
          </div>
          <div>
            <p style={{ margin: 0, fontWeight: 700, fontSize: '0.95rem', color: '#0f172a' }}>Warn User</p>
            {reportedName && <p style={{ margin: 0, fontSize: '0.78rem', color: '#64748b' }}>{reportedName}</p>}
          </div>
        </div>
        <div style={{ padding: '16px 20px 12px' }}>
          <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#374151', marginBottom: 6 }}>
            Warning reason <span style={{ color: '#dc2626' }}>(required)</span>
          </label>
          <textarea
            value={reason}
            onChange={e => { setReason(e.target.value); if (error) setError(''); }}
            placeholder="Describe the reason for this warning — this will be visible on the user's profile…"
            rows={3}
            maxLength={400}
            style={{
              width: '100%', padding: '10px 12px', border: `1.5px solid ${error ? '#dc2626' : '#e2e8f0'}`,
              borderRadius: 8, fontSize: '0.82rem', color: '#374151', resize: 'vertical',
              outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
            }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
            {error
              ? <span style={{ fontSize: '0.78rem', color: '#dc2626' }}>{error}</span>
              : <span />
            }
            <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>{reason.length}/400</span>
          </div>
          <p style={{ margin: '8px 0 0', fontSize: '0.75rem', color: '#94a3b8' }}>
            <i className="fas fa-info-circle" style={{ marginRight: 4 }} />
            This warning and its reason will appear on the user's profile page.
          </p>
        </div>
        <div style={{ padding: '12px 20px 16px', borderTop: '1px solid #f1f5f9', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onCancel} style={{ padding: '8px 16px', borderRadius: 8, border: '1.5px solid #e2e8f0', background: '#fff', color: '#374151', fontSize: '0.85rem', fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}>
            Cancel
          </button>
          <button onClick={handleConfirm} style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: '#d97706', color: '#fff', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
            <i className="fas fa-exclamation-triangle" style={{ marginRight: 6 }} />Issue Warning
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Reported Users Summary Table
// ─────────────────────────────────────────────────────────────────────────────
function ReportedUsersSummary({ reports, onViewProfile }) {
  const userMap = {};
  reports.forEach(r => {
    if (!r.reportedId) return;
    if (!userMap[r.reportedId]) {
      userMap[r.reportedId] = {
        id: r.reportedId,
        name: r.reportedName || r.reportedId,
        reportType: r.reportType,
        total: 0, pending: 0, dismissed: 0, resolved: 0,
        listingReports: 0, reviewReports: 0, userReports: 0,
        reasons: {},
      };
    }
    const u = userMap[r.reportedId];
    u.total++;
    if (r.status === 'pending')  u.pending++;
    if (r.resolution === 'dismiss') u.dismissed++;
    if (r.status === 'resolved' && r.resolution !== 'dismiss') u.resolved++;
    if (r.reportType === 'listing') u.listingReports++;
    if (r.reportType === 'review')  u.reviewReports++;
    if (r.reportType === 'user')    u.userReports++;
    if (r.reason) u.reasons[r.reason] = (u.reasons[r.reason] || 0) + 1;
  });

  const users = Object.values(userMap)
    .filter(u => u.userReports > 0)
    .sort((a, b) => b.total - a.total);

  if (users.length === 0) return null;

  return (
    <div style={{ marginTop: 32 }}>
      <h3 style={{ margin: '0 0 14px', fontSize: '1rem', fontWeight: 700, color: '#1a1a1a', display: 'flex', alignItems: 'center', gap: 10 }}>
        <i className="fas fa-users" style={{ color: '#6AA6DA', fontSize: '0.9rem' }} />
        Reported Users Summary
      </h3>
      <div style={{ overflowX: 'auto', borderRadius: 12, border: '1px solid #e8eaed' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem', background: '#fff' }}>
          <thead>
            <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e8eaed' }}>
              {['User', 'Total Reports', 'Pending', 'Dismissed', 'Resolved', 'Top Reason', 'Profile'].map(h => (
                <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, color: '#475569', fontSize: '0.73rem', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {users.map((u, i) => {
              const topReason = Object.entries(u.reasons).sort((a, b) => b[1] - a[1])[0]?.[0] || '—';
              return (
                <tr key={u.id} style={{ borderBottom: i < users.length - 1 ? '1px solid #f1f5f9' : 'none', transition: 'background 0.12s' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                  onMouseLeave={e => e.currentTarget.style.background = ''}
                >
                  <td style={{ padding: '10px 14px', fontWeight: 600, color: '#0f172a' }}>
                    <button
                      onClick={() => onViewProfile(u.id)}
                      style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.82rem', fontWeight: 600, color: '#2563eb', textDecoration: 'underline dotted', textUnderlineOffset: 3 }}
                    >
                      {u.name}
                    </button>
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <span style={{ background: u.total >= 3 ? '#fef2f2' : '#f1f5f9', color: u.total >= 3 ? '#dc2626' : '#374151', padding: '2px 8px', borderRadius: 20, fontWeight: 700 }}>{u.total}</span>
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    {u.pending > 0 ? <span style={{ background: '#fef3c7', color: '#d97706', padding: '2px 8px', borderRadius: 20, fontWeight: 600 }}>{u.pending}</span> : <span style={{ color: '#94a3b8' }}>0</span>}
                  </td>
                  <td style={{ padding: '10px 14px', color: '#64748b' }}>{u.dismissed || 0}</td>
                  <td style={{ padding: '10px 14px' }}>
                    {u.resolved > 0 ? <span style={{ background: '#f0fdf4', color: '#16a34a', padding: '2px 8px', borderRadius: 20, fontWeight: 600 }}>{u.resolved}</span> : <span style={{ color: '#94a3b8' }}>0</span>}
                  </td>
                  <td style={{ padding: '10px 14px', color: '#64748b', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{topReason}</td>
                  <td style={{ padding: '10px 14px' }}>
                    <button
                      onClick={() => onViewProfile(u.id)}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: '#eff6ff', border: 'none', borderRadius: 7, padding: '5px 10px', color: '#2563eb', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
                    >
                      <i className="fas fa-eye" style={{ fontSize: '0.7rem' }} /> View
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

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
  const [lightbox, setLightbox]           = useState(null);
  const [warnModal, setWarnModal]         = useState(null);
  const [allUsers, setAllUsers]           = useState([]);
  const [listings, setListings]           = useState([]);
  const [reviewsCache, setReviewsCache]   = useState({});
  const [showAllPending, setShowAllPending]   = useState(false);
  const [showAllResolved, setShowAllResolved] = useState(false);

  const PREVIEW_LIMIT = 3;

  const showToast  = (message, type = "success") => setToast({ message, type });
  const hideToast  = () => setToast(null);

  const openConfirm = ({ title, message, variant = "danger", onConfirm }) =>
    setConfirm({ open: true, title, message, variant, onConfirm });
  const closeConfirm = () => setConfirm(c => ({ ...c, open: false }));

  const reportTypeIcon = (type) => {
    if (type === "listing") return <i className="fas fa-store" style={{ fontSize: "1rem", color: "#6AA6DA" }} />;
    if (type === "review")  return <i className="fas fa-star" style={{ fontSize: "1rem", color: "#f59e0b" }} />;
    return <i className="fas fa-user" style={{ fontSize: "1rem", color: "#94a3b8" }} />;
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
    color: isNavigable(reportType) ? "#2563eb" : "inherit",
    cursor: isNavigable(reportType) ? "pointer" : "default",
    textDecoration: isNavigable(reportType) ? "underline dotted" : "none",
    textUnderlineOffset: "3px",
  });

  const filteredReports = reports.filter(r =>
    (r.reportedName || "").toLowerCase().includes(reportSearch.toLowerCase())
  );

  useEffect(() => {
    setShowAllPending(false);
    setShowAllResolved(false);
  }, [reportSearch]);

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

  const pendingReports   = reports.filter(r => r.status === "pending");
  const resolvedReports  = reports.filter(r => r.status !== "pending");
  const removedListings  = reports.filter(r => r.resolution === "remove_listing").length;
  const removedReviews   = reports.filter(r => r.resolution === "remove_review").length;

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
          initials: `${fn[0] || "A"}${ln[0] || ""}`.toUpperCase(),
        });
        setAuthReady(true);
      } catch (e) { console.error(e); setAuthReady(true); }
    });
    return () => unsub();
  }, [navigate]);

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
  }, [reports]);

  const handleResolveReport = async (report, action) => {
    const currentUser = auth.currentUser;
    if (!currentUser) return;

    const doResolve = async () => {
      closeConfirm();
      try {
        const batch = writeBatch(db);

        batch.update(doc(db, "reports", report.id), {
          status: "resolved",
          resolution: action,
          resolvedAt: new Date(),
          resolvedBy: currentUser.uid,
          resolvedByName: adminUser.name,
        });

        if (action === "suspend_user") {
          if (report.reportedId === currentUser.uid) {
            showToast("You cannot suspend your own account.", "error");
            return;
          }
          batch.update(doc(db, "users", report.reportedId), {
            suspended: true,
            suspendedBy: currentUser.uid,
            suspendedAt: new Date(),
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

  const handleWarnUser = async (reportedId, reportedName, reason) => {
    const currentUser = auth.currentUser;
    if (!currentUser) return;
    try {
      await updateDoc(doc(db, "users", reportedId), {
        warnings: arrayUnion({
          reason,
          warnedBy: currentUser.uid,
          warnedByName: adminUser.name,
          warnedAt: new Date(),
        }),
      });
      setWarnModal(null);
      showToast(`Warning issued to ${reportedName}.`, "success");
    } catch (err) {
      console.error(err);
      showToast("Failed to issue warning.", "error");
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
      {lightbox && <ProofLightbox photos={lightbox.photos} startIndex={lightbox.startIndex} onClose={() => setLightbox(null)} />}
      <WarnModal
        open={!!warnModal}
        reportedName={warnModal?.reportedName}
        onConfirm={(reason) => handleWarnUser(warnModal.reportedId, warnModal.reportedName, reason)}
        onCancel={() => setWarnModal(null)}
      />

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
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 16 }}>
              {[
                { icon: "fas fa-clock", label: "Pending", value: pendingReports.length, color: pendingReports.length > 0 ? "#d97706" : "#64748b", bg: pendingReports.length > 0 ? "#fef3c7" : "#f1f5f9" },
                { icon: "fas fa-check-circle", label: "Resolved", value: resolvedReports.length, color: "#16a34a", bg: "#f0fdf4" },
                { icon: "fas fa-store", label: "Listings Removed", value: removedListings, color: removedListings > 0 ? "#dc2626" : "#64748b", bg: removedListings > 0 ? "#fef2f2" : "#f1f5f9" },
                { icon: "fas fa-star", label: "Reviews Removed", value: removedReviews, color: removedReviews > 0 ? "#dc2626" : "#64748b", bg: removedReviews > 0 ? "#fef2f2" : "#f1f5f9" },
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
                {(showAllPending
                  ? filteredReports.filter(r => r.status === "pending")
                  : filteredReports.filter(r => r.status === "pending").slice(0, PREVIEW_LIMIT)
                ).map(r => {
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
                              r.reportType === "user" ? "View profile →" : undefined
                            }
                            style={navigableTitleStyle(r.reportType)}
                          >
                            {r.reportedName || r.reportedId}
                          </span>
                          <span className={styles.reportTypePill}>{r.reportType}</span>
                        </span>
                        <span className={styles.modMeta}>{r.reason}</span>
                        
                        {/* FIXED: Changed from span to div for better text containment */}
                        {r.details && (
                          <div className={styles.reportDetails}>
                            "{r.details}"
                          </div>
                        )}

                        {r.reportType === "review" && review && (
                          <div className={styles.reviewContent}>
                            <div className={styles.reviewHeader}>
                              <span className={styles.reviewStars}>
                                {"★".repeat(review.rating || 0)}{"☆".repeat(5 - (review.rating || 0))}
                              </span>
                              <span className={styles.reviewerName}>
                                {review.reviewerName || "Unknown reviewer"}
                              </span>
                            </div>
                            {review.comment && (
                              <p className={styles.reviewComment}>
                                "{review.comment}"
                              </p>
                            )}
                          </div>
                        )}
                        {r.reportType === "review" && review === undefined && (
                          <span className={styles.loadingText}>Loading review…</span>
                        )}
                        {r.reportType === "review" && review === null && (
                          <span className={styles.missingText}>Review no longer exists.</span>
                        )}

                        <span className={styles.reportMeta}>
                          Reported by {r.reporterName} ·{" "}
                          {r.createdAt?.toDate ? r.createdAt.toDate().toLocaleDateString() : "Recently"}
                        </span>

                        {r.reportType === "user" && r.proofUrls?.length > 0 && (
                          <div className={styles.proofStrip}>
                            <span className={styles.proofLabel}>
                              <i className="fas fa-camera" /> Proof ({r.proofUrls.length})
                            </span>
                            {r.proofUrls.map((url, photoIdx) => (
                              <button
                                key={photoIdx}
                                onClick={() => setLightbox({ photos: r.proofUrls, startIndex: photoIdx })}
                                className={styles.proofThumb}
                              >
                                <img src={url} alt={`proof ${photoIdx + 1}`} />
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className={styles.reportActions}>
                        <button className={styles.btnDismiss} onClick={() => handleResolveReport(r, "dismiss")}>
                          Dismiss
                        </button>
                        {r.reportType === "user" && (
                          <>
                            <button className={styles.btnSuspend} onClick={() => handleResolveReport(r, "suspend_user")}>
                              Suspend User
                            </button>
                            <button
                              onClick={() => setWarnModal({ reportedId: r.reportedId, reportedName: r.reportedName })}
                              className={styles.btnWarn}
                            >
                              <i className="fas fa-exclamation-triangle" /> Warn User
                            </button>
                          </>
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
            {filteredReports.filter(r => r.status === "pending").length > PREVIEW_LIMIT && (
              <button onClick={() => setShowAllPending(p => !p)} className={styles.viewMoreBtn}>
                {showAllPending ? "View less" : `View more (${filteredReports.filter(r => r.status === "pending").length - PREVIEW_LIMIT} more)`}
              </button>
            )}
            
            {resolvedReports.length > 0 && (
              <>
                <h3 className={styles.cardTitle} style={{ marginTop: 24 }}>Resolved Reports</h3>
                <div className={styles.modList}>
                  {(showAllResolved
                    ? filteredReports.filter(r => r.status !== "pending")
                    : filteredReports.filter(r => r.status !== "pending").slice(0, PREVIEW_LIMIT)
                  ).map(r => {
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
                              r.reportType === "user" ? "View profile →" : undefined
                            }
                            style={navigableTitleStyle(r.reportType)}
                          >
                            {r.reportedName || r.reportedId}
                          </span>
                          <span className={styles.modMeta}>{r.reason}</span>

                          {r.reportType === "review" && review && (
                            <div className={styles.reviewContent}>
                              <div className={styles.reviewHeader}>
                                <span className={styles.reviewStars}>
                                  {"★".repeat(review.rating || 0)}{"☆".repeat(5 - (review.rating || 0))}
                                </span>
                                <span className={styles.reviewerName}>
                                  {review.reviewerName || "Unknown reviewer"}
                                </span>
                              </div>
                              {review.comment && (
                                <p className={styles.reviewComment}>
                                  "{review.comment}"
                                </p>
                              )}
                            </div>
                          )}
                          {r.reportType === "review" && review === null && (
                            <span className={styles.missingText}>Review was removed.</span>
                          )}

                          {r.resolvedByName && (
                            <span className={styles.reportMeta}>
                              Resolved by {r.resolvedByName}
                              {r.resolvedAt?.toDate ? ` · ${r.resolvedAt.toDate().toLocaleDateString()}` : ""}
                            </span>
                          )}

                          {r.reportType === "user" && r.proofUrls?.length > 0 && (
                            <div className={styles.proofStrip}>
                              <span className={styles.proofLabel}>
                                <i className="fas fa-camera" /> Proof ({r.proofUrls.length})
                              </span>
                              {r.proofUrls.map((url, photoIdx) => (
                                <button
                                  key={photoIdx}
                                  onClick={() => setLightbox({ photos: r.proofUrls, startIndex: photoIdx })}
                                  className={styles.proofThumb}
                                >
                                  <img src={url} alt={`proof ${photoIdx + 1}`} />
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                        <span className={styles.resolvedBadge}>✓ {r.resolution || "resolved"}</span>
                      </div>
                    );
                  })}
                </div>
                {filteredReports.filter(r => r.status !== "pending").length > PREVIEW_LIMIT && (
                  <button onClick={() => setShowAllResolved(p => !p)} className={styles.viewMoreBtn}>
                    {showAllResolved ? "View less" : `View more (${filteredReports.filter(r => r.status !== "pending").length - PREVIEW_LIMIT} more)`}
                  </button>
                )}
              </>
            )}

            <ReportedUsersSummary
              reports={reports}
              onViewProfile={(uid) => navigate(`/profile/${uid}?preview=true`)}
            />
          </ReportCard>
        </div>
      </main>
    </div>
  );
}