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
        case 'item_ready_for_collection': return `${title} is ready for collection at the trade facility.`;
        case 'collection_booked':         return `Your collection slot for ${title} is confirmed.`;
        case 'item_collected':            return `${title} has been collected. Transaction complete.`;
        case 'transaction_complete':      return `Your sale of ${title} is complete.`;
        case 'rate_seller':               return `Rate your experience with ${n.reviewedUserName || 'the seller'} for ${title}.`;
        case 'rate_buyer':                return `Rate your buyer ${n.reviewedUserName || ''} for ${title}.`;
        default:                          return 'You have a new notification.';
    }
};

// ── Navigation resolver ───────────────────────────────────────────────────────

// Types that should send the current user (as buyer) to My Purchases
const BUYER_DEST_TYPES = new Set([
    'offer_accepted', 'seller_dropoff_booked',
    'item_at_facility', 'item_ready_for_collection',
    'item_collected', 'transaction_complete',
]);
// Types that go to Trade Facility
const FACILITY_DEST_TYPES = new Set([
    'buyer_paid', 'dropoff_booked', 'trade_waiting',
    'item_received_at_facility', 'collection_booked',
    'buyer_dropoff_booked',
]);
// Types that go to book-dropoff page
const BOOK_DROPOFF_TYPES = new Set(['trade_dropoff_required']);

async function resolveDestination(n, currentUser) {
    // Explicit linkTo stored on notification
    if (n.linkTo) return n.linkTo;

    // Use type-based routing
    if (BOOK_DROPOFF_TYPES.has(n.type) && n.transactionId)
        return `/book-dropoff/${n.transactionId}`;

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

    const BUYER_TYPES = [
        'item_at_facility',
        'item_ready_for_collection',
        'item_collected',
        'overdue_collection_buyer',
        'overdue_dropoff_buyer',
    ];
    const isBuyerNotification = BUYER_TYPES.includes(notification.type);
    navigate(isBuyerNotification ? '/my-purchases' : '/trade-facility');
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
            // Save to localStorage so the test (and any session-level tracking) can confirm
            // the click was registered — but we do NOT remove it from state here.
            // The notification stays in the bell until the user actually submits a review.
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
        if (n.type === 'buyer_paid')                return `${buyer} has paid for ${title || 'your item'}. Book a drop-off slot now.`;
        if (n.type === 'new_offer')                 return title ? `${buyer} made an offer on ${title}${price}` : (n.message || `${buyer} made you an offer${price}`);
        if (n.type === 'offer_accepted')            return `Your offer on ${title || 'your item'} was accepted! Head to payment.${price}`;
        if (n.type === 'trade_waiting')             return `Your trade offer on ${title || 'your item'} was accepted — head to the trade facility to book a drop-off slot.`;
        if (n.type === 'offer_declined')            return `Your offer on ${title || 'your item'} was declined.`;
        if (n.type === 'item_received_at_facility') return `${title} has been received at the trade facility.${price}`;
        if (n.type === 'item_at_facility')          return `${title} has been dropped off and is ready to collect from the trade facility. Show your receipt to staff when collecting.`;
        if (n.type === 'item_ready_for_collection') return `${title} is ready for collection at the trade facility.${price}`;
        if (n.type === 'item_collected')            return `${title} has been collected. Transaction complete!${price}`;
        if (n.type === 'transaction_complete')      return `Your sale of ${title} is complete${price}.`;
        if (n.type === 'collection_booked')         return n.message || `Collection slot booked for ${title}.`;
        if (n.type === 'dropoff_booked')            return n.message || `Drop-off slot booked for ${title}.`;
        if (n.type === 'overdue_collection_buyer')  return `Your collection of ${title} is overdue. Please come to the trade facility as soon as possible to collect your item.`;
        if (n.type === 'overdue_collection_seller') return `The buyer has not yet collected ${title}. They have been notified and given 24 hours to collect.`;
        if (n.type === 'overdue_dropoff_seller')    return `Your drop-off for ${title} is overdue. Please bring your item to the trade facility as soon as possible.`;
        if (n.type === 'overdue_dropoff_buyer')     return `The seller has not yet dropped off ${title}. They have been notified and given 24 hours to drop off.`;
        if (n.type === 'cancelled_dropoff_seller')   return `Your transaction for ${title} has been cancelled due to a missed drop-off.`;
        if (n.type === 'cancelled_dropoff_buyer')    return `Your transaction for ${title} was cancelled — the seller did not drop off in time.`;
        if (n.type === 'cancelled_collection_seller') return `The buyer did not collect ${title} — the transaction has been cancelled. Please come to the trade facility to collect your item.`;
        if (n.type === 'cancelled_collection_buyer') return `Your transaction for ${title} was cancelled due to non-collection.`;

        if (n.type === 'rate_seller') return `Rate your experience with ${n.reviewedUserName} as a seller${n.listingTitle ? ` for "${n.listingTitle}"${price}` : ''}`;
        if (n.type === 'rate_buyer')  return `Rate your buyer ${n.reviewedUserName}${n.listingTitle ? ` — "${n.listingTitle}"${price}` : ''}`;
       

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
                    const details = await fetchListingDetails(n.listingId);
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

    const totalCount = offerNotifications.length + ratingNotifications.length;

    // ── Priority order for notification types ─────────────────────────────────
    // Lower number = shown first
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
    };

    const sortedOfferNotifs = [...offerNotifications].sort((a, b) => {
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
                                            {/* Action-required notifications (trades, offers, drop-offs) */}
                                            {sortedOfferNotifs.length > 0 && (
                                                <>
                                                    {ratingNotifications.length > 0 && (
                                                        <div className={styles.notificationSectionLabel}>
                                                            <i className="fas fa-bolt" /> Activity
                                                        </div>
                                                    )}
                                                    {sortedOfferNotifs.map((n) => {
                                                        const cfg = getConfig(n.type);
                                                        return (
                                                            <div
                                                                key={n.id}
                                                                className={styles.notificationItem}
                                                                onClick={() => handleNotificationClick(n)}
                                                                role="button"
                                                                tabIndex={0}
                                                                onKeyDown={(e) => e.key === 'Enter' && handleNotificationClick(n)}
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

                                            {/* Rating notifications */}
                                            {ratingNotifications.length > 0 && (
                                                <>
                                                    <div className={styles.notificationSectionLabel}>
                                                        <i className="fas fa-star" /> Rate &amp; Review
                                                    </div>
                                                    {ratingNotifications.map((n) => {
                                                        const cfg = getConfig(n.type);
                                                        return (
                                                            <div
                                                                key={n.id}
                                                                className={styles.notificationItem}
                                                                onClick={() => handleNotificationClick(n)}
                                                                role="button"
                                                                tabIndex={0}
                                                                onKeyDown={(e) => e.key === 'Enter' && handleNotificationClick(n)}
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