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
    { label: "Favorites", path: "/favourites", isFavorite: true },
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

// ── Notification config ───────────────────────────────────────────────────────

const NOTIFICATION_CONFIG = {
    // Offer / transaction lifecycle
    new_offer:               { icon: 'fa-tag',             color: '#3b82f6', label: 'Offer received'    },
    offer_accepted:          { icon: 'fa-circle-check',    color: '#22c55e', label: 'Offer accepted'    },
    offer_declined:          { icon: 'fa-circle-xmark',    color: '#ef4444', label: 'Offer declined'    },
    trade_waiting:           { icon: 'fa-arrows-rotate',   color: '#7c3aed', label: 'Trade accepted'    },
    buyer_paid:              { icon: 'fa-money-bill-wave', color: '#16a34a', label: 'Payment received'  },
    // Drop-off
    dropoff_booked:          { icon: 'fa-calendar-check',  color: '#0369a1', label: 'Drop-off booked'   },
    seller_dropoff_booked:   { icon: 'fa-calendar-check',  color: '#0369a1', label: 'Drop-off booked'   },
    trade_dropoff_required:  { icon: 'fa-calendar-plus',   color: '#7c3aed', label: 'Book drop-off'     },
    buyer_dropoff_booked:    { icon: 'fa-calendar-check',  color: '#7c3aed', label: 'Trade drop-off'    },
    // Facility
    item_received_at_facility: { icon: 'fa-box-archive',   color: '#f59e0b', label: 'Item received'     },
    item_at_facility:          { icon: 'fa-warehouse',     color: '#6AA6DA', label: 'At facility'       },
    item_ready_for_collection: { icon: 'fa-person-walking',color: '#8b5cf6', label: 'Ready to collect'  },
    collection_booked:         { icon: 'fa-calendar-check',color: '#6d28d9', label: 'Collection booked' },
    item_collected:            { icon: 'fa-handshake',     color: '#22c55e', label: 'Item collected'    },
    transaction_complete:      { icon: 'fa-circle-check',  color: '#22c55e', label: 'Complete'          },
    // Rating
    rate_seller:             { icon: 'fa-star',            color: '#f59e0b', label: 'Rate seller'       },
    rate_buyer:              { icon: 'fa-star',            color: '#f59e0b', label: 'Rate buyer'        },
    // Overdue
    overdue_dropoff_buyer:   { icon: 'fa-triangle-exclamation', color: '#dc2626', label: 'Overdue Drop-off' },
    overdue_dropoff_seller:  { icon: 'fa-triangle-exclamation', color: '#dc2626', label: 'Overdue Drop-off' },
    overdue_collection_buyer: { icon: 'fa-triangle-exclamation', color: '#dc2626', label: 'Overdue Collection' },
    overdue_collection_seller: { icon: 'fa-triangle-exclamation', color: '#dc2626', label: 'Overdue Collection' },
    // Cancelled
    cancelled_dropoff_buyer: { icon: 'fa-ban',            color: '#dc2626', label: 'Transaction Cancelled' },
    cancelled_dropoff_seller: { icon: 'fa-ban',            color: '#dc2626', label: 'Transaction Cancelled' },
    cancelled_collection_buyer: { icon: 'fa-ban',         color: '#dc2626', label: 'Transaction Cancelled' },
    cancelled_collection_seller: { icon: 'fa-ban',        color: '#dc2626', label: 'Transaction Cancelled' },
};

const getConfig = (type) => NOTIFICATION_CONFIG[type] || { icon: 'fa-bell', color: '#94a3b8', label: 'Notification' };

// ── Notification message builder ──────────────────────────────────────────────

