import { createPortal } from "react-dom";
import styles from "./ProfileListingCard.module.css";

const conditionColor = {
    New:        "#4CAF50",
    "Like New": "#8BC34A",
    Good:       "#FFC107",
    Fair:       "#FF9800",
    Poor:       "#F44336",
};

const statusConfig = {
    active:   { label: "Active",   color: "#4CAF50", bg: "#e8f5e9" },
    sold:     { label: "Sold",     color: "#f44336", bg: "#ffebee" },
    traded:   { label: "Traded",   color: "#FF9800", bg: "#fff3e0" },
    pending:  { label: "Pending",  color: "#FFC107", bg: "#fff8e1" },
    inactive: { label: "Inactive", color: "#9e9e9e", bg: "#f5f5f5" },
};

const listingTypeOptions = ["For Sale", "For Trade"];

export default function ProfileListingCard({
    listing,
    onEdit,
    onDelete,
    isEditing = false,
    editData = {},
    onEditChange,
    onSave,
    onCancel,
}) {
    const { title, price, condition, listingType, status = "active" } = listing;
    const imageUrl = listing.imageUrl || (listing.photos && listing.photos[0]) || null;
    const badgeColor = conditionColor[condition] || "#999";
    const statusInfo = statusConfig[status?.toLowerCase()] || statusConfig.active;

    /* ── Edit drawer (portalled to body so it overlays everything) ── */
    const drawer = isEditing
        ? createPortal(
            <>
                {/* Backdrop */}
                <div className={styles.backdrop} onClick={onCancel} />

                {/* Drawer panel */}
                <div className={styles.drawer}>
                    <div className={styles.drawerHeader}>
                        <h3 className={styles.drawerTitle}>Edit listing</h3>
                        <button className={styles.drawerClose} onClick={onCancel} aria-label="Close">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                                 stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                                <path d="M18 6L6 18M6 6l12 12"/>
                            </svg>
                        </button>
                    </div>

                    {/* Preview thumbnail */}
                    <div className={styles.drawerPreview}>
                        {imageUrl
                            ? <img src={imageUrl} alt={title} className={styles.drawerThumb} />
                            : (
                                <div className={styles.drawerThumbPlaceholder}>
                                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none"
                                         stroke="#ccc" strokeWidth="1.5">
                                        <rect x="3" y="3" width="18" height="18" rx="2"/>
                                        <circle cx="8.5" cy="8.5" r="1.5"/>
                                        <path d="M21 15l-5-5L5 21"/>
                                    </svg>
                                </div>
                            )
                        }
                        <div className={styles.drawerPreviewInfo}>
                            <span className={styles.drawerPreviewTitle}>{title}</span>
                            <span className={styles.drawerPreviewPrice}>R {Number(price).toLocaleString()}</span>
                        </div>
                    </div>

                    <div className={styles.drawerDivider} />

                    {/* Form fields */}
                    <div className={styles.drawerForm}>
                        {/* Title */}
                        <div className={styles.fieldGroup}>
                            <label className={styles.fieldLabel}>Title</label>
                            <input
                                type="text"
                                value={editData.title || ""}
                                onChange={(e) => onEditChange("title", e.target.value)}
                                placeholder="Listing title"
                                className={styles.fieldInput}
                            />
                        </div>

                        {/* Price and Condition row */}
                        <div className={styles.fieldRow}>
                            <div className={styles.fieldGroup}>
                                <label className={styles.fieldLabel}>Price (R)</label>
                                <input
                                    type="number"
                                    value={editData.price || ""}
                                    onChange={(e) => onEditChange("price", e.target.value)}
                                    placeholder="0.00"
                                    min="0"
                                    step="0.01"
                                    className={styles.fieldInput}
                                />
                            </div>

                            <div className={styles.fieldGroup}>
                                <label className={styles.fieldLabel}>Condition</label>
                                <select
                                    value={editData.condition || ""}
                                    onChange={(e) => onEditChange("condition", e.target.value)}
                                    className={styles.fieldInput}
                                >
                                    <option value="">Select</option>
                                    <option value="New">New</option>
                                    <option value="Like New">Like New</option>
                                    <option value="Good">Good</option>
                                    <option value="Fair">Fair</option>
                                    <option value="Poor">Poor</option>
                                </select>
                            </div>
                        </div>

                        {/* Listing Type */}
                        <div className={styles.fieldGroup}>
                            <label className={styles.fieldLabel}>Listing Type</label>
                            <div className={styles.typeToggle}>
                                {listingTypeOptions.map((type) => (
                                    <button
                                        key={type}
                                        type="button"
                                        className={`${styles.typeOption} ${(editData.listingType || listingType) === type ? styles.typeOptionActive : ""}`}
                                        onClick={() => onEditChange("listingType", type)}
                                    >
                                        {type}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Specifications */}
                        <div className={styles.fieldGroup}>
                            <label className={styles.fieldLabel}>Specifications</label>
                            <textarea
                                value={editData.specification || ""}
                                onChange={(e) => onEditChange("specification", e.target.value)}
                                placeholder="e.g., Brand: Sony, Model: WH-1000XM4, Color: Black, Includes: Charging cable, case..."
                                rows={4}
                                className={styles.fieldTextarea}
                            />
                            <span className={styles.fieldHint}>
                                Add details like brand, model, size, color, included items, etc.
                            </span>
                        </div>

                        {/* Description */}
                        <div className={styles.fieldGroup}>
                            <label className={styles.fieldLabel}>Description</label>
                            <textarea
                                value={editData.description || ""}
                                onChange={(e) => onEditChange("description", e.target.value)}
                                placeholder="Describe your item..."
                                rows={4}
                                className={styles.fieldTextarea}
                            />
                        </div>
                    </div>

                    {/* Footer actions */}
                    <div className={styles.drawerFooter}>
                        <button className={styles.cancelBtn} onClick={onCancel}>
                            Cancel
                        </button>
                        <button className={styles.saveBtn} onClick={onSave}>
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
                                 stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                                <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/>
                                <polyline points="17 21 17 13 7 13 7 21"/>
                                <polyline points="7 3 7 8 15 8"/>
                            </svg>
                            Save changes
                        </button>
                    </div>
                </div>
            </>,
            document.body
        )
        : null;

    /* ── View card ── */
    return (
        <>
            {drawer}

            <div className={styles.card}>
                {/* Image */}
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
                    <div className={styles.statusWrapper}>
                        <span
                            className={styles.statusBadge}
                            style={{ backgroundColor: statusInfo.bg, color: statusInfo.color }}
                        >
                            {statusInfo.label}
                        </span>
                    </div>
                    {listingType && (
                        <span className={styles.typeBadge}>{listingType}</span>
                    )}
                </div>

                {/* Body */}
                <div className={styles.body}>
                    <p className={styles.title}>{title}</p>
                    <p className={styles.price}>
                        R {price != null ? Number(price).toLocaleString() : "Free"}
                    </p>
                </div>

                {/* Actions */}
                <div className={styles.actionRow}>
                    <button className={styles.editButton} onClick={onEdit}>
                        <i className="fas fa-edit"></i> Edit
                    </button>
                    <button className={styles.deleteButton} onClick={onDelete}>
                        <i className="fas fa-trash"></i> Delete
                    </button>
                </div>
            </div>
        </>
    );
}