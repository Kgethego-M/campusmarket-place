import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth, db, storage } from '../firebase';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { updateProfile } from 'firebase/auth';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import styles from './Profile.module.css';

const Profile = () => {
    const navigate = useNavigate();
    const fileInputRef = useRef(null);
    
    const [loading, setLoading] = useState(true);
    const [isEditing, setIsEditing] = useState(false);
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
    
    const [editFormData, setEditFormData] = useState({
        firstName: '',
        lastName: '',
        bio: ''
    });
    
    const [history, setHistory] = useState([]);
    const [listings, setListings] = useState([]);
    const [activeTab, setActiveTab] = useState('history');

    useEffect(() => {
        const loggedInUserId = localStorage.getItem('loggedInUserId');
        if (!loggedInUserId) {
            navigate('/login');
            return;
        }
        fetchUserData();
    }, [navigate]);

    const fetchUserData = async () => {
        try {
            const user = auth.currentUser;
            if (!user) {
                navigate('/login');
                return;
            }

            const userId = user.uid;
            const docRef = doc(db, 'users', userId);
            const docSnap = await getDoc(docRef);
            
            if (docSnap.exists()) {
                const userData = docSnap.data();
                
                // Set profile data
                setProfileData({
                    firstName: userData.firstName || '',
                    lastName: userData.lastName || '',
                    email: userData.email || user.email,
                    bio: userData.bio || '',
                    photoURL: userData.photoURL || user.photoURL || '/default-avatar.png',
                    memberSince: user.metadata.creationTime 
                        ? new Date(user.metadata.creationTime).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
                        : 'Unknown',
                    totalSales: userData.totalSales || 0,
                    totalTrades: userData.totalTrades || 0,
                    rating: userData.rating || 0,
                    totalRatings: userData.totalRatings || 0
                });
                
                // Set edit form data
                setEditFormData({
                    firstName: userData.firstName || '',
                    lastName: userData.lastName || '',
                    bio: userData.bio || ''
                });
                
                // Load history and listings
                setHistory(userData.history || []);
                setListings(userData.listings || []);
            } else {
                console.log("No document found matching ID");
                navigate('/login');
            }
        } catch (error) {
            console.error("Error fetching user data:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setEditFormData(prev => ({
            ...prev,
            [name]: value
        }));
    };

    const handlePhotoUpload = async (e) => {
        const file = e.target.files[0];
        if (file) {
            try {
                const user = auth.currentUser;
                if (!user) return;
                
                const storageRef = ref(storage, `profilePictures/${user.uid}`);
                await uploadBytes(storageRef, file);
                const photoURL = await getDownloadURL(storageRef);
                
                // Update Firebase Auth profile
                await updateProfile(user, { photoURL });
                
                // Update Firestore
                const userDocRef = doc(db, 'users', user.uid);
                await updateDoc(userDocRef, { photoURL });
                
                // Update local state
                setProfileData(prev => ({
                    ...prev,
                    photoURL: photoURL
                }));
                
                alert('Profile picture updated successfully!');
            } catch (error) {
                console.error("Error uploading photo:", error);
                alert('Failed to upload photo. Please try again.');
            }
        }
    };

    const handleSave = async () => {
        try {
            const user = auth.currentUser;
            if (!user) return;
            
            // Update display name in Firebase Auth
            const fullName = `${editFormData.firstName} ${editFormData.lastName}`;
            await updateProfile(user, { displayName: fullName });
            
            // Update Firestore
            const userDocRef = doc(db, 'users', user.uid);
            await updateDoc(userDocRef, {
                firstName: editFormData.firstName,
                lastName: editFormData.lastName,
                bio: editFormData.bio,
                updatedAt: new Date()
            });
            
            // Update local state
            setProfileData(prev => ({
                ...prev,
                firstName: editFormData.firstName,
                lastName: editFormData.lastName,
                bio: editFormData.bio
            }));
            
            setIsEditing(false);
            alert('Profile updated successfully!');
        } catch (error) {
            console.error("Error saving profile:", error);
            alert('Failed to save profile. Please try again.');
        }
    };

    const handleCancel = () => {
        setEditFormData({
            firstName: profileData.firstName,
            lastName: profileData.lastName,
            bio: profileData.bio
        });
        setIsEditing(false);
    };

    const renderStars = (rating) => {
        const fullStars = Math.floor(rating);
        const hasHalfStar = rating % 1 >= 0.5;
        const stars = [];
        
        for (let i = 1; i <= 5; i++) {
            if (i <= fullStars) {
                stars.push(<i key={i} className="fas fa-star"></i>);
            } else if (i === fullStars + 1 && hasHalfStar) {
                stars.push(<i key={i} className="fas fa-star-half-alt"></i>);
            } else {
                stars.push(<i key={i} className="far fa-star"></i>);
            }
        }
        return stars;
    };

    if (loading) {
        return (
            <div className={styles.loadingContainer}>
                <div className={styles.loader}>
                    <i className="fas fa-spinner fa-spin"></i>
                    <p>Loading profile...</p>
                </div>
            </div>
        );
    }

    return (
        <div className={styles.profileContainer}>
            {/* Header with back button */}
            <div className={styles.header}>
                <button className={styles.backButton} onClick={() => navigate(-1)}>
                    <i className="fas fa-arrow-left"></i>
                </button>
                <h1>My Profile</h1>
            </div>

            {/* Main Profile Card */}
            <div className={styles.profileCard}>
                <div className={styles.profileLeft}>
                    {/* Profile Picture Section */}
                    <div className={styles.profilePictureSection}>
                        <div className={styles.profilePictureWrapper}>
                            <img 
                                src={profileData.photoURL} 
                                alt="Profile" 
                                className={styles.profilePicture}
                            />
                        </div>
                    </div>

                    {/* User Info Section */}
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

                {/* Stats Section */}
                <div className={styles.statsSection}>
                    <div className={styles.rating}>
                        <div className={styles.ratingStars}>
                            {renderStars(profileData.rating)}
                        </div>
                        <span className={styles.ratingValue}>{profileData.rating}</span>
                        <span className={styles.totalRatings}>({profileData.totalRatings} ratings)</span>
                    </div>
                    
                    <div className={styles.statsGrid}>
                        <div className={styles.statItem}>
                            <i className="fas fa-tag"></i>
                            <div className={styles.statInfo}>
                                <span className={styles.statValue}>{profileData.totalSales}</span>
                                <span className={styles.statLabel}>Sales</span>
                            </div>
                        </div>
                        <div className={styles.statItem}>
                            <i className="fas fa-exchange-alt"></i>
                            <div className={styles.statInfo}>
                                <span className={styles.statValue}>{profileData.totalTrades}</span>
                                <span className={styles.statLabel}>Trades</span>
                            </div>
                        </div>
                        <div className={styles.statItem}>
                            <i className="fas fa-chart-line"></i>
                            <div className={styles.statInfo}>
                                <span className={styles.statValue}>{profileData.totalSales + profileData.totalTrades}</span>
                                <span className={styles.statLabel}>Total Transactions</span>
                            </div>
                        </div>
                    </div>

                    {isEditing ? (
                        <div className={styles.editActions}>
                            <button className={styles.saveButton} onClick={handleSave}>
                                <i className="fas fa-save"></i> Save Changes
                            </button>
                            <button className={styles.cancelButton} onClick={handleCancel}>
                                Cancel
                            </button>
                        </div>
                    ) : (
                        <button className={styles.editButton} onClick={() => setIsEditing(true)}>
                            <i className="fas fa-pen"></i> Edit Profile
                        </button>
                    )}
                </div>
            </div>

            {/* Tabs Section */}
            <div className={styles.tabsSection}>
                <div className={styles.tabs}>
                    <button 
                        className={`${styles.tab} ${activeTab === 'history' ? styles.activeTab : ''}`}
                        onClick={() => setActiveTab('history')}
                    >
                        <i className="fas fa-history"></i> History
                    </button>
                    <button 
                        className={`${styles.tab} ${activeTab === 'listings' ? styles.activeTab : ''}`}
                        onClick={() => setActiveTab('listings')}
                    >
                        <i className="fas fa-list"></i> My Listings
                    </button>
                </div>

                {/* History Tab Content */}
                {activeTab === 'history' && (
                    <div className={styles.tabContent}>
                        {history.length === 0 ? (
                            <div className={styles.emptyState}>
                                <i className="fas fa-shopping-bag"></i>
                                <p>No transaction history yet</p>
                            </div>
                        ) : (
                            <div className={styles.historyList}>
                                {history.map(item => (
                                    <div key={item.id} className={styles.historyItem}>
                                        <div className={styles.historyIcon}>
                                            {item.type === 'purchase' && <i className="fas fa-shopping-cart"></i>}
                                            {item.type === 'sale' && <i className="fas fa-tag"></i>}
                                            {item.type === 'trade' && <i className="fas fa-exchange-alt"></i>}
                                        </div>
                                        <div className={styles.historyDetails}>
                                            <h4>{item.item}</h4>
                                            <div className={styles.historyMeta}>
                                                <span><i className="fas fa-calendar"></i> {new Date(item.date).toLocaleDateString()}</span>
                                                {item.type === 'purchase' && <span><i className="fas fa-user"></i> From: {item.seller}</span>}
                                                {item.type === 'sale' && <span><i className="fas fa-user"></i> To: {item.buyer}</span>}
                                                {item.type === 'trade' && <span><i className="fas fa-user"></i> With: {item.tradedWith}</span>}
                                                {item.price && <span><i className="fas fa-dollar-sign"></i> {item.price}</span>}
                                            </div>
                                        </div>
                                        <div className={`${styles.historyStatus} ${styles[item.status]}`}>
                                            {item.status}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* My Listings Tab Content */}
                {activeTab === 'listings' && (
                    <div className={styles.tabContent}>
                        {listings.length === 0 ? (
                            <div className={styles.emptyState}>
                                <i className="fas fa-box-open"></i>
                                <p>No listings yet</p>
                            </div>
                        ) : (
                            <div className={styles.listingsGrid}>
                                {listings.map(listing => (
                                    <div key={listing.id} className={styles.listingCard}>
                                        <div className={styles.listingStatus}>
                                            <span className={`${styles.statusBadge} ${styles[listing.status]}`}>
                                                {listing.status}
                                            </span>
                                        </div>
                                        <div className={styles.listingInfo}>
                                            <h4>{listing.title}</h4>
                                            <p className={styles.listingPrice}>{listing.price}</p>
                                            <div className={styles.listingStats}>
                                                <span><i className="fas fa-eye"></i> {listing.views || 0}</span>
                                                <span><i className="fas fa-heart"></i> {listing.likes || 0}</span>
                                                <span><i className="fas fa-calendar"></i> {new Date(listing.date).toLocaleDateString()}</span>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default Profile;