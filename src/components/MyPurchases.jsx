import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth, db } from '../firebase';
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  getDoc,
} from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import NavBar from './NavBarTemp';
import styles from './MyPurchases.module.css';

const STATUS_CONFIG = {
  pending:             { label: 'Pending',             color: '#f59e0b', bg: '#fef3c7', icon: 'fa-clock'          },
  accepted:            { label: 'Accepted',            color: '#3b82f6', bg: '#dbeafe', icon: 'fa-circle-check'   },
  waiting:             { label: 'Waiting',             color: '#8b5cf6', bg: '#ede9fe', icon: 'fa-hourglass-half' },
  ready_to_release:    { label: 'Ready to Collect',    color: '#f97316', bg: '#ffedd5', icon: 'fa-circle-check'   },
  awaiting_collection: { label: 'Awaiting Collection', color: '#8b5cf6', bg: '#ede9fe', icon: 'fa-person-walking' },
  cancelled:           { label: 'Cancelled',           color: '#94a3b8', bg: '#f1f5f9', icon: 'fa-ban'            },
};

const TYPE_CONFIG = {
  sale:   { label: 'Purchase', icon: 'fa-shopping-cart', color: '#e07b3a' },
  trade:  { label: 'Trade',    icon: 'fa-exchange-alt',  color: '#3a7be0' },
  either: { label: 'Offer',    icon: 'fa-handshake',     color: '#7b3ae0' },
};

const PAYMENT_LABELS = {
  full_online: 'Fully Online',
  partial:     'Partial Online + Cash',
  cash:        'Full Cash on Delivery',
  online:      'Fully Online',
  cod:         'Full Cash on Delivery',
};

const formatDate = (ts) => {
  if (!ts) return '';
  const d = ts?.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' });
};

const getPaymentType = (tx) => tx.paymentType || tx.paymentMethod || 'cash';

const getTotalAmount = (tx) => Number(tx.agreedPrice ?? tx.listingPrice ?? tx.price ?? 0);

const getCashDue = (tx) => {
  const payType = getPaymentType(tx);
  const total   = getTotalAmount(tx);
  if (payType === 'cash' || payType === 'cod') return total;
  if (payType === 'partial') return Math.max(0, total - Number(tx.partialAmount ?? tx.onlineAmount ?? 0));
  return 0;
};

const hasStripePayment = (tx) => Boolean(
  tx.paymentProvider === 'stripe' ||
  tx.stripeRef ||
  tx.stripeCheckoutSessionId ||
  tx.stripePaymentIntentId ||
  tx.stripeCheckoutUrl
);

// Both accepted and pending_payment mean "needs payment"
const canCompletePayment = (tx) => {
  if (!tx) return false;
  return tx.status === 'accepted' || tx.status === 'pending_payment';
};

// Show accepted badge for both accepted and pending_payment
const getDisplayStatus = (tx) => {
  if (tx.status === 'pending_payment') return STATUS_CONFIG.accepted;
  return STATUS_CONFIG[tx.status] || STATUS_CONFIG.pending;
};

// For filter matching: pending_payment maps to accepted tab
const getFilterStatus = (tx) => {
  if (tx.status === 'pending_payment') return 'accepted';
  return tx.status;
};

// Whether the buyer can book a collection slot
const canBookCollection = (tx) =>
  ['ready_to_release'].includes(tx.status) && !tx.collectionBookingId;

// Whether a collection slot is already booked
const hasCollectionBooked = (tx) =>
  ['ready_to_release', 'awaiting_collection'].includes(tx.status) && !!tx.collectionBookingId;

