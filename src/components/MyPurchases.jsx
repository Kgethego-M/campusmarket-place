import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth, db } from '../firebase';
import {
  collection, query, where, onSnapshot,
  doc, getDoc,
} from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import NavBar from './NavBarTemp';
import styles from './MyPurchases.module.css';

const STATUS_CONFIG = {
  pending:   { label: 'Pending',    color: '#f59e0b', bg: '#fef3c7', icon: 'fa-clock' },
  accepted:  { label: 'Accepted',   color: '#3b82f6', bg: '#dbeafe', icon: 'fa-circle-check' },
  waiting:   { label: 'Waiting',    color: '#8b5cf6', bg: '#ede9fe', icon: 'fa-hourglass-half' },
  completed: { label: 'Completed',  color: '#22c55e', bg: '#dcfce7', icon: 'fa-check-double' },
  declined:  { label: 'Declined',   color: '#ef4444', bg: '#fee2e2', icon: 'fa-circle-xmark' },
  cancelled: { label: 'Cancelled',  color: '#94a3b8', bg: '#f1f5f9', icon: 'fa-ban' },
};

const TYPE_CONFIG = {
  sale:   { label: 'Purchase', icon: 'fa-shopping-cart', color: '#e07b3a' },
  trade:  { label: 'Trade',    icon: 'fa-exchange-alt',  color: '#3a7be0' },
  either: { label: 'Offer',    icon: 'fa-handshake',     color: '#7b3ae0' },
};

const formatDate = (ts) => {
  if (!ts) return '';
  const d = ts?.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' });
};