const buildMessage = (n) => {
    // Always prefer an explicit message stored on the notification
    if (n.message) return n.message;

    const title = n.listingTitle ? `"${n.listingTitle}"` : 'your item';
    const buyer = n.buyerName || 'A buyer';

    switch (n.type) {
        case 'new_offer':                 return `${buyer} made an offer on ${title}.`;
        case 'offer_accepted':            return `Your offer on ${title} was accepted. Complete payment to proceed.`;
        case 'offer_declined':            return `Your offer on ${title} was declined.`;
        case 'trade_waiting':             return `Your trade offer on ${title} was accepted. Book your drop-off slot now.`;
        case 'buyer_paid':                return `${buyer} paid for ${title}. Book your drop-off slot now.`;
        case 'dropoff_booked':            return `Your drop-off for ${title} is confirmed.`;
        case 'seller_dropoff_booked':     return `The seller has booked their drop-off for ${title}.`;
        case 'trade_dropoff_required':    return `The seller booked their slot for ${title}. Book your drop-off now.`;
        case 'buyer_dropoff_booked':      return `The buyer has booked their trade drop-off for ${title}.`;
        case 'item_received_at_facility': return `${title} has been received at the trade facility.`;
        case 'item_at_facility':          return `${title} is at the facility. Book your collection slot.`;
        case 'item_ready_for_collection': return `${title} is ready for collection at the trade facility. Show your receipt in the My Purchases section to staff when collecting.`;
        case 'collection_booked':         return `Your collection slot for ${title} is confirmed.`;
        case 'item_collected':            return `${title} has been collected. Transaction complete.`;
        case 'transaction_complete':      return `Your sale of ${title} is complete.`;
        case 'rate_seller':               return `How was ${n.reviewedUserName || 'the seller'} as a seller for ${title}?`;
        case 'rate_buyer':                return `How was ${n.reviewedUserName || 'the buyer'} as a buyer for ${title}?`;
        
        // Overdue notifications
        case 'overdue_dropoff_buyer':
            return `The seller has not yet dropped off ${title} at the trade facility. We have sent them a reminder. You will be notified once it arrives.`;
        case 'overdue_dropoff_seller':
            return `Your drop-off for ${title} is overdue. You have 24 hours to drop off the item at the trade facility. If the item is not dropped off within 24 hours, this transaction will be automatically cancelled.`;
        case 'overdue_collection_buyer':
            return `Your collection of ${title} is overdue. You have 24 hours to collect your item from the trade facility — please come in as soon as possible. If the item is not collected within 24 hours, this transaction will be automatically cancelled and the item returned to the seller.`;
        case 'overdue_collection_seller':
            return `The buyer has not yet collected ${title}. They have been notified and given 24 hours to collect. If they do not collect within 24 hours, the transaction will be cancelled and you will be asked to come collect your item.`;
        
        // Cancelled notifications
        case 'cancelled_dropoff_seller':
            return `Your transaction for ${title} has been cancelled due to a missed drop-off.`;
        case 'cancelled_dropoff_buyer':
            const wasOnline = n.paymentType === 'online' || n.paymentType === 'full_online';
            return wasOnline
                ? `Your transaction for ${title} was cancelled — the seller did not drop off in time. You will be refunded within 24 hours.`
                : `Your transaction for ${title} was cancelled — the seller did not drop off in time. No payment was collected.`;
        case 'cancelled_collection_buyer':
            return `Your transaction for ${title} was cancelled due to non-collection.`;
        case 'cancelled_collection_seller':
            return `The buyer did not collect ${title} — the transaction has been cancelled. Please come to the trade facility to collect your item back.`;
        
        default:
            return 'You have a new notification.';
    }
};

// ── Navigation resolver ───────────────────────────────────────────────────────

// Types that should send the current user (as buyer) to My Purchases
const BUYER_DEST_TYPES = new Set([
    'offer_accepted', 'seller_dropoff_booked',
    'item_at_facility', 'item_ready_for_collection',
    'item_collected', 'transaction_complete',
    'overdue_dropoff_buyer', 'overdue_collection_buyer',
]);
// Types that go to Trade Facility
const FACILITY_DEST_TYPES = new Set([
    'buyer_paid', 'dropoff_booked', 'trade_waiting',
    'item_received_at_facility', 'collection_booked',
    'buyer_dropoff_booked',
    'overdue_dropoff_seller', 'overdue_collection_seller',
]);
// Types that go to book-dropoff page
const BOOK_DROPOFF_TYPES = new Set(['trade_dropoff_required']);

