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

import AccessDenied from './components/AccessDenied';
import ViewListing from './components/ViewListing.jsx';
import EditListing from './pages/EditListing';
import LandingPage from './components/LandingPage';
import LoginForm from './components/LoginForm';
import SignupForm from './components/SignupForm';
import AdminDashboard from './components/Admindashboard';
import Dashboard from './components/Dashboard';
import CreateListing from './components/CreateListing';
import ViewRating from './components/ViewRating';
import ReviewOffer from './components/ReviewOffer';

import ViewListingAzure from './pages/ViewListingAzure';
import CreateListingAzure from './components/CreateListingAzure';
import EditListingAzure from './pages/EditListingAzure';
import ListingDetail from './components/ListingDetail';
import Chat from './components/Chat';
import Profile from './components/Profile'
import StaffDashboard from './components/Staffdashboard.jsx';
import ProfileListingCard from './components/ProfileListingCard';


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
          const role = userData.role || userData.userType;
          if (role === 'admin'){
            navigate('/admin');
          }
          else if (role === 'staff'){
            navigate('/staff');
          }
          else{
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
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/profile" element={<Profile />} />
      <Route path="/view-listing" element={<ProtectedRoute allowedRoles={['student']}><ViewListing /></ProtectedRoute>} />
      <Route path="/create-listing" element={<ProtectedRoute allowedRoles={['student']}><CreateListing /></ProtectedRoute>} />
      <Route path="/view-rating" element={<ViewRating userId="sampleUserId" />} />
      <Route path="/chat" element={<ProtectedRoute allowedRoles={['student']}><Chat/></ProtectedRoute>} />
      <Route path="/chat/:transactionId" element={<Chat />} />
      <Route path="/edit-listing/:id" element={<EditListing />} />
      <Route path="/access-denied" element={<AccessDenied />} />
      <Route path="/staff" element={<ProtectedRoute allowedRoles={['staff']}><StaffDashboard /></ProtectedRoute>} />
      <Route path="/admin" element={<ProtectedRoute allowedRoles={['admin']}><AdminDashboard /></ProtectedRoute>}/>
      <Route path="/azure/view-listing" element={<ViewListing />} />
      <Route path="/azure/create-listing" element={<CreateListing/>} />
      <Route path="/azure/edit-listing/:id" element={<EditListing />} />
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