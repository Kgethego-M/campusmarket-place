import { useState, useRef, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { auth, db } from "../firebase";
import {
    collection, query, where, onSnapshot, getDocs,
    doc, getDoc, updateDoc,
} from "firebase/firestore";
import { signOut, onAuthStateChanged } from "firebase/auth";
import styles from "./NavBar.module.css";

const NAV_LINKS = [
    { label: "Browse",         path: "/view-listing" },
    { label: "Trade Facility", path: "/trade-facility" },
    { label: "Messages",       path: "/chat" },
    { label: "My Purchases",   path: "/my-purchases" },
];

const formatTime = (ts) => {
    if (!ts) return '';
    const d = ts?.toDate ? ts.toDate() : new Date(ts);
    const diff = Math.floor((Date.now() - d.getTime()) / 1000);
    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return d.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' });
};

/** Fetch a listing title from Firestore, returns null if not found */
const fetchListingTitle = async (listingId) => {
    if (!listingId) return null;
    try {
        const snap = await getDoc(doc(db, 'listings', listingId));
        if (snap.exists()) {
            const d = snap.data();
            return d.title || d.Title || null;
        }
    } catch (_) {}
    return null;
};

export default function Navbar() {
    const navigate = useNavigate();
    const location = useLocation();

    const [dropdownOpen, setDropdownOpen]           = useState(false);
    const [isLoggingOut, setIsLoggingOut]           = useState(false);
    const [notificationsOpen, setNotificationsOpen] = useState(false);
    const [currentUser, setCurrentUser]             = useState(null);

    // Offer/transaction notifications (Firestore real-time), enriched with listing title
    const [offerNotifications, setOfferNotifications] = useState([]);
    // Rating notifications derived from completed Purchases
    const [ratingNotifications, setRatingNotifications] = useState([]);
    // localStorage cache of dismissed rating IDs
    const [readRatingIds, setReadRatingIds] = useState(() => {
        try { return JSON.parse(localStorage.getItem('readRatingNotifs') || '[]'); }
        catch { return []; }
    });

    const [userDisplay, setUserDisplay] = useState({
        name: 'Student', email: '', photoURL: '', initials: 'S',
    });

    const dropdownRef     = useRef(null);
    const notificationRef = useRef(null);

    // ── Helpers ───────────────────────────────────────────────────────────────

    const markOfferAsRead = async (id) => {
        try { await updateDoc(doc(db, 'notifications', id), { read: true }); }
        catch (err) { console.error('Failed to mark notification as read:', err); }
    };

    const markRatingAsRead = (id) => {
        const updated = [...new Set([...readRatingIds, id])];
        setReadRatingIds(updated);
        localStorage.setItem('readRatingNotifs', JSON.stringify(updated));
    };

    const handleNotificationClick = async (n) => {
        setNotificationsOpen(false);

        if (n.source === 'offer') {
            await markOfferAsRead(n.id);
            if (n.type === 'new_offer') {
                navigate('/profile?tab=offers&highlight=' + (n.transactionId || n.listingId));
            } else if (n.type === 'offer_accepted') {
                if (n.transactionId) {
                    navigate(`/payment/${n.transactionId}`);
                } else {
                    navigate('/my-purchases');
                }
            } else if (n.type === 'offer_declined') {
                navigate('/view-listing');
            }
        } else if (n.source === 'rating') {
            markRatingAsRead(n.id);
            setRatingNotifications((prev) => prev.filter((r) => r.id !== n.id));
            navigate(
                `/review/${n.listingId}` +
                `?reviewedUserId=${n.reviewedUserId}` +
                `&name=${encodeURIComponent(n.reviewedUserName)}` +
                `&role=${n.role}` +
                `&purchaseId=${n.purchaseId}`
            );
        }
    };

    const handleMarkAllRead = async () => {
        await Promise.all(offerNotifications.map((n) => markOfferAsRead(n.id)));
        const allRatingIds = ratingNotifications.map((n) => n.id);
        const updated = [...new Set([...readRatingIds, ...allRatingIds])];
        setReadRatingIds(updated);
        localStorage.setItem('readRatingNotifs', JSON.stringify(updated));
        setRatingNotifications([]);
    };

    // ── Notification display helpers ──────────────────────────────────────────

    const notificationIcon = (type) => {
        if (type === 'new_offer')                              return 'fa-shopping-cart';
        if (type === 'offer_accepted')                         return 'fa-circle-check';
        if (type === 'offer_declined')                         return 'fa-circle-xmark';
        if (type === 'rate_seller' || type === 'rate_buyer')   return 'fa-star';
        return 'fa-bell';
    };

    const notificationIconColor = (type) => {
        if (type === 'new_offer')      return '#3b82f6'; // blue
        if (type === 'offer_accepted') return '#22c55e'; // green
        if (type === 'offer_declined') return '#ef4444'; // red
        if (type === 'rate_seller' || type === 'rate_buyer') return '#f59e0b'; // amber
        return '#94a3b8';
    };

    const notificationMessage = (n) => {
        const title = n.listingTitle ? `"${n.listingTitle}"` : 'your listing';
        if (n.type === 'new_offer')      return `${n.buyerName || 'A student'} made an offer on ${title}`;
        if (n.type === 'offer_accepted') return `Your offer on ${title} was accepted!`;
        if (n.type === 'offer_declined') return `Your offer on ${title} was declined.`;
        if (n.type === 'rate_seller')    return n.title || 'Rate your seller';
        if (n.type === 'rate_buyer')     return n.title || 'Rate your buyer';
        return 'Notification';
    };

    // ── Auth + Firestore profile ──────────────────────────────────────────────

    useEffect(() => {
        const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
            if (!firebaseUser) {
                setUserDisplay({ name: 'Student', email: '', photoURL: '', initials: 'S' });
                setCurrentUser(null);
                setOfferNotifications([]);
                setRatingNotifications([]);
                return;
            }
            setCurrentUser(firebaseUser);

            const parts    = (firebaseUser.displayName || '').split(' ');
            const fn       = parts[0] || '';
            const ln       = parts.slice(1).join(' ') || '';
            const initials = `${fn[0] || ''}${ln[0] || ''}`.toUpperCase() || 'S';
            setUserDisplay({ name: firebaseUser.displayName || 'Student', email: firebaseUser.email || '', photoURL: firebaseUser.photoURL || '', initials });

            try {
                const snap = await getDoc(doc(db, 'users', firebaseUser.uid));
                if (snap.exists()) {
                    const d   = snap.data();
                    const ffn = d.firstName || fn;
                    const fln = d.lastName  || ln;
                    const ini = `${ffn[0] || ''}${fln[0] || ''}`.toUpperCase() || 'S';
                    setUserDisplay({
                        name:     `${ffn} ${fln}`.trim() || firebaseUser.displayName || 'Student',
                        email:    d.email    || firebaseUser.email    || '',
                        photoURL: d.photoURL || firebaseUser.photoURL || '',
                        initials: ini,
                    });
                }
            } catch (err) {
                console.warn('NavBar: could not load Firestore profile', err);
            }
        });
        return () => unsub();
    }, []);

    // ── Close on outside click ────────────────────────────────────────────────

    useEffect(() => {
        const handle = (e) => {
            if (dropdownRef.current     && !dropdownRef.current.contains(e.target))     setDropdownOpen(false);
            if (notificationRef.current && !notificationRef.current.contains(e.target)) setNotificationsOpen(false);
        };
        document.addEventListener('mousedown', handle);
        return () => document.removeEventListener('mousedown', handle);
    }, []);

    // ── Logout ────────────────────────────────────────────────────────────────

    const handleLogout = () => {
        setIsLoggingOut(true);
        setTimeout(async () => {
            try {
                localStorage.removeItem('loggedInUserId');
                localStorage.removeItem('userData');
                await signOut(auth);
                navigate('/login');
            } catch (err) {
                console.error('Error signing out:', err);
                alert('Failed to logout. Please try again.');
            } finally {
                setIsLoggingOut(false);
                setDropdownOpen(false);
            }
        }, 2000);
    };

    // ── Real-time offer notifications — enriched with listing title ───────────

    useEffect(() => {
        if (!currentUser) return;

        const q = query(
            collection(db, 'notifications'),
            where('userId', '==', currentUser.uid),
            where('read',   '==', false)
        );

        const unsub = onSnapshot(q, async (snapshot) => {
            const raw = snapshot.docs.map((d) => ({ id: d.id, source: 'offer', ...d.data() }));

            const enriched = await Promise.all(
                raw.map(async (n) => {
                    const listingTitle = await fetchListingTitle(n.listingId);
                    return { ...n, listingTitle };
                })
            );
            setOfferNotifications(enriched);
        });

        return () => unsub();
    }, [currentUser]);

    // ── One-time fetch: rating notifications from completed Purchases ──────────

    useEffect(() => {
        if (!currentUser) return;

        const fetchRatingNotifications = async () => {
            try {
                const [buyerSnap, sellerSnap] = await Promise.all([
                    getDocs(query(
                        collection(db, 'transactions'),
                        where('buyerId',  '==', currentUser.uid),
                        where('status',   '==', 'completed')
                    )),
                    getDocs(query(
                        collection(db, 'transactions'),
                        where('sellerId', '==', currentUser.uid),
                        where('status',   '==', 'completed')
                    )),
                ]);

                const results = [];

                for (const d of buyerSnap.docs) {
                    const data = d.data();
                    const listingId = data.listingId || data.ListingId || data.listing_id || null;
                    if (!listingId) {
                        console.warn(`NavBar: Purchases/${d.id} missing listingId — fields:`, Object.keys(data));
                        continue;
                    }
                    let sellerName = 'Seller';
                    try {
                        const u = await getDoc(doc(db, 'users', data.sellerId));
                        if (u.exists()) {
                            const ud = u.data();
                            sellerName = `${ud.firstName || ''} ${ud.lastName || ''}`.trim() || sellerName;
                        }
                    } catch (_) {}
                    results.push({
                        id: `buyer-${d.id}`, source: 'rating', type: 'rate_seller',
                        title: `Rate your experience with ${sellerName}`,
                        message: `Your purchase is complete — how was the transaction?`,
                        listingId, purchaseId: d.id,
                        reviewedUserId: data.sellerId, reviewedUserName: sellerName,
                        role: 'seller', createdAt: data.updatedAt || data.createdAt,
                    });
                }

                for (const d of sellerSnap.docs) {
                    const data = d.data();
                    const listingId = data.listingId || data.ListingId || data.listing_id || null;
                    if (!listingId) {
                        console.warn(`NavBar: Purchases/${d.id} missing listingId — fields:`, Object.keys(data));
                        continue;
                    }
                    let buyerName = 'Buyer';
                    try {
                        const u = await getDoc(doc(db, 'users', data.buyerId));
                        if (u.exists()) {
                            const ud = u.data();
                            buyerName = `${ud.firstName || ''} ${ud.lastName || ''}`.trim() || buyerName;
                        }
                    } catch (_) {}
                    results.push({
                        id: `seller-${d.id}`, source: 'rating', type: 'rate_buyer',
                        title: `Rate your buyer — ${buyerName}`,
                        message: `Your listing was purchased — how was the buyer?`,
                        listingId, purchaseId: d.id,
                        reviewedUserId: data.buyerId, reviewedUserName: buyerName,
                        role: 'buyer', createdAt: data.updatedAt || data.createdAt,
                    });
                }

                // Drop already-dismissed ones
                const unread = results.filter((n) => !readRatingIds.includes(n.id));

                // Drop ones the user has already reviewed
                const reviewChecks = await Promise.all(
                    unread.map(async (n) => {
                        try {
                            const snap = await getDocs(query(
                                collection(db, 'reviews'),
                                where('reviewerUserId', '==', currentUser.uid),
                                where('listingId',      '==', n.listingId),
                                where('reviewedUserId', '==', n.reviewedUserId)
                            ));
                            return snap.empty ? n : null;
                        } catch (_) { return n; }
                    })
                );

                setRatingNotifications(reviewChecks.filter(Boolean));
            } catch (err) {
                console.error('NavBar: error fetching rating notifications', err);
            }
        };

        fetchRatingNotifications();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentUser]);

    // ── Merge & counts ────────────────────────────────────────────────────────

    const totalCount = offerNotifications.length + ratingNotifications.length;

    // ── Render ────────────────────────────────────────────────────────────────

    return (
        <header className={styles.navbar}>
            {/* Logo */}
            <div className={styles.logo} onClick={() => navigate('/view-listing')}>
                <div className={styles.logoBox}>
                    <i className="fa-solid fa-shop" style={{ color: '#fff', fontSize: '1.1rem' }} />
                </div>
                <span className={styles.logoText}>CampusMarket</span>
            </div>

            {/* Nav links */}
            <nav className={styles.navLinks}>
                {NAV_LINKS.map((link) => {
                    const isActive = link.path && location.pathname === link.path;
                    let cls = styles.navLink;
                    if (isActive)   cls += ` ${styles.navLinkActive}`;
                    if (!link.path) cls += ` ${styles.navLinkDisabled}`;
                    return (
                        <button
                            key={link.label}
                            className={cls}
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
                        <i className="fa-solid fa-bell" />
                        {totalCount > 0 && (
                            <span className={styles.notificationBadge}>{totalCount}</span>
                        )}
                    </button>

                    {notificationsOpen && (
                        <div className={styles.notificationDropdown}>

                            {/* Header */}
                            <div className={styles.notificationHeader}>
                                <span>Notifications</span>
                                {totalCount > 0 && (
                                    <button className={styles.markAllRead} onClick={handleMarkAllRead}>
                                        Mark all as read
                                    </button>
                                )}
                            </div>

                            {/* Scrollable list */}
                            <div className={styles.notificationList}>

                                {totalCount === 0 ? (
                                    <div className={styles.notificationEmpty}>
                                        <i className="fas fa-bell-slash" style={{ fontSize: '1.5rem', color: '#94a3b8', marginBottom: '0.5rem' }} />
                                        <p style={{ color: '#94a3b8', margin: 0, fontSize: '0.875rem' }}>No new notifications</p>
                                    </div>
                                ) : (
                                    <>
                                        {/* ── Offers & Transactions ── */}
                                        {offerNotifications.length > 0 && (
                                            <>
                                                <div className={styles.notificationSectionLabel}>
                                                    <i className="fas fa-tag" /> Offers &amp; Transactions
                                                </div>
                                                {offerNotifications.map((n) => (
                                                    <div
                                                        key={n.id}
                                                        className={styles.notificationItem}
                                                        onClick={() => handleNotificationClick(n)}
                                                        role="button"
                                                        tabIndex={0}
                                                        onKeyDown={(e) => e.key === 'Enter' && handleNotificationClick(n)}
                                                        data-testid={`notification-item-${n.id}`}
                                                    >
                                                        <div
                                                            className={styles.notificationIconWrap}
                                                            style={{ color: notificationIconColor(n.type) }}
                                                        >
                                                            <i className={`fas ${notificationIcon(n.type)}`} />
                                                        </div>
                                                        <div className={styles.notificationContent}>
                                                            <p>{notificationMessage(n)}</p>
                                                            <span>{formatTime(n.createdAt)}</span>
                                                        </div>
                                                        <i className="fas fa-chevron-right" style={{ color: '#cbd5e1', fontSize: '0.65rem', flexShrink: 0 }} />
                                                    </div>
                                                ))}
                                            </>
                                        )}

                                        {/* ── Rate & Review ── */}
                                        {ratingNotifications.length > 0 && (
                                            <>
                                                <div className={styles.notificationSectionLabel}>
                                                    <i className="fas fa-star" /> Rate &amp; Review
                                                </div>
                                                {ratingNotifications.map((n) => (
                                                    <div
                                                        key={n.id}
                                                        className={styles.notificationItem}
                                                        onClick={() => handleNotificationClick(n)}
                                                        role="button"
                                                        tabIndex={0}
                                                        onKeyDown={(e) => e.key === 'Enter' && handleNotificationClick(n)}
                                                        data-testid={`notification-item-${n.id}`}
                                                    >
                                                        <div
                                                            className={styles.notificationIconWrap}
                                                            style={{ color: notificationIconColor(n.type) }}
                                                        >
                                                            <i className={`fas ${notificationIcon(n.type)}`} />
                                                        </div>
                                                        <div className={styles.notificationContent}>
                                                            <p>{notificationMessage(n)}</p>
                                                            {n.message && (
                                                                <p style={{ color: '#94a3b8', fontSize: '0.75rem', margin: '1px 0 0' }}>
                                                                    {n.message}
                                                                </p>
                                                            )}
                                                            <span>{formatTime(n.createdAt)}</span>
                                                        </div>
                                                        <i className="fas fa-chevron-right" style={{ color: '#cbd5e1', fontSize: '0.65rem', flexShrink: 0 }} />
                                                    </div>
                                                ))}
                                            </>
                                        )}
                                    </>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* Menu Button */}
                <div className={styles.menuWrapper} ref={dropdownRef}>
                    <button
                        className={styles.iconButton}
                        onClick={() => !isLoggingOut && setDropdownOpen((v) => !v)}
                        title="Menu"
                    >
                        <i className="fa-solid fa-bars" />
                    </button>

                    {dropdownOpen && !isLoggingOut && (
                        <div className={styles.dropdown}>
                            <div className={styles.dropdownHeader}>
                                <div className={styles.dropdownAvatar} />
                                <div><span className={styles.dropdownName}>{userDisplay.name}</span></div>
                            </div>
                            <div className={styles.dropdownDivider} />
                            <button className={styles.dropdownItem} onClick={() => { navigate('/profile'); setDropdownOpen(false); }}>
                                <i className="fas fa-user" /> My Profile
                            </button>
                            <button className={styles.dropdownItem} onClick={() => { navigate('/settings'); setDropdownOpen(false); }}>
                                <i className="fas fa-cog" /> Settings
                            </button>
                            <button className={`${styles.dropdownItem} ${styles.dropdownSell}`} onClick={() => { navigate('/create-listing'); setDropdownOpen(false); }}>
                                <i className="fas fa-plus" /> Sell Item
                            </button>
                            <div className={styles.dropdownDivider} />
                            <button
                                className={`${styles.dropdownItem} ${styles.dropdownLogout}`}
                                onClick={handleLogout}
                                disabled={isLoggingOut}
                            >
                                {isLoggingOut
                                    ? <><i className="fas fa-spinner fa-spin" /> Logging out...</>
                                    : <><i className="fas fa-right-from-bracket" /> Logout</>
                                }
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
