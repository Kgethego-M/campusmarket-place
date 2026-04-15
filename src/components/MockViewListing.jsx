import { useEffect, useState } from "react";

// --- MOCK IMPORTS (remove these when switching back to Firebase) ---
import { mockListings } from "../mockData.js";

// --- FIREBASE IMPORTS (uncomment these when switching back to Firebase) ---
// import { db } from "../firebase.js";
// import { collection, getDocs, orderBy, query } from "firebase/firestore";

import { validateListingData } from "../utils/view-listing.utils.js";
import ListingCard from "./ListingCard.jsx";
import NavBar from "./NavBarTemp.jsx";
import styles from "./ViewListing.module.css";

const LISTING_TYPES = ["All", "For Sale", "For Trade"];
const CONDITIONS    = ["All", "New", "Like New", "Good", "Fair", "Poor"];
const CATEGORIES    = [
    "All", "Books", "Electronics", "Clothing", "Furniture",
    "Appliances", "Sports Equipment", "Outdoor Gear",
    "Accessories and Jewelry", "Toys and Games",
    "Beauty and Personal Care", "Stationary", "Study Materials", "Other",
];

export default function ViewListings() {
    const [listings, setListings]       = useState([]);
    const [loading, setLoading]         = useState(true);
    const [search, setSearch]           = useState("");
    const [typeFilter, setTypeFilter]   = useState("All");
    const [condFilter, setCondFilter]   = useState("All");
    const [catFilter, setCatFilter]     = useState("All");
    const [showFilters, setShowFilters] = useState(false);

    // ── Fetch & merge listings ──────────────────────────────────────────────
    useEffect(() => {
        async function fetchListings() {
            try {
                const stored    = JSON.parse(sessionStorage.getItem("listings") || "[]");
                const storedIds = new Set(stored.map((l) => l.id));

                const normalise = (l) => ({
                    ...l,
                    imageUrl:   l.imageUrl || (l.photos && l.photos[0]) || null,
                    sellerName: l.sellerName || "Student",
                });

                const merged = [
                    ...stored.map(normalise),
                    ...mockListings.filter((l) => !storedIds.has(l.id)).map(normalise),
                ];

                // --- FIREBASE FETCH (uncomment when switching back) ---
                // const q    = query(collection(db, "listings"), orderBy("timestamp", "desc"));
                // const snap = await getDocs(q);
                // const merged = snap.docs.map(d => normalise({ id: d.id, ...d.data() }));
                // --- END FIREBASE FETCH ---

                const valid = merged.filter((l) => validateListingData(l).valid);
                setListings(valid);
            } catch (err) {
                console.error("Failed to fetch listings:", err);
            } finally {
                setLoading(false);
            }
        }
        fetchListings();
    }, []);

    // ── Filter logic ────────────────────────────────────────────────────────
    const filtered = listings.filter((l) => {
        const matchSearch =
            l.title?.toLowerCase().includes(search.toLowerCase()) ||
            l.category?.toLowerCase().includes(search.toLowerCase());
        const matchType = typeFilter === "All" || l.listingType === typeFilter;
        const matchCond = condFilter === "All" || l.condition === condFilter;
        const matchCat  = catFilter  === "All" || l.category  === catFilter;
        return matchSearch && matchType && matchCond && matchCat;
    });

    const activeFilterCount = [typeFilter, condFilter, catFilter].filter(v => v !== "All").length;

    function clearFilters() {
        setTypeFilter("All");
        setCondFilter("All");
        setCatFilter("All");
    }

    return (
        <>
            <NavBar />
            <div className={styles.page}>
                {/* ── Page header ── */}
                <div className={styles.pageHeader}>
                    <h1 className={styles.heading}>Browse Listings</h1>
                    <p className={styles.subheading}>
                        Discover items from students across the whole campus
                    </p>
                </div>

                {/* ── Search + filter toggle ── */}
                <div className={styles.searchRow}>
                    <input
                        className={styles.searchInput}
                        type="text"
                        placeholder="Search textbooks, electronics..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                    <button
                        className={`${styles.filterBtn} ${showFilters ? styles.filterBtnActive : ""}`}
                        onClick={() => setShowFilters((v) => !v)}
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                            stroke="currentColor" strokeWidth="2.2"
                            strokeLinecap="round" strokeLinejoin="round">
                            <line x1="4"  y1="6"  x2="20" y2="6"/>
                            <line x1="8"  y1="12" x2="16" y2="12"/>
                            <line x1="11" y1="18" x2="13" y2="18"/>
                        </svg>
                        Filters
                        {activeFilterCount > 0 && (
                            <span className={styles.filterBadge}>{activeFilterCount}</span>
                        )}
                    </button>
                </div>

                {/* ── Filter panel ── */}
                {showFilters && (
                    <div className={styles.filterPanel}>

                        <div className={styles.filterGroup}>
                            <span className={styles.filterLabel}>Listing type</span>
                            <div className={styles.pills}>
                                {LISTING_TYPES.map((t) => (
                                    <button
                                        key={t}
                                        className={`${styles.pill} ${typeFilter === t ? styles.pillActive : ""}`}
                                        onClick={() => setTypeFilter(t)}
                                    >
                                        {t}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className={styles.filterGroup}>
                            <span className={styles.filterLabel}>Condition</span>
                            <div className={styles.pills}>
                                {CONDITIONS.map((c) => (
                                    <button
                                        key={c}
                                        className={`${styles.pill} ${condFilter === c ? styles.pillActive : ""}`}
                                        onClick={() => setCondFilter(c)}
                                    >
                                        {c}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className={styles.filterGroup}>
                            <span className={styles.filterLabel}>Category</span>
                            <div className={styles.pills}>
                                {CATEGORIES.map((c) => (
                                    <button
                                        key={c}
                                        className={`${styles.pill} ${catFilter === c ? styles.pillActive : ""}`}
                                        onClick={() => setCatFilter(c)}
                                    >
                                        {c}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {activeFilterCount > 0 && (
                            <button className={styles.clearBtn} onClick={clearFilters}>
                                Clear all filters
                            </button>
                        )}
                    </div>
                )}

                {/* ── Results count ── */}
                {!loading && (
                    <p className={styles.resultsCount}>
                        {filtered.length} {filtered.length === 1 ? "listing" : "listings"} found
                    </p>
                )}

                {/* ── Grid ── */}
                {loading ? (
                    <div className={styles.skeletonGrid}>
                        {Array.from({ length: 8 }).map((_, i) => (
                            <div key={i} className={styles.skeletonCard}>
                                <div className={styles.skeletonImg} />
                                <div className={styles.skeletonBody}>
                                    <div className={styles.skeletonLine} style={{ width: "60%" }} />
                                    <div className={styles.skeletonLine} style={{ width: "35%" }} />
                                    <div className={styles.skeletonLine} style={{ width: "45%" }} />
                                </div>
                            </div>
                        ))}
                    </div>
                ) : filtered.length === 0 ? (
                    <div className={styles.emptyState}>
                        <svg width="40" height="40" viewBox="0 0 24 24" fill="none"
                            stroke="#ccc" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="11" cy="11" r="8"/>
                            <line x1="21" y1="21" x2="16.65" y2="16.65"/>
                        </svg>
                        <p>No listings match your filters.</p>
                        <button className={styles.clearBtn} onClick={() => { setSearch(""); clearFilters(); }}>
                            Clear search &amp; filters
                        </button>
                    </div>
                ) : (
                    <div className={styles.listingsGrid}>
                        {filtered.map((listing, index) => (
                            <ListingCard
                                key={listing.id ?? index}
                                listing={listing}
                                visible={true}
                            />
                        ))}
                    </div>
                )}
            </div>
        </>
    );
}
