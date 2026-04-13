// src/App.jsx
import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { useState, useEffect } from 'react';
import { auth, db } from './firebase';
import AdminUsers from './pages/AdminUsers';
import AccessDenied from './components/AccessDenied';
import ViewListing from './pages/ViewListing';
import EditListing from './pages/EditListing';
import LandingPage from './components/LandingPage';
import LoginForm from './components/LoginForm';
import SignupForm from './components/SignupForm';
import Dashboard from './components/Dashboard';

// Protects routes based on role
function ProtectedRoute({ children, allowedRoles }) {
  const [loading, setLoading] = useState(true);
  const [accessGranted, setAccessGranted] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setIsLoggedIn(false);
        setLoading(false);
        return;
      }
      setIsLoggedIn(true);
      try {
        const userSnap = await getDoc(doc(db, 'users', user.uid));
        if (!userSnap.exists()) { setLoading(false); return; }
        const userData = userSnap.data();
        setAccessGranted(allowedRoles.includes(userData.role));
      } catch (e) {
        console.error(e);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, [allowedRoles]);

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>Checking permissions...</div>;
  if (!isLoggedIn) return <Navigate to="/login" />;
  if (!accessGranted) return <AccessDenied />;
  return children;
}

function LandingPageWrapper() {
  const navigate = useNavigate();
  return <LandingPage onGetStarted={() => navigate('/login')} />;
}

function LoginWrapper() {
  const navigate = useNavigate();
  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
      <LoginForm
        onSwitchToSignup={() => navigate('/signup')}
        onLoginSuccess={(userData) => {
          if (userData.userType === 'admin' || userData.role === 'admin') {
            navigate('/admin/users');
          } else {
            navigate('/view-listing');
          }
        }}
      />
    </div>
  );
}

function SignupWrapper() {
  const navigate = useNavigate();
  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
      <SignupForm
        onSwitchToLogin={() => navigate('/login')}
        onSignupSuccess={() => navigate('/view-listing')}
      />
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPageWrapper />} />
        <Route path="/login" element={<LoginWrapper />} />
        <Route path="/signup" element={<SignupWrapper />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/view-listing" element={<ViewListing />} />
        <Route path="/edit-listing/:id" element={<EditListing />} />
        <Route path="/access-denied" element={<AccessDenied />} />

        {/* Protected admin route */}
        <Route path="/admin/users" element={
          <ProtectedRoute allowedRoles={['admin']}>
            <AdminUsers />
          </ProtectedRoute>
        } />
      </Routes>
    </BrowserRouter>
  );
}

export default App;