export default function MyPurchases() {
  const navigate = useNavigate();

  const [currentUser, setCurrentUser]   = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [enriched, setEnriched]         = useState([]);
  const [loading, setLoading]           = useState(true);
  const [hasFetched, setHasFetched]     = useState(false);
  const [activeFilter, setActiveFilter] = useState('all');

  // ── Auth ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    return onAuthStateChanged(auth, (user) => {
      if (!user) { navigate('/login'); return; }
      setCurrentUser(user);
    });
  }, [navigate]);

  // ── Real-time listener ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!currentUser) return;

    const q = query(
      collection(db, 'transactions'),
      where('buyerId', '==', currentUser.uid)
    );

    const unsub = onSnapshot(q, (snap) => {
      const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setTransactions(docs);
      setHasFetched(true);
    });

    const fallback = setTimeout(() => setHasFetched(true), 4000);
    return () => { unsub(); clearTimeout(fallback); };
  }, [currentUser]);

  // ── Enrich transactions ────────────────────────────────────────────────────
  useEffect(() => {
    if (!hasFetched) return;

    if (transactions.length === 0) {
      setEnriched([]);
      setLoading(false);
      return;
    }

    setLoading(true);

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
                listingTitle = listingTitle || ld.title || 'Unknown Item';
                listingImage = ld.photos?.[0] || ld.imageUrl || null;
                listingPrice = listingPrice ?? ld.price ?? null;
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

      // Sort by status then newest first
      const ORDER = {
        pending: 0, accepted: 1, pending_payment: 1, waiting: 2,
        ready_to_release: 3, awaiting_collection: 4, cancelled: 5,
      };
      results.sort((a, b) => {
        const diff = (ORDER[a.status] ?? 99) - (ORDER[b.status] ?? 99);
        if (diff !== 0) return diff;
        const ta = a.updatedAt?.toDate?.() || a.createdAt?.toDate?.() || new Date(0);
        const tb = b.updatedAt?.toDate?.() || b.createdAt?.toDate?.() || new Date(0);
        return tb - ta;
      });

      setEnriched(results);
      setLoading(false);
    };

    enrich();
  }, [transactions, hasFetched]);

  // ── Filters ────────────────────────────────────────────────────────────────
  const FILTERS = [
    { key: 'all',                 label: 'All'                },
    { key: 'pending',             label: 'Pending'            },
    { key: 'accepted',            label: 'Accepted'           },
    { key: 'waiting',             label: 'Waiting'            },
    { key: 'awaiting_collection', label: 'Awaiting Collection'},
  ];

  const filtered =
    activeFilter === 'all'
      ? enriched
      : enriched.filter((tx) => getFilterStatus(tx) === activeFilter);

  const counts = FILTERS.reduce((acc, f) => {
    acc[f.key] =
      f.key === 'all'
        ? enriched.length
        : enriched.filter((tx) => getFilterStatus(tx) === f.key).length;
    return acc;
  }, {});

  const activeCount = enriched.filter((tx) =>
    ['pending', 'accepted', 'pending_payment', 'waiting', 'ready_to_release', 'awaiting_collection'].includes(tx.status)
  ).length;

  const handleArrowClick = (tx) => {
    if (canCompletePayment(tx)) {
      navigate(`/payment/${tx.id}`);
      return;
    }
    if (tx.listingId) navigate(`/listing/${tx.listingId}`);
  };

  return (
    <>
      <NavBar />
      <div className={styles.page}>
        <div className={styles.container}>

          {/* Header */}
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

          {/* Filter tabs */}
          <div className={styles.filters}>
            {FILTERS.map((f) => (
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

          {/* Content */}
          {loading ? (
            <div className={styles.skeletonList}>
              {[1, 2, 3, 4].map((n) => (
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
              <p>
                {activeFilter === 'all'
                  ? "You haven't made any offers yet"
                  : `No ${activeFilter.replace('_', ' ')} offers`}
              </p>
              {activeFilter === 'all' && (
                <button className={styles.browseBtn} onClick={() => navigate('/view-listing')}>
                  Browse Listings
                </button>
              )}
            </div>
          ) : (
            <div className={styles.transactionList}>
              {filtered.map((tx) => {
                const status          = getDisplayStatus(tx);
                const type            = TYPE_CONFIG[tx.type] || TYPE_CONFIG.sale;
                const isActive        = ['pending', 'accepted', 'pending_payment', 'waiting', 'ready_to_release', 'awaiting_collection'].includes(tx.status);
                const paymentType     = getPaymentType(tx);
                const isPartialTx     = paymentType === 'partial';
                const isCashTx        = paymentType === 'cash' || paymentType === 'cod';
                const total           = getTotalAmount(tx);
                const cashDue         = getCashDue(tx);
                const stripePaid      = hasStripePayment(tx) && tx.paymentStatus === 'paid';
                const showPaymentButton = canCompletePayment(tx);
                const showPanel       = tx.agreedPrice != null || paymentType || tx.tradeItem || tx.terms;

                return (
                  <div
                    key={tx.id}
                    className={`${styles.card} ${isActive ? styles.cardActive : ''} ${showPaymentButton ? styles.cardAccepted : ''}`}
                    onClick={() => handleArrowClick(tx)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleArrowClick(tx); }}
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
                          <i className="fas fa-user" />{tx.sellerName}
                        </span>
                        {tx.listingPrice != null && (
                          <span className={styles.metaChip}>
                            <i className="fas fa-tag" />
                            R {Number(tx.listingPrice).toLocaleString('en-ZA')}
                          </span>
                        )}
                        {tx.createdAt && (
                          <span className={styles.metaChip}>
                            <i className="fas fa-calendar-alt" />{formatDate(tx.createdAt)}
                          </span>
                        )}
                      </div>

                      {/* Offer Details Panel */}
                      {showPanel && (
                        <div className={styles.offerPanel}>
                          <p className={styles.offerPanelTitle}>
                            <i className="fas fa-file-invoice" /> Your Offer Details
                          </p>
                          <div className={styles.offerPanelGrid}>
                            {tx.agreedPrice != null && (
                              <>
                                <span className={styles.offerPanelLabel}>Offered price</span>
                                <span className={styles.offerPanelValueGreen}>
                                  R {Number(tx.agreedPrice).toLocaleString('en-ZA')}
                                  {tx.listingPrice != null && Number(tx.agreedPrice) !== Number(tx.listingPrice) && (
                                    <span className={styles.offerPanelOrig}>
                                      {' '}(listed: R {Number(tx.listingPrice).toLocaleString('en-ZA')})
                                    </span>
                                  )}
                                </span>
                              </>
                            )}
                            {paymentType && tx.type !== 'trade' && (
                              <>
                                <span className={styles.offerPanelLabel}>Payment</span>
                                <span className={styles.offerPanelValue}>{PAYMENT_LABELS[paymentType] || paymentType}</span>
                              </>
                            )}
                            {tx.paymentProvider && (
                              <>
                                <span className={styles.offerPanelLabel}>Provider</span>
                                <span className={styles.offerPanelValue}>
                                  {tx.paymentProvider === 'stripe' ? 'Stripe' : tx.paymentProvider}
                                </span>
                              </>
                            )}
                            {tx.paymentStatus && (
                              <>
                                <span className={styles.offerPanelLabel}>Payment status</span>
                                <span className={styles.offerPanelValue}>
                                  {String(tx.paymentStatus).replaceAll('_', ' ')}
                                </span>
                              </>
                            )}
                            {isPartialTx && (
                              <>
                                <span className={styles.offerPanelLabel}>Online</span>
                                <span className={styles.offerPanelValueBlue}>
                                  R {Number(tx.partialAmount ?? tx.onlineAmount ?? 0).toLocaleString('en-ZA')}
                                </span>
                                <span className={styles.offerPanelLabel}>Cash</span>
                                <span className={styles.offerPanelValueAmber}>
                                  R {cashDue.toLocaleString('en-ZA')}
                                </span>
                              </>
                            )}
                            {isCashTx && (
                              <>
                                <span className={styles.offerPanelLabel}>Cash due at drop-off</span>
                                <span className={styles.offerPanelValueAmber}>
                                  R {total.toLocaleString('en-ZA')}
                                </span>
                              </>
                            )}
                            {tx.tradeItem && (
                              <>
                                <span className={styles.offerPanelLabel}>Trade item</span>
                                <span className={styles.offerPanelValue}>{tx.tradeItem}</span>
                              </>
                            )}
                            {tx.terms && (
                              <>
                                <span className={styles.offerPanelLabel}>Terms</span>
                                <span className={styles.offerPanelValueItalic}>{tx.terms}</span>
                              </>
                            )}
                          </div>
                        </div>
                      )}

                      {/* ── Status messages ── */}
                      {tx.status === 'pending' && (
                        <div className={styles.statusMsg} style={{ borderColor: '#f59e0b', background: '#fffbeb' }}>
                          <i className="fas fa-clock" style={{ color: '#f59e0b' }} />
                          <span>Waiting for the seller to respond to your offer.</span>
                        </div>
                      )}

                      {/* accepted AND pending_payment both show the pay prompt */}
                      {(tx.status === 'accepted' || tx.status === 'pending_payment') && (
                        <div
                          className={styles.statusMsg}
                          style={{ borderColor: '#3b82f6', background: '#eff6ff', cursor: 'pointer' }}
                          onClick={(e) => { e.stopPropagation(); navigate(`/payment/${tx.id}`); }}
                        >
                          <i className="fas fa-credit-card" style={{ color: '#3b82f6' }} />
                          <span>Your offer was accepted. Click here to complete payment via Stripe.</span>
                        </div>
                      )}

                      {tx.status === 'waiting' && (
                        <div className={styles.statusMsg} style={{ borderColor: '#8b5cf6', background: '#f5f3ff' }}>
                          <i className="fas fa-hourglass-half" style={{ color: '#8b5cf6' }} />
                          <span>
                            {stripePaid || hasStripePayment(tx) ? (
                              cashDue > 0 ? (
                                <>Online payment received. Bring <strong style={{ color: '#7c3aed' }}>R {cashDue.toLocaleString('en-ZA')}</strong> cash at drop-off.</>
                              ) : (
                                'Online payment received. Awaiting drop-off and collection confirmation.'
                              )
                            ) : (
                              <>Cash due at drop-off: <strong style={{ color: '#7c3aed' }}>R {cashDue.toLocaleString('en-ZA')}</strong></>
                            )}
                          </span>
                        </div>
                      )}

                      {tx.status === 'ready_to_release' && (
                        <div className={styles.statusMsg} style={{ borderColor: '#0ea5e9', background: '#f0f9ff' }}>
                          <i className="fas fa-warehouse" style={{ color: '#0ea5e9' }} />
                          <span>
                            Your item is at the trade facility.{' '}
                            {canBookCollection(tx)
                              ? 'Book a collection slot to pick it up.'
                              : 'Collection slot already booked — see details below.'
                            }
                          </span>
                        </div>
                      )}

                      {tx.status === 'awaiting_collection' && (
                        <div className={styles.statusMsg} style={{ borderColor: '#8b5cf6', background: '#f5f3ff' }}>
                          <i className="fas fa-person-walking" style={{ color: '#8b5cf6' }} />
                          <span>
                            {tx.collectionDate && tx.collectionTimeSlot
                              ? <>Collection booked for <strong>{tx.collectionDate}</strong> at <strong>{tx.collectionTimeSlot}</strong>. Please bring your student card.</>
                              : 'Your item is ready — please collect it from the trade facility.'
                            }
                          </span>
                        </div>
                      )}

                      {/* Collection slot details if already booked */}
                      {hasCollectionBooked(tx) && tx.collectionDate && (
                        <div className={styles.statusMsg} style={{ borderColor: '#0ea5e9', background: '#f0f9ff', marginTop: 6 }}>
                          <i className="fas fa-calendar-check" style={{ color: '#0ea5e9' }} />
                          <span>
                            Collection slot: <strong>{tx.collectionDate}</strong> at <strong>{tx.collectionTimeSlot}</strong>
                          </span>
                        </div>
                      )}

                      {tx.status === 'cancelled' && (
                        <div className={styles.statusMsg} style={{ borderColor: '#94a3b8', background: '#f8fafc' }}>
                          <i className="fas fa-ban" style={{ color: '#94a3b8' }} />
                          <span>This transaction was cancelled.</span>
                        </div>
                      )}
                    </div>

                    {/* ── Action buttons ── */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignSelf: 'center' }}>
                      {/* Payment button */}
                      {showPaymentButton && (
                        <button
                          className={`${styles.viewBtn} ${styles.viewBtnPay}`}
                          onClick={(e) => { e.stopPropagation(); navigate(`/payment/${tx.id}`); }}
                          title="Complete payment"
                        >
                          <i className="fas fa-credit-card" />
                        </button>
                      )}

                      {/* Book collection button */}
                      {canBookCollection(tx) && (
                        <button
                          className={styles.viewBtn}
                          style={{ background: '#0ea5e9', fontSize: '0.72rem', padding: '6px 10px', borderRadius: 8, color: '#fff', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}
                          onClick={(e) => { e.stopPropagation(); navigate(`/book-collection/${tx.id}`); }}
                          title="Book collection slot"
                        >
                          <i className="fas fa-calendar-plus" />
                          Book Collection
                        </button>
                      )}

                      {/* View listing button — fallback when no action buttons */}
                      {!showPaymentButton && !canBookCollection(tx) && tx.listingId && (
                        <button
                          className={styles.viewBtn}
                          onClick={(e) => { e.stopPropagation(); navigate(`/listing/${tx.listingId}`); }}
                          title="View listing"
                        >
                          <i className="fas fa-arrow-right" />
                        </button>
                      )}
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