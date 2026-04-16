import React, { useState, useEffect } from 'react';
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useNavigate
} from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from './firebase';

import AdminUsers from './pages/AdminUsers';
import AccessDenied from './components/AccessDenied';
import ViewListing from './components/ViewListing.jsx';
import EditListing from './pages/EditListing';
import LandingPage from './components/LandingPage';
import LoginForm from './components/LoginForm';
import SignupForm from './components/SignupForm';
import AdminDashboard from './components/Admindashboard';
import Dashboard from './components/Dashboard';
import Profile from './components/Profile';
import CreateListing from './components/CreateListing';
import ViewRating from './components/ViewRating';

import ViewListingAzure from './pages/ViewListingAzure';
import CreateListingAzure from './components/CreateListingAzure';
import EditListingAzure from './pages/EditListingAzure';

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

        if (!userSnap.exists()) {
          setLoading(false);
          return;
        }

        const userData = userSnap.data();
        setAccessGranted(allowedRoles.includes(userData.role));
      } catch (e) {
        console.error(e);
      }

      setLoading(false);
    });

    return () => unsubscribe();
  }, [allowedRoles]);

  if (loading) {
    return (
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '100vh'
        }}
      >
        Checking permissions...
      </div>
    );
  }

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
    <div
      style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh'
      }}
    >
      <LoginForm
        onSwitchToSignup={() => navigate('/signup')}
        onLoginSuccess={(userData) => {
          if (
            userData.userType === 'admin' ||
            userData.role === 'admin'
          ) {
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
    <div
      style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh'
      }}
    >
      <SignupForm
        onSwitchToLogin={() => navigate('/login')}
        onLoginSuccess={() => navigate('/view-listing')}
      />
    </div>
  );
}

// Exported separately so tests can wrap with MemoryRouter
export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<LandingPageWrapper />} />
      <Route path="/login" element={<LoginWrapper />} />
      <Route path="/signup" element={<SignupWrapper />} />
      <Route path="/admin" element={<AdminDashboard />} />
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/profile" element={<Profile />} />
      <Route path="/view-listing" element={<ViewListing />} />
      <Route path="/create-listing" element={<CreateListing />} />
      <Route path="/profile" element={<Profile />} />
      <Route path="/view-rating" element={<ViewRating userId="sampleUserId" />} />
      <Route path="/edit-listing/:id" element={<EditListing />} />
      <Route path="/access-denied" element={<AccessDenied />} />
      <Route
        path="/admin/users"
        element={
          <ProtectedRoute allowedRoles={['admin']}>
            <AdminUsers />
          </ProtectedRoute>
        }
      />
      <Route path="/azure/view-listing" element={<ViewListingAzure />} />
      <Route path="/azure/create-listing" element={<CreateListingAzure />} />
      <Route path="/azure/edit-listing/:id" element={<EditListingAzure />} />
    </Routes>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}

export default App;