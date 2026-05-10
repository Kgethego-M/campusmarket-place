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
    { label: "Cart",           path: "/cart", isCart: true },
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

const fetchListingDetails = async (listingId) => {
    if (!listingId) return {};
    try {
        const snap = await getDoc(doc(db, 'listings', listingId));
        if (snap.exists()) {
            const d = snap.data();
            return {
                title: d.title || d.Title || null,
                price: d.price || d.Price || null,
            };
        }
    } catch (_) {}
    return {};
};

// ── Resolve whether the current user is the seller or buyer for a
//    given transaction, then route to the correct page.
//    Seller → /trade-facility   |   Buyer → /my-purchases
async function resolveAndNavigate(transactionId, currentUser, navigate) {
    if (transactionId && currentUser) {
        try {
            const txSnap = await getDoc(doc(db, 'transactions', transactionId));
            if (txSnap.exists()) {
                const isSeller = txSnap.data().sellerId === currentUser.uid;
                navigate(isSeller ? '/trade-facility' : '/my-purchases');
                return;
            }
        } catch (err) {
            console.error('NavBar: could not resolve transaction for routing', err);
        }
    }
    // Hard fallback — should rarely be reached
    navigate('/trade-facility');
}

export default function Navbar() {
    const navigate = useNavigate();
    const location = useLocation();

    const [dropdownOpen, setDropdownOpen]           = useState(false);
    const [isLoggingOut, setIsLoggingOut]           = useState(false);
    const [notificationsOpen, setNotificationsOpen] = useState(false);
    const [currentUser, setCurrentUser]             = useState(null);

    const [offerNotifications, setOfferNotifications]   = useState([]);
    const [ratingNotifications, setRatingNotifications] = useState([]);
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

            if (n.type === 'buyer_paid') {
                // Seller gets this notification → always Trade Facility
                navigate('/trade-facility');

            } else if (n.type === 'new_offer') {
                navigate('/profile?tab=offers&highlight=' + (n.transactionId || n.listingId));

            } else if (n.type === 'offer_accepted') {
                navigate(n.transactionId ? `/payment/${n.transactionId}` : '/my-purchases');

            } else if (n.type === 'offer_declined') {
                navigate('/view-listing');

            } else if (
                n.type === 'dropoff_booked'             ||
                n.type === 'item_received_at_facility'  ||
                n.type === 'item_at_facility'           ||
                n.type === 'item_ready_for_collection'  ||
                n.type === 'collection_booked'          ||
                n.type === 'transaction_complete'
            ) {
                // ── KEY FIX ──────────────────────────────────────────────────
                // Look up the transaction and check sellerId vs currentUser.uid.
                // Seller → Trade Facility, Buyer → My Purchases.
                // This correctly handles dropoff_booked (seller action) so the
                // seller is never sent to My Purchases.
                await resolveAndNavigate(n.transactionId, currentUser, navigate);
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

    const notificationIcon = (type) => {
        if (type === 'buyer_paid')                           return 'fa-money-bill-wave';
        if (type === 'new_offer')                            return 'fa-shopping-cart';
        if (type === 'offer_accepted')                       return 'fa-circle-check';
        if (type === 'offer_declined')                       return 'fa-circle-xmark';
        if (type === 'rate_seller' || type === 'rate_buyer') return 'fa-star';
        if (type === 'item_received_at_facility')            return 'fa-box-archive';
        if (type === 'item_at_facility')                     return 'fa-warehouse';
        if (type === 'item_ready_for_collection')            return 'fa-person-walking';
        if (type === 'transaction_complete')                 return 'fa-circle-check';
        if (type === 'collection_booked')                    return 'fa-calendar-check';
        if (type === 'dropoff_booked')                       return 'fa-calendar-check';
        return 'fa-bell';
    };

    const notificationIconColor = (type) => {
        if (type === 'buyer_paid')                           return '#16a34a';
        if (type === 'new_offer')                            return '#3b82f6';
        if (type === 'offer_accepted')                       return '#22c55e';
        if (type === 'offer_declined')                       return '#ef4444';
        if (type === 'rate_seller' || type === 'rate_buyer') return '#f59e0b';
        if (type === 'item_received_at_facility')            return '#f59e0b';
        if (type === 'item_at_facility')                     return '#6AA6DA';
        if (type === 'item_ready_for_collection')            return '#8b5cf6';
        if (type === 'transaction_complete')                 return '#22c55e';
        if (type === 'collection_booked')                    return '#6d28d9';
        if (type === 'dropoff_booked')                       return '#92400e';
        return '#94a3b8';
    };

    const notificationMessage = (n) => {
        const title = n.listingTitle ? `"${n.listingTitle}"` : 'your item';
        const price = n.listingPrice ? ` · R${Number(n.listingPrice).toLocaleString('en-ZA')}` : '';
        const buyer = n.buyerName || 'A student';

        if (n.type === 'buyer_paid')     return `${buyer} has paid for ${title}. Book a drop-off slot now.`;
        if (n.type === 'new_offer')      return `${buyer} made an offer on ${title}${price}`;
        if (n.type === 'offer_accepted') return `Your offer on ${title} was accepted!${price}`;
        if (n.type === 'offer_declined') return `Your offer on ${title} was declined.`;

        if (n.type === 'rate_seller') {
            const itemPart = n.listingTitle ? ` for "${n.listingTitle}"${price}` : '';
            return `Rate your experience with ${n.reviewedUserName} as a seller${itemPart}`;
        }
        if (n.type === 'rate_buyer') {
            const itemPart = n.listingTitle ? ` — "${n.listingTitle}"${price}` : '';
            return `Rate your buyer ${n.reviewedUserName}${itemPart}`;
        }

        if (n.type === 'item_received_at_facility') return `${title} has been received at the trade facility.${price}`;
        if (n.type === 'item_at_facility')           return `${title} is now at the trade facility.${price}`;
        if (n.type === 'item_ready_for_collection')  return `${title} is ready for collection at the trade facility.${price}`;
        if (n.type === 'transaction_complete')       return `Your sale of ${title} is complete${price} — buyer notified to collect.`;
        if (n.type === 'collection_booked')          return n.message || `Collection slot booked for ${title}.`;
        if (n.type === 'dropoff_booked')             return n.message || `Drop-off slot booked for ${title}.`;
        return 'Notification';
    };

    // ── Auth + profile ────────────────────────────────────────────────────────

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

    // ── Offer notifications (real-time) ───────────────────────────────────────

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
                    const details = await fetchListingDetails(n.listingId);
                    return {
                        ...n,
                        listingTitle: n.listingTitle || details.title || null,
                        listingPrice: n.agreedPrice  || details.price || null,
                    };
                })
            );
            setOfferNotifications(enriched);
        });

        return () => unsub();
    }, [currentUser]);

    // ── Rating notifications ──────────────────────────────────────────────────

    useEffect(() => {
        if (!currentUser) return;

        const fetchRatingNotifications = async () => {
            try {
                const [buyerSnap, sellerSnap] = await Promise.all([
                    getDocs(query(collection(db, 'transactions'), where('buyerId',  '==', currentUser.uid), where('status', '==', 'completed'))),
                    getDocs(query(collection(db, 'transactions'), where('sellerId', '==', currentUser.uid), where('status', '==', 'completed'))),
                ]);

                const results = [];

                for (const d of buyerSnap.docs) {
                    const data = d.data();
                    const listingId = data.listingId || data.ListingId || data.listing_id || null;
                    if (!listingId) {
                        console.warn('NavBar: transaction missing listingId', d.id);
                        continue;
                    }

                    let sellerName = 'Seller';
                    let listingTitle = data.listingTitle || '';
                    let listingPrice = null;

                    try {
                        const [userSnap, listingSnap] = await Promise.all([
                            getDoc(doc(db, 'users', data.sellerId)),
                            getDoc(doc(db, 'listings', listingId)),
                        ]);
                        if (userSnap.exists()) {
                            const ud = userSnap.data();
                            sellerName = `${ud.firstName || ''} ${ud.lastName || ''}`.trim() || sellerName;
                        }
                        if (listingSnap.exists()) {
                            const ld = listingSnap.data();
                            listingTitle = listingTitle || ld.title || ld.Title || '';
                            listingPrice = ld.price || ld.Price || null;
                        }
                    } catch (_) {}

                    results.push({
                        id: `buyer-${d.id}`, source: 'rating', type: 'rate_seller',
                        title: `Rate your experience with ${sellerName}`,
                        message: `Your purchase is complete — how was the transaction?`,
                        listingId,
                        listingTitle,
                        listingPrice,
                        purchaseId: d.id,
                        reviewedUserId: data.sellerId,
                        reviewedUserName: sellerName,
                        role: 'seller',
                        createdAt: data.updatedAt || data.createdAt,
                    });
                }

                for (const d of sellerSnap.docs) {
                    const data = d.data();
                    const listingId = data.listingId || data.ListingId || data.listing_id || null;
                    if (!listingId) {
                        console.warn('NavBar: transaction missing listingId', d.id);
                        continue;
                    }

                    let buyerName = 'Buyer';
                    let listingTitle = data.listingTitle || '';
                    let listingPrice = null;

                    try {
                        const [userSnap, listingSnap] = await Promise.all([
                            getDoc(doc(db, 'users', data.buyerId)),
                            getDoc(doc(db, 'listings', listingId)),
                        ]);
                        if (userSnap.exists()) {
                            const ud = userSnap.data();
                            buyerName = `${ud.firstName || ''} ${ud.lastName || ''}`.trim() || buyerName;
                        }
                        if (listingSnap.exists()) {
                            const ld = listingSnap.data();
                            listingTitle = listingTitle || ld.title || ld.Title || '';
                            listingPrice = ld.price || ld.Price || null;
                        }
                    } catch (_) {}

                    results.push({
                        id: `seller-${d.id}`, source: 'rating', type: 'rate_buyer',
                        title: `Rate your buyer — ${buyerName}`,
                        message: `Your listing was purchased — how was the buyer?`,
                        listingId,
                        listingTitle,
                        listingPrice,
                        purchaseId: d.id,
                        reviewedUserId: data.buyerId,
                        reviewedUserName: buyerName,
                        role: 'buyer',
                        createdAt: data.updatedAt || data.createdAt,
                    });
                }

                const unread = results.filter((n) => !readRatingIds.includes(n.id));

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
                            {link.isCart
                                ? <span className={styles.cartNavItem}><i className="fas fa-shopping-cart" />Cart</span>
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
                            <div className={styles.notificationHeader}>
                                <span>Notifications</span>
                                {totalCount > 0 && (
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
                                        {offerNotifications.length > 0 && (
                                            <>
                                                <div className={styles.notificationSectionLabel}>
                                                    <i className="fas fa-tag" /> Offers &amp; Transactions
                                                </div>
                                                {offerNotifications.map((n) => (
                                                    <div
                                                        key={n.id}
                                                        data-testid={`notification-item-${n.id}`}
                                                        className={styles.notificationItem}
                                                        onClick={() => handleNotificationClick(n)}
                                                        role="button"
                                                        tabIndex={0}
                                                        onKeyDown={(e) => e.key === 'Enter' && handleNotificationClick(n)}
                                                    >
                                                        <div className={styles.notificationIconWrap} style={{ color: notificationIconColor(n.type) }}>
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
                                        {ratingNotifications.length > 0 && (
                                            <>
                                                <div className={styles.notificationSectionLabel}>
                                                    <i className="fas fa-star" /> Rate &amp; Review
                                                </div>
                                                {ratingNotifications.map((n) => (
                                                    <div
                                                        key={n.id}
                                                        data-testid={`notification-item-${n.id}`}
                                                        className={styles.notificationItem}
                                                        onClick={() => handleNotificationClick(n)}
                                                        role="button"
                                                        tabIndex={0}
                                                        onKeyDown={(e) => e.key === 'Enter' && handleNotificationClick(n)}
                                                    >
                                                        <div className={styles.notificationIconWrap} style={{ color: notificationIconColor(n.type) }}>
                                                            <i className={`fas ${notificationIcon(n.type)}`} />
                                                        </div>
                                                        <div className={styles.notificationContent}>
                                                            <p>{notificationMessage(n)}</p>
                                                            {n.message && <p style={{ color: '#94a3b8', fontSize: '0.75rem', margin: '1px 0 0' }}>{n.message}</p>}
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

            {isLoggingOut && (
                <div className={styles.logoutOverlay}>
                    <div className={styles.logoutLoader}>
                        <i className="fas fa-spinner fa-spin" />
                        <p>Logging out...</p>
                    </div>
                </div>
            )}

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
                            link.label === 'Browse'       ? 'fa-store' :
                            link.label === 'Messages'     ? 'fa-comment' :
                            link.label === 'My Purchases' ? 'fa-bag-shopping' :
                            link.label === 'Cart'         ? 'fa-cart-shopping' :
                            'fa-arrows-rotate'
                        }`} />
                        <span>{link.label}</span>
                    </button>
                ))}
            </nav>
        </header>
    );
}