async function resolveDestination(n, currentUser) {
    // Explicit linkTo stored on notification
    if (n.linkTo) return n.linkTo;

    // Use type-based routing
    if (BOOK_DROPOFF_TYPES.has(n.type) && n.transactionId)
        return `/book-dropoff/${n.transactionId}`;
    
    // Special case: offer_declined should go back to view-listing
    if (n.type === 'offer_declined') return '/view-listing';
    
    // Overdue notifications for buyers go to My Purchases
    if (n.type === 'overdue_dropoff_buyer' || n.type === 'overdue_collection_buyer') {
        return '/my-purchases';
    }
    
    // Overdue notifications for sellers go to Trade Facility
    if (n.type === 'overdue_dropoff_seller' || n.type === 'overdue_collection_seller') {
        return '/trade-facility';
    }

    if (BUYER_DEST_TYPES.has(n.type)) return '/my-purchases';
    if (FACILITY_DEST_TYPES.has(n.type)) return '/trade-facility';

    // Fallback: determine role from transaction
    const txId = n.transactionId || n.txnId || null;
    if (txId && currentUser) {
        try {
            const snap = await getDoc(doc(db, 'transactions', txId));
            if (snap.exists()) {
                return snap.data().sellerId === currentUser.uid
                    ? '/trade-facility'
                    : '/my-purchases';
            }
        } catch (_) {}
    }

    return '/trade-facility';
}

// ── fetchListingTitle helper ──────────────────────────────────────────────────

async function fetchListingTitle(listingId) {
    if (!listingId) return { title: null };
    try {
        const snap = await getDoc(doc(db, 'listings', listingId));
        if (snap.exists()) {
            return { title: snap.data().title || null, price: snap.data().price || null };
        }
    } catch (err) {
        console.error('Failed to fetch listing title:', err);
    }
    return { title: null, price: null };
}

// ── Deduplication ─────────────────────────────────────────────────────────────
// If multiple notifications exist for the same transaction + same type, keep only the newest.
function deduplicate(notifications) {
    const seen = new Map();
    // Sort newest first so we keep the latest when deduplicating
    const sorted = [...notifications].sort((a, b) => {
        const ta = a.createdAt?.toDate?.() || new Date(a.createdAt || 0);
        const tb = b.createdAt?.toDate?.() || new Date(b.createdAt || 0);
        return tb - ta;
    });
    for (const n of sorted) {
        const key = `${n.transactionId || n.id}__${n.type}`;
        if (!seen.has(key)) seen.set(key, n);
    }
    return Array.from(seen.values());
}

