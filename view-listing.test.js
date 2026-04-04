// view-listing.test.js
import { formatPrice, getFirstImage, validateListingData } from "./view-listing.utils.js";

describe("formatPrice", () => {

    test("should return formatted price for For Sale", () => {
        expect(formatPrice(350, "For Sale")).toBe("R350.00");
    });

    test("should return formatted price for Either", () => {
        expect(formatPrice(100, "Either")).toBe("R100.00");
    });

    test("should return null for For Trade", () => {
        expect(formatPrice(350, "For Trade")).toBeNull();
    });

    test("should format decimal prices correctly", () => {
        expect(formatPrice(99.9, "For Sale")).toBe("R99.90");
    });

});

describe("getFirstImage", () => {

    test("should return first image from array", () => {
        const photos = ["url1", "url2", "url3"];
        expect(getFirstImage(photos)).toBe("url1");
    });

    test("should return null if photos is empty", () => {
        expect(getFirstImage([])).toBeNull();
    });

    test("should return null if photos is undefined", () => {
        expect(getFirstImage(undefined)).toBeNull();
    });

});

describe("validateListingData", () => {

    const validListing = {
        title: "Headphones",
        description: "Great headphones",
        category: "Electronics",
        condition: "Like New",
        listingType: "For Sale",
        photos: ["url1"]
    };

    test("should pass with valid listing", () => {
        expect(validateListingData(validListing).valid).toBe(true);
    });

    test("should fail if title is missing", () => {
        expect(validateListingData({ ...validListing, title: "" }).valid).toBe(false);
    });

    test("should fail if description is missing", () => {
        expect(validateListingData({ ...validListing, description: "" }).valid).toBe(false);
    });

    test("should fail if category is missing", () => {
        expect(validateListingData({ ...validListing, category: "" }).valid).toBe(false);
    });

    test("should fail if photos is empty", () => {
        expect(validateListingData({ ...validListing, photos: [] }).valid).toBe(false);
    });

    test("should fail if photos is missing", () => {
        expect(validateListingData({ ...validListing, photos: undefined }).valid).toBe(false);
    });

});

describe("Acceptance Tests", () => {

    test("listing with photos displays first image", () => {
        const photos = ["https://firebase.url/photo1.jpg", "https://firebase.url/photo2.jpg"];
        expect(getFirstImage(photos)).toBe("https://firebase.url/photo1.jpg");
    });

    test("For Trade listing has no price", () => {
        expect(formatPrice(350, "For Trade")).toBeNull();
    });

    test("valid listing passes all checks", () => {
        const listing = {
            title: "Calculus Textbook",
            description: "Good condition",
            category: "Textbooks",
            condition: "Good",
            listingType: "For Sale",
            photos: ["url1"]
        };
        expect(validateListingData(listing).valid).toBe(true);
    });

});