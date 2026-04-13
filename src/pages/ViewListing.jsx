// src/pages/ViewListing.jsx
import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { mockListings } from "../mockData.js";
import ListingCard from "../components/ListingCard.jsx";

export default function ViewListing() {
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterType, setFilterType] = useState("all");

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

      <div
        style={{
          display: "flex",
          gap: 8,
          marginBottom: 12,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <input
          placeholder="Search listings..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{ flex: 1, padding: 8, minWidth: "200px" }}
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

        {/* Add Listing button */}
        <Link
          to="/create-listing"
          style={{
            padding: "8px 16px",
            backgroundColor: "#007bff",
            color: "white",
            textDecoration: "none",
            borderRadius: "4px",
            fontWeight: "bold",
          }}
        >
          Add Listing
        </Link>
      </div>

      {loading ? (
        <p>Loading listings...</p>
      ) : filteredListings.length === 0 ? (
        <p>No listings found.</p>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
          {filteredListings.map((l, i) => (
            <ListingCard key={l.id ?? i} listing={l} />
          ))}
        </div>
      )}
    </div>
  );
}