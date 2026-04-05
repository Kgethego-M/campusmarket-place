import { useEffect, useState } from "react";

// --- MOCK IMPORTS (remove these when switching back to Firebase) ---
import { mockListings } from "../mockData.js";

// --- FIREBASE IMPORTS (uncomment these when switching back to Firebase) ---
// import { db } from "../firebase.js";
// import { collection, getDocs, orderBy, query } from "firebase/firestore";

import { validateListingData } from "../utils/view-listing.utils.js";
import ListingCard from "./ListingCard.jsx";
import styles from "./ViewListing.module.css";

export default function ViewListings() {
    const [listings, setListings] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function fetchListings() {
            try {

                // --- MOCK FETCH (remove this block when switching back to Firebase) ---
                const valid = mockListings.filter(
                    (l) => validateListingData(l).valid
                );
                setListings(valid);
                // --- END MOCK FETCH ---

                // --- FIREBASE FETCH (uncomment this block when switching back to Firebase) ---
                // const q = query(collection(db, "listings"), orderBy("timestamp", "desc"));
                // const querySnapshot = await getDocs(q);
                // const valid = [];
                // querySnapshot.forEach((doc) => {
                //     const listing = doc.data();
                //     if (validateListingData(listing).valid) {
                //         valid.push({ id: doc.id, ...listing });
                //     }
                // });
                // setListings(valid);
                // --- END FIREBASE FETCH ---

            } catch (err) {
                console.error("Failed to fetch listings:", err);
            } finally {
                setLoading(false);
            }
        }
        fetchListings();
    }, []);

    return (
        <div className={styles.page}>
            <h1 className={styles.heading}>Campus Marketplace</h1>
            {loading ? (
                <p className={styles.loadingText}>Loading listings...</p>
            ) : listings.length === 0 ? (
                <p className={styles.loadingText}>No listings found.</p>
            ) : (
                <div className={styles.listingsGrid}>
                    {listings.map((listing, index) => (
                        <ListingCard key={listing.id ?? index} listing={listing} />
                    ))}
                </div>
            )}
        </div>
    );
}
