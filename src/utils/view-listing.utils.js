export function formatPrice(price, listingType) {
    if (listingType === "For Trade") return null;
    const rounded = Math.round(Number(price) * 100) / 100;
    return `R${rounded.toFixed(2)}`;
}

export function getFirstImage(photos) {
    if (!photos || photos.length === 0) return null;
    return photos[0];
}

export function validateListingData(listing) {
    if (!listing.title) return { valid: false, error: "Missing title" };
    if (!listing.description) return { valid: false, error: "Missing description" };
    if (!listing.category) return { valid: false, error: "Missing category" };
    if (!listing.condition) return { valid: false, error: "Missing condition" };
    if (!listing.listingType) return { valid: false, error: "Missing listing type" };
    if (!listing.photos || listing.photos.length === 0) return { valid: false, error: "Missing photos" };
    return { valid: true };
}
