import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { auth, db } from '../firebase';
import { onAuthStateChanged } from 'firebase/auth';
import {
  doc, getDoc, onSnapshot, updateDoc, arrayRemove,
} from 'firebase/firestore';
import NavBarTemp from './NavBarTemp';
import styles from './ViewCart.module.css';

// The navbar links array here is not used because NavBarTemp handles navigation.
// We keep it only for reference, but we won't use it.
// const NAV_LINKS = [ ... ]; // removed

export default function ViewCart() {
  const navigate = useNavigate();
  const location = useLocation();

  const [currentUser, setCurrentUser]         = useState(null);
  const [cartItems, setCartItems]             = useState([]);
  const [cartIds, setCartIds]                 = useState([]);
  const [loading, setLoading]                 = useState(true);
  const [snapshotReceived, setSnapshotReceived] = useState(false);
  const [removing, setRemoving]               = useState(null);
  const [toast, setToast]                     = useState(null);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2800);
  };

  // ── Auth ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user) { navigate('/login'); return; }
      setCurrentUser(user);
    });
    return () => unsub();
  }, [navigate]);

  // ── Real-time favourites listener ──────────────────────────────────────────
  useEffect(() => {
    if (!currentUser) return;

    const unsub = onSnapshot(doc(db, 'carts', currentUser.uid), (snap) => {
      if (snap.exists()) {
        const ids = snap.data().items || [];
        setCartIds(ids);
      } else {
        setCartIds([]);
        setCartItems([]);
        setLoading(false);
      }
      setSnapshotReceived(true);
    });

    return () => unsub();
  }, [currentUser]);

  // ── Enrich favourite IDs with listing data ─────────────────────────────────
  useEffect(() => {
    if (!snapshotReceived) return;
    if (cartIds.length === 0) {
      setCartItems([]);
      setLoading(false);
      return;
    }

    const enrich = async () => {
      const results = await Promise.all(
        cartIds.map(async (id) => {
          try {
            const snap = await getDoc(doc(db, 'listings', id));
            if (!snap.exists()) return null;
            const d = snap.data();
            return {
              id: snap.id,
              title:       d.title || 'Unknown Item',
              price:       d.price ?? null,
              condition:   d.condition || '',
              listingType: d.listingType || '',
              photos:      d.photos || [],
              sellerName:  d.sellerName || 'Unknown Seller',
              status:      d.status || 'active',
            };
          } catch {
            return null;
          }
        })
      );
      setCartItems(results.filter(r => r && r.status === 'active'));
      setLoading(false);
    };

    enrich();
  }, [cartIds, snapshotReceived]);

  // ── Remove from favourites ─────────────────────────────────────────────────
  const handleRemove = async (listingId) => {
    if (!currentUser || removing) return;
    setRemoving(listingId);
    try {
      await updateDoc(doc(db, 'carts', currentUser.uid), {
        items: arrayRemove(listingId),
      });
      showToast('Removed from favourites');
    } catch (err) {
      console.error('Remove from favourites error:', err);
      showToast('Failed to remove item', 'error');
    } finally {
      setRemoving(null);
    }
  };

  // ── Clear all favourites ───────────────────────────────────────────────────
  const handleClearAll = async () => {
    if (!currentUser || cartItems.length === 0) return;
    try {
      await updateDoc(doc(db, 'carts', currentUser.uid), { items: [] });
      showToast('Favourites cleared');
    } catch {
      showToast('Failed to clear favourites', 'error');
    }
  };

  // ── Skeleton while loading ─────────────────────────────────────────────────
  if (loading) {
    return (
      <>
        <NavBarTemp />
        <div className={styles.page}>
          <div className={styles.container}>
            <div className={styles.header}>
              <div className={styles.headerLeft}>
                <h1 className={styles.pageTitle}>My Favourites</h1>
              </div>
            </div>
            <div className={styles.grid}>
              {[1, 2, 3, 4, 5, 6].map(n => (
                <div key={n} className={styles.skeletonCard}>
                  <div className={styles.skeletonImg} />
                  <div className={styles.skeletonBody}>
                    <div className={styles.skeletonLine} style={{ width: '65%' }} />
                    <div className={styles.skeletonLine} style={{ width: '40%', height: '10px' }} />
                  </div>
                  <div className={styles.skeletonActions}>
                    <div className={styles.skeletonBtn} />
                    <div className={styles.skeletonBtn} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <NavBarTemp />
      <div className={styles.page}>
        <div className={styles.container}>

          {/* ── Toast ── */}
          {toast && (
            <div className={`${styles.toast} ${toast.type === 'error' ? styles.toastError : styles.toastSuccess}`}>
              <i className={`fas ${toast.type === 'error' ? 'fa-circle-exclamation' : 'fa-circle-check'}`} />
              {toast.msg}
            </div>
          )}

          {/* ── Header ── */}
          <div className={styles.header}>
            <div className={styles.headerLeft}>
              <button className={styles.backBtn} onClick={() => navigate(-1)}>
                <i className="fas fa-arrow-left" /> Back
              </button>
              <div>
                <h1 className={styles.pageTitle}>My Favorites</h1>
                <p className={styles.pageSub}>
                  {cartItems.length === 0
                    ? 'No items saved'
                    : `${cartItems.length} item${cartItems.length === 1 ? '' : 's'} saved`
                  }
                </p>
              </div>
            </div>
            {cartItems.length > 0 && (
              <button className={styles.clearBtn} onClick={handleClearAll}>
                <i className="fas fa-trash" /> Clear all
              </button>
            )}
          </div>

          {/* ── Empty state ── */}
          {cartItems.length === 0 ? (
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon}>
                <i className="fas fa-heart-broken" />
              </div>
              <p className={styles.emptyTitle}>Your favorites list is empty</p>
              <p className={styles.emptySub}>Browse listings and click the heart icon to save items.</p>
              <button className={styles.browseBtn} onClick={() => navigate('/view-listing')}>
                <i className="fas fa-search" /> Browse listings
              </button>
            </div>
          ) : (
            <div className={styles.grid}>
              {cartItems.map((item, i) => {
                const imageUrl = item.photos?.[0] || null;
                const conditionColors = {
                  New: '#4CAF50', 'Like New': '#8BC34A',
                  Good: '#FFC107', Fair: '#FF9800', Poor: '#F44336',
                };
                const badgeColor = conditionColors[item.condition] || '#999';

                const normaliseType = (t) => {
                  if (!t) return '';
                  const v = t.toString().toLowerCase().trim();
                  if (v === 'either' || v === 'for sale or trade') return 'For Sale or Trade';
                  if (v === 'sale'   || v === 'for sale')          return 'For Sale';
                  if (v === 'trade'  || v === 'for trade')         return 'For Trade';
                  return t;
                };
                const displayType = normaliseType(item.listingType);

                return (
                  <div
                    key={item.id}
                    className={styles.card}
                    style={{ animationDelay: `${i * 55}ms` }}
                  >
                    {/* Image */}
                    <div className={styles.imageWrapper}>
                      {imageUrl ? (
                        <img
                          src={imageUrl}
                          alt={item.title}
                          className={styles.image}
                          loading="lazy"
                        />
                      ) : (
                        <div className={styles.imagePlaceholder}>
                          <svg width="36" height="36" viewBox="0 0 24 24" fill="none"
                               stroke="#ccc" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="3" y="3" width="18" height="18" rx="2"/>
                            <circle cx="8.5" cy="8.5" r="1.5"/>
                            <path d="M21 15l-5-5L5 21"/>
                          </svg>
                        </div>
                      )}
                      {item.condition && (
                        <span className={styles.conditionBadge} style={{ backgroundColor: badgeColor }}>
                          {item.condition}
                        </span>
                      )}
                      {displayType && (
                        <span className={styles.typeBadge}>{displayType}</span>
                      )}
                    </div>

                    {/* Body */}
                    <div className={styles.body}>
                      <p className={styles.title}>{item.title}</p>
                      <p className={styles.price}>
                        R {item.price != null ? Number(item.price).toLocaleString('en-ZA') : 'Free'}
                      </p>
                    </div>

                    {/* Actions */}
                    <div className={styles.actionRow}>
                      <button
                        className={styles.viewBtn}
                        onClick={() => navigate(`/listing/${item.id}`)}
                      >
                        <i className="fas fa-eye" /> View
                      </button>
                      <button
                        className={styles.removeBtn}
                        onClick={() => handleRemove(item.id)}
                        disabled={removing === item.id}
                      >
                        {removing === item.id
                          ? <i className="fas fa-spinner fa-spin" />
                          : <><i className="fas fa-trash" /> Remove</>
                        }
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}