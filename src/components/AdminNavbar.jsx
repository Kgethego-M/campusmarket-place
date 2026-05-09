import React, { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { auth, db } from "../firebase";
import { signOut } from "firebase/auth";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import styles from "./AdminNavbar.module.css";

export default function AdminNavbar({ activePage, adminUser, unreadReports: unreadReportsProp }) {
  const navigate = useNavigate();
  const location = useLocation();
  const dropdownRef = useRef(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [badge, setBadge] = useState(typeof unreadReportsProp === "number" ? unreadReportsProp : 0);

  // Real-time pending report count
  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, "reports"), where("status", "==", "pending")),
      (snap) => setBadge(snap.size),
      (err) => console.warn("Could not fetch report badge count:", err.message)
    );
    return () => unsub();
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target))
        setDropdownOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    setDropdownOpen(false);
    setTimeout(async () => {
      try {
        localStorage.removeItem("loggedInUserId");
        await signOut(auth);
        navigate("/login");
      } catch (e) {
        console.error(e);
      } finally {
        setIsLoggingOut(false);
      }
    }, 1500);
  };

  const navItems = [
    { key: "dashboard",  icon: "fas fa-th-large",    label: "Dashboard",          path: "/admin" },
    { key: "analytics",  icon: "fas fa-chart-bar",   label: "Analytics",          path: "/admin/analytics" },
    { key: "reports",    icon: "fas fa-flag",        label: "Reports",            path: "/admin/reports", badge: badge > 0 ? badge : null },
    { key: "moderation", icon: "fas fa-chart-simple", label: "Moderation Summary", path: "/admin/moderation-summary" },
  ];

  // Determine active page based on current path if not explicitly passed
  const getActiveKey = () => {
    if (activePage) return activePage;
    const path = location.pathname;
    if (path === "/admin") return "dashboard";
    if (path === "/admin/analytics") return "analytics";
    if (path === "/admin/reports") return "reports";
    if (path === "/admin/moderation-summary") return "moderation";
    return "dashboard";
  };

  const currentActive = getActiveKey();

  return (
    <>
      <header className={styles.navbar}>
        <div className={styles.navLeft}>
          <div className={styles.logoBox}>
            <i className="fa-solid fa-shop" />
          </div>
          <span className={styles.logoText}>CampusMarket</span>
          <span className={styles.adminPill}>Admin</span>
        </div>

        {/* Desktop Navigation */}
        <nav className={styles.navCenter}>
          {navItems.map(item => (
            <button
              key={item.key}
              className={`${styles.navLink} ${currentActive === item.key ? styles.navLinkActive : ""}`}
              onClick={() => currentActive !== item.key && navigate(item.path)}
            >
              <i className={item.icon} />
              {item.label}
              {item.badge != null && (
                <span className={styles.navBadge}>{item.badge}</span>
              )}
            </button>
          ))}
        </nav>

        <div className={styles.navRight}>
          {/* Desktop profile dropdown */}
          <div className={styles.menuWrap} ref={dropdownRef}>
            <button
              className={styles.iconButton}
              onClick={() => !isLoggingOut && setDropdownOpen(v => !v)}
              title={adminUser?.name}
            >
              <i className="fa-solid fa-user-circle" />
            </button>

            {dropdownOpen && !isLoggingOut && (
              <div className={styles.dropdown}>
                <div className={styles.ddHeader}>
                  <span className={styles.ddName}>{adminUser?.name}</span>
                  <span className={styles.ddRole}>Administrator</span>
                </div>
                <div className={styles.ddDivider} />
                <button className={styles.ddItem} onClick={() => { navigate("/profile"); setDropdownOpen(false); }}>
                  <i className="fas fa-user" /> My Profile
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

      {/* Mobile Bottom Navigation Bar - Icons Only */}
      <nav className={styles.bottomNav}>
        {navItems.map(item => (
          <button
            key={item.key}
            className={`${styles.bottomNavItem} ${currentActive === item.key ? styles.bottomNavItemActive : ""}`}
            onClick={() => navigate(item.path)}
          >
            <i className={item.icon} />
            {item.badge != null && (
              <span className={styles.bottomNavBadge}>{item.badge}</span>
            )}
            <span className={styles.bottomNavLabel}>{item.label}</span>
          </button>
        ))}
      </nav>

      {isLoggingOut && (
        <div className={styles.logoutOverlay}>
          <div className={styles.logoutBox}>
            <i className="fas fa-spinner fa-spin" />
            <p>Logging out…</p>
          </div>
        </div>
      )}
    </>
  );
}