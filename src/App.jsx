// src/App.jsx
import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import AdminUsers from './pages/AdminUsers';
import AccessDenied from './components/AccessDenied';
import ViewListing from './pages/ViewListing';
import EditListing from './pages/EditListing';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/view-listing" />} />
        <Route path="/view-listing" element={<ViewListing />} />
        <Route path="/edit-listing/:id" element={<EditListing />} />
        <Route path="/admin/users" element={<AdminUsers />} />
        <Route path="/access-denied" element={<AccessDenied />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;