export default function Navbar() {
    const navigate = useNavigate();
    const location = useLocation();

    const [isLoggingOut, setIsLoggingOut]           = useState(false);
    const [notificationsOpen, setNotificationsOpen] = useState(false);
    const [avatarMenuOpen, setAvatarMenuOpen]       = useState(false);
    const [currentUser, setCurrentUser]             = useState(null);

    const [offerNotifications, setOfferNotifications]   = useState([]);
    const [ratingNotifications, setRatingNotifications] = useState([]);
    const [userDisplay, setUserDisplay] = useState({
        name: 'Student', email: '', photoURL: '', initials: 'S',
    });

    const notificationRef = useRef(null);
    const avatarRef       = useRef(null);

    // ── Helpers ───────────────────────────────────────────────────────────────

    const markOfferAsRead = async (id) => {
        try { await updateDoc(doc(db, 'notifications', id), { read: true }); }
        catch (err) { console.error('Failed to mark notification as read:', err); }
    };

    const markRatingAsRead = (id) => {
        try {
            const existing = JSON.parse(localStorage.getItem('readRatingNotifs') || '[]');
            const updated = [...new Set([...existing, id])];
            localStorage.setItem('readRatingNotifs', JSON.stringify(updated));
        } catch (err) { console.error('Failed to save rating read state:', err); }
    };

    const handleNotificationClick = async (n) => {
        setNotificationsOpen(false);

        if (n.source === 'offer') {
            await markOfferAsRead(n.id);
            const dest = await resolveDestination(n, currentUser);
            // Special case: offer_accepted on a payment-required transaction
            if (n.type === 'offer_accepted' && n.transactionId) {
                navigate(`/payment/${n.transactionId}`);
            } else if (n.type === 'new_offer') {
                navigate('/profile?tab=offers' + (n.transactionId ? `&highlight=${n.transactionId}` : ''));
            } else if (n.type === 'rate_seller' || n.type === 'rate_buyer') {
                navigate(
                    `/review/${n.listingId}` +
                    `?reviewedUserId=${n.reviewedUserId}` +
                    `&name=${encodeURIComponent(n.reviewedUserName || '')}` +
                    `&role=${n.role}` +
                    `&purchaseId=${n.purchaseId}`
                );
            } else {
                navigate(dest);
            }
        } else if (n.source === 'rating') {
            // Save to localStorage so the test can confirm the click was registered
            markRatingAsRead(n.id);
            navigate(
                `/review/${n.listingId}` +
                `?reviewedUserId=${n.reviewedUserId}` +
                `&name=${encodeURIComponent(n.reviewedUserName || '')}` +
                `&role=${n.role}` +
                `&purchaseId=${n.purchaseId}`
            );
        }
    };

    const handleMarkAllRead = async () => {
        // Only clear offer/transaction notifications — rating notifications stay
        // until the user actually submits their review
        const pendingOffers = [...offerNotifications];
        if (pendingOffers.length === 0) return;

        // Mark each offer notification as read in Firestore.
        try {
            await Promise.all(pendingOffers.map((n) => markOfferAsRead(n.id)));
        } catch (err) {
            console.error('Failed to mark all as read:', err);
        }
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
                name:     firebaseUser.displayName || 'Student',
                email:    firebaseUser.email || '',
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

    // ── Close on outside click ────────────────────────────────────────────────

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
                    const details = await fetchListingTitle(n.listingId);
                    return { ...n, listingTitle: n.listingTitle || details.title || null, listingPrice: n.agreedPrice || details.price || null };
                })
            );
            const sorted = enriched.sort((a, b) => {
                const ta = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : new Date(a.createdAt || 0).getTime();
                const tb = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : new Date(b.createdAt || 0).getTime();
                return tb - ta;
            });
            setOfferNotifications(sorted);
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
                    const data      = d.data();
                    const listingId = data.listingId || null;
                    if (!listingId) continue;
                    let sellerName = 'Seller', listingTitle = data.listingTitle || '';
                    try {
                        const [userSnap, listingSnap] = await Promise.all([
                            getDoc(doc(db, 'users', data.sellerId)),
                            getDoc(doc(db, 'listings', listingId)),
                        ]);
                        if (userSnap.exists())    { const ud = userSnap.data();    sellerName   = `${ud.firstName || ''} ${ud.lastName || ''}`.trim() || sellerName; }
                        if (listingSnap.exists()) { const ld = listingSnap.data(); listingTitle = listingTitle || ld.title || ''; }
                    } catch (_) {}
                    results.push({
                        id: `buyer-${d.id}`, source: 'rating', type: 'rate_seller',
                        listingId, listingTitle, purchaseId: d.id,
                        reviewedUserId: data.sellerId, reviewedUserName: sellerName,
                        role: 'seller', createdAt: data.updatedAt || data.createdAt,
                    });
                }

                for (const d of sellerSnap.docs) {
                    const data      = d.data();
                    const listingId = data.listingId || null;
                    if (!listingId) continue;
                    let buyerName = 'Buyer', listingTitle = data.listingTitle || '';
                    try {
                        const [userSnap, listingSnap] = await Promise.all([
                            getDoc(doc(db, 'users', data.buyerId)),
                            getDoc(doc(db, 'listings', listingId)),
                        ]);
                        if (userSnap.exists())    { const ud = userSnap.data();    buyerName    = `${ud.firstName || ''} ${ud.lastName || ''}`.trim() || buyerName; }
                        if (listingSnap.exists()) { const ld = listingSnap.data(); listingTitle = listingTitle || ld.title || ''; }
                    } catch (_) {}
                    results.push({
                        id: `seller-${d.id}`, source: 'rating', type: 'rate_buyer',
                        listingId, listingTitle, purchaseId: d.id,
                        reviewedUserId: data.buyerId, reviewedUserName: buyerName,
                        role: 'buyer', createdAt: data.updatedAt || data.createdAt,
                    });
                }

                // Show all rating notifications that don't yet have a submitted review
                const unread = results;
                const reviewChecks = await Promise.all(
                    unread.map(async (n) => {
                        try {
                            const snap = await getDocs(query(
                                collection(db, 'reviews'),
                                where('reviewerUserId', '==', currentUser.uid),
                                where('listingId',      '==', n.listingId),
                                where('reviewedUserId', '==', n.reviewedUserId),
                            ));
                            return snap.empty ? n : null;
                        } catch (_) { return n; }
                    })
                );
                const filtered = reviewChecks.filter(Boolean);
                filtered.sort((a, b) => {
                    const ta = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : new Date(a.createdAt || 0).getTime();
                    const tb = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : new Date(b.createdAt || 0).getTime();
                    return tb - ta;
                });
                setRatingNotifications(filtered);
            } catch (err) {
                console.error('NavBar: error fetching rating notifications', err);
            }
        };
        fetchRatingNotifications();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentUser]);

    // Combine notifications for display
    const allNotifications = [...offerNotifications, ...ratingNotifications];
    const totalCount = allNotifications.length;

    // Priority order for notification types (lower number = shown first)
    const TYPE_PRIORITY = {
        trade_dropoff_required:    0,
        offer_accepted:            1,
        trade_waiting:             2,
        buyer_paid:                3,
        new_offer:                 4,
        item_ready_for_collection: 5,
        collection_booked:         6,
        dropoff_booked:            7,
        seller_dropoff_booked:     7,
        buyer_dropoff_booked:      7,
        item_at_facility:          8,
        item_received_at_facility: 9,
        item_collected:            10,
        transaction_complete:      11,
        rate_seller:               12,
        rate_buyer:                12,
        offer_declined:            13,
        overdue_dropoff_buyer:     14,
        overdue_dropoff_seller:    14,
        overdue_collection_buyer:  15,
        overdue_collection_seller: 15,
        cancelled_dropoff_buyer:   16,
        cancelled_dropoff_seller:  16,
        cancelled_collection_buyer: 17,
        cancelled_collection_seller: 17,
    };

    const sortedNotifications = [...allNotifications].sort((a, b) => {
        const pa = TYPE_PRIORITY[a.type] ?? 99;
        const pb = TYPE_PRIORITY[b.type] ?? 99;
        if (pa !== pb) return pa - pb;
        const ta = a.createdAt?.toDate?.() || new Date(a.createdAt || 0);
        const tb = b.createdAt?.toDate?.() || new Date(b.createdAt || 0);
        return tb - ta;
    });

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
                                    ? <span className={styles.cartNavItem}><i className="fas fa-heart" /> Favorites</span>
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
                                <span className={styles.notificationBadge} data-testid="notification-badge">{totalCount}</span>
                            )}
                        </button>

                        {notificationsOpen && (
                            <div className={styles.notificationDropdown} data-testid="notification-dropdown">
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
                                            {sortedNotifications.map((n, index) => {
                                                const cfg = getConfig(n.type);
                                                return (
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
                                                            style={{ color: cfg.color, background: `${cfg.color}18` }}
                                                        >
                                                            <i className={`fas ${cfg.icon}`} />
                                                        </div>
                                                        <div className={styles.notificationContent}>
                                                            <p className={styles.notificationLabel}>{cfg.label}</p>
                                                            <p className={styles.notificationMsg}>{buildMessage(n)}</p>
                                                            <span className={styles.notificationTime}>{formatTime(n.createdAt)}</span>
                                                        </div>
                                                        <i className="fas fa-chevron-right" style={{ color: '#cbd5e1', fontSize: '0.6rem', flexShrink: 0 }} />
                                                    </div>
                                                );
                                            })}
                                        </>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Avatar button + popover */}
                    <div className={styles.avatarWrapper} ref={avatarRef}>
                        <button
                            className={styles.avatarButton}
                            onClick={() => setAvatarMenuOpen((v) => !v)}
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
                                link.label === 'Browse'         ? 'fa-store'        :
                                link.label === 'Messages'       ? 'fa-comment'      :
                                link.label === 'My Purchases'   ? 'fa-bag-shopping' :
                                link.label === 'Favorites'      ? 'fa-heart'        :
                                'fa-arrows-rotate'
                            }`} />
                            <span>{link.label}</span>
                        </button>
                    ))}
                </nav>
            </header>

            {/* Floating Action Button */}
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