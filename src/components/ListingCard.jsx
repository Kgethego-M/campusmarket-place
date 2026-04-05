import { useState } from "react";
import { formatPrice, getFirstImage } from "../utils/view-listing.utils.js";
import styles from "./ListingCard.module.css";

export default function ListingCard({ listing }) {
    const [flipped, setFlipped] = useState(false);

    const { title, description, category, condition, listingType, price, photos } = listing;
    const firstImage = getFirstImage(photos);
    const formattedPrice = formatPrice(price, listingType);

    return (
        <div className={styles.cardWrapper} onClick={() => setFlipped((f) => !f)}>
            <div className={`${styles.card} ${flipped ? styles.flipped : ""}`}>

                {/* Front */}
                <div className={styles.cardFront}>
                    <h2 className={styles.cardTitle}>{title}</h2>
                    <div className={styles.cardBody}>
                        {firstImage && (
                            <div className={styles.imgContainer}>
                                <img src={firstImage} alt={title} className={styles.img} />
                            </div>
                        )}
                        <p><strong>Category:</strong> {category}</p>
                        <p><strong>Condition:</strong> {condition}</p>
                        <p><strong>Listing Type:</strong> {listingType}</p>
                        {formattedPrice && <p><strong>Price:</strong> {formattedPrice}</p>}
                        <div className={styles.buttonSection}>
                            <button
                                className={styles.viewMoreBtn}
                                onClick={(e) => e.stopPropagation()}
                            >
                                View More
                            </button>
                        </div>
                    </div>
                </div>

                {/* Back */}
                <div className={styles.cardBack}>
                    <p className={styles.descriptionText}>{description}</p>
                </div>

            </div>
        </div>
    );
}
