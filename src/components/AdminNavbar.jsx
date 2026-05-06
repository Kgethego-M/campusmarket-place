import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { auth, db } from "../firebase";
import { signOut } from "firebase/auth";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import styles from "./AdminNavbar.module.css";

export default function AdminNavbar({ activePage, adminUser, unreadReports: unreadReportsProp }) {
  const navigate = useNavigate();
  const dropdownRef = useRef(null);
  const mobileMenuRef = useRef(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  // Initialise from prop so there's never a flash of 0 on the dashboard
  const [badge, setBadge] = useState(typeof unreadReportsProp === "number" ? unreadReportsProp : 0);

  // Real-time pending report count — resolves from Firestore's local cache
  // instantly on subsequent page visits, so there's no visible delay.
  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, "reports"), where("status", "==", "pending")),
      (snap) => setBadge(snap.size),
      (err) => console.warn("Could not fetch report badge count:", err.message)
    );
    return () => unsub();
  }, []);

  // Close menus on outside click
  useEffect(() => {
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target))
        setDropdownOpen(false);
      if (mobileMenuRef.current && !mobileMenuRef.current.contains(e.target))
        setMobileMenuOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    setDropdownOpen(false);
    setMobileMenuOpen(false);
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
    { key: "reports",    icon: "fas fa-flag",         label: "Reports",            path: "/admin/reports", badge: badge > 0 ? badge : null },
    { key: "moderation", icon: "fas fa-chart-simple", label: "Moderation Summary", path: "/admin/moderation-summary" },
  ];

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

        <nav className={styles.navCenter}>
          {navItems.map(item => (
            <button
              key={item.key}
              className={`${styles.navLink} ${activePage === item.key ? styles.navLinkActive : ""}`}
              onClick={() => activePage !== item.key && navigate(item.path)}
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
          {/* Mobile hamburger */}
          <div className={styles.mobileMenuWrap} ref={mobileMenuRef}>
            <button
              className={styles.mobileHamburger}
              onClick={() => setMobileMenuOpen(v => !v)}
              aria-label="Open navigation"
            >
              <i className={`fas ${mobileMenuOpen ? "fa-times" : "fa-bars"}`} />
            </button>

            {mobileMenuOpen && (
              <div className={styles.mobileDropdown}>
                <div className={styles.mobileDropdownSection}>
                  <span className={styles.mobileSectionLabel}>Navigation</span>
                  {navItems.map(item => (
                    <button
                      key={item.key}
                      className={`${styles.mobileNavItem} ${activePage === item.key ? styles.mobileNavItemActive : ""}`}
                      onClick={() => { navigate(item.path); setMobileMenuOpen(false); }}
                    >
                      <i className={item.icon} />
                      {item.label}
                      {item.badge != null && (
                        <span className={styles.navBadge}>{item.badge}</span>
                      )}
                    </button>
                  ))}
                </div>
                <div className={styles.mobileDivider} />
                <div className={styles.mobileDropdownSection}>
                  <span className={styles.mobileSectionLabel}>Account</span>
                  <button className={styles.mobileNavItem} onClick={() => { navigate("/profile"); setMobileMenuOpen(false); }}>
                    <i className="fas fa-user" /> My Profile
                  </button>
                  <button className={`${styles.mobileNavItem} ${styles.mobileNavItemLogout}`} onClick={handleLogout}>
                    <i className="fas fa-right-from-bracket" /> Logout
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Desktop profile dropdown */}
          <div className={`${styles.menuWrap} ${styles.desktopOnly}`} ref={dropdownRef}>
            <button
              className={styles.iconButton}
              onClick={() => !isLoggingOut && setDropdownOpen(v => !v)}
              title={adminUser?.name}
            >
              <i className="fa-solid fa-bars" />
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
