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
 *
 * Routing rules per notification type:
 *
 * SELLER notifications:
 *   overdue_dropoff_seller        → /trade-facility?tab=buyer&highlight=<id>&overdueHighlight=<id>
 *                                   (Track Pick-up tab, red highlight — seller checks if buyer collected)
 *                                   Actually: seller needs to come drop off → Book Drop-off tab, red highlight
 *   overdue_collection_seller     → /trade-facility?tab=seller&highlight=<id>&overdueHighlight=<id>
 *                                   (Book Drop-off tab, red highlight)
 *   cancelled_dropoff_seller      → /profile?tab=history&highlight=<id>
 *   cancelled_collection_seller   → /profile?tab=history&highlight=<id>
 *   item_received_at_facility     → /trade-facility?tab=seller&highlight=<id>
 *   transaction_complete          → /profile?tab=history&highlight=<id>
 *   buyer_paid / offer_accepted_seller / dropoff_booked / trade_waiting
 *                                 → /trade-facility?tab=seller&highlight=<id>
 *
 * BUYER notifications:
 *   overdue_dropoff_buyer         → /trade-facility?tab=buyer&highlight=<id>&overdueHighlight=<id>
 *   overdue_collection_buyer      → /trade-facility?tab=buyer&highlight=<id>&overdueHighlight=<id>
 *   cancelled_dropoff_buyer       → /profile?tab=history&highlight=<id>
 *   cancelled_collection_buyer    → /profile?tab=history&highlight=<id>
 *   item_at_facility / item_ready_for_collection / item_collected
 *                                 → /my-purchases?open=<id>
 *   collection_booked             → /trade-facility?tab=buyer&highlight=<id>
 */
