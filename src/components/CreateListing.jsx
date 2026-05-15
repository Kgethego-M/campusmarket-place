import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { auth, db } from "../firebase.js";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import {
    validateListing,
    validateImages,
    conditionMap,
    categoryMap,
    listingTypeMap,
} from "../utils/create-listing.utils.js";
import NavBar from "./NavBarTemp.jsx";
import styles from "./CreateListing.module.css";
import PriceSuggestion from "./PriceSuggestion.jsx"; // US18

const CLOUDINARY_CLOUD_NAME    = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
const CLOUDINARY_UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET;
const MAX_PHOTOS = 5;

async function uploadToCloudinary(file) {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);
    const res = await fetch(
        `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`,
        { method: "POST", body: formData }
    );
    if (!res.ok) throw new Error(`Cloudinary upload failed: ${res.statusText}`);
    const data = await res.json();
    return data.secure_url;
}

// ── Toast ─────────────────────────────────────────────────────────────────────
function Toast({ toast }) {
    if (!toast) return null;
    return (
        <div className={`${styles.toast} ${toast.type === 'error' ? styles.toastError : toast.type === 'warn' ? styles.toastWarn : styles.toastSuccess}`}>
            <i className={`fas ${toast.type === 'error' ? 'fa-circle-exclamation' : toast.type === 'warn' ? 'fa-triangle-exclamation' : 'fa-circle-check'}`} />
            {toast.msg}
        </div>
    );
}

