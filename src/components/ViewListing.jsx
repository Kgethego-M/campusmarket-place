import { useEffect, useState } from "react";

// --- FIREBASE IMPORTS ---
import { db } from "../firebase.js";
import { collection, getDocs, orderBy, query } from "firebase/firestore";

import { validateListingData } from "../utils/view-listing.utils.js";
import ListingCard from "./ListingCard.jsx";
import NavBar from "./NavBarTemp.jsx";
import styles from "./ViewListing.module.css";

const LISTING_TYPES = ["All", "For Sale", "For Trade"];
const CONDITIONS = ["All", "New", "Like New", "Good", "Fair", "Poor"];
const CATEGORIES = [
    "All",
    "Books",
    "Electronics",
    "Clothing",
    "Furniture",
    "Appliances",
    "Sports Equipment",
    "Outdoor Gear",
    "Accessories and Jewelry",
    "Toys and Games",
    "Beauty and Personal Care",
    "Stationary",
    "Study Materials",
    "Other",
];

const PRICE_RANGES = [
    { label: "All",          min: 0,    max: Infinity },
    { label: "Under R100",   min: 0,    max: 100 },
    { label: "R100 – R300",  min: 100,  max: 300 },
    { label: "R300 – R500",  min: 300,  max: 500 },
    { label: "R500 – R1000", min: 500,  max: 1000 },
    { label: "Over R1000",   min: 1000, max: Infinity },
];

export default function ViewListings() {
    const [listings, setListings] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [typeFilter, setTypeFilter] = useState("All");
    const [condFilter, setCondFilter] = useState("All");
    const [catFilter, setCatFilter] = useState("All");
    const [priceFilter, setPriceFilter] = useState("All");
    const [showFilters, setShowFilters] = useState(false);

    // ── Fetch listings from Firebase ──────────────────────────────────────────────
    useEffect(() => {
        async function fetchListings() {
            setLoading(true);
            try {
                // Query listings collection, ordered by newest first
                const listingsRef = collection(db, "listings");
                const q = query(listingsRef, orderBy("timestamp", "desc"));
                const querySnapshot = await getDocs(q);
                
                // Transform Firebase data to match your listing structure
                const firebaseListings = querySnapshot.docs.map(doc => {
                    const data = doc.data();
                    return {
                        id: doc.id,
                        ...data,
                        // FIXED: Use photos array for images
                        imageUrl: data.photos && data.photos.length > 0 ? data.photos[0] : null,
                        sellerName: data.sellerName || "Student",
                        sellerAvatar: data.sellerAvatar || null,
                        sellerUID: data.sellerUID || data.sellerUid,
                        title: data.title || data.Title,
                        price: data.price || data.Price,
                        condition: data.condition || data.Condition,
                        category: data.category || data.Category,
                        listingType: data.listingType || data["Listing Type"],
                        description: data.description || data.Description,
                        status: data.status || data.Status,
                        timestamp: data.timestamp || data.Timestamp,
                    };
                });

                // Also get session storage listings (for user's own listings)
                const stored = JSON.parse(sessionStorage.getItem("listings") || "[]");
                const storedIds = new Set(stored.map((l) => l.id));
                
                // Merge stored listings (avoid duplicates)
                const normalise = (l) => ({
                    ...l,
                    imageUrl: l.imageUrl || (l.photos && l.photos[0]) || null,
                    sellerName: l.sellerName || "Student",
                });

                const merged = [
                    ...stored.map(normalise),
                    ...firebaseListings.filter((l) => !storedIds.has(l.id)),
                ];

                // Validate and set listings
                const valid = merged.filter((l) => validateListingData(l).valid);
                setListings(valid);
            } catch (err) {
                console.error("Failed to fetch listings from Firebase:", err);
            } finally {
                setLoading(false);
            }
        }

        loadListings();
    }, []);

    const activePriceRange =
        PRICE_RANGES.find((r) => r.label === priceFilter) ||
        PRICE_RANGES[0];

    const filtered = listings.filter((listing) => {
        const matchSearch =
            l.title?.toLowerCase().includes(search.toLowerCase()) ||
            l.category?.toLowerCase().includes(search.toLowerCase()) ||
            l.description?.toLowerCase().includes(search.toLowerCase());
        
        const matchType  = typeFilter  === "All" || l.listingType === typeFilter;
        const matchCond  = condFilter  === "All" || l.condition   === condFilter;
        const matchCat   = catFilter   === "All" || l.category    === catFilter;
        const matchPrice = priceFilter === "All" ||
            (l.price >= activePriceRange.min && l.price < activePriceRange.max);
        
        return matchSearch && matchType && matchCond && matchCat && matchPrice;
    });

    const activeFilterCount = [
        typeFilter,
        condFilter,
        catFilter,
        priceFilter,
    ].filter((v) => v !== "All").length;

    function clearFilters() {
        setTypeFilter("All");
        setCondFilter("All");
        setCatFilter("All");
        setPriceFilter("All");
    }

    return (
        <>
            <NavBar />
            <div className={styles.page}>
                <div className={styles.pageHeader}>
                    <h1 className={styles.heading}>Browse Listings</h1>
                    <p className={styles.subheading}>
                        Discover items from students across campus
                    </p>
                </div>

                <div className={styles.searchRow}>
                    <input
                        className={styles.searchInput}
                        type="text"
                        placeholder="Search textbooks, electronics..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>

                {!loading && (
                    <p className={styles.resultsCount}>
                        {filtered.length}{" "}
                        {filtered.length === 1
                            ? "listing"
                            : "listings"}{" "}
                        found
                    </p>
                )}

                {loading ? (
                    <p>Loading listings...</p>
                ) : filtered.length === 0 ? (
                    <p>No listings found.</p>
                ) : (
                    <div className={styles.listingsGrid}>
                        {filtered.map((listing, index) => (
                            <ListingCard
                                key={listing.id ?? index}
                                listing={listing}
                            />
                        ))}
                    </div>
                )}
            </div>
        </>
    );
}