async function resolveAndNavigate(notification, currentUser, navigate) {
    const transactionId =
        notification.transactionId  ||
        notification.transaction_id ||
        notification.txnId          ||
        notification.txId           ||
        null;

    const type = notification.type || '';

    // ── History routes — these always go to /profile?tab=history ──────────────
    const HISTORY_TYPES = [
        'cancelled_dropoff_seller',
        'cancelled_dropoff_buyer',
        'cancelled_collection_seller',
        'cancelled_collection_buyer',
        'transaction_complete',
        'item_collected',
    ];
    if (HISTORY_TYPES.includes(type)) {
        const dest = transactionId
            ? `/profile?tab=history&highlight=${transactionId}`
            : '/profile?tab=history';
        navigate(dest);
        return;
    }

  
    if (type === 'overdue_dropoff_seller' || type === 'overdue_collection_seller') {
        const dest = transactionId
            ? `/trade-facility?tab=seller&highlight=${transactionId}&overdueHighlight=${transactionId}`
            : '/trade-facility?tab=seller';
        navigate(dest);
        return;
    }
    if (type === 'overdue_dropoff_buyer' || type === 'overdue_collection_buyer') {
        const dest = transactionId
            ? `/trade-facility?tab=buyer&highlight=${transactionId}&overdueHighlight=${transactionId}`
            : '/trade-facility?tab=buyer';
        navigate(dest);
        return;
    }

    // ── Seller trade/facility routes ──────────────────────────────────────────
    const SELLER_TRADE_FACILITY_TYPES = [
        'buyer_paid',
        'offer_accepted_seller',
        'dropoff_booked',
        'trade_waiting',
        'item_received_at_facility',
        'collection_booked',
    ];
    if (SELLER_TRADE_FACILITY_TYPES.includes(type)) {
        const dest = transactionId
            ? `/trade-facility?tab=seller&highlight=${transactionId}`
            : '/trade-facility?tab=seller';
        navigate(dest);
        return;
    }

    // ── Buyer My Purchases routes ─────────────────────────────────────────────
    const BUYER_MY_PURCHASES_TYPES = [
        'item_at_facility',
        'item_ready_for_collection',
        'offer_accepted',
    ];
    if (BUYER_MY_PURCHASES_TYPES.includes(type)) {
        const dest = transactionId
            ? `/my-purchases?open=${transactionId}`
            : '/my-purchases';
        navigate(dest);
        return;
    }

    // ── Generic fallback: look up transaction in Firestore to determine role ──
    if (transactionId && currentUser) {
        try {
            const txSnap = await getDoc(doc(db, 'transactions', transactionId));
            if (txSnap.exists()) {
                const txData   = txSnap.data();
                const isSeller = txData.sellerId === currentUser.uid;
                const status   = txData.status;
                const isHistorical = status === 'completed' || status === 'cancelled';

                if (isHistorical) {
                    navigate(`/profile?tab=history&highlight=${transactionId}`);
                } else if (isSeller) {
                    navigate(`/trade-facility?tab=seller&highlight=${transactionId}`);
                } else {
                    const STATUS_TO_FILTER = {
                        accepted:            'accepted',
                        pending_payment:     'accepted',
                        waiting:             'waiting',
                        awaiting_collection: 'awaiting_collection',
                        pending:             'pending',
                    };
                    const filter = STATUS_TO_FILTER[status] || 'all';
                    navigate(`/my-purchases?filter=${filter}&open=${transactionId}`);
                }
                return;
            }
        } catch (err) {
            console.error('NavBar: resolveAndNavigate error', err);
        }
    }

    // ── Last-resort fallback ──────────────────────────────────────────────────
    const isBuyerNotification = BUYER_TYPES.includes(type);
    if (isBuyerNotification) {
        navigate(transactionId ? `/my-purchases?open=${transactionId}` : '/my-purchases');
    } else {
        navigate(transactionId ? `/trade-facility?tab=seller&highlight=${transactionId}` : '/trade-facility');
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

    // ── Toast for "action already handled" ───────────────────────────────────
    const [toast, setToast] = useState(null); 
    const showToast = (message) => {
        const id = Date.now();
        setToast({ message, id });
        setTimeout(() => setToast((t) => (t?.id === id ? null : t)), 3500);
    };

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
            
            const OVERDUE_TYPES = [
                'overdue_dropoff_seller',
                'overdue_dropoff_buyer',
                'overdue_collection_seller',
                'overdue_collection_buyer',
            ];
            if (OVERDUE_TYPES.includes(n.type) && n.transactionId) {
                try {
                    const txSnap = await getDoc(doc(db, 'transactions', n.transactionId));
                    if (txSnap.exists()) {
                        const txStatus = txSnap.data().status;
                        const isDropOffOverdue   = n.type === 'overdue_dropoff_seller'   || n.type === 'overdue_dropoff_buyer';
                        const isCollectionOverdue = n.type === 'overdue_collection_seller' || n.type === 'overdue_collection_buyer';
                        const actionAlreadyDone =
                            (isDropOffOverdue   && txStatus !== 'pending') ||
                            (isCollectionOverdue && txStatus !== 'awaiting_collection');

                        if (actionAlreadyDone) {
                            await markOfferAsRead(n.id);
                            showToast('This has already been handled ✓');
                            return;
                        }
                    } else {
                        // Transaction no longer exists — dismiss silently with toast
                        await markOfferAsRead(n.id);
                        showToast('This has already been handled ✓');
                        return;
                    }
                } catch (err) {
                    console.error('NavBar: stale-check error', err);
                }
            }

            await markOfferAsRead(n.id);

            if (n.type === 'new_offer') {
                // Deep-link to the Offers tab on the profile page, highlighting the specific offer
                const highlight = n.transactionId || n.listingId || '';
                navigate(`/profile?tab=offers&highlight=${highlight}`);

            } else if (n.type === 'offer_accepted_seller') {
                // Seller accepted an offer — go straight to their card in Trade Facility
                const highlight = n.transactionId || '';
                navigate(`/trade-facility?tab=seller${highlight ? `&highlight=${highlight}` : ''}`);

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

        // For overdue notifications, do a live Firestore check first and show a toast if any were already acted on, so the user knows they're cleared.
        const OVERDUE_TYPES = new Set([
            'overdue_dropoff_seller', 'overdue_dropoff_buyer',
            'overdue_collection_seller', 'overdue_collection_buyer',
        ]);
        const overdueNotifs = pendingOffers.filter(n => OVERDUE_TYPES.has(n.type) && n.transactionId);
        let anyAlreadyDone = false;
        await Promise.all(
            overdueNotifs.map(async (n) => {
                try {
                    const txSnap = await getDoc(doc(db, 'transactions', n.transactionId));
                    if (!txSnap.exists()) { anyAlreadyDone = true; return; }
                    const txStatus = txSnap.data().status;
                    const isDropOff   = n.type === 'overdue_dropoff_seller'   || n.type === 'overdue_dropoff_buyer';
                    const isCollection = n.type === 'overdue_collection_seller' || n.type === 'overdue_collection_buyer';
                    if ((isDropOff && txStatus !== 'pending') || (isCollection && txStatus !== 'awaiting_collection')) {
                        anyAlreadyDone = true;
                    }
                } catch (_) {}
            })
        );

        // Mark each offer notification as read in Firestore.
        // The onSnapshot listener removes them from state once Firestore confirms.
        try {
            await Promise.all(pendingOffers.map((n) => markOfferAsRead(n.id)));
            if (anyAlreadyDone) {
                showToast('Some actions were already completed — all notifications cleared ✓');
            }
        } catch (err) {
            console.error('Failed to mark all as read:', err);
        }
    };

    const notificationIcon = (type) => {
        if (type === 'offer_accepted_seller')                       return 'fa-calendar-plus';
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
        if (type === 'offer_accepted_seller')                       return '#16a34a';
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
        if (n.type === 'buyer_paid')                return `${buyer} has committed to pay or has paid for ${title || 'your item'}. Book a drop-off slot now.`;
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
                return `Your offer on ${title || 'your item'} was accepted! Go commit to paying${amt} in cash at collection in My Purchases.`;
            }
            if (isPartialNotif && n.partialAmount) {
                return `Your offer on ${title || 'your item'} was accepted! Pay R${Number(n.partialAmount).toLocaleString('en-ZA')} online now — the rest in cash at collection.`;
            }
            return `Your offer on ${title || 'your item'} was accepted! Head to payment.${price}`;
        }
        if (n.type === 'offer_accepted_seller')     return `You accepted an offer on ${title || 'your item'}. Book a drop-off for it in Trade Facility.`;
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
        // ── FIXED: match test expectations exactly ────────────────────────────
        if (n.type === 'rate_seller') {
            const sellerName = n.reviewedUserName || 'Seller';
            const listingPart = n.listingTitle ? ` for "${n.listingTitle}"${price}` : '';
            return `How was ${sellerName} as a seller${listingPart}?`;
        }
        if (n.type === 'rate_buyer') {
            const buyerName = n.reviewedUserName || 'Buyer';
            const listingPart = n.listingTitle ? ` — "${n.listingTitle}"${price}` : '';
            return `How was ${buyerName} as a buyer${listingPart}?`;
        }
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
                    results.push({
                        id: `buyer-${d.id}`,
                        source: 'rating',
                        type: 'rate_seller',
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
                    if (!listingId) continue;
                    let buyerName = 'Buyer', listingTitle = data.listingTitle || '', listingPrice = null;
                    try {
                        const [userSnap, listingSnap] = await Promise.all([getDoc(doc(db, 'users', data.buyerId)), getDoc(doc(db, 'listings', listingId))]);
                        if (userSnap.exists())    { const ud = userSnap.data();    buyerName    = `${ud.firstName || ''} ${ud.lastName || ''}`.trim() || buyerName; }
                        if (listingSnap.exists()) { const ld = listingSnap.data(); listingTitle = listingTitle || ld.title || ld.Title || ''; listingPrice = ld.price || ld.Price || null; }
                    } catch (_) {}
                    results.push({
                        id: `seller-${d.id}`,
                        source: 'rating',
                        type: 'rate_buyer',
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

            {/* ── "Action already done" toast ── */}
            {toast && (
                <div style={{
                    position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
                    zIndex: 9999, pointerEvents: 'none',
                    background: '#1e293b', color: '#fff',
                    padding: '10px 20px', borderRadius: 10,
                    fontSize: '0.85rem', fontWeight: 600,
                    boxShadow: '0 4px 20px rgba(0,0,0,0.25)',
                    display: 'flex', alignItems: 'center', gap: 8,
                    animation: 'fadeInUp 0.2s ease',
                }}>
                    <i className="fas fa-circle-check" style={{ color: '#4ade80', fontSize: '0.9rem' }} />
                    {toast.message}
                    <style>{`@keyframes fadeInUp { from { opacity:0; transform:translateX(-50%) translateY(8px); } to { opacity:1; transform:translateX(-50%) translateY(0); } }`}</style>
                </div>
            )}
        </>
    );
}
