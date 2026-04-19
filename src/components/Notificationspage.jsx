import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth, db } from '../firebase';
import {
  collection, query, where, getDocs, doc, getDoc
} from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import NavBar from './NavBarTemp';
import styles from "../pages/Notificationspage.module.css";

const formatTime = (ts) => {
  if (!ts) return '';
  const d = ts?.toDate ? ts.toDate() : new Date(ts);
  const diff = Math.floor((Date.now() - d.getTime()) / 1000);
  if (diff < 60) return 'Just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return d.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' });
};

export default function NotificationsPage() {
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [readIds, setReadIds] = useState(() => {
    try { return JSON.parse(localStorage.getItem('readRatingNotifs') || '[]'); }
    catch { return []; }
  });

  useEffect(() => {
    return onAuthStateChanged(auth, (user) => setCurrentUser(user));
  }, []);

  useEffect(() => {
    if (!currentUser) return;

    const fetchPurchases = async () => {
      setLoading(true);
      try {
        const buyerQ = query(
          collection(db, 'transactions'),
          where('buyerId', '==', currentUser.uid),
          where('status', '==', 'completed')
        );

        const sellerQ = query(
          collection(db, 'transactions'),
          where('sellerId', '==', currentUser.uid),
          where('status', '==', 'completed')
        );

        const [buyerSnap, sellerSnap] = await Promise.all([
          getDocs(buyerQ),
          getDocs(sellerQ),
        ]);

        const results = [];

        for (const d of buyerSnap.docs) {
          const data = d.data();
          let sellerName = 'Seller';
          try {
            const userSnap = await getDoc(doc(db, 'users', data.sellerId));
            if (userSnap.exists()) {
              const u = userSnap.data();
              sellerName = `${u.firstName || ''} ${u.lastName || ''}`.trim() || sellerName;
            }
          } catch (_) {}

          results.push({
            id: `buyer-${d.id}`,
            type: 'rate_seller',
            title: `Rate your experience with ${sellerName}`,
            message: `Your purchase is complete — how was the transaction?`,
            listingId: data.listingId,
            purchaseId: d.id,
            reviewedUserId: data.sellerId,
            reviewedUserName: sellerName,
            role: 'seller',
            createdAt: data.updatedAt || data.createdAt,
          });
        }

        for (const d of sellerSnap.docs) {
          const data = d.data();
          let buyerName = 'Buyer';
          try {
            const userSnap = await getDoc(doc(db, 'users', data.buyerId));
            if (userSnap.exists()) {
              const u = userSnap.data();
              buyerName = `${u.firstName || ''} ${u.lastName || ''}`.trim() || buyerName;
            }
          } catch (_) {}

          results.push({
            id: `seller-${d.id}`,
            type: 'rate_buyer',
            title: `Rate your buyer — ${buyerName}`,
            message: `Your listing was purchased — how was the buyer?`,
            listingId: data.listingId,
            purchaseId: d.id,
            reviewedUserId: data.buyerId,
            reviewedUserName: buyerName,
            role: 'buyer',
            createdAt: data.updatedAt || data.createdAt,
          });
        }

        results.sort((a, b) => {
          const ta = a.createdAt?.toDate?.() || new Date(0);
          const tb = b.createdAt?.toDate?.() || new Date(0);
          return tb - ta;
        });

        // ✅ FIXED: Check by reviewerUserId + listingId + reviewedUserId
        // This works regardless of purchaseId format issues
        const reviewChecks = await Promise.all(
          results.map(async (n) => {
            try {
              const q = query(
                collection(db, 'reviews'),
                where('reviewerUserId', '==', currentUser.uid),
                where('listingId', '==', n.listingId),
                where('reviewedUserId', '==', n.reviewedUserId)
              );
              const snap = await getDocs(q);
              return snap.empty ? n : null;
            } catch (_) {
              return n;
            }
          })
        );

        setNotifications(reviewChecks.filter(Boolean));
      } catch (err) {
        console.error('Error fetching purchases:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchPurchases();
  }, [currentUser]);

  const isRead = (id) => readIds.includes(id);
  const unreadCount = notifications.filter((n) => !isRead(n.id)).length;

  const markRead = (id) => {
    const updated = [...new Set([...readIds, id])];
    setReadIds(updated);
    localStorage.setItem('readRatingNotifs', JSON.stringify(updated));
  };

  const markAllRead = () => {
    const all = notifications.map((n) => n.id);
    setReadIds(all);
    localStorage.setItem('readRatingNotifs', JSON.stringify(all));
  };

  const handleClick = (n) => {
    markRead(n.id);
    setNotifications((prev) => prev.filter((item) => item.id !== n.id));
    navigate(
      `/review/${n.listingId}?reviewedUserId=${n.reviewedUserId}&name=${encodeURIComponent(n.reviewedUserName)}&role=${n.role}&purchaseId=${n.purchaseId}`
    );
  };

  return (
    <>
      <NavBar />
      <div className={styles.page}>
        <div className={styles.container}>

          <div className={styles.header}>
            <button className={styles.backBtn} onClick={() => navigate(-1)}>
              <i className="fas fa-arrow-left" /> Back
            </button>
            <div className={styles.headerRight}>
              <h1 className={styles.title}>
                Notifications
                {unreadCount > 0 && (
                  <span className={styles.unreadBadge}>{unreadCount}</span>
                )}
              </h1>
              {unreadCount > 0 && (
                <button className={styles.markAllBtn} onClick={markAllRead}>
                  Mark all as read
                </button>
              )}
            </div>
          </div>

          {loading && (
            <div className={styles.loading}>
              <i className="fas fa-spinner fa-spin" />
              <p>Loading notifications...</p>
            </div>
          )}

          {!loading && notifications.length > 0 && (
            <div className={styles.section}>
              <p className={styles.sectionLabel}>
                <i className="fas fa-star" /> Rate &amp; Review
              </p>
              {notifications.map((n) => (
                <div
                  key={n.id}
                  className={`${styles.card} ${!isRead(n.id) ? styles.cardUnread : ''}`}
                  onClick={() => handleClick(n)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === 'Enter' && handleClick(n)}
                >
                  <div className={`${styles.iconWrap} ${styles.iconStar}`}>
                    <i className="fas fa-star" />
                  </div>
                  <div className={styles.content}>
                    <p className={styles.cardTitle}>{n.title}</p>
                    <p className={styles.cardMsg}>{n.message}</p>
                    <span className={styles.time}>{formatTime(n.createdAt)}</span>
                  </div>
                  {!isRead(n.id) && <span className={styles.dot} />}
                  <i className="fas fa-chevron-right" style={{ color: '#94a3b8', fontSize: '0.75rem' }} />
                </div>
              ))}
            </div>
          )}

          {!loading && notifications.length === 0 && (
            <div className={styles.empty}>
              <i className="fas fa-bell-slash" />
              <p>No notifications yet</p>
              <span>Completed purchases will appear here</span>
            </div>
          )}

        </div>
      </div>
    </>
  );
}
