import React, { useState, useEffect } from 'react';
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useNavigate,
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
import SuspendedPage from './components/SuspendedPage';
import Dashboard from './components/Dashboard';
import CreateListing from './components/CreateListing';
import ViewRating from './components/ViewRating';
import ReviewOffer from './components/ReviewOffer';
import ListingDetail from './components/ListingDetail';
import ReviewForm from './components/ReviewForm.jsx';
import Notificationspage from './components/Notificationspage.jsx';
import MyPurchases from './components/MyPurchases.jsx';
import Payment from './components/Payment.jsx';
import PaymentSuccess from './components/PaymentSuccess.jsx';
import PaymentCancelled from './components/PaymentCancelled.jsx';
import ReportsPage from './components/ReportsPage';
import ModerationSummaryPage from './components/ModerationSummaryPage';

import CreateListingAzure from './components/CreateListingAzure';
// import EditListingAzure from './pages/EditListingAzure';

import Chat from './components/Chat';
import Profile from './components/Profile';
import StaffDashboard from './components/Staffdashboard.jsx';
import ProfileListingCard from './components/ProfileListingCard';

// SPRINT 2 IMPORTS
import TradeFacility from './components/TradeFacility';
import BookDropOff from './components/BookDropOff';

// SPRINT 3 IMPORTS
import AdminAnalytics from './components/AdminAnalytics';
import ViewCart from './components/ViewCart';

// -------------------------
// Protected Route
// -------------------------
function ProtectedRoute({ children, allowedRoles }) {
  const [loading, setLoading] = useState(true);
  const [firebaseUser, setFirebaseUser] = useState(null);
  const [roleAllowed, setRoleAllowed] = useState(false);
  const [isSuspended, setIsSuspended] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setFirebaseUser(null);
        setRoleAllowed(false);
        setIsSuspended(false);
        setLoading(false);
        return;
      }

      setFirebaseUser(user);

      try {
        const userRef = doc(db, 'users', user.uid);
        const userSnap = await getDoc(userRef);

        if (!userSnap.exists()) {
          setRoleAllowed(false);
          setIsSuspended(false);
          setLoading(false);
          return;
        }

        const userData = userSnap.data();

        if (userData.suspended) {
          setIsSuspended(true);
          setRoleAllowed(false);
          setLoading(false);
          return;
        }

        const userRole = userData.role || userData.userType;

        setIsSuspended(false);
        setRoleAllowed(allowedRoles.includes(userRole));
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
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '100vh',
        }}
      >
        Loading...
      </div>
    );
  }

  if (!firebaseUser) return <Navigate to="/login" replace />;
  if (isSuspended) return <Navigate to="/suspended" replace />;
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
    <div
      style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
      }}
    >
      <LoginForm
        onSwitchToSignup={() => navigate('/signup')}
        onLoginSuccess={(userData) => {
          if (userData.suspended) {
            navigate('/suspended');
            return;
          }

          const role = userData.role || userData.userType;

          if (role === 'admin') {
            navigate('/admin');
          } else if (role === 'staff') {
            navigate('/staff');
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
        minHeight: '100vh',
      }}
    >
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
      {/* Public Routes */}
      <Route path="/" element={<LandingPageWrapper />} />
      <Route path="/login" element={<LoginWrapper />} />
      <Route path="/signup" element={<SignupWrapper />} />
      <Route path="/suspended" element={<SuspendedPage />} />
      <Route path="/access-denied" element={<AccessDenied />} />

      {/* General */}
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/profile" element={<Profile />} />
      <Route path="/profile/:userId" element={<ViewRating />} />
      <Route path="/view-rating" element={<ViewRating userId="sampleUserId" />} />
      <Route path="/listing/:id" element={<ListingDetail />} />
      <Route path="/review/:transactionId" element={<ReviewForm />} />
      <Route path="/edit-listing/:id" element={<EditListing />} />
      <Route path="/azure/create-listing" element={<CreateListingAzure />} />

      {/* Student Routes */}
      <Route
        path="/view-listing"
        element={
          <ProtectedRoute allowedRoles={['student']}>
            <ViewListing />
          </ProtectedRoute>
        }
      />

      <Route
        path="/create-listing"
        element={
          <ProtectedRoute allowedRoles={['student']}>
            <CreateListing />
          </ProtectedRoute>
        }
      />

      <Route
        path="/cart"
        element={
          <ProtectedRoute allowedRoles={['student']}>
            <ViewCart />
          </ProtectedRoute>
        }
      />

      <Route
        path="/chat"
        element={
          <ProtectedRoute allowedRoles={['student']}>
            <Chat />
          </ProtectedRoute>
        }
      />

      <Route
        path="/chat/:transactionId"
        element={
          <ProtectedRoute allowedRoles={['student']}>
            <Chat />
          </ProtectedRoute>
        }
      />

      <Route
        path="/trade-facility"
        element={
          <ProtectedRoute allowedRoles={['student']}>
            <TradeFacility />
          </ProtectedRoute>
        }
      />

      <Route
        path="/book-dropoff/:transactionId"
        element={
          <ProtectedRoute allowedRoles={['student']}>
            <BookDropOff />
          </ProtectedRoute>
        }
      />

      <Route
        path="/payment/:txId"
        element={
          <ProtectedRoute allowedRoles={['student']}>
            <Payment />
          </ProtectedRoute>
        }
      />

      {/* Stripe return routes */}
      <Route
        path="/payment-success"
        element={
          <ProtectedRoute allowedRoles={['student']}>
            <PaymentSuccess />
          </ProtectedRoute>
        }
      />

      <Route
        path="/payment-cancelled"
        element={
          <ProtectedRoute allowedRoles={['student']}>
            <PaymentCancelled />
          </ProtectedRoute>
        }
      />

      <Route
        path="/notifications"
        element={
          <ProtectedRoute allowedRoles={['student']}>
            <Notificationspage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/my-purchases"
        element={
          <ProtectedRoute allowedRoles={['student']}>
            <MyPurchases />
          </ProtectedRoute>
        }
      />

      {/* Staff Routes */}
      <Route
        path="/staff"
        element={
          <ProtectedRoute allowedRoles={['staff']}>
            <StaffDashboard />
          </ProtectedRoute>
        }
      />

      {/* Admin Routes */}
      <Route
        path="/admin"
        element={
          <ProtectedRoute allowedRoles={['admin']}>
            <AdminDashboard />
          </ProtectedRoute>
        }
      />

      <Route
        path="/admin/analytics"
        element={
          <ProtectedRoute allowedRoles={['admin']}>
            <AdminAnalytics />
          </ProtectedRoute>
        }
      />

      <Route
        path="/admin/reports"
        element={
          <ProtectedRoute allowedRoles={['admin']}>
            <ReportsPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/admin/moderation-summary"
        element={
          <ProtectedRoute allowedRoles={['admin']}>
            <ModerationSummaryPage />
          </ProtectedRoute>
        }
      />

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
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