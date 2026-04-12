// src/pages/ViewListing.jsx
import React, { useEffect, useState } from "react";
import { mockListings } from "../mockData.js";
import ListingCard from "../components/ListingCard.jsx";

export default function ViewListing() {
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterType, setFilterType] = useState("all"); // NEW state for type filter

  useEffect(() => {
    setListings(mockListings);
    setLoading(false);
  }, []);

  const filteredListings = listings.filter((listing) => {
    const q = searchTerm.trim().toLowerCase();
    const matchesSearch =
      !q ||
      (listing.title || "").toLowerCase().includes(q) ||
      (listing.description || "").toLowerCase().includes(q);

    const matchesCategory =
      filterCategory === "all" || listing.category === filterCategory;

    const matchesType =
      filterType === "all" || listing.type === filterType;

    return matchesSearch && matchesCategory && matchesType;
  });

  return (
    <div style={{ padding: 20 }}>
      <h1>Campus Marketplace</h1>

      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <input
          placeholder="Search listings..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{ flex: 1, padding: 8 }}
        />

        {/* Category filter */}
        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          style={{ padding: 8 }}
        >
          <option value="all">All Categories</option>
          <option value="books">Books</option>
          <option value="electronics">Electronics</option>
          <option value="clothing">Clothing</option>
        </select>

        {/* Listing type filter */}
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          style={{ padding: 8 }}
        >
          <option value="all">All Types</option>
          <option value="ForSale">For Sale</option>
          <option value="ForTrade">For Trade</option>
        </select>
      </div>

      {loading ? (
        <p>Loading listings...</p>
      ) : filteredListings.length === 0 ? (
        <p>No listings found.</p>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap" }}>
          {filteredListings.map((l, i) => (
            <ListingCard key={l.id ?? i} listing={l} />
          ))}
        </div>
      )}
    </div>
  );
}