export default function MyPurchases() {
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [enriched, setEnriched] = useState([]);
  const [loading, setLoading] = useState(true);
  const [snapshotReceived, setSnapshotReceived] = useState(false);
  const [activeFilter, setActiveFilter] = useState('all');

  // Auth
  useEffect(() => {
    return onAuthStateChanged(auth, (user) => {
      if (!user) { navigate('/login'); return; }
      setCurrentUser(user);
    });
  }, [navigate]);

  // Real-time listener — all transactions where user is the buyer
  useEffect(() => {
    if (!currentUser) return;

    const q = query(
      collection(db, 'transactions'),
      where('buyerId', '==', currentUser.uid)
    );

    const unsub = onSnapshot(q, (snap) => {
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setTransactions(docs);
      setSnapshotReceived(true);
    });

    // Fallback: if Firestore doesn't respond (e.g. in tests), stop loading
    const fallback = setTimeout(() => setSnapshotReceived(true), 800);

    return () => { unsub(); clearTimeout(fallback); };
  }, [currentUser]);

  // Enrich transactions with listing + seller details
  useEffect(() => {
    if (!snapshotReceived) return;
    if (transactions.length === 0) {
      setEnriched([]);
      setLoading(false);
      return;
    }

    const enrich = async () => {
      const results = await Promise.all(
        transactions.map(async (tx) => {
          let listingTitle = tx.listingTitle || null;
          let listingImage = null;
          let listingPrice = tx.agreedPrice ?? tx.price ?? null;
          let sellerName   = tx.sellerName  || null;

          try {
            if (tx.listingId) {
              const ls = await getDoc(doc(db, 'listings', tx.listingId));
              if (ls.exists()) {
                const ld = ls.data();
                listingTitle = listingTitle || ld.title  || 'Unknown Item';
                listingImage = ld.photos?.[0] || ld.imageUrl || null;
                listingPrice = listingPrice  ?? ld.price ?? null;
              }
            }
          } catch (_) {}

          try {
            if (!sellerName && tx.sellerId) {
              const us = await getDoc(doc(db, 'users', tx.sellerId));
              if (us.exists()) {
                const ud = us.data();
                sellerName = `${ud.firstName || ''} ${ud.lastName || ''}`.trim() || ud.email || null;
              }
            }
          } catch (_) {}

          return {
            ...tx,
            listingTitle: listingTitle || 'Unknown Item',
            listingImage,
            listingPrice,
            sellerName: sellerName || 'Unknown Seller',
          };
        })
      );

      // Sort: pending/accepted first, then by date descending
      results.sort((a, b) => {
        const order = { pending: 0, accepted: 1, waiting: 2, completed: 3, declined: 4, cancelled: 5 };
        const diff = (order[a.status] ?? 6) - (order[b.status] ?? 6);
        if (diff !== 0) return diff;
        const ta = a.updatedAt?.toDate?.() || a.createdAt?.toDate?.() || new Date(0);
        const tb = b.updatedAt?.toDate?.() || b.createdAt?.toDate?.() || new Date(0);
        return tb - ta;
      });

      setEnriched(results);
      setLoading(false);
    };

    enrich();
  }, [transactions]);

  const FILTERS = [
    { key: 'all',       label: 'All' },
    { key: 'pending',   label: 'Pending' },
    { key: 'accepted',  label: 'Accepted' },
    { key: 'waiting',   label: 'Waiting' },
    { key: 'completed', label: 'Completed' },
    { key: 'declined',  label: 'Declined' },
  ];

  const filtered = activeFilter === 'all'
    ? enriched
    : enriched.filter(tx => tx.status === activeFilter);

  const counts = FILTERS.reduce((acc, f) => {
    acc[f.key] = f.key === 'all' ? enriched.length : enriched.filter(tx => tx.status === f.key).length;
    return acc;
  }, {});

  const activeCount = enriched.filter(tx =>
    tx.status === 'pending' || tx.status === 'accepted' || tx.status === 'waiting'
  ).length;

  // ── Arrow click handler ─────────────────────────────────────────────────────
  // accepted → go to payment page
  // all others → go to listing
  const handleArrowClick = (tx) => {
    if (tx.status === 'accepted') {
      navigate(`/payment/${tx.id}`);
    } else if (tx.listingId) {
      navigate(`/listing/${tx.listingId}`);
    }
  };

  return (
    <>
      <NavBar />
      <div className={styles.page}>
        <div className={styles.container}>

          {/* ── Header ── */}
          <div className={styles.header}>
            <button className={styles.backBtn} onClick={() => navigate(-1)}>
              <i className="fas fa-arrow-left" /> Back
            </button>
            <div className={styles.headerTitle}>
              <h1>My Purchases &amp; Offers</h1>
              {activeCount > 0 && (
                <span className={styles.activeCountBadge}>{activeCount} active</span>
              )}
            </div>
          </div>

          {/* ── Filter tabs ── */}
          <div className={styles.filters}>
            {FILTERS.map(f => (
              <button
                key={f.key}
                className={`${styles.filterBtn} ${activeFilter === f.key ? styles.filterBtnActive : ''}`}
                onClick={() => setActiveFilter(f.key)}
              >
                {f.label}
                {counts[f.key] > 0 && (
                  <span className={styles.filterCount}>{counts[f.key]}</span>
                )}
              </button>
            ))}
          </div>

          {/* ── Content ── */}
          {loading ? (
            <div className={styles.skeletonList}>
              {[1, 2, 3].map(n => (
                <div key={n} className={styles.skeletonCard}>
                  <div className={styles.skeletonImg} />
                  <div className={styles.skeletonBody}>
                    <div className={styles.skeletonLine} style={{ width: '55%' }} />
                    <div className={styles.skeletonLine} style={{ width: '35%', height: '10px' }} />
                    <div className={styles.skeletonChips}>
                      <div className={styles.skeletonChip} />
                      <div className={styles.skeletonChip} />
                      <div className={styles.skeletonChip} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className={styles.emptyState}>
              <i className="fas fa-shopping-bag" />
              <p>{activeFilter === 'all' ? "You haven't made any offers yet" : `No ${activeFilter} offers`}</p>
              {activeFilter === 'all' && (
                <button className={styles.browseBtn} onClick={() => navigate('/view-listing')}>
                  Browse Listings
                </button>
              )}
            </div>
          ) : (
            <div className={styles.transactionList}>
              {filtered.map(tx => {
                const status  = STATUS_CONFIG[tx.status] || STATUS_CONFIG.pending;
                const type    = TYPE_CONFIG[tx.type]     || TYPE_CONFIG.sale;
                const isActive = tx.status === 'pending' || tx.status === 'accepted' || tx.status === 'waiting';
                const isAccepted = tx.status === 'accepted';

                return (
                  <div
                    key={tx.id}
                    className={`${styles.card} ${isActive ? styles.cardActive : ''} ${isAccepted ? styles.cardAccepted : ''}`}
                  >
                    {/* Image */}
                    <div className={styles.cardImage}>
                      {tx.listingImage ? (
                        <img src={tx.listingImage} alt={tx.listingTitle} />
                      ) : (
                        <div className={styles.imagePlaceholder}>
                          <i className="fas fa-image" />
                        </div>
                      )}
                    </div>

                    {/* Details */}
                    <div className={styles.cardDetails}>
                      <div className={styles.cardTop}>
                        <h3 className={styles.cardTitle}>{tx.listingTitle}</h3>
                        <span
                          className={styles.statusBadge}
                          style={{ color: status.color, background: status.bg }}
                        >
                          <i className={`fas ${status.icon}`} />
                          {status.label}
                        </span>
                      </div>

                      <div className={styles.cardMeta}>
                        <span className={styles.metaChip}>
                          <i className={`fas ${type.icon}`} style={{ color: type.color }} />
                          {type.label}
                        </span>
                        <span className={styles.metaChip}>
                          <i className="fas fa-user" />
                          {tx.sellerName}
                        </span>
                        {tx.listingPrice != null && (
                          <span className={styles.metaChip}>
                            <i className="fas fa-tag" />
                            R {Number(tx.listingPrice).toLocaleString('en-ZA')}
                          </span>
                        )}
                        {tx.createdAt && (
                          <span className={styles.metaChip}>
                            <i className="fas fa-calendar-alt" />
                            {formatDate(tx.createdAt)}
                          </span>
                        )}
                      </div>

                      {/* ── Offer Details Panel ── */}
                      {(() => {
                        const PAYMENT_LABELS = {
                          full_online: 'Fully Online',
                          partial:     'Partial Online + Cash',
                          cash:        'Full Cash on Delivery',
                          online:      'Fully Online',
                          cod:         'Full Cash on Delivery',
                        };
                        const hasPayment = (tx.paymentType || tx.paymentMethod) && tx.type !== 'trade';
                        const hasPartial = tx.paymentType === 'partial' && tx.partialAmount != null;
                        const hasTerms   = !!tx.terms;
                        const showPanel  = tx.agreedPrice != null || hasPayment || tx.tradeItem || hasTerms;
                        if (!showPanel) return null;

                        return (
                          <div className={styles.offerPanel}>
                            <p className={styles.offerPanelTitle}>
                              <i className="fas fa-file-invoice" />
                              Your Offer Details
                            </p>
                            <div className={styles.offerPanelGrid}>

                              {tx.agreedPrice != null && (
                                <>
                                  <span className={styles.offerPanelLabel}>Offered price</span>
                                  <span className={styles.offerPanelValueGreen}>
                                    R {Number(tx.agreedPrice).toLocaleString('en-ZA')}
                                    {tx.listingPrice != null && Number(tx.agreedPrice) !== Number(tx.listingPrice) && (
                                      <span className={styles.offerPanelOrig}> (listed: R {Number(tx.listingPrice).toLocaleString('en-ZA')})</span>
                                    )}
                                  </span>
                                </>
                              )}

                              {hasPayment && (
                                <>
                                  <span className={styles.offerPanelLabel}>Payment</span>
                                  <span className={styles.offerPanelValue}>
                                    {PAYMENT_LABELS[tx.paymentType] || PAYMENT_LABELS[tx.paymentMethod] || tx.paymentType || tx.paymentMethod}
                                  </span>
                                </>
                              )}

                              {hasPartial && (
                                <>
                                  <span className={styles.offerPanelLabel}>Online</span>
                                  <span className={styles.offerPanelValueBlue}>R {Number(tx.partialAmount).toLocaleString('en-ZA')}</span>
                                  <span className={styles.offerPanelLabel}>Cash</span>
                                  <span className={styles.offerPanelValueAmber}>
                                    R {Math.max(0, Number(tx.agreedPrice ?? tx.listingPrice ?? 0) - Number(tx.partialAmount)).toLocaleString('en-ZA')}
                                  </span>
                                </>
                              )}

                              {tx.tradeItem && (
                                <>
                                  <span className={styles.offerPanelLabel}>Trade item</span>
                                  <span className={styles.offerPanelValue}>{tx.tradeItem}</span>
                                </>
                              )}

                              {hasTerms && (
                                <>
                                  <span className={styles.offerPanelLabel}>Terms</span>
                                  <span className={styles.offerPanelValueItalic}>{tx.terms}</span>
                                </>
                              )}

                            </div>
                          </div>
                        );
                      })()}

                      {/* Status-specific messages */}
                      {tx.status === 'pending' && (
                        <div className={styles.statusMsg} style={{ borderColor: '#f59e0b', background: '#fffbeb' }}>
                          <i className="fas fa-clock" style={{ color: '#f59e0b' }} />
                          <span>Waiting for the seller to respond to your offer.</span>
                        </div>
                      )}
                      {tx.status === 'accepted' && (
                        <div className={styles.statusMsg} style={{ borderColor: '#3b82f6', background: '#eff6ff' }}>
                          <i className="fas fa-circle-check" style={{ color: '#3b82f6' }} />
                          <span>Your offer was accepted! Tap the arrow to complete payment.</span>
                        </div>
                      )}
                      {tx.status === 'waiting' && (() => {
                        const payType = tx.paymentType || tx.paymentMethod || 'cash';
                        const isCash = payType === 'cash' || payType === 'cod';
                        const isPartialTx = payType === 'partial';
                        const total = Number(tx.agreedPrice ?? tx.listingPrice ?? 0);
                        const cashDue = isCash
                          ? total
                          : isPartialTx
                            ? Math.max(0, total - Number(tx.partialAmount ?? 0))
                            : 0;
                        return (
                          <div className={styles.statusMsg} style={{ borderColor: '#8b5cf6', background: '#f5f3ff' }}>
                            <i className="fas fa-hourglass-half" style={{ color: '#8b5cf6' }} />
                            <span>
                              {tx.paystackRef && !isCash
                                ? cashDue > 0
                                  ? <>Online payment received. Bring <strong style={{ color: '#7c3aed' }}>R {cashDue.toLocaleString('en-ZA')}</strong> cash at drop-off.</>
                                  : 'Online payment received. Awaiting drop-off and collection confirmation.'
                                : <>Cash due at drop-off: <strong style={{ color: '#7c3aed' }}>R {cashDue.toLocaleString('en-ZA')}</strong></>
                              }
                            </span>
                          </div>
                        );
                      })()}
                      {tx.status === 'completed' && (
                        <div className={styles.statusMsg} style={{ borderColor: '#22c55e', background: '#f0fdf4' }}>
                          <i className="fas fa-check-double" style={{ color: '#22c55e' }} />
                          <span>Transaction complete.</span>
                        </div>
                      )}
                      {tx.status === 'declined' && (
                        <div className={styles.statusMsg} style={{ borderColor: '#ef4444', background: '#fef2f2' }}>
                          <i className="fas fa-circle-xmark" style={{ color: '#ef4444' }} />
                          <span>Your offer was declined. You can browse other listings.</span>
                        </div>
                      )}
                    </div>

                    {/* Payment button — only on accepted */}
                    {isAccepted && (
                      <button
                        className={`${styles.viewBtn} ${styles.viewBtnPay}`}
                        onClick={() => navigate(`/payment/${tx.id}`)}
                        title="Complete payment"
                      >
                        <i className="fas fa-credit-card" />
                      </button>
                    )}
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