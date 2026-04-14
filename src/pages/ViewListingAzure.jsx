import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import ListingCard from "../components/ListingCard.jsx";
import styles from "../components/ViewListing.module.css";

const API_URL = import.meta.env.VITE_API_URL;

export default function ViewListingAzure() {
    const [listings, setListings] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const navigate = useNavigate();

    useEffect(() => {
        fetchListings();
    }, []);

    async function fetchListings() {
        try {
            const response = await fetch(`${API_URL}/listings`);
            
            if (!response.ok) {
                throw new Error("Failed to fetch listings");
            }
            
            const data = await response.json();
            setListings(data);
        } catch (err) {
            console.error("Failed to fetch listings:", err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className={styles.page}>
            <h1 className={styles.heading}>Campus Marketplace (Azure)</h1>
            <button
                onClick={() => navigate("/azure/create-listing")}
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
                + Create Listing (Azure)
            </button>
            {loading ? (
                <p className={styles.loadingText}>Loading listings...</p>
            ) : error ? (
                <p className={styles.loadingText} style={{ color: "red" }}>Error: {error}</p>
            ) : listings.length === 0 ? (
                <p className={styles.loadingText}>No listings found. Create one!</p>
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