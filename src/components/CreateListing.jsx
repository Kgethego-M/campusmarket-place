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

const CLOUDINARY_CLOUD_NAME   = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
const CLOUDINARY_UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET;

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

export default function CreateListing() {
    const navigate    = useNavigate();
    const fileInputRef = useRef(null);

    const [title, setTitle]               = useState("");
    const [description, setDescription]   = useState("");
    const [specification, setSpecification] = useState("");
    const [price, setPrice]               = useState("");
    const [category, setCategory]         = useState("");
    const [otherCategory, setOtherCategory] = useState("");
    const [condition, setCondition]       = useState("");
    const [listingType, setListingType]   = useState("");
    const [imageFiles, setImageFiles]     = useState([]);
    const [imagePreviews, setImagePreviews] = useState([]);
    const [loading, setLoading]           = useState(false);
    const [uploadStep, setUploadStep]     = useState(0);   // 0 = idle, N = uploading photo N
    const [totalPhotos, setTotalPhotos]   = useState(0);

    function handleImageChange(e) {
        const files = Array.from(e.target.files);
        setImageFiles(files);
        setImagePreviews(files.map((f) => URL.createObjectURL(f)));
    }

    // Derive button label from state
    function buttonLabel() {
        if (!loading) return "Publish Listing";
        if (uploadStep > 0 && totalPhotos > 0) {
            return `Uploading photo ${uploadStep} of ${totalPhotos}…`;
        }
        return "Saving listing…";
    }

    async function handleSubmit(e) {
        e.preventDefault();
        if (loading) return; // prevent double-submit

        const user = auth.currentUser;
        if (!user) { alert("Please log in to create a listing."); return; }

        const parsedPrice = parseFloat(price);
        const validationResult = validateListing({ title, description, price: parsedPrice, category, condition, listingType });
        if (!validationResult.valid) { alert(validationResult.error); return; }

        const imageResult = validateImages(imageFiles);
        if (!imageResult.valid) { alert(imageResult.error); return; }

        let finalCategory = category;
        if (category === "other") {
            if (!otherCategory.trim()) { alert("Please specify the category."); return; }
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

            setUploadStep(0); // switches label to "Saving listing…"

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
            alert("Successfully created listing!");
            navigate("/view-listing");
        } catch (err) {
            console.error("Failed to create listing:", err);
            alert("Failed to create listing. Please try again.");
            setLoading(false);
            setUploadStep(0);
            setTotalPhotos(0);
        }
    }

    return (
        <>
        <NavBar />
        <div className={styles.page}>
            <div className={styles.headingWrapper}>
                <h1 className={styles.heading}>Create Listing</h1>
                <p className={styles.subheading}>List an item for sale or trade</p>
            </div>

            <form className={styles.form} onSubmit={handleSubmit}>

                {/* Photos */}
                <label className={styles.label}>Photos</label>
                <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept="image/*"
                    style={{ display: "none" }}
                    onChange={handleImageChange}
                />
                <div
                    className={styles.dropZone}
                    onClick={() => !loading && fileInputRef.current?.click()}
                >
                    {imagePreviews.length > 0 ? (
                        <div className={styles.imagePreview}>
                            {imagePreviews.map((src, i) => (
                                <img key={i} src={src} alt={`preview-${i}`} className={styles.previewImg} />
                            ))}
                        </div>
                    ) : (
                        <div className={styles.dropZonePlaceholder}>
                            <svg className={styles.dropZoneIcon} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                                <rect x="3" y="3" width="18" height="18" rx="2" />
                                <circle cx="8.5" cy="8.5" r="1.5" />
                                <path d="M21 15l-5-5L5 21" />
                            </svg>
                            <p>Click or drag photos here</p>
                        </div>
                    )}
                </div>

                {/* Title */}
                <label className={styles.label}>Title</label>
                <input
                    className={styles.input}
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="E.g Calculus textbook"
                    required
                    disabled={loading}
                />

                {/* Description */}
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

                {/* Specification */}
                <label className={styles.label}>Specification</label>
                <textarea
                    className={styles.textarea}
                    rows={4}
                    value={specification}
                    onChange={(e) => setSpecification(e.target.value)}
                    placeholder="Enter product specifications and details..."
                    disabled={loading}
                />

                {/* Price + Listing Type */}
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

                {/* Category + Condition */}
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

                <button
                    type="submit"
                    className={styles.submitBtn}
                    disabled={loading}
                    style={{
                        opacity:          loading ? 0.65 : 1,
                        cursor:           loading ? 'not-allowed' : 'pointer',
                        backgroundColor:  loading ? '#a0c4e8' : undefined,
                        display:          'flex',
                        alignItems:       'center',
                        justifyContent:   'center',
                        gap:              '8px',
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
                            style={{ animation: 'spin 0.8s linear infinite', flexShrink: 0 }}
                        >
                            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                        </svg>
                    )}
                    {buttonLabel()}
                </button>

                {/* Inline spin keyframe */}
                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </form>
        </div>
        </>
    );
}