import { db } from "./firebase.js";
import { collection, getDocs, orderBy, query } from "firebase/firestore";
import { formatPrice, getFirstImage, validateListingData } from "./view-listing-utils.js";

async function getListings() {
    const q = query(collection(db, "listings"), orderBy("timestamp", "desc"));
    const querySnapshot = await getDocs(q);

    querySnapshot.forEach((doc) => {
        const listing = doc.data();
        createCard(listing);
    });
}

getListings();

function createCard(listing) {
    if (!validateListingData(listing).valid) return;

    const title = listing.title;
    const description = listing.description;
    const price = listing.price;
    const category = listing.category;
    const condition = listing.condition;
    const listingType = listing.listingType;
    const firstImage = getFirstImage(listing.photos);

    const listingCard = document.createElement("div");
    listingCard.style.width = '300px';
    listingCard.style.minHeight = '400px';
    listingCard.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 1)';
    listingCard.style.borderRadius = '8px';
    listingCard.style.padding = '0px';
    listingCard.style.backgroundColor = '#DBE3E9';
    listingCard.style.position = 'relative';
    listingCard.style.transformStyle = 'preserve-3d';
    listingCard.style.transition = 'transform 0.6s';
    listingCard.style.cursor = 'pointer';
    listingCard.style.textAlign = 'center';

    listingCard.addEventListener('mouseover', () => {
        listingCard.style.boxShadow = '0 8px 16px rgba(106, 166, 218, 1)';
    });

    listingCard.addEventListener('mouseout', () => {
        listingCard.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 1)';
    });

    listingCard.addEventListener('click', () => {
        listingCard.classList.toggle('flipped');
    });

    const titleElement = document.createElement("h2");
    titleElement.textContent = title;
    titleElement.style.fontWeight = 400;

    const card_body = document.createElement("section");
    card_body.style.backgroundColor = '#FBFBFB';
    card_body.style.padding = '15px';
    card_body.style.borderRadius = '8px';
    card_body.style.textAlign = 'left';
    card_body.style.boxShadow = '0 4px 8px rgba(106, 166, 218, 1)';
    card_body.style.backfaceVisibility = 'hidden';

    const cardFront = document.createElement("section");
    cardFront.style.backfaceVisibility = 'hidden';
    cardFront.style.position = 'relative';
    cardFront.style.backgroundColor = '#DBE3E9';
    cardFront.style.borderRadius = '8px';
    cardFront.style.padding = '15px';
    cardFront.style.boxSizing = 'border-box';
    cardFront.style.textAlign = 'center';

    cardFront.appendChild(titleElement);
    cardFront.appendChild(card_body);
    listingCard.appendChild(cardFront);

    const cardBack = document.createElement("section");
    cardBack.style.backfaceVisibility = 'hidden';
    cardBack.style.transform = 'rotateY(180deg)';
    cardBack.style.position = 'absolute';
    cardBack.style.top = '0';
    cardBack.style.left = '0';
    cardBack.style.right = '0';
    cardBack.style.bottom = '0';
    cardBack.style.width = '100%';
    cardBack.style.height = '100%';
    cardBack.style.backgroundColor = '#DBE3E9';
    cardBack.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 1)';
    cardBack.style.alignContent = 'center';
    cardBack.style.textAlign = 'center';
    cardBack.style.margin = '0 auto';
    cardBack.style.padding = '15px';
    cardBack.style.borderRadius = '8px';
    cardBack.style.boxSizing = 'border-box';
    cardBack.style.display = 'flex';
    cardBack.style.justifyContent = 'center';
    cardBack.style.alignItems = 'center';

    cardBack.addEventListener('mouseover', () => {
        cardBack.style.boxShadow = '0 8px 16px rgba(106, 166, 218, 1)';
    });

    cardBack.addEventListener('mouseout', () => {
        cardBack.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 1)';
    });

    const descriptionElement = document.createElement("p");
    descriptionElement.textContent = description;
    cardBack.appendChild(descriptionElement);
    listingCard.appendChild(cardBack);

    const imgContainer = document.createElement("section");
    imgContainer.style.display = "flex";
    imgContainer.style.justifyContent = "center";

    const img = document.createElement("img");
    img.src = firstImage;
    img.style.width = "90%";
    img.style.objectFit = "cover";
    img.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 1)';
    imgContainer.appendChild(img);
    card_body.appendChild(imgContainer);

    const categoryElement = document.createElement("p");
    categoryElement.textContent = `Category: ${category}`;
    card_body.appendChild(categoryElement);

    const conditionElement = document.createElement("p");
    conditionElement.textContent = `Condition: ${condition}`;
    card_body.appendChild(conditionElement);

    const listingTypeElement = document.createElement("p");
    listingTypeElement.textContent = `Listing Type: ${listingType}`;
    card_body.appendChild(listingTypeElement);

    const formattedPrice = formatPrice(price, listingType);
    if (formattedPrice) {
        const priceElement = document.createElement("p");
        priceElement.textContent = `Price: ${formattedPrice}`;
        card_body.appendChild(priceElement);
    }

    const buttonSection = document.createElement("section");
    buttonSection.style.display = "flex";
    buttonSection.style.justifyContent = "center";
    buttonSection.style.alignItems = "center";
    buttonSection.style.marginTop = "15px";

    const viewMoreButton = document.createElement("button");
    viewMoreButton.textContent = "View More";
    viewMoreButton.style.display = 'block';
    viewMoreButton.style.margin = '0 auto';
    viewMoreButton.addEventListener('click', () => {
    });
    buttonSection.appendChild(viewMoreButton);
    card_body.appendChild(buttonSection);

    document.getElementById("listings-section").appendChild(listingCard);
}
