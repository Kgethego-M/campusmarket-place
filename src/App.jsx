import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import CreateListing from "./components/MockCreateListing.jsx";
import ViewListings from "./components/MockViewListing.jsx";
import AdminUsers from './pages/AdminUsers';
import AccessDenied from './components/AccessDenied';
import EditListing from './pages/EditListing';

// Seed dummy listings into sessionStorage for testing
if (!sessionStorage.getItem("listings")) {
  sessionStorage.setItem("listings", JSON.stringify([
    {
      id: "listing-001",
      title: "Calculus Textbook",
      price: "150",
      description: "Good condition, no highlights",
      condition: "Good",
      sellerUID: "user-123"
    },
    {
      id: "listing-002",
      title: "Laptop Stand",
      price: "200",
      description: "Barely used",
      condition: "Like New",
      sellerUID: "user-123"
    }
  ]));
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Home */}
        <Route path="/" element={<Navigate to="/view-listing" replace />} />

        {/* Dev 4 routes */}
        <Route path="/view-listing" element={<ViewListings />} />
        <Route path="/create-listing" element={<CreateListing />} />

        {/* Dev 3 routes */}
        <Route path="/admin/users" element={<AdminUsers />} />
        <Route path="/access-denied" element={<AccessDenied />} />

        {/* Dev 5 routes */}
        <Route path="/listing/:listingId/edit" element={<EditListing />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;