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

// ── Helpers ────────────────────────────────────────────────────────────────

const formatTime = (ts) => {
    if (!ts) return '';
    const d = ts?.toDate ? ts.toDate() : new Date(ts);
    if (isNaN(d.getTime())) return '';
    const diff = Math.floor((Date.now() - d.getTime()) / 1000);
    if (diff < 60)    return 'Just now';
    if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return d.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' });
};

// Returns a JS Date (or epoch 0) so we can sort by it
const tsToDate = (ts) => {
    if (!ts) return new Date(0);
    if (ts?.toDate) return ts.toDate();
    const d = new Date(ts);
    return isNaN(d.getTime()) ? new Date(0) : d;
};

// Resolves a listing title from Firestore given any of the possible id fields
// stored on a notification or transaction document.
const fetchListingTitle = async (listingId) => {
    if (!listingId) return null;
    try {
        const snap = await getDoc(doc(db, 'listings', listingId));
        if (snap.exists()) {
            const d = snap.data();
            return {
                title: d.title || d.Title || null,
                price: d.price || d.Price || null,
            };
        }
    } catch (_) {
        console.error('Error fetching listing title:', _);
    }
    return null;
};

// ── Try every possible field name for the transaction ID,
//    look it up, check sellerId vs currentUser.uid, and route.
//    Seller → /trade-facility  |  Buyer → /my-purchases
async function resolveAndNavigate(notification, currentUser, navigate) {
    // Grab the transaction ID from whichever field it's stored under
    const transactionId =
        notification.transactionId  ||
        notification.transaction_id ||
        notification.txnId          ||
        notification.txId           ||
        null;

    if (transactionId && currentUser) {
        try {
            const txSnap = await getDoc(doc(db, 'transactions', transactionId));
            if (txSnap.exists()) {
                const isSeller = txSnap.data().sellerId === currentUser.uid;
                navigate(isSeller ? '/trade-facility' : '/my-purchases');
                return;
            }
        } catch (err) {
            console.error('NavBar: resolveAndNavigate error', err);
        }
    }

    // No transaction ID or lookup failed — use the notification type to guess
    // Buyer-facing types → My Purchases, seller-facing → Trade Facility
    const BUYER_TYPES = [
        'item_at_facility',
        'item_ready_for_collection',
        'collection_booked',
        'item_collected',
        'offer_accepted',
    ];
    const isBuyerNotification = BUYER_TYPES.includes(notification.type);
    navigate(isBuyerNotification ? '/my-purchases' : '/trade-facility');
}

// Picks the first truthy listing-id field from a notification document,
// covering every field name that has been used across the codebase.
const resolveListingId = (n) =>
    n.listingId || n.relatedListingId || n.listing_id || n.ListingId || null;

// ── Notification content helpers (single definition) ─────────────────────

const getNotificationIcon = (type) => {
    switch (type) {
        case 'buyer_paid':                  return 'fa-money-bill-wave';
        case 'new_offer':                   return 'fa-shopping-cart';
        case 'offer_accepted':              return 'fa-circle-check';
        case 'offer_declined':              return 'fa-circle-xmark';
        case 'rate_seller':
        case 'rate_buyer':                  return 'fa-star';
        case 'item_received_at_facility':   return 'fa-box-archive';
        case 'item_at_facility':            return 'fa-warehouse';
        case 'item_ready_for_collection':   return 'fa-person-walking';
        case 'transaction_complete':        return 'fa-circle-check';
        case 'drop_off_booked':
        case 'booking_confirmed':           return 'fa-calendar-check';
        case 'offer_countered':             return 'fa-arrows-left-right';
        case 'payment_received':            return 'fa-credit-card';
        default:                            return 'fa-bell';
    }
};

const getNotificationIconColor = (type) => {
    switch (type) {
        case 'buyer_paid':
        case 'payment_received':            return '#16a34a';
        case 'new_offer':                   return '#3b82f6';
        case 'offer_accepted':
        case 'transaction_complete':        return '#22c55e';
        case 'offer_declined':              return '#ef4444';
        case 'rate_seller':
        case 'rate_buyer':                  return '#f59e0b';
        case 'item_received_at_facility':   return '#f59e0b';
        case 'item_at_facility':            return '#6AA6DA';
        case 'item_ready_for_collection':   return '#8b5cf6';
        case 'drop_off_booked':
        case 'booking_confirmed':           return '#0ea5e9';
        case 'offer_countered':             return '#f97316';
        default:                            return '#94a3b8';
    }
};

