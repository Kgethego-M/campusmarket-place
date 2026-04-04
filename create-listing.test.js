import { validateListing, validateImages, conditionMap, categoryMap, listingTypeMap } from "./create-listing.utils.js";

describe("Field Validation", () => {

    test("should fail if title is empty", () => {
        const result = validateListing({ title: "", description: "test", price: 50, category: "electronics", condition: "new", listingType: "sale" });
        expect(result.valid).toBe(false);
        expect(result.error).toBe("Please fill in all fields correctly.");
    });

    test("should fail if description is empty", () => {
        const result = validateListing({ title: "Headphones", description: "", price: 50, category: "electronics", condition: "new", listingType: "sale" });
        expect(result.valid).toBe(false);
    });

    test("should fail if price is not a number", () => {
        const result = validateListing({ title: "Headphones", description: "test", price: NaN, category: "electronics", condition: "new", listingType: "sale" });
        expect(result.valid).toBe(false);
    });

    test("should fail if price is negative", () => {
        const result = validateListing({ title: "Headphones", description: "test", price: -10, category: "electronics", condition: "new", listingType: "sale" });
        expect(result.valid).toBe(false);
    });

    test("should fail if category is empty", () => {
        const result = validateListing({ title: "Headphones", description: "test", price: 50, category: "", condition: "new", listingType: "sale" });
        expect(result.valid).toBe(false);
    });

    test("should fail if condition is empty", () => {
        const result = validateListing({ title: "Headphones", description: "test", price: 50, category: "electronics", condition: "", listingType: "sale" });
        expect(result.valid).toBe(false);
    });

    test("should fail if listingType is empty", () => {
        const result = validateListing({ title: "Headphones", description: "test", price: 50, category: "electronics", condition: "new", listingType: "" });
        expect(result.valid).toBe(false);
    });

    test("should pass if all fields are valid", () => {
        const result = validateListing({ title: "Headphones", description: "test", price: 50, category: "electronics", condition: "new", listingType: "sale" });
        expect(result.valid).toBe(true);
    });

});

// ─── IMAGE VALIDATION TESTS ──────────────────────────────────────

describe("Image Validation", () => {

    test("should fail if no images uploaded", () => {
        const result = validateImages([]);
        expect(result.valid).toBe(false);
        expect(result.error).toBe("You must upload at least one image.");
    });

    test("should fail if more than 5 images uploaded", () => {
        const fakeFiles = new Array(6).fill({ type: "image/jpeg", name: "test.jpg" });
        const result = validateImages(fakeFiles);
        expect(result.valid).toBe(false);
        expect(result.error).toBe("You can upload a maximum of 5 images.");
    });

    test("should fail if file is not an image", () => {
        const fakeFiles = [{ type: "application/pdf", name: "document.pdf" }];
        const result = validateImages(fakeFiles);
        expect(result.valid).toBe(false);
        expect(result.error).toContain("is not a valid image");
    });

    test("should pass with 1 valid image", () => {
        const fakeFiles = [{ type: "image/jpeg", name: "photo.jpg" }];
        const result = validateImages(fakeFiles);
        expect(result.valid).toBe(true);
    });

    test("should pass with 5 valid images", () => {
        const fakeFiles = new Array(5).fill({ type: "image/png", name: "photo.png" });
        const result = validateImages(fakeFiles);
        expect(result.valid).toBe(true);
    });

    test("should accept jpeg, png, webp and gif", () => {
        const types = ["image/jpeg", "image/png", "image/webp", "image/gif"];
        types.forEach(type => {
            const result = validateImages([{ type, name: "photo" }]);
            expect(result.valid).toBe(true);
        });
    });

});

// ─── CATEGORY MAPPING TESTS ──────────────────────────────────────

describe("Category Mapping", () => {

    test("should map electronics correctly", () => {
        expect(categoryMap["electronics"]).toBe("Electronics");
    });

    test("should map books correctly", () => {
        expect(categoryMap["books"]).toBe("Textbooks");
    });

    test("should return custom value for other category", () => {
        const result = categoryMap["musical instruments"] || "musical instruments";
        expect(result).toBe("musical instruments");
    });

});

// ─── CONDITION MAPPING TESTS ─────────────────────────────────────

describe("Condition Mapping", () => {

    test("should map like_new correctly", () => {
        expect(conditionMap["like_new"]).toBe("Like New");
    });

    test("should map all conditions correctly", () => {
        expect(conditionMap["new"]).toBe("New");
        expect(conditionMap["good"]).toBe("Good");
        expect(conditionMap["fair"]).toBe("Fair");
        expect(conditionMap["poor"]).toBe("Poor");
    });

});

// ─── LISTING TYPE MAPPING TESTS ──────────────────────────────────

describe("Listing Type Mapping", () => {

    test("should map sale correctly", () => {
        expect(listingTypeMap["sale"]).toBe("For Sale");
    });

    test("should map trade correctly", () => {
        expect(listingTypeMap["trade"]).toBe("For Trade");
    });

    test("should map either correctly", () => {
        expect(listingTypeMap["either"]).toBe("Either");
    });

});

// ─── ACCEPTANCE TESTS ────────────────────────────────────────────

describe("Acceptance Tests", () => {

    test("valid listing passes all validation", () => {
        const listing = { title: "Calculus Textbook", description: "Good condition", price: 50, category: "books", condition: "good", listingType: "sale" };
        const images = [{ type: "image/jpeg", name: "photo.jpg" }];
        expect(validateListing(listing).valid).toBe(true);
        expect(validateImages(images).valid).toBe(true);
    });

    test("photo upload validation passes for valid image", () => {
        const images = [{ type: "image/jpeg", name: "photo.jpg" }];
        expect(validateImages(images).valid).toBe(true);
    });

    test("empty required field fails validation", () => {
        const listing = { title: "", description: "Good condition", price: 50, category: "books", condition: "good", listingType: "sale" };
        expect(validateListing(listing).valid).toBe(false);
    });

});

