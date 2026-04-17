import { useState, useRef, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { auth, db } from "../firebase";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { signOut, onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import styles from "./NavBar.module.css";

const NAV_LINKS = [
    { label: "Browse",         path: "/view-listing" },
    { label: "Trade Facility", path: null },
    { label: "Messages",       path: null },
    { label: "View Cart",      path: null },
];

export default function Navbar() {
    const navigate  = useNavigate();
    const location  = useLocation();
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const [isLoggingOut, setIsLoggingOut] = useState(false);
    const [notifications, setNotifications] = useState([]);
    const [currentUser, setCurrentUser] = useState(null);
    const [notificationsOpen, setNotificationsOpen] = useState(false);
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
                // Firestore fetch failed — Auth data is still shown, no crash
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

    const handleLogout = async () => {
        setIsLoggingOut(true);
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

      useEffect(() => {
    const unsubscribeAuth = auth.onAuthStateChanged((user) => {
      setCurrentUser(user);
    });
    return () => unsubscribeAuth();
  }, []);

  useEffect(() => {
    if (!currentUser) return;
    const q = query(
      collection(db, "notifications"),
      where("userId", "==", currentUser.uid)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const offers = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      setNotifications((prev) => [
        ...prev.filter((n) => n.type !== "new_offer"),
        ...offers,
      ]);
    });
    return () => unsubscribe();
  }, [currentUser]);


    return (
        <header className={styles.navbar}>
            {/* Logo */}
            <div className={styles.logo} onClick={() => navigate("/view-listing")}>
                <div className={styles.logoBox}>
                    <i className="fa-solid fa-shop" style={{ color: "#fff", fontSize: "1.1rem" }} />
                </div>
                <span className={styles.logoText}>CampusMarket</span>
            </div>

            {/* Nav links */}
            <nav className={styles.navLinks}>
                {NAV_LINKS.map((link) => {
                    const isActive = link.path && location.pathname === link.path;
                    return (
                        <button
                            key={link.label}
                            className={`${styles.navLink} ${isActive ? styles.navLinkActive : ""} ${!link.path ? styles.navLinkDisabled : ""}`}
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
                        <span className={styles.notificationBadge}>{notifications.length}</span>
                    </button>

                    {notificationsOpen && (
                        <div className={styles.notificationDropdown}>
                            <div className={styles.notificationHeader}>
                                <span>Notifications</span>
                                <button className={styles.markAllRead}>Mark all as read</button>
                            </div>
                            <div className={styles.notificationList}>
                            {/* 🔔 Dynamic notifications from Firestore */}
                            {notifications.map((n) => (
                                <div key={n.id} className={styles.notificationItem}>
                                <i className="fas fa-shopping-cart"></i>
                                <div className={styles.notificationContent}>
                                    <p>
                                    {n.type === "new_offer"
                                        ? `New purchase offer from buyer ${n.buyerId}`
                                        : n.type === "offer_accepted"
                                        ? "Your offer was accepted!"
                                        : "Notification"}
                                    </p>
                                    <span>
                                    {n.createdAt?.toDate
                                        ? n.createdAt.toDate().toLocaleString()
                                        : ""}
                                    </span>

                                    {/* 👇 Only show this button for new offers */}
                                   {n.type === "new_offer" && (
                                        <button
                                            className={styles.viewOfferBtn}
                                            onClick={async () => {
                                                try {
                                                    // 1. Mark as read in Firestore
                                                    const notificationRef = doc(db, "notifications", n.id);
                                                    await updateDoc(notificationRef, { read: true });

                                                    // 2. Close the dropdown menu
                                                    setNotificationsOpen(false);

                                                    // 3. Navigate to the decision page
                                                    navigate(`/profile/listings/${n.transactionId}`);
                                                } catch (error) {
                                                    console.error("Error updating notification:", error);
                                                    // Even if Firestore fails, we should still let the user navigate
                                                    navigate(`/profile/listings/${n.transactionId}`);
                                                }
                                            }}
                                        >
                                            View Offer
                                        </button>
                                    )}
                                </div>
                                </div>
                            ))}

                            {/* ✅ You can still keep your static notifications if you want */}
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

                {/* Menu Button (3 horizontal lines) */}
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
                                <div><span className={styles.dropdownName}>{userDisplay.name}</span></div>
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

            {/* Global logout overlay */}
            {isLoggingOut && (
                <div className={styles.logoutOverlay}>
                    <div className={styles.logoutLoader}>
                        <i className="fas fa-spinner fa-spin" />
                        <p>Logging out...</p>
                    </div>
                </div>
            )}
        </header>
    );
}