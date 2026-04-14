import { useEffect, useState } from "react";

// --- MOCK IMPORTS (remove these when switching back to Firebase) ---
import { mockListings } from "../mockData.js";

// --- FIREBASE IMPORTS (uncomment these when switching back to Firebase) ---
// import { db } from "../firebase.js";
// import { collection, getDocs, orderBy, query } from "firebase/firestore";

import { validateListingData } from "../utils/view-listing.utils.js";
import ListingCard from "./ListingCard.jsx";
import styles from "./ViewListing.module.css";

const NAV_ITEMS = [
    { label: "Browse", icon: "🛍️", active: true },
    { label: "Trade Facility", icon: "🔄" },
    { label: "Messages", icon: "💬" },
    { label: "My Listings", icon: "📦" },
    { label: "Saved Items", icon: "🔖" },
    { label: "Orders", icon: "🧾" },
];

const NAV_BOTTOM = [
    { label: "Settings", icon: "⚙️" },
    { label: "Help", icon: "❓" },
    { label: "Log Out", icon: "🚪" },
];

export default function ViewListings() {
    const [listings, setListings] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [sidebarOpen, setSidebarOpen] = useState(true);

    useEffect(() => {
        async function fetchListings() {
            try {
                // Pull from sessionStorage first (fixes image disappearing on refresh)
                const stored = JSON.parse(sessionStorage.getItem("listings") || "[]");

                // Merge with mockListings, avoiding duplicates by id
                const storedIds = new Set(stored.map((l) => l.id));
                const merged = [
                    ...stored,
                    ...mockListings.filter((l) => !storedIds.has(l.id)),
                ];

                // --- FIREBASE FETCH (uncomment this block when switching back to Firebase) ---
                // const q = query(collection(db, "listings"), orderBy("timestamp", "desc"));
                // const querySnapshot = await getDocs(q);
                // const merged = [];
                // querySnapshot.forEach((doc) => {
                //     merged.push({ id: doc.id, ...doc.data() });
                // });
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

    const filtered = listings.filter((l) =>
        l.title?.toLowerCase().includes(search.toLowerCase()) ||
        l.category?.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div className={styles.layout}>

            {/* Sidebar */}
            <aside className={`${styles.sidebar} ${sidebarOpen ? styles.sidebarOpen : styles.sidebarClosed}`}>
                <div className={styles.sidebarLogo}>
                    <div className={styles.logoBox} />
                    {sidebarOpen && <span className={styles.logoText}>CampusMarket</span>}
                </div>

                <nav className={styles.navList}>
                    {NAV_ITEMS.map((item) => (
                        <div
                            key={item.label}
                            className={`${styles.navItem} ${item.active ? styles.navItemActive : ""}`}
                        >
                            <span className={styles.navIcon}>{item.icon}</span>
                            {sidebarOpen && <span className={styles.navLabel}>{item.label}</span>}
                        </div>
                    ))}
                </nav>

                <div className={styles.navDivider} />

                <nav className={styles.navList}>
                    {NAV_BOTTOM.map((item) => (
                        <div key={item.label} className={styles.navItem}>
                            <span className={styles.navIcon}>{item.icon}</span>
                            {sidebarOpen && <span className={styles.navLabel}>{item.label}</span>}
                        </div>
                    ))}
                </nav>

                <button
                    className={styles.collapseBtn}
                    onClick={() => setSidebarOpen((o) => !o)}
                    title={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
                >
                    {sidebarOpen ? "◀" : "▶"}
                </button>
            </aside>

            {/* Main content */}
            <main className={styles.main}>
                <div className={styles.pageHeader}>
                    <div>
                        <h1 className={styles.heading}>Browse Listings</h1>
                        <p className={styles.subheading}>Discover items from students across the whole campus</p>
                    </div>
                </div>

                {/* Search + Filter bar */}
                <div className={styles.searchBar}>
                    <input
                        className={styles.searchInput}
                        type="text"
                        placeholder="Search textbooks, electronics..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                    <button className={styles.filterBtn}>Filters</button>
                </div>

                {/* Grid */}
                {loading ? (
                    <p className={styles.loadingText}>Loading listings...</p>
                ) : filtered.length === 0 ? (
                    <p className={styles.loadingText}>No listings found.</p>
                ) : (
                    <div className={styles.listingsGrid}>
                        {filtered.map((listing, index) => (
                            <ListingCard key={listing.id ?? index} listing={listing} />
                        ))}
                    </div>
                )}
            </main>
        </div>
    );
}
