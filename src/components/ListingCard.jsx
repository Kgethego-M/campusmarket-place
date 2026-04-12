import React from "react";

function capitalize(word) {
  if (!word) return "";
  return word.charAt(0).toUpperCase() + word.slice(1);
}

export default function ListingCard({ listing }) {
  return (
    <div className="listing-card" style={{ border: "1px solid #ccc", padding: 12, margin: 8 }}>
      <p>Category: {capitalize(listing.category)}</p>
      <p>Condition: {listing.condition}</p>
      <p>Listing Type: {listing.type === "ForSale" ? "For Sale" : "For Trade"}</p>
      <p>Price: R{listing.price.toFixed(2)}</p>
    </div>
  );
}