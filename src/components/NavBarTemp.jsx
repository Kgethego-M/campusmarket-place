import { useState, useRef, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { auth, db } from "../firebase";
import {
    collection, query, where, onSnapshot, getDocs,
    doc, getDoc, updateDoc,
} from "firebase/firestore";
import { signOut, onAuthStateChanged } from "firebase/auth";
import { markRatingAsRead, isRatingNotificationDismissed } from "../services/notificationService";
import styles from "./NavBar.module.css";

const NAV_LINKS = [
    { label: "Browse",         path: "/view-listing" },
    { label: "Trade Facility", path: "/trade-facility" },
    { label: "Messages",       path: "/chat" },
    { label: "My Purchases",   path: "/my-purchases" },
    { label: "Favorites",      path: "/favourites", isFavorite: true },
];

const formatTime = (ts) => {
    if (!ts) return '';
    const d = ts?.toDate ? ts.toDate() : new Date(ts);
    const diff = Math.floor((Date.now() - d.getTime()) / 1000);
    if (diff < 60)    return 'Just now';
    if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return d.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' });
};

// ── Icon + colour maps ────────────────────────────────────────────────────────

const ICON_MAP = {
    buyer_paid:                  'fa-money-bill-wave',
    new_offer:                   'fa-shopping-cart',
    offer_accepted:              'fa-circle-check',
    trade_waiting:               'fa-clock',
    offer_declined:              'fa-circle-xmark',
    rate_seller:                 'fa-star',
    rate_buyer:                  'fa-star',
    item_received_at_facility:   'fa-box-archive',
    item_at_facility:            'fa-warehouse',
    item_ready_for_collection:   'fa-person-walking',
    item_collected:              'fa-handshake',
    transaction_complete:        'fa-circle-check',
    dropoff_booked:              'fa-calendar-check',
    buyer_dropoff_booked:        'fa-calendar-check',
    seller_dropoff_booked:       'fa-calendar-check',
    trade_dropoff_required:      'fa-calendar-plus',
    overdue_collection_buyer:    'fa-triangle-exclamation',
    overdue_collection_seller:   'fa-triangle-exclamation',
    overdue_dropoff_seller:      'fa-triangle-exclamation',
    overdue_dropoff_buyer:       'fa-clock',
    cancelled_dropoff_seller:    'fa-ban',
    cancelled_dropoff_buyer:     'fa-ban',
    cancelled_collection_seller: 'fa-ban',
    cancelled_collection_buyer:  'fa-ban',
};

const COLOR_MAP = {
    buyer_paid:                  '#16a34a',
    new_offer:                   '#3b82f6',
    offer_accepted:              '#22c55e',
    trade_waiting:               '#f59e0b',
    offer_declined:              '#ef4444',
    rate_seller:                 '#f59e0b',
    rate_buyer:                  '#f59e0b',
    item_received_at_facility:   '#f59e0b',
    item_at_facility:            '#6AA6DA',
    item_ready_for_collection:   '#8b5cf6',
    item_collected:              '#22c55e',
    transaction_complete:        '#22c55e',
    dropoff_booked:              '#92400e',
    buyer_dropoff_booked:        '#92400e',
    seller_dropoff_booked:       '#92400e',
    trade_dropoff_required:      '#7c3aed',
    overdue_collection_buyer:    '#dc2626',
    overdue_collection_seller:   '#dc2626',
    overdue_dropoff_seller:      '#dc2626',
    overdue_dropoff_buyer:       '#f59e0b',
    cancelled_dropoff_seller:    '#dc2626',
    cancelled_dropoff_buyer:     '#dc2626',
    cancelled_collection_seller: '#dc2626',
    cancelled_collection_buyer:  '#dc2626',
};

export default function Navbar() {
    const navigate = useNavigate();
    const location = useLocation();

    const [isLoggingOut,       setIsLoggingOut]       = useState(false);
    const [notificationsOpen,  setNotificationsOpen]  = useState(false);
    const [avatarMenuOpen,     setAvatarMenuOpen]     = useState(false);
    const [currentUser,        setCurrentUser]        = useState(null);
    const [notifications,      setNotifications]      = useState([]);
    const [userDisplay,        setUserDisplay]        = useState({
        name: 'Student', email: '', photoURL: '', initials: 'S',
    });

    const notificationRef = useRef(null);
    const avatarRef       = useRef(null);

    // ── Mark as read ──────────────────────────────────────────────────────────

    const markAsRead = async (id) => {
        try { await updateDoc(doc(db, 'notifications', id), { read: true }); }
        catch (err) { console.error('markAsRead failed:', err); }
    };

    // ── Notification click ────────────────────────────────────────────────────

    const handleNotificationClick = async (n) => {
        setNotificationsOpen(false);
        
        // For rating notifications, mark as read in localStorage
        if (n.type === 'rate_seller' || n.type === 'rate_buyer') {
            markRatingAsRead(n.id);
        }
        
        // Mark as read in Firestore
        await markAsRead(n.id);
        
        // Use the redirectPath from the notification
        if (n.redirectPath) {
            navigate(n.redirectPath);
        } else {
            // Fallback to default pages if no redirectPath
            const isRating = n.type === 'rate_seller' || n.type === 'rate_buyer';
            if (isRating && n.listingId && n.reviewedUserId) {
                navigate(
                    `/review/${n.listingId}` +
                    `?reviewedUserId=${n.reviewedUserId}` +
                    `&name=${encodeURIComponent(n.reviewedUserName || 'User')}` +
                    `&role=${n.type === 'rate_seller' ? 'seller' : 'buyer'}` +
                    `&purchaseId=${n.transactionId || ''}`
                );
            } else {
                navigate('/my-purchases');
            }
        }
    };

    const handleMarkAllRead = async () => {
        const transactional = notifications.filter(
            n => n.type !== 'rate_seller' && n.type !== 'rate_buyer'
        );
        try {
            await Promise.all(transactional.map(n => markAsRead(n.id)));
        } catch (err) {
            console.error('Failed to mark all as read:', err);
        }
    };

    const notificationIcon = (type) => ICON_MAP[type] || 'fa-bell';
    const notificationColor = (type) => COLOR_MAP[type] || '#94a3b8';

    const notificationMessage = (n) => {
        // If there's a custom message, use it
        if (n.message) return n.message;
        
        const title = n.listingTitle ? `"${n.listingTitle}"` : 'your item';
        const buyer = n.buyerName || 'A student';
        
        const messages = {
            buyer_paid:                  `${buyer} has paid for ${title}. Book a drop-off slot now.`,
            new_offer:                   `${buyer} made an offer on ${title}`,
            offer_accepted:              `Your offer on ${title} was accepted! Head to payment.`,
            trade_waiting:               `Your trade offer on ${title} was accepted — head to the trade facility.`,
            offer_declined:              `Your offer on ${title} was declined.`,
            item_received_at_facility:   `${title} has been received at the trade facility.`,
            item_at_facility:            `${title} has been dropped off and is ready to collect.`,
            item_ready_for_collection:   `${title} is ready for collection at the trade facility.`,
            item_collected:              `${title} has been collected. Transaction complete!`,
            transaction_complete:        `Your transaction for ${title} is complete.`,
            dropoff_booked:              `Drop-off slot booked for ${title}.`,
            buyer_dropoff_booked:        `Your trade drop-off for ${title} is confirmed.`,
            seller_dropoff_booked:       `The seller has booked drop-off for ${title}.`,
            trade_dropoff_required:      `Book your trade drop-off slot for ${title}.`,
            overdue_collection_buyer:    `Your collection of ${title} is overdue. Please come to the trade facility.`,
            overdue_collection_seller:   `The buyer has not yet collected ${title}.`,
            overdue_dropoff_seller:      `Your drop-off for ${title} is overdue.`,
            overdue_dropoff_buyer:       `The seller has not yet dropped off ${title}.`,
            cancelled_dropoff_seller:    `Your transaction for ${title} was cancelled due to missed drop-off.`,
            cancelled_dropoff_buyer:     `Your transaction for ${title} was cancelled — the seller didn't drop off.`,
            cancelled_collection_seller: `Transaction cancelled — buyer didn't collect ${title}.`,
            cancelled_collection_buyer:  `Your transaction for ${title} was cancelled due to non-collection.`,
            rate_seller:                 `How was ${n.reviewedUserName || 'the seller'} as a seller for ${title}?`,
            rate_buyer:                  `How was ${n.reviewedUserName || 'the buyer'} as a buyer for ${title}?`,
        };
        
        return messages[n.type] || 'You have a new notification';
    };

    // ── Auth + profile ────────────────────────────────────────────────────────

    useEffect(() => {
        const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
            if (!firebaseUser) {
                setUserDisplay({ name: 'Student', email: '', photoURL: '', initials: 'S' });
                setCurrentUser(null);
                setNotifications([]);
                return;
            }
            setCurrentUser(firebaseUser);

            const parts    = (firebaseUser.displayName || '').split(' ');
            const fn       = parts[0] || '';
            const ln       = parts.slice(1).join(' ') || '';
            const initials = `${fn[0] || ''}${ln[0] || ''}`.toUpperCase() || 'S';
            setUserDisplay({
                name:     firebaseUser.displayName || 'Student',
                email:    firebaseUser.email        || '',
                photoURL: firebaseUser.photoURL     || '',
                initials,
            });

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

    // ── Outside-click close ───────────────────────────────────────────────────

    useEffect(() => {
        const handle = (e) => {
            if (notificationRef.current && !notificationRef.current.contains(e.target))
                setNotificationsOpen(false);
            if (avatarRef.current && !avatarRef.current.contains(e.target))
                setAvatarMenuOpen(false);
        };
        document.addEventListener('mousedown', handle);
        return () => document.removeEventListener('mousedown', handle);
    }, []);

    // ── Logout ────────────────────────────────────────────────────────────────

    const handleLogout = () => {
        setIsLoggingOut(true);
        setAvatarMenuOpen(false);
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
            }
        }, 2000);
    };

    // ── Real-time notifications listener ─────────────────────────────────────

    useEffect(() => {
        if (!currentUser) return;

        const q = query(
            collection(db, 'notifications'),
            where('userId', '==', currentUser.uid),
            where('read',   '==', false),
        );

        const unsub = onSnapshot(q, async (snapshot) => {
            const raw = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            
            // Sort by createdAt (newest first)
            const sorted = raw.sort((a, b) => {
                const ta = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : new Date(a.createdAt || 0).getTime();
                const tb = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : new Date(b.createdAt || 0).getTime();
                return tb - ta;
            });

            // Deduplicate: for overdue/recurring notification types, keep only the
            // most-recent notification per (type + transactionId) pair
            const DEDUP_TYPES = new Set([
                'overdue_collection_buyer',
                'overdue_collection_seller',
                'overdue_dropoff_seller',
                'overdue_dropoff_buyer',
                'cancelled_dropoff_seller',
                'cancelled_dropoff_buyer',
                'cancelled_collection_seller',
                'cancelled_collection_buyer',
            ]);
            const seen = new Set();
            const deduped = sorted.filter((n) => {
                if (!DEDUP_TYPES.has(n.type)) return true;
                const key = `${n.type}::${n.transactionId || ''}`;
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            });

            // Filter out rating notifications that were dismissed
            const finalNotifications = deduped.filter(n => {
                if (n.type === 'rate_seller' || n.type === 'rate_buyer') {
                    return !isRatingNotificationDismissed(n.id);
                }
                return true;
            });

            setNotifications(finalNotifications);
        });
        return () => unsub();
    }, [currentUser]);

    // ── Split for rendering sections ──────────────────────────────────────────

    const transactionalNotifs = notifications.filter(
        n => n.type !== 'rate_seller' && n.type !== 'rate_buyer'
    );
    const ratingNotifs = notifications.filter(
        n => n.type === 'rate_seller' || n.type === 'rate_buyer'
    );
    const totalCount = notifications.length;

    // ── Render ────────────────────────────────────────────────────────────────

    return (
        <>
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
                                {link.isFavorite
                                    ? <span className={styles.cartNavItem}><i className="fas fa-heart" />Favorites</span>
                                    : link.label
                                }
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
                            onClick={() => setNotificationsOpen(v => !v)}
                            title="Notifications"
                        >
                            <i className="fa-solid fa-bell" />
                            {totalCount > 0 && (
                                <span className={styles.notificationBadge}>{totalCount}</span>
                            )}
                        </button>

                        {notificationsOpen && (
                            <div className={styles.notificationDropdown}>
                                <div className={styles.notificationHeader}>
                                    <span>Notifications</span>
                                    {transactionalNotifs.length > 0 && (
                                        <button className={styles.markAllRead} onClick={handleMarkAllRead}>
                                            Mark all as read
                                        </button>
                                    )}
                                </div>

                                <div className={styles.notificationList}>
                                    {totalCount === 0 ? (
                                        <div className={styles.notificationEmpty}>
                                            <i className="fas fa-bell-slash" style={{ fontSize: '1.5rem', color: '#94a3b8', marginBottom: '0.5rem' }} />
                                            <p style={{ color: '#94a3b8', margin: 0, fontSize: '0.875rem' }}>No new notifications</p>
                                        </div>
                                    ) : (
                                        <>
                                            {transactionalNotifs.length > 0 && (
                                                <>
                                                    <div className={styles.notificationSectionLabel}>
                                                        <i className="fas fa-tag" /> Offers &amp; Transactions
                                                    </div>
                                                    {transactionalNotifs.map(n => (
                                                        <NotificationRow
                                                            key={n.id}
                                                            n={n}
                                                            onClick={handleNotificationClick}
                                                            notificationIcon={notificationIcon}
                                                            notificationColor={notificationColor}
                                                            notificationMessage={notificationMessage}
                                                            formatTime={formatTime}
                                                        />
                                                    ))}
                                                </>
                                            )}
                                            {ratingNotifs.length > 0 && (
                                                <>
                                                    <div className={styles.notificationSectionLabel}>
                                                        <i className="fas fa-star" /> Rate &amp; Review
                                                    </div>
                                                    {ratingNotifs.map(n => (
                                                        <NotificationRow
                                                            key={n.id}
                                                            n={n}
                                                            onClick={handleNotificationClick}
                                                            notificationIcon={notificationIcon}
                                                            notificationColor={notificationColor}
                                                            notificationMessage={notificationMessage}
                                                            formatTime={formatTime}
                                                        />
                                                    ))}
                                                </>
                                            )}
                                        </>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Avatar */}
                    <div className={styles.avatarWrapper} ref={avatarRef}>
                        <button
                            className={styles.avatarButton}
                            onClick={() => setAvatarMenuOpen(v => !v)}
                            title={userDisplay.name}
                            aria-label="Account menu"
                        >
                            {userDisplay.photoURL ? (
                                <img src={userDisplay.photoURL} alt={userDisplay.name} className={styles.avatarImg} />
                            ) : (
                                <span className={styles.avatarInitials}>{userDisplay.initials}</span>
                            )}
                        </button>

                        {avatarMenuOpen && !isLoggingOut && (
                            <div className={styles.avatarDropdown}>
                                <div className={styles.avatarDropdownUser}>
                                    <span className={styles.avatarDropdownName}>{userDisplay.name}</span>
                                    {userDisplay.email && (
                                        <span className={styles.avatarDropdownEmail}>{userDisplay.email}</span>
                                    )}
                                </div>
                                <div className={styles.dropdownDivider} />
                                <button
                                    className={styles.avatarDropdownItem}
                                    onClick={() => { navigate('/profile'); setAvatarMenuOpen(false); }}
                                >
                                    <i className="fas fa-user" /> My Profile
                                </button>
                                <div className={styles.dropdownDivider} />
                                <button
                                    className={`${styles.avatarDropdownItem} ${styles.avatarDropdownLogout}`}
                                    onClick={handleLogout}
                                >
                                    <i className="fas fa-right-from-bracket" /> Log out
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                {/* Mobile bottom nav */}
                <nav className={styles.mobileNav} aria-hidden="true">
                    {NAV_LINKS.map((link) => (
                        <button
                            key={link.label}
                            tabIndex={-1}
                            className={`${styles.mobileNavBtn} ${location.pathname === link.path ? styles.mobileNavBtnActive : ''}`}
                            onClick={() => link.path && navigate(link.path)}
                        >
                            <i className={`fas ${
                                link.label === 'Browse'       ? 'fa-store'        :
                                link.label === 'Messages'     ? 'fa-comment'      :
                                link.label === 'My Purchases' ? 'fa-bag-shopping' :
                                link.label === 'Favorites'    ? 'fa-heart'        :
                                'fa-arrows-rotate'
                            }`} />
                            <span>{link.label}</span>
                        </button>
                    ))}
                </nav>
            </header>

            {/* FAB */}
            <button
                className={styles.fab}
                onClick={() => navigate('/create-listing')}
                title="Sell an item"
                aria-label="Sell an item"
            >
                <i className="fas fa-plus" />
            </button>

            {/* Logout overlay */}
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

// ── Notification row sub-component ────────────────────────────────────────────

function NotificationRow({ n, onClick, notificationIcon, notificationColor, notificationMessage, formatTime }) {
    return (
        <div
            key={n.id}
            data-testid={`notification-item-${n.id}`}
            className={styles.notificationItem}
            onClick={() => onClick(n)}
            role="button"
            tabIndex={0}
            onKeyDown={e => e.key === 'Enter' && onClick(n)}
        >
            <div
                className={styles.notificationIconWrap}
                style={{ color: notificationColor(n.type) }}
            >
                <i className={`fas ${notificationIcon(n.type)}`} />
            </div>
            <div className={styles.notificationContent}>
                <p>{notificationMessage(n)}</p>
                <span>{formatTime(n.createdAt)}</span>
            </div>
            {n.redirectPath && (
                <i className="fas fa-chevron-right" style={{ color: '#cbd5e1', fontSize: '0.65rem', flexShrink: 0 }} />
            )}
        </div>
    );
}