// Produces a specific, human-readable message for every notification type.
// `n.listingTitle` should already be resolved before calling this.
const getNotificationMessage = (n) => {
    const item   = n.listingTitle ? `"${n.listingTitle}"` : 'your item';
    const buyer  = n.buyerName  || 'Your buyer';
    const seller = n.sellerName || 'Your seller';

    switch (n.type) {
        case 'buyer_paid':
            return `${buyer} paid for ${item}. Book a drop-off slot now.`;
        case 'payment_received':
            return `Payment received for ${item}. Awaiting drop-off booking.`;
        case 'new_offer':
            return `${buyer} made an offer on ${item}.`;
        case 'offer_accepted':
            return `Your offer on ${item} was accepted — proceed to payment.`;
        case 'offer_declined':
            return `Your offer on ${item} was declined.`;
        case 'offer_countered':
            return `${seller} countered your offer on ${item}.`;
        case 'drop_off_booked':
        case 'booking_confirmed':
            return n.dropOffDate
                ? `Drop-off for ${item} booked on ${n.dropOffDate}${n.dropOffTimeSlot ? ` at ${n.dropOffTimeSlot}` : ''}.`
                : `A drop-off slot has been booked for ${item}.`;
        case 'item_received_at_facility':
            return `${item} has been received at the trade facility.`;
        case 'item_at_facility':
            return `${item} is at the facility — payment will be processed shortly.`;
        case 'item_ready_for_collection':
            return `${item} is ready for collection at the trade facility.`;
        case 'transaction_complete':
            return `Your sale of ${item} is complete. The buyer has been notified to collect.`;
        case 'rate_seller': {
            const rItem = n.listingTitle ? ` for "${n.listingTitle}"` : '';
            const rName = n.reviewedUserName || 'the seller';
            return `How was ${rName} as a seller${rItem}?`;
        }
        case 'rate_buyer': {
            const rItem = n.listingTitle ? ` for "${n.listingTitle}"` : '';
            const rName = n.reviewedUserName || 'the buyer';
            return `How was ${rName} as a buyer${rItem}?`;
        }
        default:
            return n.message || n.title || n.body || '(no details available)';
    }
};

