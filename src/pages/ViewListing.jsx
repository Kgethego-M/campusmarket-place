import { useEffect, useState } from "react";

// --- MOCK IMPORTS ---
import { mockListings } from "../mockData.js";

// --- UTIL ---
import { validateListingData } from "../utils/view-listing.utils.js";
import ListingCard from "./ListingCard.jsx";
import styles from "./ViewListing.module.css";

export default function ViewListings() {
    const [listings, setListings] = useState([]);
    const [loading, setLoading] = useState(true);

    const [searchTerm, setSearchTerm] = useState("");
    const [filterCategory, setFilterCategory] = useState("all");

    useEffect(() => {
        async function fetchListings() {
            try {
                const valid = mockListings.filter(
                    (l) => validateListingData(l).valid
                );
                setListings(valid);
            } catch (err) {
                console.error("Failed to fetch listings:", err);
            } finally {
                setLoading(false);
            }
        }

        fetchListings();
    }, []);

    const filteredListings = listings.filter((listing) => {
        const matchesSearch = listing.title
            ?.toLowerCase()
            .includes(searchTerm.toLowerCase());

        const matchesFilter =
            filterCategory === "all" ||
            listing.category === filterCategory;

        return matchesSearch && matchesFilter;
    });

    return (
        <div className={styles.page}>
            <h1 className={styles.heading}>Campus Marketplace</h1>

            {loading ? (
                <p className={styles.loadingText}>Loading listings...</p>
            ) : (
                <>
                    {/* SEARCH + FILTER CONTROLS */}
                    <div className={styles.controls}>
                        <input
                            type="text"
                            placeholder="Search listings..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className={styles.searchInput}
                        />

                        <select
                            value={filterCategory}
                            onChange={(e) => setFilterCategory(e.target.value)}
                            className={styles.filterSelect}
                        >
                            <option value="all">All</option>
                            <option value="books">Books</option>
                            <option value="electronics">Electronics</option>
                            <option value="clothing">Clothing</option>
                        </select>
                    </div>

                    {/* LISTINGS */}
                    {filteredListings.length === 0 ? (
                        <p className={styles.loadingText}>
                            No listings found.
                        </p>
                    ) : (
                        <div className={styles.listingsGrid}>
                            {filteredListings.map((listing, index) => (
                                <ListingCard
                                    key={listing.id ?? index}
                                    listing={listing}
                                />
                            ))}
                        </div>
                    )}
                </>
            )}
        </div>
    );
}