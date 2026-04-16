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
import ViewListing from './components/MockViewListing';
import EditListing from './pages/EditListing';
import LandingPage from './components/LandingPage';
import LoginForm from './components/LoginForm';
import SignupForm from './components/SignupForm';
import AdminDashboard from './components/Admindashboard';
import Dashboard from './components/Dashboard';
import MockCreateListing from './components/MockCreateListing';

import ViewListingAzure from './pages/ViewListingAzure';
import Profile from './components/Profile';
import CreateListingAzure from './components/CreateListingAzure';
import EditListingAzure from './pages/EditListingAzure';

// -------------------------
// Protected Route (CLEAN)
// -------------------------
function ProtectedRoute({ children, allowedRoles }) {
  const [loading, setLoading] = useState(true);
  const [firebaseUser, setFirebaseUser] = useState(null);
  const [roleAllowed, setRoleAllowed] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setFirebaseUser(null);
        setRoleAllowed(false);
        setLoading(false);
        return;
      }

      setFirebaseUser(user);

      try {
        const userRef = doc(db, 'users', user.uid);
        const userSnap = await getDoc(userRef);

        if (!userSnap.exists()) {
          setRoleAllowed(false);
          setLoading(false);
          return;
        }

        const userData = userSnap.data();

        setRoleAllowed(
          allowedRoles.includes(userData.role)
        );
      } catch (err) {
        console.error('Role check failed:', err);
        setRoleAllowed(false);
      }

      setLoading(false);
    });

    return () => unsubscribe();
  }, [allowedRoles]);

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh'
      }}>
        Loading...
      </div>
    );
  }

  if (!firebaseUser) return <Navigate to="/login" />;
  if (!roleAllowed) return <AccessDenied />;

  return children;
}

// -------------------------
// Wrappers
// -------------------------
function LandingPageWrapper() {
  const navigate = useNavigate();
  return <LandingPage onGetStarted={() => navigate('/login')} />;
}

function LoginWrapper() {
  const navigate = useNavigate();

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: '100vh'
    }}>
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
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: '100vh'
    }}>
      <SignupForm
        onSwitchToLogin={() => navigate('/login')}
        onLoginSuccess={() => navigate('/view-listing')}
      />
    </div>
  );
}

// -------------------------
// Routes
// -------------------------
export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<LandingPageWrapper />} />
      <Route path="/login" element={<LoginWrapper />} />
      <Route path="/signup" element={<SignupWrapper />} />
      <Route path="/admin" element={<AdminDashboard />} />
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/view-listing" element={<ViewListing />} />
      <Route path="/create-listing" element={<MockCreateListing />} />
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

      {/* Azure prototypes deprecated, use main routes */}
    </Routes>
  );
}

// -------------------------
// App entry
// -------------------------
function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}

export default App;