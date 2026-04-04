import { db, storage, auth } from "./firebase.js";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";

import { db, storage, auth } from "./firebase.js";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { validateListing, validateImages, conditionMap, categoryMap, listingTypeMap } from "./listing-utils.js";

const listingForm = document.getElementById("listing-form");

listingForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    await createListing();
});

document.getElementById('image').addEventListener('change', () => {
    const preview = document.getElementById('image-preview');
    preview.innerHTML = '';
    const imageFiles = document.getElementById('image').files;
    for (const file of imageFiles) {
        const img = document.createElement('img');
        img.src = URL.createObjectURL(file);
        img.style.width = '100px';
        img.style.height = '100px';
        img.style.objectFit = 'cover';
        img.style.margin = '5px';
        img.style.border = '2px solid #000000';
        img.style.borderRadius = '5px';
        preview.appendChild(img);
    }
});

document.getElementById('category').addEventListener('change', () => {
    const otherField = document.getElementById('other-category');
    otherField.style.display =
        document.getElementById('category').value === 'other' ? 'block' : 'none';
});

async function createListing() {
    const user = auth.currentUser;
    if (!user) {
        alert("Please log in to create a listing.");
        return;
    }

    const title = document.getElementById("title").value;
    const description = document.getElementById("description").value;
    const specification = document.getElementById("specification").value;
    const price = parseFloat(document.getElementById("price").value);
    let category = document.getElementById('category').value;
    const condition = document.getElementById('condition').value;
    const listingType = document.getElementById('listing-type').value;
    const imageFiles = document.getElementById('image').files;

    const validationResult = validateListing({ title, description, price, category, condition, listingType });
    if (!validationResult.valid) {
        alert(validationResult.error);
        return;
    }

    const imageResult = validateImages(Array.from(imageFiles));
    if (!imageResult.valid) {
        alert(imageResult.error);
        return;
    }

    const otherCategoryValue = document.getElementById('other-category').value;
    if (category === "other") {
        if (!otherCategoryValue) {
            alert("Please specify the category.");
            return;
        }
        category = otherCategoryValue;
    }

    const mappedCategory = categoryMap[category] || category;

    const photoURLs = [];
    for (const file of imageFiles) {
        const storageRef = ref(storage, `listings/${Date.now()}_${file.name}`);
        await uploadBytes(storageRef, file);
        const url = await getDownloadURL(storageRef);
        photoURLs.push(url);
    }

    await addDoc(collection(db, "listings"), {
        title,
        description,
        specification,
        price,
        category: mappedCategory,
        condition: conditionMap[condition],
        listingType: listingTypeMap[listingType],
        photos: photoURLs,
        sellerUID: user.uid,
        timestamp: serverTimestamp()
    });

    alert("Successfully created listing!");
    window.location.href = "view-listing.html";
    listingForm.reset();
}
