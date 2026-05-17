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

// ── Notification types that belong to the buyer (My Purchases page) ──────────
const BUYER_TYPES = [
    'item_at_facility',
    'item_ready_for_collection',
    'item_collected',
    'overdue_collection_buyer',
    'overdue_dropoff_buyer',
    'cancelled_dropoff_buyer',
    'cancelled_collection_buyer',
    'offer_accepted',
];

// ── Notification types that belong to the seller (Trade Facility page) ────────
const SELLER_TYPES = [
    'buyer_paid',
    'item_received_at_facility',
    'collection_booked',
    'dropoff_booked',
    'overdue_collection_seller',
    'overdue_dropoff_seller',
    'cancelled_dropoff_seller',
    'cancelled_collection_seller',
    'trade_waiting',
    'transaction_complete',
];

/**
 * Resolves the best deep-link URL for a notification and navigates to it.
 *
 * MyPurchases  supports: ?filter=<status>&open=<transactionId>
 * TradeFacility supports: ?tab=<seller|buyer>&highlight=<transactionId>
 */
async function resolveAndNavigate(notification, currentUser, navigate) {
    const transactionId =
        notification.transactionId  ||
        notification.transaction_id ||
        notification.txnId          ||
        notification.txId           ||
        null;

    // If we have a transactionId, verify the role from Firestore and use it
    if (transactionId && currentUser) {
        try {
            const txSnap = await getDoc(doc(db, 'transactions', transactionId));
            if (txSnap.exists()) {
                const isSeller = txSnap.data().sellerId === currentUser.uid;
                const status   = txSnap.data().status;

                // Map transaction status → MyPurchases filter
                const STATUS_TO_FILTER = {
                    accepted:            'accepted',
                    pending_payment:     'accepted',
                    waiting:             'waiting',
                    awaiting_collection: 'awaiting_collection',
                };
                const filter = STATUS_TO_FILTER[status] || 'all';

                if (isSeller) {
                    // Seller → Trade Facility, highlight the transaction card
                    navigate(`/trade-facility?tab=seller&highlight=${transactionId}`);
                } else {
                    // Buyer → My Purchases
                    navigate('/my-purchases');
                }
                return;
            }
        } catch (err) {
            console.error('NavBar: resolveAndNavigate error', err);
        }
    }

    // Fallback: use notification type to determine destination
    const isBuyerNotification = BUYER_TYPES.includes(notification.type);
    if (isBuyerNotification) {
        navigate('/my-purchases');
    } else {
        const dest = transactionId
            ? `/trade-facility?tab=seller&highlight=${transactionId}`
            : '/trade-facility';
        navigate(dest);
    }
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

            if (n.type === 'new_offer') {
                // Deep-link to the Offers tab on the profile page, highlighting the specific offer
                const highlight = n.transactionId || n.listingId || '';
                navigate(`/profile?tab=offers&highlight=${highlight}`);

            } else if (n.type === 'offer_accepted') {
                // Cash offers → show the purchase card; online/partial → Stripe payment page
                const pm = (n.paymentMethod || '').toLowerCase();
                const isCashNotif = pm === 'cash' || pm === 'cod' || pm === 'fully_cash';
                if (isCashNotif && n.transactionId) {
                    navigate(`/my-purchases?open=${n.transactionId}`);
                } else {
                    navigate(`/payment/${n.transactionId}`);
                }

            } else if (n.type === 'offer_declined') {
                // Nothing specific to open — browse listings
                navigate('/view-listing');

            } else {
                // All other types (buyer_paid, item_at_facility, overdue, cancelled, etc.)
                await resolveAndNavigate(n, currentUser, navigate);
            }

        } else if (n.source === 'rating') {
            // Save to localStorage so the test (and any session-level tracking) can confirm
            // the click was registered — but we do NOT remove it from state here.
            // The notification stays in the bell until the user actually submits a review.
            markRatingAsRead(n.id);
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
        // Only clear offer/transaction notifications — rating notifications stay
        // until the user actually submits their review
        const pendingOffers = [...offerNotifications];
        if (pendingOffers.length === 0) return;

        // Mark each offer notification as read in Firestore.
        // The onSnapshot listener removes them from state once Firestore confirms.
        try {
            await Promise.all(pendingOffers.map((n) => markOfferAsRead(n.id)));
        } catch (err) {
            console.error('Failed to mark all as read:', err);
        }
    };

    const notificationIcon = (type) => {
        if (type === 'buyer_paid')                           return 'fa-money-bill-wave';
        if (type === 'new_offer')                            return 'fa-shopping-cart';
        if (type === 'offer_accepted')                       return 'fa-circle-check';
        if (type === 'trade_waiting')                        return 'fa-clock';
        if (type === 'offer_declined')                       return 'fa-circle-xmark';
        if (type === 'rate_seller' || type === 'rate_buyer') return 'fa-star';
        if (type === 'item_received_at_facility')            return 'fa-box-archive';
        if (type === 'item_at_facility')                     return 'fa-warehouse';
        if (type === 'item_ready_for_collection')            return 'fa-person-walking';
        if (type === 'item_collected')                       return 'fa-handshake';
        if (type === 'transaction_complete')                 return 'fa-circle-check';
        if (type === 'collection_booked')                    return 'fa-calendar-check';
        if (type === 'dropoff_booked')                       return 'fa-calendar-check';
        if (type === 'overdue_collection_buyer')             return 'fa-triangle-exclamation';
        if (type === 'overdue_collection_seller')            return 'fa-triangle-exclamation';
        if (type === 'overdue_dropoff_seller')               return 'fa-triangle-exclamation';
        if (type === 'overdue_dropoff_buyer')                return 'fa-clock';
        if (type === 'cancelled_dropoff_seller')             return 'fa-ban';
        if (type === 'cancelled_dropoff_buyer')              return 'fa-ban';
        if (type === 'cancelled_collection_seller')          return 'fa-ban';
        if (type === 'cancelled_collection_buyer')           return 'fa-ban';
        return 'fa-bell';
    };

    const notificationIconColor = (type) => {
        if (type === 'buyer_paid')                           return '#16a34a';
        if (type === 'new_offer')                            return '#3b82f6';
        if (type === 'offer_accepted')                       return '#22c55e';
        if (type === 'trade_waiting')                        return '#f59e0b';
        if (type === 'offer_declined')                       return '#ef4444';
        if (type === 'rate_seller' || type === 'rate_buyer') return '#f59e0b';
        if (type === 'item_received_at_facility')            return '#f59e0b';
        if (type === 'item_at_facility')                     return '#6AA6DA';
        if (type === 'item_ready_for_collection')            return '#8b5cf6';
        if (type === 'item_collected')                       return '#22c55e';
        if (type === 'transaction_complete')                 return '#22c55e';
        if (type === 'collection_booked')                    return '#6d28d9';
        if (type === 'dropoff_booked')                       return '#92400e';
        if (type === 'overdue_collection_buyer')             return '#dc2626';
        if (type === 'overdue_collection_seller')            return '#dc2626';
        if (type === 'overdue_dropoff_seller')               return '#dc2626';
        if (type === 'overdue_dropoff_buyer')                return '#f59e0b';
        if (type === 'cancelled_dropoff_seller')             return '#dc2626';
        if (type === 'cancelled_dropoff_buyer')              return '#dc2626';
        if (type === 'cancelled_collection_seller')          return '#dc2626';
        if (type === 'cancelled_collection_buyer')           return '#dc2626';
        return '#94a3b8';
    };

    const notificationMessage = (n) => {
        const title = n.listingTitle ? `"${n.listingTitle}"` : (n.itemTitle ? `"${n.itemTitle}"` : (n.message ? null : 'your item'));
        const price = n.listingPrice ? ` · R${Number(n.listingPrice).toLocaleString('en-ZA')}` : '';
        const buyer = n.buyerName || 'A student';
        const isTrade = n.isTrade === true;
        if (n.type === 'buyer_paid')                return `${buyer} has paid for ${title || 'your item'}. Book a drop-off slot now.`;
        if (n.type === 'new_offer') {
            const itemLabel = title || '"your item"';
            if (isTrade) return `${buyer} made a trade offer on ${itemLabel}`;
            return `${buyer} made an offer on ${itemLabel}${price}`;
        }
        if (n.type === 'offer_accepted') {
            if (isTrade) return `Your trade offer on ${title || 'your item'} was accepted — head to the trade facility to book a drop-off slot.`;
            const pm = (n.paymentMethod || '').toLowerCase();
            const isCashNotif = pm === 'cash' || pm === 'cod' || pm === 'fully_cash';
            const isPartialNotif = pm === 'partial';
            if (isCashNotif) {
                const amt = n.agreedPrice ? ` — R${Number(n.agreedPrice).toLocaleString('en-ZA')} in cash` : '';
                return `Your offer on ${title || 'your item'} was accepted! You committed to paying${amt} in cash at collection.`;
            }
            if (isPartialNotif && n.partialAmount) {
                return `Your offer on ${title || 'your item'} was accepted! Pay R${Number(n.partialAmount).toLocaleString('en-ZA')} online now — the rest in cash at collection.`;
            }
            return `Your offer on ${title || 'your item'} was accepted! Head to payment.${price}`;
        }
        if (n.type === 'trade_waiting')             return `Your trade offer on ${title || 'your item'} was accepted — head to the trade facility to book a drop-off slot.`;
        if (n.type === 'offer_declined') {
            if (isTrade) return `Your trade offer on ${title || 'your item'} was declined.`;
            return `Your offer on ${title || 'your item'} was declined.`;
        }
        if (n.type === 'item_received_at_facility') return `${title} has been received at the trade facility.`;
        if (n.type === 'item_at_facility')          return `${title} has been dropped off and is ready to collect from the trade facility. Show your receipt to staff when collecting.`;
        if (n.type === 'item_ready_for_collection') return `${title} is ready for collection at the trade facility.`;
        if (n.type === 'item_collected')            return `${title} has been collected. Transaction complete!`;
        if (n.type === 'transaction_complete') {
            if (isTrade) return `Your trade of ${title} is complete.`;
            return `Your sale of ${title} is complete${price}.`;
        }
        if (n.type === 'collection_booked')         return n.message || `Collection slot booked for ${title}.`;
        if (n.type === 'dropoff_booked') {
            if (isTrade) return n.message || `Your trade offer on ${title || 'your item'} was accepted — book your drop-off slot now.`;
            return n.message || `Drop-off slot booked for ${title}.`;
        }
        if (n.type === 'overdue_collection_buyer')  return `Your collection of ${title} is overdue. Please come to the trade facility as soon as possible to collect your item.`;
        if (n.type === 'overdue_collection_seller') return `The buyer has not yet collected ${title}. They have been notified and given 24 hours to collect.`;
        if (n.type === 'overdue_dropoff_seller')    return `Your drop-off for ${title} is overdue. Please bring your item to the trade facility as soon as possible.`;
        if (n.type === 'overdue_dropoff_buyer')     return `The seller has not yet dropped off ${title}. They have been notified and given 24 hours to drop off.`;
        if (n.type === 'cancelled_dropoff_seller')   return `Your transaction for ${title} has been cancelled due to a missed drop-off.`;
        if (n.type === 'cancelled_dropoff_buyer')    return `Your transaction for ${title} was cancelled — the seller did not drop off in time.`;
        if (n.type === 'cancelled_collection_seller') return `The buyer did not collect ${title} — the transaction has been cancelled. Please come to the trade facility to collect your item.`;
        if (n.type === 'cancelled_collection_buyer') return `Your transaction for ${title} was cancelled due to non-collection.`;
        if (n.type === 'rate_seller') return `How was ${n.reviewedUserName} as a seller${n.listingTitle ? ` for "${n.listingTitle}"${price}` : ''}`;
        if (n.type === 'rate_buyer')  return `How was ${n.reviewedUserName} as a buyer${n.listingTitle ? ` — "${n.listingTitle}"${price}` : ''}`;
        return n.message || 'Notification';
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
            if (notificationRef.current && !notificationRef.current.contains(e.target)) setNotificationsOpen(false);
            if (avatarRef.current       && !avatarRef.current.contains(e.target))       setAvatarMenuOpen(false);
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
                    const details = await fetchListingDetails(n.listingId);
                    return { ...n, listingTitle: n.listingTitle || details.title || null, listingPrice: n.agreedPrice || details.price || null };
                })
            );
            const sorted = enriched.sort((a, b) => {
                const ta = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : new Date(a.createdAt || 0).getTime();
                const tb = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : new Date(b.createdAt || 0).getTime();
                return tb - ta;
            });

            // Deduplicate: for overdue/recurring notification types, keep only the
            // most-recent notification per (type + transactionId) pair so that
            // automated re-sends don't show multiple identical items in the bell.
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
                const key = `${n.type}::${n.transactionId || n.transaction_id || n.txnId || ''}`;
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            });

            setOfferNotifications(deduped);
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
                    if (!listingId) continue;
                    let sellerName = 'Seller', listingTitle = data.listingTitle || '', listingPrice = null;
                    try {
                        const [userSnap, listingSnap] = await Promise.all([getDoc(doc(db, 'users', data.sellerId)), getDoc(doc(db, 'listings', listingId))]);
                        if (userSnap.exists())    { const ud = userSnap.data();    sellerName   = `${ud.firstName || ''} ${ud.lastName || ''}`.trim() || sellerName; }
                        if (listingSnap.exists()) { const ld = listingSnap.data(); listingTitle = listingTitle || ld.title || ld.Title || ''; listingPrice = ld.price || ld.Price || null; }
                    } catch (_) {}
                    results.push({ id: `buyer-${d.id}`, source: 'rating', type: 'rate_seller', title: `How was ${sellerName} as a seller`, message: `Your purchase is complete — how was the transaction?`, listingId, listingTitle, listingPrice, purchaseId: d.id, reviewedUserId: data.sellerId, reviewedUserName: sellerName, role: 'seller', createdAt: data.updatedAt || data.createdAt });
                }

                for (const d of sellerSnap.docs) {
                    const data = d.data();
                    const listingId = data.listingId || data.ListingId || data.listing_id || null;
                    if (!listingId) continue;
                    let buyerName = 'Buyer', listingTitle = data.listingTitle || '', listingPrice = null;
                    try {
                        const [userSnap, listingSnap] = await Promise.all([getDoc(doc(db, 'users', data.buyerId)), getDoc(doc(db, 'listings', listingId))]);
                        if (userSnap.exists())    { const ud = userSnap.data();    buyerName    = `${ud.firstName || ''} ${ud.lastName || ''}`.trim() || buyerName; }
                        if (listingSnap.exists()) { const ld = listingSnap.data(); listingTitle = listingTitle || ld.title || ld.Title || ''; listingPrice = ld.price || ld.Price || null; }
                    } catch (_) {}
                    results.push({ id: `seller-${d.id}`, source: 'rating', type: 'rate_buyer', title: `How was ${buyerName} as a buyer`, message: `Your listing was purchased — how was the buyer?`, listingId, listingTitle, listingPrice, purchaseId: d.id, reviewedUserId: data.buyerId, reviewedUserName: buyerName, role: 'buyer', createdAt: data.updatedAt || data.createdAt });
                }

                // Show all rating notifications that don't yet have a submitted review
                const unread = results;
                const reviewChecks = await Promise.all(
                    unread.map(async (n) => {
                        try {
                            const snap = await getDocs(query(collection(db, 'reviews'), where('reviewerUserId', '==', currentUser.uid), where('listingId', '==', n.listingId), where('reviewedUserId', '==', n.reviewedUserId)));
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

    const totalCount = offerNotifications.length + ratingNotifications.length;

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
                            <button key={link.label} className={cls} onClick={() => link.path && navigate(link.path)} disabled={!link.path}>
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
                        <button className={styles.iconButton} onClick={() => setNotificationsOpen((v) => !v)} title="Notifications">
                            <i className="fa-solid fa-bell" />
                            {totalCount > 0 && <span className={styles.notificationBadge}>{totalCount}</span>}
                        </button>

                        {notificationsOpen && (
                            <div className={styles.notificationDropdown}>
                                <div className={styles.notificationHeader}>
                                    <span>Notifications</span>
                                    {totalCount > 0 && <button className={styles.markAllRead} onClick={handleMarkAllRead}>Mark all as read</button>}
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
                                                    <div className={styles.notificationSectionLabel}><i className="fas fa-tag" /> Offers &amp; Transactions</div>
                                                    {offerNotifications.map((n) => (
                                                        <div key={n.id} data-testid={`notification-item-${n.id}`} className={styles.notificationItem} onClick={() => handleNotificationClick(n)} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && handleNotificationClick(n)}>
                                                            <div className={styles.notificationIconWrap} style={{ color: notificationIconColor(n.type) }}><i className={`fas ${notificationIcon(n.type)}`} /></div>
                                                            <div className={styles.notificationContent}><p>{notificationMessage(n)}</p><span>{formatTime(n.createdAt)}</span></div>
                                                            <i className="fas fa-chevron-right" style={{ color: '#cbd5e1', fontSize: '0.65rem', flexShrink: 0 }} />
                                                        </div>
                                                    ))}
                                                </>
                                            )}
                                            {ratingNotifications.length > 0 && (
                                                <>
                                                    <div className={styles.notificationSectionLabel}><i className="fas fa-star" /> Rate &amp; Review</div>
                                                    {ratingNotifications.map((n) => (
                                                        <div key={n.id} data-testid={`notification-item-${n.id}`} className={styles.notificationItem} onClick={() => handleNotificationClick(n)} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && handleNotificationClick(n)}>
                                                            <div className={styles.notificationIconWrap} style={{ color: notificationIconColor(n.type) }}><i className={`fas ${notificationIcon(n.type)}`} /></div>
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

                    {/* ── Avatar button + popover ── */}
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
                                link.label === 'Favorites'       ? 'fa-heart'        :
                                'fa-arrows-rotate'
                            }`} />
                            <span>{link.label}</span>
                        </button>
                    ))}
                </nav>
            </header>

            {/* ── Floating Action Button — Sell an item ── */}
            <button
                className={styles.fab}
                onClick={() => navigate('/create-listing')}
                title="Sell an item"
                aria-label="Sell an item"
            >
                <i className="fas fa-plus" />
            </button>

            {/* ── Logout overlay ── */}
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