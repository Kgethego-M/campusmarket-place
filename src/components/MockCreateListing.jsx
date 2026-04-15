import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";

import { auth } from "../firebase.js";
import { onAuthStateChanged } from "firebase/auth";

import {
    validateListing,
    validateImages,
    conditionMap,
    categoryMap,
    listingTypeMap,
} from "../utils/create-listing.utils.js";
import { createListing } from "../api/listings.js";

import NavBar from "./NavBarTemp.jsx";
import styles from "./CreateListing.module.css";

export default function CreateListing() {
    const navigate = useNavigate();
    const fileInputRef = useRef(null);

    const [user, setUser] = useState(null);
    const [authLoading, setAuthLoading] = useState(true);

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

    // ✅ FIX: Proper auth listener (prevents false "not logged in")
    useEffect(() => {
        const unsub = onAuthStateChanged(auth, (u) => {
            setUser(u);
            setAuthLoading(false);
        });

        return () => unsub();
    }, []);

    function handleImageChange(e) {
        const files = Array.from(e.target.files);
        setImageFiles(files);
        setImagePreviews(files.map((file) => URL.createObjectURL(file)));
    }

    async function handleSubmit(e) {
        e.preventDefault();

        // ✅ FIX: wait for auth state
        if (authLoading) return;

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
        const formData = new FormData();
        formData.append('user_id', user.uid);
        formData.append('title', title);
        formData.append('description', description);
        formData.append('specifications', specification);
        formData.append('price', parsedPrice);
        formData.append('category', finalCategory);
        formData.append('condition', conditionMap[condition]);
        formData.append('listing_type', listingTypeMap[listingType]);
        if (imageFiles[0]) {
            formData.append('image', imageFiles[0]);
        }

        await createListing(formData);

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
        <>
            <NavBar />

            <div className={styles.page}>
                <div className={styles.headingWrapper}>
                    <h1 className={styles.heading}>Create Listing</h1>
                    <p className={styles.subheading}>
                        List an item for sale or trade
                    </p>
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
                        onClick={() => fileInputRef.current?.click()}
                    >
                        {imagePreviews.length > 0 ? (
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
                        ) : (
                            <div
                                className={styles.dropZonePlaceholder}
                            >
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
                        required
                    />

                    {/* Description */}
                    <label className={styles.label}>
                        Description
                    </label>
                    <textarea
                        className={styles.textarea}
                        rows={4}
                        value={description}
                        onChange={(e) =>
                            setDescription(e.target.value)
                        }
                        required
                    />

                    {/* Specification */}
                    <label className={styles.label}>
                        Specification
                    </label>
                    <textarea
                        className={styles.textarea}
                        rows={4}
                        value={specification}
                        onChange={(e) =>
                            setSpecification(e.target.value)
                        }
                    />

                    {/* Price + Listing Type */}
                    <div className={styles.row}>
                        <div>
                            <label className={styles.label}>
                                Price
                            </label>
                            <input
                                className={styles.input}
                                type="number"
                                value={price}
                                onChange={(e) =>
                                    setPrice(e.target.value)
                                }
                                min="0"
                                step="0.01"
                                required={
                                    listingType !== "trade"
                                }
                            />
                        </div>

                        <div>
                            <label className={styles.label}>
                                Listing Type
                            </label>
                            <select
                                className={styles.select}
                                value={listingType}
                                onChange={(e) =>
                                    setListingType(e.target.value)
                                }
                                required
                            >
                                <option value="" disabled>
                                    Select
                                </option>
                                <option value="sale">
                                    For Sale
                                </option>
                                <option value="trade">
                                    For Trade
                                </option>
                                <option value="either">
                                    Either
                                </option>
                            </select>
                        </div>
                    </div>

                    {/* Category + Condition */}
                    <div className={styles.row}>
                        <div>
                            <label className={styles.label}>
                                Category
                            </label>

                            <select
                                className={styles.select}
                                value={category}
                                onChange={(e) =>
                                    setCategory(e.target.value)
                                }
                                required
                            >
                                <option value="" disabled>
                                    Select
                                </option>
                                <option value="electronics">
                                    Electronics
                                </option>
                                <option value="books">
                                    Books
                                </option>
                                <option value="clothing">
                                    Clothing
                                </option>
                                <option value="other">
                                    Other
                                </option>
                            </select>

                            {category === "other" && (
                                <input
                                    className={styles.input}
                                    value={otherCategory}
                                    onChange={(e) =>
                                        setOtherCategory(
                                            e.target.value
                                        )
                                    }
                                    placeholder="Specify category"
                                />
                            )}
                        </div>

                        <div>
                            <label className={styles.label}>
                                Condition
                            </label>

                            <select
                                className={styles.select}
                                value={condition}
                                onChange={(e) =>
                                    setCondition(e.target.value)
                                }
                                required
                            >
                                <option value="" disabled>
                                    Select
                                </option>
                                <option value="new">New</option>
                                <option value="good">
                                    Good
                                </option>
                                <option value="fair">
                                    Fair
                                </option>
                            </select>
                        </div>
                    </div>

                    <button
                        type="submit"
                        className={styles.submitBtn}
                        disabled={loading || authLoading}
                    >
                        {loading
                            ? "Creating..."
                            : "Publish Listing"}
                    </button>
                </form>
            </div>
        </>
    );
}