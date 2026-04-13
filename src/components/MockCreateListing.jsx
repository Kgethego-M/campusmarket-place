import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";

import { auth } from "../firebase.mock.js";

import {
    validateListing,
    validateImages,
    conditionMap,
    categoryMap,
    listingTypeMap,
} from "../utils/create-listing.utils.js";
import styles from "./CreateListing.module.css";

export default function CreateListing() {
    const navigate = useNavigate();
    const fileInputRef = useRef(null);

    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [specification, setSpecification] = useState("");
    const [price, setPrice] = useState("");
    const [category, setCategory] = useState("");
    const [otherCategory, setOtherCategory] = useState("");
    const [condition, setCondition] = useState("");
    const [listingType, setListingType] = useState("");
    const [imageFiles, setImageFiles] = useState([]);
    const [imagePreviews, setImagePreviews] = useState([]);
    const [loading, setLoading] = useState(false);

    function handleImageChange(e) {
        const files = Array.from(e.target.files);
        setImageFiles(files);
        setImagePreviews(files.map((file) => URL.createObjectURL(file)));
    }

    async function handleSubmit(e) {
        e.preventDefault();

        const user = auth.currentUser;
        if (!user) {
            alert("Please log in to create a listing.");
            return;
        }

        const parsedPrice = parseFloat(price);
        const validationResult = validateListing({
            title,
            description,
            price: parsedPrice,
            category,
            condition,
            listingType,
        });
        if (!validationResult.valid) {
            alert(validationResult.error);
            return;
        }

        const imageResult = validateImages(imageFiles);
        if (!imageResult.valid) {
            alert(imageResult.error);
            return;
        }

        let finalCategory = category;
        if (category === "other") {
            if (!otherCategory) {
                alert("Please specify the category.");
                return;
            }
            finalCategory = otherCategory;
        } else {
            finalCategory = categoryMap[category] || category;
        }

        setLoading(true);

        try {
            const photoPreviews = imageFiles.map((f) => URL.createObjectURL(f));

            const newListing = {
                id: `listing-${Date.now()}`,
                title,
                description,
                specification,
                price: Math.round(parsedPrice * 100) / 100,
                category: finalCategory,
                condition: conditionMap[condition],
                listingType: listingTypeMap[listingType],
                photos: photoPreviews,
                sellerUID: user.uid,
                timestamp: Date.now(),
            };

            // Save to sessionStorage as source of truth
            const existing = JSON.parse(sessionStorage.getItem("listings") || "[]");
            sessionStorage.setItem("listings", JSON.stringify([...existing, newListing]));

            alert("Successfully created listing!");
            navigate("/view-listing");
        } catch (err) {
            console.error(err);
            alert("Failed to create listing. Please try again.");
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className={styles.page}>
            <h1 className={styles.heading}>Create New Listing</h1>
            <form className={styles.form} onSubmit={handleSubmit}>

                <label className={styles.label}>Product Title:</label>
                <input
                    className={styles.input}
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Calculus Textbook"
                    required
                />

                <label className={styles.label}>Product Description:</label>
                <textarea
                    className={styles.textarea}
                    rows={4}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Describe your item..."
                    required
                />

                <label className={styles.label}>Product Specification:</label>
                <textarea
                    className={styles.textarea}
                    rows={4}
                    value={specification}
                    onChange={(e) => setSpecification(e.target.value)}
                    placeholder="Enter product specifications and details..."
                />

                <label className={styles.label}>Price of Product:</label>
                <input
                    className={styles.input}
                    type="number"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    placeholder="25.99"
                    min="0"
                    step="0.01"
                    required={listingType !== "trade"}
                />

                <label className={styles.label} style={{ marginBottom: "10px" }}>
                    Images of Product
                </label>
                <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept="image/*"
                    style={{ display: "none" }}
                    onChange={handleImageChange}
                />
                <label
                    className={styles.chooseImageBtn}
                    onClick={() => fileInputRef.current?.click()}
                >
                    Choose Images
                </label>

                {imagePreviews.length > 0 && (
                    <div className={styles.imagePreview}>
                        {imagePreviews.map((src, i) => (
                            <img
                                key={i}
                                src={src}
                                alt={`preview-${i}`}
                                className={styles.previewImg}
                            />
                        ))}
                    </div>
                )}

                <label className={styles.label}>Category of Product:</label>
                <select
                    className={styles.select}
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    required
                >
                    <option value="" disabled>Select a category</option>
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
                        style={{ marginTop: "5px" }}
                    />
                )}

                <label className={styles.label}>Condition of Product:</label>
                <select
                    className={styles.select}
                    value={condition}
                    onChange={(e) => setCondition(e.target.value)}
                    required
                >
                    <option value="" disabled>Select a condition</option>
                    <option value="new">New</option>
                    <option value="like_new">Like New</option>
                    <option value="good">Good</option>
                    <option value="fair">Fair</option>
                    <option value="poor">Poor</option>
                </select>

                <label className={styles.label}>Listing Type:</label>
                <select
                    className={styles.select}
                    value={listingType}
                    onChange={(e) => setListingType(e.target.value)}
                    required
                >
                    <option value="" disabled>Select a listing type</option>
                    <option value="sale">For Sale</option>
                    <option value="trade">For Trade</option>
                    <option value="either">Either</option>
                </select>

                <button type="submit" className={styles.submitBtn} disabled={loading}>
                    {loading ? "Creating..." : "Create Listing"}
                </button>
            </form>
        </div>
    );
}