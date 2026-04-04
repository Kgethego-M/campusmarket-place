import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import AdminUsers from './pages/AdminUsers';
import AccessDenied from './components/AccessDenied';
import EditListing from './pages/EditListing';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Temporary home redirect — Dev 2 will add login page */}
        <Route path="/" element={<Navigate to="/admin/users" />} />
        
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