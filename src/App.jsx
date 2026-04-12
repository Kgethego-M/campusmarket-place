import React from 'react';
import { BrowserRouter, Routes, Route, useNavigate } from 'react-router-dom';
import AdminUsers from './pages/AdminUsers';
import AccessDenied from './components/AccessDenied';
import ViewListing from './pages/ViewListing';
import EditListing from './pages/EditListing';
import LandingPage from './components/LandingPage';
import LoginForm from './components/LoginForm';
import SignupForm from './components/SignupForm';
import Dashboard from './components/Dashboard';

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
        onLoginSuccess={() => navigate('/view-listing')}
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
        <Route path="/admin/users" element={<AdminUsers />} />
        <Route path="/access-denied" element={<AccessDenied />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;