import { useEffect, useState } from "react";

// --- FIREBASE IMPORTS ---
import { db } from "../firebase.js";
import { collection, getDocs, orderBy, query, where } from "firebase/firestore";

import { validateListingData } from "../utils/view-listing.utils.js";
import ListingCard from "./ListingCard.jsx";
import NavBar from "./NavBarTemp.jsx";
import styles from "./ViewListing.module.css";
import AdBanner from "./AdBanner.jsx";
import PremiumPopup from "./PremiumPopup.jsx";   // ✅ new import for premium popup

const LISTING_TYPES = ["All", "For Sale", "For Trade", "For Sale or Trade"];
const CONDITIONS    = ["All", "New", "Like New", "Good", "Fair", "Poor"];
const CATEGORIES    = [
    "All", "Books", "Electronics", "Clothing", "Furniture",
    "Appliances", "Sports Equipment", "Outdoor Gear",
    "Accessories and Jewelry", "Toys and Games",
    "Beauty and Personal Care", "Stationary", "Study Materials", "Other",
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
    const [listings, setListings]       = useState([]);
    const [loading, setLoading]         = useState(true);
    const [search, setSearch]           = useState("");
    const [typeFilter, setTypeFilter]   = useState("All");
    const [condFilter, setCondFilter]   = useState("All");
    const [catFilter, setCatFilter]     = useState("All");
    const [priceFilter, setPriceFilter] = useState("All");
    const [showFilters, setShowFilters] = useState(false);

    // ── Fetch listings from Firebase ──────────────────────────
    useEffect(() => {
        async function fetchListings() {
            setLoading(true);
            try {
                // 1. Fetch listing IDs that are tied to accepted/completed transactions
                let hiddenListingIds = new Set();
                try {
                    const txSnap = await getDocs(
                        query(
                            collection(db, "transactions"),
                            where("status", "in", ["accepted", "completed"])
                        )
                    );
                    txSnap.docs.forEach(d => {
                        const lid = d.data().listingId;
                        if (lid) hiddenListingIds.add(lid);
                    });
                } catch (txErr) {
                    console.warn("Could not fetch transactions for filtering:", txErr);
                }

                // 2. Fetch all listings ordered by timestamp
                const querySnapshot = await getDocs(
                    query(collection(db, "listings"), orderBy("timestamp", "desc"))
                );

                const normaliseType = (t) => {
                    if (!t) return t;
                    if (t === "either") return "For Sale or Trade";
                    if (t === "sale")   return "For Sale";
                    if (t === "trade")  return "For Trade";
                    return t;
                };

                const firebaseListings = querySnapshot.docs.map(doc => {
                    const data = doc.data();
                    return {
                        id: doc.id,
                        ...data,
                        imageUrl:            data.photos?.[0] ?? null,
                        sellerName:          data.sellerName   || "Student",
                        sellerAvatar:        data.sellerAvatar || null,
                        sellerUID:           data.sellerUID    || data.sellerUid,
                        title:               data.title        || data.Title,
                        price:               data.price        || data.Price,
                        condition:           data.condition    || data.Condition,
                        category:            data.category     || data.Category,
                        listingType:         normaliseType(data.listingType),
                        originalListingType: data.listingType,
                        description:         data.description  || data.Description,
                        status:              data.status       || data.Status,
                        timestamp:           data.timestamp    || data.Timestamp,
                    };
                });

                // 3. Merge with any sessionStorage listings (legacy/local)
                const stored    = JSON.parse(sessionStorage.getItem("listings") || "[]");
                const storedIds = new Set(stored.map(l => l.id));

                const normaliseStored = (l) => ({
                    ...l,
                    imageUrl:            l.imageUrl || l.photos?.[0] || null,
                    sellerName:          l.sellerName || "Student",
                    listingType:         normaliseType(l.listingType),
                    originalListingType: l.listingType,
                });

                const merged = [
                    ...stored.map(normaliseStored),
                    ...firebaseListings.filter(l => !storedIds.has(l.id)),
                ];

                // 4. Remove listings that are hidden due to transaction or status
                const UNAVAILABLE = new Set(["accepted", "completed", "sold", "traded", "inactive", "waiting"]);
                const visible = merged.filter(l => {
                    if (hiddenListingIds.has(l.id)) return false;
                    if (l.status && UNAVAILABLE.has(l.status.toLowerCase())) return false;
                    return validateListingData(l).valid;
                });

                setListings(visible);
            } catch (err) {
                console.error("Failed to fetch listings from Firebase:", err);
            } finally {
                setLoading(false);
            }
        }
        fetchListings();
    }, []);

    // ── Filter logic ──────────────────────────────────────────
    const activePriceRange = PRICE_RANGES.find(r => r.label === priceFilter) || PRICE_RANGES[0];

    const filtered = listings.filter(l => {
        const matchSearch =
            l.title?.toLowerCase().includes(search.toLowerCase()) ||
            l.category?.toLowerCase().includes(search.toLowerCase()) ||
            l.description?.toLowerCase().includes(search.toLowerCase());

        let matchesType = true;
        if (typeFilter === "For Sale") {
            matchesType = l.originalListingType === "sale" || l.listingType === "For Sale";
        } else if (typeFilter === "For Trade") {
            matchesType = l.originalListingType === "trade" || l.listingType === "For Trade";
        } else if (typeFilter === "For Sale or Trade") {
            matchesType = l.originalListingType === "either" || l.listingType === "For Sale or Trade";
        }

        const matchCond  = condFilter  === "All" || l.condition === condFilter;
        const matchCat   = catFilter   === "All" || l.category  === catFilter;
        const matchPrice = priceFilter === "All" ||
            (l.price >= activePriceRange.min && l.price < activePriceRange.max);

        return matchSearch && matchesType && matchCond && matchCat && matchPrice;
    });

    const activeFilterCount = [typeFilter, condFilter, catFilter, priceFilter]
        .filter(v => v !== "All").length;

    function clearFilters() {
        setTypeFilter("All");
        setCondFilter("All");
        setCatFilter("All");
        setPriceFilter("All");
    }

    return (
        <>
            <PremiumPopup />    {/* ✅ premium popup appears first, overlays everything */}
            <NavBar />
            <div className={styles.page}>
                <div className={styles.pageHeader}>
                    <h1 className={styles.heading}>Browse Listings</h1>
                    <p className={styles.subheading}>
                        Discover items from students across the whole campus
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
                    <button
                        className={`${styles.filterBtn} ${showFilters ? styles.filterBtnActive : ""}`}
                        onClick={() => setShowFilters(v => !v)}
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

                {showFilters && (
                    <div className={styles.filterPanel}>
                        <div className={styles.filterGroup}>
                            <span className={styles.filterLabel}>Listing type</span>
                            <div className={styles.pills}>
                                {LISTING_TYPES.map(t => (
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
                            <span className={styles.filterLabel}>Price range</span>
                            <div className={styles.pills}>
                                {PRICE_RANGES.map(r => (
                                    <button
                                        key={r.label}
                                        className={`${styles.pill} ${priceFilter === r.label ? styles.pillActive : ""}`}
                                        onClick={() => setPriceFilter(r.label)}
                                    >
                                        {r.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className={styles.filterGroup}>
                            <span className={styles.filterLabel}>Condition</span>
                            <div className={styles.pills}>
                                {CONDITIONS.map(c => (
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
                                {CATEGORIES.map(c => (
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

                {!loading && (
                    <p className={styles.resultsCount}>
                        {filtered.length} {filtered.length === 1 ? "listing" : "listings"} found
                    </p>
                )}

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
            <AdBanner />
        </>
    );
}