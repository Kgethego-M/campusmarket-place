import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { mockListings } from "../mockData.js";
import { validateListingData } from "../utils/view-listing.utils.js";
import ListingCard from "../components/ListingCard.jsx";
import styles from "../components/ViewListing.module.css";

export default function ViewListings() {
    const [listings, setListings] = useState([]);
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();

    useEffect(() => {
        try {
            const stored = sessionStorage.getItem("listings");
            let allListings;

            if (!stored) {
                sessionStorage.setItem("listings", JSON.stringify(mockListings));
                allListings = mockListings;
            } else {
                const parsed = JSON.parse(stored);
                const parsedIds = new Set(parsed.map((l) => l.id));
                const missing = mockListings.filter((l) => !parsedIds.has(l.id));
                allListings = [...parsed, ...missing];
                sessionStorage.setItem("listings", JSON.stringify(allListings));
            }

            const valid = allListings.filter((l) => validateListingData(l).valid);
            setListings(valid);
        } catch (err) {
            console.error("Failed to fetch listings:", err);
        } finally {
            setLoading(false);
        }
    }, []);

    return (
        <div className={styles.page}>
            <h1 className={styles.heading}>Campus Marketplace</h1>
            <button
                onClick={() => navigate("/create-listing")}
                style={{
                    marginBottom: "24px",
                    padding: "10px 24px",
                    backgroundColor: "#4a90d9",
                    color: "white",
                    border: "none",
                    borderRadius: "8px",
                    fontSize: "15px",
                    fontWeight: "600",
                    cursor: "pointer",
                }}
            >
                + Create Listing
            </button>
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