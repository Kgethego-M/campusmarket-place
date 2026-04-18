// src/components/ListingCard.jsx
import { useNavigate } from 'react-router-dom';
import styles from "./ListingCard.module.css";

const conditionColor = {
    New:        "#4CAF50",
    "Like New": "#8BC34A",
    Good:       "#FFC107",
    Fair:       "#FF9800",
    Poor:       "#F44336",
};

const formatListingType = (type) => {
    if (!type) return null;
    const t = type.toString().toLowerCase().trim();
    if (t === "either" || t === "for sale or trade") return "For Sale or Trade";  // UPDATED
    if (t === "sale"   || t === "for sale")          return "For Sale";
    if (t === "trade"  || t === "for trade")         return "For Trade";
    return type;
};

export default function ListingCard({ listing, visible = true }) {
    const navigate = useNavigate();
    const {
        title,
        price,
        condition,
        listingType,
        sellerName,
        sellerAvatar,
    } = listing;

    const imageUrl = listing.imageUrl || (listing.photos && listing.photos[0]) || null;
    const badgeColor = conditionColor[condition] || "#999";
    const displayListingType = formatListingType(listingType);

    return (
        <div
            className={`${styles.card} ${visible ? styles.cardVisible : ""}`}
            onClick={() => navigate(`/listing/${listing.id}`)}
            style={{ cursor: 'pointer' }}
        >
            {/* ── Image ── */}
            <div className={styles.imageWrapper}>
                {imageUrl ? (
                    <img
                        src={imageUrl}
                        alt={title}
                        className={styles.image}
                        loading="lazy"
                        onError={(e) => { e.currentTarget.style.display = "none"; }}
                    />
                ) : (
                    <div className={styles.imagePlaceholder}>
                        <svg width="36" height="36" viewBox="0 0 24 24" fill="none"
                             stroke="#ccc" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="3" y="3" width="18" height="18" rx="2"/>
                            <circle cx="8.5" cy="8.5" r="1.5"/>
                            <path d="M21 15l-5-5L5 21"/>
                        </svg>
                    </div>
                )}

                {condition && (
                    <span className={styles.conditionBadge} style={{ backgroundColor: badgeColor }}>
                        {condition}
                    </span>
                )}

                {displayListingType && (
                    <span className={styles.typeBadge}>{displayListingType}</span>
                )}
            </div>

            {/* ── Body ── */}
            <div className={styles.body}>
                <p className={styles.title}>{title}</p>
                <p className={styles.price}>
                    {price != null ? `R ${Number(price).toLocaleString()}` : "Free"}
                </p>

                <div className={styles.sellerRow}>
                    <div className={styles.avatar}>
                        {sellerAvatar
                            ? <img src={sellerAvatar} alt={sellerName}/>
                            : <span>{sellerName?.[0]?.toUpperCase() ?? "?"}</span>
                        }
                    </div>
                    <span className={styles.sellerName}>{sellerName ?? "Student"}</span>
                </div>
            </div>
        </div>
    );
}