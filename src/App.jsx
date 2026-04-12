// src/App.jsx
import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import AdminUsers from './pages/AdminUsers';
import AccessDenied from './components/AccessDenied';

// Correct import name
import ViewListing from './pages/ViewListing';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Temporary home redirect — Dev 2 will add login page */}
        <Route path="/" element={<Navigate to="/admin/users" />} />
        
        {/* Dev 3 routes */}
        <Route path="/admin/users" element={<AdminUsers />} />
        <Route path="/access-denied" element={<AccessDenied />} />
      </Routes>
    </BrowserRouter>
  );
}
export default App;