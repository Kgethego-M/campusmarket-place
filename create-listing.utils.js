export const conditionMap = {
    'new': 'New',
    'like_new': 'Like New',
    'good': 'Good',
    'fair': 'Fair',
    'poor': 'Poor'
};

export const categoryMap = {
    'electronics': 'Electronics',
    'books': 'Textbooks',
    'clothing': 'Clothing',
    'furniture': 'Furniture',
    'appliance': 'Appliances',
    'sports': 'Sports Equipment',
    'study_materials': 'Study Materials'
};

export const listingTypeMap = {
    'sale': 'For Sale',
    'trade': 'For Trade',
    'either': 'Either'
};

export function validateListing({ title, description, price, category, condition, listingType }) {
    if (!title || !description || isNaN(price) || price < 0 || !category || !condition || !listingType) {
        return { valid: false, error: "Please fill in all fields correctly." };
    }
    return { valid: true };
}

export function validateImages(files) {
    if (files.length === 0) return { valid: false, error: "You must upload at least one image." };
    if (files.length > 5) return { valid: false, error: "You can upload a maximum of 5 images." };
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    for (const file of files) {
        if (!allowedTypes.includes(file.type)) {
            return { valid: false, error: `${file.name} is not a valid image.` };
        }
    }
    return { valid: true };
}