// ── Component ──────────────────────────────────────────────────────────────

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

    // ── Notification actions ─────────────────────────────────────────────────

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

            switch (n.type) {
                case 'buyer_paid':
                case 'payment_received':
                    navigate('/trade-facility');
                    break;
                case 'new_offer':
                    navigate('/profile?tab=offers&highlight=' + (n.transactionId || n.listingId));
                    break;
                case 'offer_accepted':
                    navigate(n.transactionId ? `/payment/${n.transactionId}` : '/my-purchases');
                    break;
                case 'offer_declined':
                case 'offer_countered':
                    navigate('/view-listing');
                    break;
                case 'drop_off_booked':
                case 'booking_confirmed':
                    navigate('/trade-facility');
                    break;
                case 'item_received_at_facility':
                case 'item_at_facility':
                case 'item_ready_for_collection':
                case 'transaction_complete':
                    navigate('/my-purchases');
                    break;
                default:
                    if (n.transactionId) navigate(`/my-purchases`);
                    else navigate('/trade-facility');
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
            setUserDisplay({
                name: firebaseUser.displayName || 'Student',
                email: firebaseUser.email || '',
                photoURL: firebaseUser.photoURL || '',
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

    // ── Outside-click to close dropdowns ────────────────────────────────────

    useEffect(() => {
        const handle = (e) => {
            if (dropdownRef.current     && !dropdownRef.current.contains(e.target))     setDropdownOpen(false);
            if (notificationRef.current && !notificationRef.current.contains(e.target)) setNotificationsOpen(false);
        };
        document.addEventListener('mousedown', handle);
        return () => document.removeEventListener('mousedown', handle);
    }, []);

    // ── Logout ───────────────────────────────────────────────────────────────

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

    // ── Offer notifications (real-time, sorted newest → oldest) ─────────────

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
                    // Resolve the listing id using every possible field name, then
                    // fetch the title from Firestore if it wasn't stored on the doc.
                    const listingId    = resolveListingId(n);
                    const listingData = n.listingTitle ? null : await fetchListingTitle(listingId);
                    const listingTitle = n.listingTitle || (listingData?.title) || null;

                    // Resolve buyer/seller display names if not stored on the doc
                    let buyerName  = n.buyerName  || null;
                    let sellerName = n.sellerName || null;
                    try {
                        const fetches = await Promise.all([
                            (!buyerName  && n.buyerId)  ? getDoc(doc(db, 'users', n.buyerId))  : Promise.resolve(null),
                            (!sellerName && n.sellerId) ? getDoc(doc(db, 'users', n.sellerId)) : Promise.resolve(null),
                        ]);
                        if (fetches[0]?.exists()) {
                            const ud = fetches[0].data();
                            buyerName = `${ud.firstName || ''} ${ud.lastName || ''}`.trim() || null;
                        }
                        if (fetches[1]?.exists()) {
                            const ud = fetches[1].data();
                            sellerName = `${ud.firstName || ''} ${ud.lastName || ''}`.trim() || null;
                        }
                    } catch (_) {}

                    return { ...n, listingId, listingTitle, buyerName, sellerName };
                })
            );

            // Sort newest first using createdAt
            enriched.sort((a, b) => tsToDate(b.createdAt) - tsToDate(a.createdAt));

            setOfferNotifications(enriched);
        });

        return () => unsub();
    }, [currentUser]);

    // ── Rating notifications (sorted newest → oldest) ────────────────────────

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
                    const data      = d.data();
                    // Cover every field name used across the codebase
                    const listingId = data.listingId || data.ListingId || data.listing_id || null;
                    if (!listingId) continue;

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
                    const data      = d.data();
                    const listingId = data.listingId || data.ListingId || data.listing_id || null;
                    if (!listingId) continue;

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

                // Filter already-read, then sort newest first
                const unread = results
                    .filter((n) => !readRatingIds.includes(n.id))
                    .sort((a, b) => tsToDate(b.createdAt) - tsToDate(a.createdAt));

                // Remove ones the user already reviewed
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

    // Combined list shown in a single sorted feed (newest first)
    const allNotifications = [...offerNotifications, ...ratingNotifications]
        .sort((a, b) => tsToDate(b.createdAt) - tsToDate(a.createdAt));

    const totalCount = offerNotifications.length + ratingNotifications.length;

    // ── Render ───────────────────────────────────────────────────────────────

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
                                    allNotifications.map((n) => (
                                        <div
                                            key={n.id}
                                            data-testid={`notification-item-${n.id}`}
                                            className={styles.notificationItem}
                                            onClick={() => handleNotificationClick(n)}
                                            role="button"
                                            tabIndex={0}
                                            onKeyDown={(e) => e.key === 'Enter' && handleNotificationClick(n)}
                                        >
                                            <div
                                                className={styles.notificationIconWrap}
                                                style={{ color: getNotificationIconColor(n.type) }}
                                            >
                                                <i className={`fas ${getNotificationIcon(n.type)}`} />
                                            </div>
                                            <div className={styles.notificationContent}>
                                                <p>{getNotificationMessage(n)}</p>
                                                {n.listingTitle && (
                                                    <p className={styles.notificationSubline}>
                                                        {n.listingTitle}
                                                    </p>
                                                )}
                                                <span>{formatTime(n.createdAt)}</span>
                                            </div>
                                            <i className="fas fa-chevron-right" style={{ color: '#cbd5e1', fontSize: '0.65rem', flexShrink: 0 }} />
                                        </div>
                                    ))
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
                            link.label === 'Browse'         ? 'fa-store' :
                            link.label === 'Messages'       ? 'fa-comment' :
                            link.label === 'My Purchases'   ? 'fa-bag-shopping' :
                            link.label === 'Cart'           ? 'fa-cart-shopping' :
                            'fa-arrows-rotate'
                        }`} />
                        <span>{link.label}</span>
                    </button>
                ))}
            </nav>
        </header>
    );
}