import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
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
        <Route path="/" element={<Navigate to="/admin/users" />} />
        <Route path="/admin/users" element={<AdminUsers />} />
        <Route path="/access-denied" element={<AccessDenied />} />
        <Route path="/listing/:listingId/edit" element={<EditListing />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;