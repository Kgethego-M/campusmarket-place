import { onAuthStateChanged } from 'firebase/auth';
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { auth, db, storage } from '../firebase';
import { doc, getDoc, updateDoc, collection, query, where, getDocs, deleteDoc, onSnapshot } from 'firebase/firestore';
import { updateProfile } from 'firebase/auth';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import ProfileListingCard from './ProfileListingCard';
import OfferItem from './OfferItem'; 
import styles from './Profile.module.css';

const Profile = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const fileInputRef = useRef(null);
    
    const [loading, setLoading] = useState(true);
    const [isEditing, setIsEditing] = useState(false);
    const [incomingOffers, setIncomingOffers] = useState([]);
    const [highlightedOfferId, setHighlightedOfferId] = useState(null);
    const [profileData, setProfileData] = useState({
        firstName: '',
        lastName: '',
        email: '',
        bio: '',
        photoURL: '',
        memberSince: '',
        totalSales: 0,
        totalTrades: 0,
        rating: 0,
        totalRatings: 0
    });
    
    const [editFormData, setEditFormData] = useState({ firstName: '', lastName: '', bio: '' });
    const [history, setHistory] = useState([]);
    const [listings, setListings] = useState([]);
    const [activeTab, setActiveTab] = useState('history');
    const [editingListingId, setEditingListingId] = useState(null);
    const [editListingData, setEditListingData] = useState({});

    // Parse URL parameters for tab and highlight
    useEffect(() => {
        const params = new URLSearchParams(location.search);
        const tab = params.get('tab');
        const highlight = params.get('highlight');
        
        if (tab && (tab === 'history' || tab === 'listings' || tab === 'offers')) {
            setActiveTab(tab);
        }
        
        if (highlight) {
            setHighlightedOfferId(highlight);
            // Clear highlight after 3 seconds
            setTimeout(() => setHighlightedOfferId(null), 3000);
        }
    }, [location.search]);

    // Logic for Initials Avatar
    const getInitials = () => {
        const first = profileData.firstName?.charAt(0) || '';
        const last = profileData.lastName?.charAt(0) || '';
        return (first + last).toUpperCase() || '?';
    };

    // Fix: Safe number conversion for stats
    const safeNumber = (value) => {
        const num = Number(value);
        return isNaN(num) ? 0 : num;
    };

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (user) => {
            if (!user) {
                navigate('/login');
                return;
            }

            fetchUserData(user); 

            const q = query(
                collection(db, 'transactions'),
                where('sellerId', '==', user.uid),
                where('status', '==', 'pending')
            );

            const unsubscribeOffers = onSnapshot(q, (snapshot) => {
                setIncomingOffers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
            });

            return () => unsubscribeOffers();
        });

        return () => unsubscribe();
    }, [navigate]);

    const fetchUserData = async (user) => {
        try {
            const userId = user.uid;
            const docRef = doc(db, 'users', userId);
            const docSnap = await getDoc(docRef);
            await fetchUserListings(userId);

            if (docSnap.exists()) {
                const userData = docSnap.data();
                setProfileData({
                    ...userData,
                    email: userData.email || user.email,
                    photoURL: userData.photoURL || user.photoURL || '',
                    memberSince: user.metadata.creationTime
                        ? new Date(user.metadata.creationTime).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
                        : 'Unknown',
                    // Ensure these are numbers
                    totalSales: safeNumber(userData.totalSales),
                    totalTrades: safeNumber(userData.totalTrades),
                    rating: safeNumber(userData.rating),
                    totalRatings: safeNumber(userData.totalRatings)
                });
                setEditFormData({
                    firstName: userData.firstName || '',
                    lastName: userData.lastName || '',
                    bio: userData.bio || '',
                });
                setHistory(userData.history || []);
            }
        } catch (error) {
            console.error('Error:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setEditFormData(prev => ({ ...prev, [name]: value }));
    };

    const fetchUserListings = async (userId) => {
        const q = query(collection(db, "listings"), where("sellerUID", "==", userId));
        const querySnapshot = await getDocs(q);
        setListings(querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    };

    const handlePhotoUpload = async (e) => {
        const file = e.target.files[0];
        if (file) {
            const user = auth.currentUser;
            const storageRef = ref(storage, `profilePictures/${user.uid}`);
            await uploadBytes(storageRef, file);
            const photoURL = await getDownloadURL(storageRef);
            await updateDoc(doc(db, 'users', user.uid), { photoURL });
            setProfileData(prev => ({ ...prev, photoURL }));
        }
    };

    const renderStars = (rating) => {
        const safeRating = safeNumber(rating);
        const fullStars = Math.floor(safeRating);
        return [...Array(5)].map((_, i) => (
            <i key={i} className={`${i < fullStars ? 'fas' : 'far'} fa-star`}></i>
        ));
    };

    if (loading) 
        return (
            <div className={styles.loadingContainer}>
                <div className={styles.loader}>
                    <i className="fas fa-spinner fa-spin"></i>
                    <p>Loading Profile...</p>
                </div>
            </div>
        );

    // Calculate safe values for display
    const totalSales = safeNumber(profileData.totalSales);
    const totalTrades = safeNumber(profileData.totalTrades);
    const totalTransactions = totalSales + totalTrades;

    return (
        <div className={styles.profileContainer}>
            <div className={styles.header}>
                <button className={styles.backButton} onClick={() => navigate(-1)}>
                    <i className="fas fa-arrow-left"></i>
                </button>
                <h1>My Profile</h1>
            </div>

            <div className={styles.profileCard}>
                <div className={styles.profileLeft}>
                    <div className={styles.profilePictureSection}>
                        <div className={styles.profilePictureWrapper}>
                            <img 
                                src={profileData.photoURL || '/default-avatar.png'} 
                                alt="Profile" 
                                className={styles.profilePicture}
                                onError={(e) => {
                                    e.target.src = '/default-avatar.png';
                                }}
                            />
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/*"
                                style={{ display: 'none' }}
                                onChange={handlePhotoUpload}
                            />
                        </div>
                    </div>

                    <div className={styles.userInfo}>
                        {isEditing ? (
                            <div className={styles.editForm}>
                                <div className={styles.formGroup}>
                                    <label>First Name</label>
                                    <input
                                        type="text"
                                        name="firstName"
                                        value={editFormData.firstName}
                                        disabled
                                        className={styles.disabledInput}
                                    />
                                </div>
                                <div className={styles.formGroup}>
                                    <label>Surname</label>
                                    <input
                                        type="text"
                                        name="lastName"
                                        value={editFormData.lastName}
                                        disabled
                                        className={styles.disabledInput}
                                    />
                                </div>
                                <div className={styles.formGroup}>
                                    <label>Email</label>
                                    <input
                                        type="email"
                                        value={profileData.email}
                                        disabled
                                        className={styles.disabledInput}
                                    />
                                </div>
                                <div className={styles.formGroup}>
                                    <label>Bio</label>
                                    <textarea
                                        name="bio"
                                        value={editFormData.bio}
                                        onChange={handleInputChange}
                                        placeholder="Tell us about yourself..."
                                        rows="3"
                                    />
                                </div>
                            </div>
                        ) : (
                            <>
                                <h2>{profileData.firstName} {profileData.lastName}</h2>
                                <p className={styles.email}>{profileData.email}</p>
                                <p className={styles.bio}>{profileData.bio || "No bio yet. Click edit to add one!"}</p>
                                <div className={styles.memberSince}>
                                    <i className="fas fa-calendar-alt"></i>
                                    <span>Member since {profileData.memberSince}</span>
                                </div>
                            </>
                        )}
                    </div>
                </div>

                <div className={styles.statsSection}>
                    <div className={styles.rating}>
                        <div className={styles.ratingStars}>{renderStars(profileData.rating)}</div>
                        <span className={styles.ratingValue}>{safeNumber(profileData.rating).toFixed(1)}</span>
                        <span className={styles.totalRatings}>({safeNumber(profileData.totalRatings)} ratings)</span>
                    </div>
                    
                    <div className={styles.statsGrid}>
                        <div className={styles.statItem}>
                            <i className="fas fa-tag"></i>
                            <div className={styles.statInfo}>
                                <span className={styles.statValue}>{totalSales}</span>
                                <span className={styles.statLabel}>Sales</span>
                            </div>
                        </div>
                        <div className={styles.statItem}>
                            <i className="fas fa-exchange-alt"></i>
                            <div className={styles.statInfo}>
                                <span className={styles.statValue}>{totalTrades}</span>
                                <span className={styles.statLabel}>Trades</span>
                            </div>
                        </div>
                        <div className={styles.statItem}>
                            <i className="fas fa-chart-line"></i>
                            <div className={styles.statInfo}>
                                <span className={styles.statValue}>{totalTransactions}</span>
                                <span className={styles.statLabel}>Total Transactions</span>
                            </div>
                        </div>
                    </div>

                    <button className={styles.editButton} onClick={() => setIsEditing(!isEditing)}>
                        <i className="fas fa-pen"></i> {isEditing ? "Save Profile" : "Edit Profile"}
                    </button>
                </div>
            </div>

            <div className={styles.tabsSection}>
                <div className={styles.tabs}>
                    <button className={`${styles.tab} ${activeTab === 'history' ? styles.activeTab : ''}`} onClick={() => setActiveTab('history')}>
                        <i className="fas fa-history"></i> History
                    </button>
                    <button className={`${styles.tab} ${activeTab === 'listings' ? styles.activeTab : ''}`} onClick={() => setActiveTab('listings')}>
                        <i className="fas fa-list"></i> My Listings ({listings.length})
                    </button>
                    <button className={`${styles.tab} ${activeTab === 'offers' ? styles.activeTab : ''}`} onClick={() => setActiveTab('offers')}>
                        <i className="fas fa-hand-holding-usd"></i> Offers ({incomingOffers.length})
                    </button>
                </div>

                <div className={styles.tabContent}>
                    {activeTab === 'history' && (
                        history.length === 0 ? <p className={styles.emptyState}>No history yet</p> : <div>History Items...</div>
                    )}

                    {activeTab === 'listings' && (
                        <div className={styles.listingsGrid}>
                            {listings.map(l => <ProfileListingCard key={l.id} listing={l} />)}
                        </div>
                    )}

                    {activeTab === 'offers' && (
                        <div className={styles.historyList}>
                            {incomingOffers.length === 0 ? (
                                <p className={styles.emptyState}>No pending offers</p>
                            ) : (
                                incomingOffers.map(offer => (
                                    <div key={offer.id} className={`${styles.offerWrapper} ${highlightedOfferId === offer.id ? styles.highlightedOffer : ''}`}>
                                        <OfferItem offer={offer} />
                                    </div>
                                ))
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default Profile;