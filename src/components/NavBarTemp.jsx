import { useState, useRef, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { auth, db } from "../firebase";
import { signOut, onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import styles from "./NavBar.module.css";

const NAV_LINKS = [
    { label: "Browse",         path: "/view-listing",  icon: "fas fa-search" },
    { label: "Trade Facility", path: null,              icon: "fas fa-exchange-alt" },
    { label: "Messages",       path: "/chat",           icon: "fas fa-comment" },
    { label: "View Cart",      path: null,              icon: "fas fa-shopping-cart" },
];

export default function Navbar() {
    const navigate  = useNavigate();
    const location  = useLocation();
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const [isLoggingOut, setIsLoggingOut] = useState(false);
    const [notificationsOpen, setNotificationsOpen] = useState(false);
    const [mobileOpen, setMobileOpen] = useState(false);
    const dropdownRef = useRef(null);
    const notificationRef = useRef(null);

    // ── Real user state ────────────────────────────────────────────────────
    const [userDisplay, setUserDisplay] = useState({
        name: 'Student',
        email: '',
        photoURL: '',
        initials: 'S'
    });

    // Listen for auth changes and load the user's Firestore profile
    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
            if (!firebaseUser) {
                setUserDisplay({ name: 'Student', email: '', photoURL: '', initials: 'S' });
                return;
            }

            // Start with what Firebase Auth already knows (instant)
            const nameParts = (firebaseUser.displayName || '').split(' ');
            const firstName = nameParts[0] || '';
            const lastName  = nameParts.slice(1).join(' ') || '';
            const initials  = `${firstName[0] || ''}${lastName[0] || ''}`.toUpperCase() || 'S';

            setUserDisplay({
                name: firebaseUser.displayName || 'Student',
                email: firebaseUser.email || '',
                photoURL: firebaseUser.photoURL || '',
                initials
            });

            // Then enrich with Firestore data (may have updated bio/photo)
            try {
                const snap = await getDoc(doc(db, 'users', firebaseUser.uid));
                if (snap.exists()) {
                    const data = snap.data();
                    const fn = data.firstName || firstName;
                    const ln = data.lastName  || lastName;
                    const ini = `${fn[0] || ''}${ln[0] || ''}`.toUpperCase() || 'S';
                    setUserDisplay({
                        name: `${fn} ${ln}`.trim() || firebaseUser.displayName || 'Student',
                        email: data.email || firebaseUser.email || '',
                        photoURL: data.photoURL || firebaseUser.photoURL || '',
                        initials: ini
                    });
                }
            } catch (err) {
                console.warn('NavBar: could not load Firestore profile', err);
            }
        });

        return () => unsubscribe();
    }, []);

    // Close dropdown when clicking outside
    useEffect(() => {
        function handleClickOutside(e) {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
                setDropdownOpen(false);
            }
            if (notificationRef.current && !notificationRef.current.contains(e.target)) {
                setNotificationsOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    // Lock body scroll when drawer is open
    useEffect(() => {
        document.body.style.overflow = mobileOpen ? "hidden" : "";
        return () => { document.body.style.overflow = ""; };
    }, [mobileOpen]);

    const handleLogout = async () => {
        setIsLoggingOut(true);
        setMobileOpen(false);
        setTimeout(async () => {
            try {
                localStorage.removeItem('loggedInUserId');
                localStorage.removeItem('userData');
                await signOut(auth);
                navigate("/login");
            } catch (error) {
                console.error("Error signing out:", error);
                alert("Failed to logout. Please try again.");
            } finally {
                setIsLoggingOut(false);
                setDropdownOpen(false);
            }
        }, 2000);
    };

    const handleNavClick = (path) => {
        if (path) {
            navigate(path);
            setMobileOpen(false);
        }
    };

    return (
        <>
        <header className={styles.navbar}>
            {/* Logo */}
            <div className={styles.logo} onClick={() => navigate("/view-listing")}>
                <div className={styles.logoBox}>
                    <i className="fa-solid fa-shop" style={{ color: "#fff", fontSize: "1.1rem" }} />
                </div>
                <span className={styles.logoText}>CampusMarket</span>
            </div>

            {/* Desktop nav links - hidden on mobile */}
            <nav className={styles.navLinks}>
                {NAV_LINKS.map((link) => {
                    const isActive = link.path && location.pathname === link.path;
                    // Build className conditionally
                    let buttonClassName = styles.navLink;
                    if (isActive) buttonClassName += ` ${styles.navLinkActive}`;
                    if (!link.path) buttonClassName += ` ${styles.navLinkDisabled}`;
                    
                    return (
                        <button
                            key={link.label}
                            className={buttonClassName}
                            onClick={() => link.path && navigate(link.path)}
                            disabled={!link.path}
                        >
                            {link.label}
                        </button>
                    );
                })}
            </nav>

            {/* Right side */}
            <div className={styles.navRight}>
                {/* Notification Bell */}
                <div className={styles.notificationWrapper} ref={notificationRef}>
                    <button 
                        className={styles.iconButton}
                        onClick={() => setNotificationsOpen((v) => !v)}
                        title="Notifications"
                    >
                        <i className="fa-solid fa-bell"></i>
                        <span className={styles.notificationBadge}>3</span>
                    </button>

                    {notificationsOpen && (
                        <div className={styles.notificationDropdown}>
                            <div className={styles.notificationHeader}>
                                <span>Notifications</span>
                                <button className={styles.markAllRead}>Mark all as read</button>
                            </div>
                            <div className={styles.notificationList}>
                                <div className={styles.notificationItem}>
                                    <i className="fas fa-tag"></i>
                                    <div className={styles.notificationContent}>
                                        <p>New message from John about Calculus textbook</p>
                                        <span>5 minutes ago</span>
                                    </div>
                                </div>
                                <div className={styles.notificationItem}>
                                    <i className="fas fa-shopping-cart"></i>
                                    <div className={styles.notificationContent}>
                                        <p>Your item "Python Book" was purchased</p>
                                        <span>1 hour ago</span>
                                    </div>
                                </div>
                                <div className={styles.notificationItem}>
                                    <i className="fas fa-star"></i>
                                    <div className={styles.notificationContent}>
                                        <p>You received a 5-star rating!</p>
                                        <span>2 hours ago</span>
                                    </div>
                                </div>
                            </div>
                            <div className={styles.notificationFooter}>
                                <button onClick={() => navigate("/notifications")}>View all notifications</button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Hamburger Button - visible only on mobile */}
                <button 
                    className={styles.hamburger}
                    onClick={() => setMobileOpen(true)}
                    aria-label="Open menu"
                >
                    <i className="fas fa-bars"></i>
                </button>

                {/* Menu Button (3 horizontal lines) - desktop dropdown */}
                <div className={styles.menuWrapper} ref={dropdownRef}>
                    <button 
                        className={styles.iconButton}
                        onClick={() => !isLoggingOut && setDropdownOpen((v) => !v)}
                        title="Menu"
                    >
                        <i className="fa-solid fa-bars"></i>
                    </button>

                    {dropdownOpen && !isLoggingOut && (
                        <div className={styles.dropdown}>
                            <div className={styles.dropdownHeader}>
                                <div className={styles.dropdownAvatar}>
                                </div>
                                <div>
                                    <span className={styles.dropdownName}>{userDisplay.name}</span>
                                    <div className={styles.ddRole}>Student</div>
                                </div>
                            </div>
                            <div className={styles.dropdownDivider} />
                            <button className={styles.dropdownItem} onClick={() => { navigate("/profile"); setDropdownOpen(false); }}>
                                <i className="fas fa-user" /> My Profile
                            </button>
                            <button className={styles.dropdownItem} onClick={() => { navigate("/settings"); setDropdownOpen(false); }}>
                                <i className="fas fa-cog" /> Settings
                            </button>
                            <button className={`${styles.dropdownItem} ${styles.dropdownSell}`} onClick={() => { navigate("/create-listing"); setDropdownOpen(false); }}>
                                <i className="fas fa-plus" /> Sell Item
                            </button>
                            <div className={styles.dropdownDivider} />
                            <button
                                className={`${styles.dropdownItem} ${styles.dropdownLogout}`}
                                onClick={handleLogout}
                                disabled={isLoggingOut}
                            >
                                {isLoggingOut ? (
                                    <><i className="fas fa-spinner fa-spin" /> Logging out...</>
                                ) : (
                                    <><i className="fas fa-right-from-bracket" /> Logout</>
                                )}
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </header>

        {/* Mobile Drawer - appears on small screens */}
        {mobileOpen && (
            <>
                {/* Backdrop overlay */}
                <div className={styles.mobileOverlay} onClick={() => setMobileOpen(false)} />
                
                {/* Drawer panel */}
                <div className={styles.mobileDrawer}>
                    <div className={styles.drawerHeader}>
                        <span className={styles.drawerTitle}>Menu</span>
                        <button className={styles.drawerClose} onClick={() => setMobileOpen(false)}>
                            <i className="fas fa-times" />
                        </button>
                    </div>

                    {/* User info in drawer */}
                    <div className={styles.drawerUser}>
                        <div className={styles.drawerAvatar}>
                            {userDisplay.photoURL ? (
                                <img src={userDisplay.photoURL} alt={userDisplay.name} />
                            ) : (
                                <span>{userDisplay.initials}</span>
                            )}
                        </div>
                        <div className={styles.drawerUserInfo}>
                            <span className={styles.drawerUserName}>{userDisplay.name}</span>
                            <span className={styles.drawerUserEmail}>{userDisplay.email}</span>
                        </div>
                    </div>

                    {/* Navigation Links moved inside drawer */}
                    <div className={styles.drawerSection}>Navigation</div>
                    {NAV_LINKS.map((link) => {
                        const isActive = link.path && location.pathname === link.path;
                        return (
                            <button
                                key={link.label}
                                className={`${styles.drawerLink} ${isActive ? styles.drawerLinkActive : ""}`}
                                onClick={() => handleNavClick(link.path)}
                                disabled={!link.path}
                            >
                                <i className={link.icon}></i>
                                {link.label}
                            </button>
                        );
                    })}

                    {/* Account links */}
                    <div className={styles.drawerDivider} />
                    <div className={styles.drawerSection}>Account</div>
                    <button className={styles.drawerLink} onClick={() => handleNavClick("/profile")}>
                        <i className="fas fa-user"></i> My Profile
                    </button>
                    <button className={styles.drawerLink} onClick={() => handleNavClick("/settings")}>
                        <i className="fas fa-cog"></i> Settings
                    </button>
                    <button className={`${styles.drawerLink} ${styles.drawerLinkSell}`} onClick={() => handleNavClick("/create-listing")}>
                        <i className="fas fa-plus"></i> Sell Item
                    </button>

                    <div className={styles.drawerDivider} />
                    <button 
                        className={`${styles.drawerLink} ${styles.drawerLogout}`}
                        onClick={handleLogout}
                        disabled={isLoggingOut}
                    >
                        {isLoggingOut ? (
                            <><i className="fas fa-spinner fa-spin"></i> Logging out...</>
                        ) : (
                            <><i className="fas fa-right-from-bracket"></i> Logout</>
                        )}
                    </button>
                </div>
            </>
        )}

        {/* Global logout overlay */}
        {isLoggingOut && (
            <div className={styles.logoutOverlay}>
                <div className={styles.logoutLoader}>
                    <i className="fas fa-spinner fa-spin" />
                    <p>Logging out...</p>
                </div>
            </div>
        )}
        </>
    );
}