export default function CreateListing() {
    const navigate     = useNavigate();
    const fileInputRef = useRef(null);
    const addMoreRef   = useRef(null);

    const [title, setTitle]                   = useState("");
    const [description, setDescription]       = useState("");
    const [specification, setSpecification]   = useState("");
    const [price, setPrice]                   = useState("");
    const [category, setCategory]             = useState("");
    const [otherCategory, setOtherCategory]   = useState("");
    const [condition, setCondition]           = useState("");
    const [listingType, setListingType]       = useState("");
    const [imageFiles, setImageFiles]         = useState([]);      // File[]
    const [imagePreviews, setImagePreviews]   = useState([]);      // blob URL[]
    const [loading, setLoading]               = useState(false);
    const [uploadStep, setUploadStep]         = useState(0);
    const [totalPhotos, setTotalPhotos]       = useState(0);
    const [toast, setToast]                   = useState(null);
    const [removingIdx, setRemovingIdx]       = useState(null);    // animating removal

    const showToast = (msg, type = 'success') => {
        setToast({ msg, type });
        setTimeout(() => setToast(null), 3000);
    };

    // ── Image handlers ────────────────────────────────────────────────────────

    const handleImageChange = (e) => {
        const incoming = Array.from(e.target.files);
        const remaining = MAX_PHOTOS - imageFiles.length;
        if (remaining <= 0) {
            showToast(`Maximum ${MAX_PHOTOS} photos allowed`, 'warn');
            e.target.value = '';
            return;
        }
        const accepted = incoming.slice(0, remaining);
        if (incoming.length > remaining) {
            showToast(`Only ${remaining} more photo${remaining === 1 ? '' : 's'} can be added (max ${MAX_PHOTOS})`, 'warn');
        }
        const newPreviews = accepted.map((f) => URL.createObjectURL(f));
        setImageFiles((prev) => [...prev, ...accepted]);
        setImagePreviews((prev) => [...prev, ...newPreviews]);
        e.target.value = '';
    };

    const handleRemoveImage = (idx) => {
        setRemovingIdx(idx);
        // Revoke old object URL
        URL.revokeObjectURL(imagePreviews[idx]);
        setTimeout(() => {
            setImageFiles((prev) => prev.filter((_, i) => i !== idx));
            setImagePreviews((prev) => prev.filter((_, i) => i !== idx));
            setRemovingIdx(null);
        }, 220);
    };

    // ── Button label ──────────────────────────────────────────────────────────

    function buttonLabel() {
        if (!loading) return "Publish Listing";
        if (uploadStep > 0 && totalPhotos > 0) return `Uploading photo ${uploadStep} of ${totalPhotos}…`;
        return "Saving listing…";
    }

    // ── Submit ────────────────────────────────────────────────────────────────

    async function handleSubmit(e) {
        e.preventDefault();
        if (loading) return;

        const user = auth.currentUser;
        if (!user) { showToast("Please log in to create a listing.", 'warn'); return; }

        const parsedPrice = parseFloat(price);
        const validationResult = validateListing({ title, description, price: parsedPrice, category, condition, listingType });
        if (!validationResult.valid) { showToast(validationResult.error, 'warn'); return; }

        const imageResult = validateImages(imageFiles);
        if (!imageResult.valid) { showToast(imageResult.error, 'warn'); return; }

        let finalCategory = category;
        if (category === "other") {
            if (!otherCategory.trim()) { showToast("Please specify the category.", 'warn'); return; }
            finalCategory = otherCategory.trim();
        } else {
            finalCategory = categoryMap[category] || category;
        }

        setLoading(true);
        setTotalPhotos(imageFiles.length);

        try {
            const photoURLs = [];
            for (let i = 0; i < imageFiles.length; i++) {
                setUploadStep(i + 1);
                const url = await uploadToCloudinary(imageFiles[i]);
                photoURLs.push(url);
            }

            setUploadStep(0);

            const listingData = {
                title,
                description,
                specification,
                price:        Math.round(parsedPrice * 100) / 100,
                category:     finalCategory,
                condition:    conditionMap[condition],
                listingType:  listingTypeMap[listingType],
                photos:       photoURLs,
                sellerUID:    user.uid,
                sellerName:   user.displayName || "Anonymous",
                sellerAvatar: user.photoURL || "",
                status:       "active",
                timestamp:    serverTimestamp(),
            };

            await addDoc(collection(db, "listings"), listingData);
            showToast("Listing published successfully!");
            setTimeout(() => navigate("/view-listing"), 1200);
        } catch (err) {
            console.error("Failed to create listing:", err);
            showToast("Failed to create listing. Please try again.", 'error');
            setLoading(false);
            setUploadStep(0);
            setTotalPhotos(0);
        }
    }

    const canAddMore = imageFiles.length < MAX_PHOTOS && !loading;

    return (
        <>
        <NavBar />
        <Toast toast={toast} />
        <div className={styles.page}>
            <div className={styles.headingWrapper}>
                <h1 className={styles.heading}>Create Listing</h1>
                <p className={styles.subheading}>List an item for sale or trade</p>
            </div>

            <form className={styles.form} onSubmit={handleSubmit}>

                {/* ── Photos ── */}
                <label className={styles.label}>
                    Photos
                    <span className={styles.photoCount}>{imageFiles.length} / {MAX_PHOTOS}</span>
                </label>

                {/* Hidden file inputs */}
                <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept="image/*"
                    style={{ display: "none" }}
                    onChange={handleImageChange}
                />
                <input
                    ref={addMoreRef}
                    type="file"
                    multiple
                    accept="image/*"
                    style={{ display: "none" }}
                    onChange={handleImageChange}
                />

                {/* Drop zone — only shown when no images yet */}
                {imagePreviews.length === 0 && (
                    <div
                        className={styles.dropZone}
                        onClick={() => !loading && fileInputRef.current?.click()}
                    >
                        <div className={styles.dropZonePlaceholder}>
                            <svg className={styles.dropZoneIcon} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                                <rect x="3" y="3" width="18" height="18" rx="2" />
                                <circle cx="8.5" cy="8.5" r="1.5" />
                                <path d="M21 15l-5-5L5 21" />
                            </svg>
                            <p>Click to add photos</p>
                            <p className={styles.dropZoneHint}>Up to {MAX_PHOTOS} photos · JPG, PNG, WEBP</p>
                        </div>
                    </div>
                )}

                {/* Preview grid */}
                {imagePreviews.length > 0 && (
                    <div className={styles.previewGrid}>
                        {imagePreviews.map((src, i) => (
                            <div
                                key={src}
                                className={`${styles.previewItem} ${removingIdx === i ? styles.previewRemoving : styles.previewEntering}`}
                            >
                                <img src={src} alt={`preview-${i}`} className={styles.previewImg} />

                                {/* Remove button */}
                                <button
                                    type="button"
                                    className={styles.removeBtn}
                                    onClick={() => handleRemoveImage(i)}
                                    disabled={loading}
                                    title="Remove photo"
                                >
                                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                                        <line x1="18" y1="6" x2="6" y2="18" />
                                        <line x1="6" y1="6" x2="18" y2="18" />
                                    </svg>
                                </button>

                                {/* First image label */}
                                {i === 0 && (
                                    <span className={styles.mainLabel}>Main</span>
                                )}
                            </div>
                        ))}

                        {/* Add more tile */}
                        {canAddMore && (
                            <button
                                type="button"
                                className={styles.addMoreTile}
                                onClick={() => addMoreRef.current?.click()}
                            >
                                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                                    <line x1="12" y1="5" x2="12" y2="19" />
                                    <line x1="5" y1="12" x2="19" y2="12" />
                                </svg>
                                <span>{MAX_PHOTOS - imageFiles.length} left</span>
                            </button>
                        )}
                    </div>
                )}

                {/* ── Title ── */}
                <label className={styles.label}>Title</label>
                <input
                    className={styles.input}
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="E.g. Calculus textbook"
                    required
                    disabled={loading}
                />

                {/* ── Description ── */}
                <label className={styles.label}>Description</label>
                <textarea
                    className={styles.textarea}
                    rows={4}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Describe the item condition, features and any relevant details"
                    required
                    disabled={loading}
                />

                {/* ── Specification ── */}
                <label className={styles.label}>Specification (Optional)</label>
                <textarea
                    className={styles.textarea}
                    rows={3}
                    value={specification}
                    onChange={(e) => setSpecification(e.target.value)}
                    placeholder="Enter product specifications and details..."
                    disabled={loading}
                />

                {/* ── Price + Listing Type ── */}
                <div className={styles.row}>
                    <div>
                        <label className={styles.label}>Price</label>
                        <input
                            className={styles.input}
                            type="number"
                            value={price}
                            onChange={(e) => setPrice(e.target.value)}
                            placeholder="Enter price"
                            min="0"
                            step="0.01"
                            required={listingType !== "trade"}
                            disabled={loading}
                        />
                    </div>
                    <div>
                        <label className={styles.label}>Listing Type</label>
                        <select
                            className={styles.select}
                            value={listingType}
                            onChange={(e) => setListingType(e.target.value)}
                            required
                            disabled={loading}
                        >
                            <option value="" disabled>Select</option>
                            <option value="sale">For Sale</option>
                            <option value="trade">For Trade</option>
                            <option value="either">For Sale or Trade</option>
                        </select>
                    </div>
                </div>

                {/* ── Category + Condition ── */}
                <div className={styles.row}>
                    <div>
                        <label className={styles.label}>Category</label>
                        <select
                            className={styles.select}
                            value={category}
                            onChange={(e) => setCategory(e.target.value)}
                            required
                            disabled={loading}
                        >
                            <option value="" disabled>Select</option>
                            <option value="electronics">Electronics</option>
                            <option value="books">Books</option>
                            <option value="clothing">Clothing</option>
                            <option value="furniture">Furniture</option>
                            <option value="appliance">Appliances</option>
                            <option value="sports">Sports Equipment</option>
                            <option value="outdoors">Outdoor Gear</option>
                            <option value="accessories">Accessories and Jewelry</option>
                            <option value="toys">Toys and Games</option>
                            <option value="beauty">Beauty and Personal Care</option>
                            <option value="stationary">Stationary</option>
                            <option value="study_materials">Study Materials</option>
                            <option value="other">Other</option>
                        </select>

                        {category === "other" && (
                            <input
                                className={styles.input}
                                type="text"
                                value={otherCategory}
                                onChange={(e) => setOtherCategory(e.target.value)}
                                placeholder="Specify category"
                                style={{ marginTop: "6px" }}
                                disabled={loading}
                            />
                        )}

{/* ── US18: Price Suggestion widget ── */}
<PriceSuggestion
    category={category === "other" ? "" : category}
    itemCondition={condition}     // ← ADD THIS LINE (it's missing!)
    onSuggestionLoad={({ low, high }) => {
        // Pre-fill price only if seller hasn't typed one yet
        if (!price) {
            setPrice(String(Math.round((low + high) / 2)));
        }
    }}
/>
                    </div>

                    <div>
                        <label className={styles.label}>Condition</label>
                        <select
                            className={styles.select}
                            value={condition}
                            onChange={(e) => setCondition(e.target.value)}
                            required
                            disabled={loading}
                        >
                            <option value="" disabled>Select</option>
                            <option value="new">New</option>
                            <option value="like_new">Like New</option>
                            <option value="good">Good</option>
                            <option value="fair">Fair</option>
                            <option value="poor">Poor</option>
                        </select>
                    </div>
                </div>

                {/* ── Submit ── */}
                <button
                    type="submit"
                    className={styles.submitBtn}
                    disabled={loading}
                    style={{
                        opacity:         loading ? 0.65 : 1,
                        cursor:          loading ? "not-allowed" : "pointer",
                        backgroundColor: loading ? "#a0c4e8" : undefined,
                        display:         "flex",
                        alignItems:      "center",
                        justifyContent:  "center",
                        gap:             "8px",
                    }}
                >
                    {loading && (
                        <svg
                            width="16" height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                            style={{ animation: "spin 0.8s linear infinite", flexShrink: 0 }}
                        >
                            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                        </svg>
                    )}
                    {buttonLabel()}
                </button>

                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </form>
        </div>
        </>
    );
}