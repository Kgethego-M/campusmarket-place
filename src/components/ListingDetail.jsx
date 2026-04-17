// src/components/ListingDetail.jsx
import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { createTransaction } from '../services/transactionService';
import { notifySellerOfOffer } from '../services/notificationService';
import NavBarTemp from './NavBarTemp';
import { color } from '@cloudinary/url-gen/qualifiers/background';

export function ListingDetailView({ listing, currentUser }) {
  const [mainImage, setMainImage] = useState(0);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [purchaseType, setPurchaseType] = useState(''); // 'sale' or 'trade'
  const [agreedPrice, setAgreedPrice] = useState(listing.price);
  const [tradeItem, setTradeItem] = useState('');
  const [paymentType, setPaymentType] = useState('full_online');
  const [partialAmount, setPartialAmount] = useState('');
  const [terms, setTerms] = useState('');  

const handleTransaction = async () => {
    const transactionData = {
        type: purchaseType,
        listingId: listing.id,
        buyerId: currentUser.uid,
        buyerName: currentUser.displayName || 'Student', 
        sellerId: listing.sellerUID || listing.sellerId,
        status: 'pending'
    };

    const transactionId = await createTransaction(transactionData);

    // FIX: Pass buyerName to the notification
    await notifySellerOfOffer({
        transactionId,
        sellerId: listing.sellerUID || listing.sellerId,
        buyerId: currentUser.uid,
        buyerName: currentUser.displayName || 'Student', 
    });

    setIsModalOpen(false);
    alert('Offer initiated!');
};

  // ADD THIS FUNCTION to open the modal
  const openPurchaseModal = () => {
    const listingType = listing.listingType || listing.type;
    if (listingType === 'Both' || listingType === 'Either' || listingType === 'both') {
      setPurchaseType(''); // Force them to choose
    } else {
      setPurchaseType(listingType.toLowerCase().includes('sale') ? 'sale' : 'trade');
    }
    setIsModalOpen(true);
  };

  const renderButton = () => {
    if (!currentUser) return null;

    const sellerId = listing.sellerUID || listing.sellerId;
    if (currentUser.uid === sellerId) return null;

    const type = listing.listingType || listing.type;
    let label = '';

    if (type === 'For Sale' || type === 'sale') label = 'Buy Now';
    else if (type === 'For Trade' || type === 'trade') label = 'Make Trade Offer';
    else if (type === 'Both' || type === 'both' || type === 'Either') label = 'Buy Now / Make Trade Offer';
    else return null;

    return (
      <button onClick={openPurchaseModal} style={styles.buyBtn}>
        {label} — R {Number(listing.price).toLocaleString()}
      </button>
    );
  };

  const photos = listing.photos && listing.photos.length > 0 ? listing.photos : [];
  const type = listing.listingType || listing.type || '';
  const condition = listing.condition || '';

  const conditionColor = {
    New: '#4CAF50',
    'Like New': '#8BC34A',
    Good: '#FFC107',
    Fair: '#FF9800',
    Poor: '#F44336',
  };

  const typeColor = {
    'For Sale': '#e07b3a',
    'For Trade': '#3a7be0',
    'Both': '#7b3ae0',
    'Either': '#7b3ae0',
    sale: '#e07b3a',
    trade: '#3a7be0',
  };

  return (
    <div style={styles.page}>

      {/* Left — images */}
      <div style={styles.imageSection}>
        <div style={styles.mainImageWrapper}>
          {photos.length > 0 ? (
            <img
              src={photos[mainImage]}
              alt={listing.title}
              style={styles.mainImage}
            />
          ) : (
            <div style={styles.imagePlaceholder}>
              <p style={{ color: '#aaa' }}>No Image Available</p>
            </div>
          )}
        </div>

        {/* Thumbnails */}
        {photos.length > 1 && (
          <div style={styles.thumbnailRow}>
            {photos.map((photo, index) => (
              <img
                key={index}
                src={photo}
                alt={`thumbnail-${index}`}
                onClick={() => setMainImage(index)}
                style={{
                  ...styles.thumbnail,
                  border: mainImage === index ? '2px solid #1d9e75' : '2px solid transparent',
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Right — details */}
      <div style={styles.detailSection}>

        {/* Badges */}
        <div style={styles.badgeRow}>
          {condition && (
            <span style={{ ...styles.badge, backgroundColor: conditionColor[condition] || '#999', color: '#fff' }}>
              {condition}
            </span>
          )}
          {type && (
            <span style={{ ...styles.badge, backgroundColor: typeColor[type] || '#555', color: '#fff' }}>
              {type}
            </span>
          )}
          {listing.category && (
            <span style={{ ...styles.badge, backgroundColor: '#E1E5AC', color: '#fff' }}>
              {listing.category}
            </span>
          )}
        </div>

        {/* Title */}
        <h1 style={styles.title}>{listing.title}</h1>

        {/* Price */}
        <p style={styles.price}>R {Number(listing.price).toLocaleString()}</p>

        

        {/* Description */}
        <p style={styles.description}>{listing.description}</p>

        {/* Buy / Trade button */}
        {renderButton()}

        {/* CHECK for the Message Button */}
        {currentUser && currentUser.uid !== (listing.sellerUID || listing.sellerId) && (
          <button style={styles.messageBtn}>
            Message Seller
          </button>
        )}

        {/* 3. Optional: Show a message if it IS the seller */}
        {currentUser && currentUser.uid === (listing.sellerUID || listing.sellerId) && (
          <p style={{ ...styles.sellerVerified, color: '#6AA6DA', textAlign: 'center' }}>
            This is your listing
          </p>
        )}

        {/* Seller card */}
        <div style={styles.sellerCard}>
          <div style={styles.sellerAvatar}>
            {listing.sellerAvatar ? (
              <img src={listing.sellerAvatar} alt={listing.sellerName} style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
            ) : (
              <span style={styles.sellerInitial}>
                {listing.sellerName?.[0]?.toUpperCase() ?? '?'}
              </span>
            )}
          </div>
          <div>
            <p style={styles.sellerName}>{listing.sellerName ?? 'Student'}</p>
            <p style={styles.sellerVerified}>seller ratings</p>
          </div>
        </div>

      </div>

      {isModalOpen && (
        <div style={modalStyles.overlay}>
          <div style={modalStyles.modal}>
            <div style={modalStyles.header}>
              <h2 style={{margin: 0}}>{purchaseType === 'trade' ? 'Initiate Trade' : 'Initiate Purchase'}</h2>
              <button onClick={() => setIsModalOpen(false)} style={modalStyles.closeBtn}>×</button>
            </div>

            <p style={{color: '#666', fontSize: '14px'}}>Review and confirm your details for "{listing.title}"</p>

            {/* Selection for 'Both' types */}
            {(listing.listingType === 'Both' || listing.listingType === 'Either' || listing.listingType === 'both') && !purchaseType && (
              <div style={modalStyles.section}>
                <label style={modalStyles.label}>Choose Transaction Type</label>
                <div style={{display: 'flex', gap: '10px'}}>
                  <button onClick={() => setPurchaseType('sale')} style={modalStyles.choiceBtn}>Cash Purchase</button>
                  <button onClick={() => setPurchaseType('trade')} style={modalStyles.choiceBtn}>Trade Item</button>
                </div>
              </div>
            )}

            {/* Sale Fields */}
            {purchaseType === 'sale' && (
              <div style={modalStyles.section}>
                <label style={modalStyles.label}>Agreed Price (R)</label>
                <input type="number" value={agreedPrice} onChange={(e) => setAgreedPrice(e.target.value)} style={modalStyles.input} />
                
                <label style={modalStyles.label}>Payment Method</label>
                <select value={paymentType} onChange={(e) => setPaymentType(e.target.value)} style={modalStyles.input}>
                  <option value="full_online">Fully Online</option>
                  <option value="partial">Partial Online / Partial Cash</option>
                  <option value="cash">Full Cash on Delivery</option>
                </select>

                {paymentType === 'partial' && (
                  <input type="number" placeholder="Enter online payment amount" value={partialAmount} onChange={(e) => setPartialAmount(e.target.value)} style={modalStyles.input} />
                )}
              </div>
            )}

            {/* Trade Fields */}
            {purchaseType === 'trade' && (
              <div style={modalStyles.section}>
                <label style={modalStyles.label}>Item you are exchanging</label>
                <input type="text" placeholder="e.g. iPhone 13 + R500" value={tradeItem} onChange={(e) => setTradeItem(e.target.value)} style={modalStyles.input} />
              </div>
            )}

            <div style={modalStyles.section}>
              <label style={modalStyles.label}>Changes to terms (optional)</label>
              <textarea placeholder="E.g. Seller agreed to include charger..." value={terms} onChange={(e) => setTerms(e.target.value)} style={modalStyles.textarea} />
            </div>

            <button onClick={handleTransaction} style={styles.buyBtn}>
              Confirm & Send Offer
            </button>
          </div>
        </div>
      )}

    </div>
  );
}

export default function ListingDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [listing, setListing] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    async function fetchListing() {
      try {
        const docRef = doc(db, 'listings', id);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setListing({ id: docSnap.id, ...docSnap.data() });
        }
      } catch (err) {
        console.error('Failed to fetch listing:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchListing();
  }, [id]);

  if (loading) return <div style={{ padding: '40px', textAlign: 'center' }}>Loading...</div>;
  if (!listing) return <div style={{ padding: '40px', textAlign: 'center' }}>Listing not found.</div>;

  return (
    <>
      <NavBarTemp />
      <div style={{ padding: '16px 32px' }}>
        <button onClick={() => navigate(-1)} style={styles.backBtn}>
          ← Back to listings
        </button>
      </div>
      <ListingDetailView listing={listing} currentUser={currentUser} />
    </>
  );
}

const styles = {
page: {
    display: 'flex',
    gap: '48px',
    padding: '40px 32px 48px',
    width: '100%',
    margin: '0 auto',
    flexWrap: 'wrap',
    backgroundColor: '#fbfbfb',
    minHeight: '100vh',
    borderRadius: '24px',
  },  
  imageSection: {
    flex: '1 1 400px',
    minWidth: '300px',
  },
  mainImageWrapper: {
    width: '100%',
    aspectRatio: '4/3',
    borderRadius: '12px',
    overflow: 'hidden',
    backgroundColor: '#0f63e0',
  },
  mainImage: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  imagePlaceholder: {
    width: '100%',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbnailRow: {
    display: 'flex',
    gap: '8px',
    marginTop: '12px',
    flexWrap: 'wrap',
  },
  thumbnail: {
    width: '72px',
    height: '72px',
    objectFit: 'cover',
    borderRadius: '8px',
    cursor: 'pointer',
  },
  detailSection: {
    flex: '1 1 340px',
    minWidth: '280px',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  badgeRow: {
    display: 'flex',
    gap: '8px',
    flexWrap: 'wrap',
  },
  badge: {
    padding: '4px 12px',
    borderRadius: '20px',
    fontSize: '0.75rem',
    fontWeight: '600',
    fontFamily: 'Segoe UI, system-ui, sans-serif',
    color:'#DBE3E9'
  },
  title: {
    fontSize: '1.8rem',
    fontWeight: '700',
    color: '#1a1a1a',
    margin: '0',
    fontFamily: 'Segoe UI, system-ui, sans-serif',
  },
  price: {
    fontSize: '1.6rem',
    fontWeight: '700',
    color: '#6AA6DA',
    margin: '0',
    fontFamily: 'Segoe UI, system-ui, sans-serif',
  },
  
  description: {
    fontSize: '0.95rem',
    color: '#444',
    lineHeight: '1.6',
    fontFamily: 'Segoe UI, system-ui, sans-serif',
    margin: '0',
  },
  buyBtn: {
    width: '100%',
    padding: '16px',
    backgroundColor: '#6AA6DA',
    color: '#fff',
    border: 'none',
    borderRadius: '10px',
    fontSize: '1rem',
    fontWeight: '700',
    cursor: 'pointer',
    fontFamily: 'Segoe UI, system-ui, sans-serif',
  },
  messageBtn: {
    width: '100%',
    padding: '12px',
    backgroundColor: 'transparent',
    color: '#444',
    border: '1px solid #6aa6da57',
    borderRadius: '10px',
    fontSize: '0.95rem',
    fontWeight: '500',
    cursor: 'pointer',
    fontFamily: 'Segoe UI, system-ui, sans-serif',
  },
  sellerCard: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '16px',
    border: '1px solid #c1bfbf',
    borderRadius: '12px',
    marginTop: '8px',
  },
  sellerAvatar: {
    width: '48px',
    height: '48px',
    borderRadius: '50%',
    backgroundColor: '#166bc0',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    flexShrink: 0,
  },
  sellerInitial: {
    fontSize: '1.1rem',
    fontWeight: '700',
    color: '#4a7fa5',
  },
  sellerName: {
    margin: '0',
    fontWeight: '600',
    fontSize: '0.95rem',
    color: '#1a1a1a',
    fontFamily: 'Segoe UI, system-ui, sans-serif',
  },
  sellerVerified: {
    margin: '0',
    fontSize: '0.8rem',
    color: '#555',
    fontFamily: 'Segoe UI, system-ui, sans-serif',
  },
  backBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontSize: '0.9rem',
    color: '#555',
    padding: '0',
    fontFamily: 'Segoe UI, system-ui, sans-serif',
  },
};
const modalStyles = {
  overlay: {
    position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
    backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000
  },
  modal: {
    backgroundColor: 'white', padding: '30px', borderRadius: '16px', width: '90%', maxWidth: '500px',
    boxShadow: '0 10px 30px rgba(0,0,0,0.2)', fontFamily: 'Segoe UI, system-ui, sans-serif'
  },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' },
  closeBtn: { background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer', color: '#666' },
  section: { marginBottom: '20px' },
  label: { display: 'block', fontWeight: '600', marginBottom: '8px', fontSize: '14px', color: '#333' },
  input: { width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #ddd', marginBottom: '10px', boxSizing: 'border-box' },
  textarea: { width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #ddd', height: '80px', boxSizing: 'border-box' },
  choiceBtn: { flex: 1, padding: '12px', borderRadius: '8px', border: '1px solid #6AA6DA', cursor: 'pointer', backgroundColor: '#f0f7ff', color: '#166bc0', fontWeight: '600' }
};