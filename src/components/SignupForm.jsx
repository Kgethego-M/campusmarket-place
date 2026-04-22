import { useState } from "react";
import {
  signInWithPopup,
  signOut,
  GoogleAuthProvider,
} from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";
import { auth, db, isValidWitsEmail, getUserType } from "../firebase";
import GoogleIcon from "./GoogleIcon";
import Message from "./Message";

export default function SignupForm({ onSwitchToLogin, onLoginSuccess }) {
  const [msg, setMsg] = useState({ text: "", error: false });
  const [loading, setLoading] = useState(false);
  const [showPopup, setShowPopup] = useState(false);

  const show = (text, error = false) => setMsg({ text, error });

  async function handleGoogleSignup(e) {
    e.preventDefault();
    setLoading(true);
    setShowPopup(true);
    
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      const result = await signInWithPopup(auth, provider);
      const user = result.user;

      if (!isValidWitsEmail(user.email)) {
        await signOut(auth);
        setShowPopup(false);
        show(`Only Wits emails allowed. You used: ${user.email}`, true);
        return;
      }

      const userType = getUserType(user.email);
      const nameParts = (user.displayName || "").split(" ");
      const firstName = nameParts[0] || "";
      const lastName = nameParts.slice(1).join(" ") || "";
      const userData = {
        email: user.email, firstName, lastName, userType,
        role: userType,
        photoURL: user.photoURL || "",
        createdAt: new Date().toISOString(),
        isVerified: true,
      };

      await setDoc(doc(db, "users", user.uid), userData, { merge: true });
      localStorage.setItem("loggedInUserId", user.uid);
      
      // Small delay to show loading popup
      setTimeout(() => {
        setShowPopup(false);
        onLoginSuccess(userData);
      }, 1000);
      
    } catch (err) {
      setShowPopup(false);
      if (!["auth/popup-closed-by-user", "auth/cancelled-popup-request"].includes(err.code))
        show("Sign-up failed: " + err.message, true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="form-card">
        <header>Sign Up</header>
        <p className="form-subtitle">Create your CampusMarket account</p>

        <Message text={msg.text} isError={msg.error} />

        <div style={{ marginTop: 16 }}>
          <button className="google-btn" onClick={handleGoogleSignup} disabled={loading}>
            <GoogleIcon /> Sign up with Google
          </button>
        </div>

        <div className="wits-note">
          <i className="fas fa-info-circle"></i>{" "}
          Only <strong>@school email</strong> accounts are accepted.
        </div>

        <div className="divider" />

        <div className="form-link" style={{ marginTop: 14 }}>
          <span>
            Already have an account?{" "}
            <a href="#" onClick={e => { e.preventDefault(); onSwitchToLogin(); }}>
              Login
            </a>
          </span>
        </div>
      </div>

      {/* Loading Popup */}
      {showPopup && (
        <div style={popupStyles.overlay}>
          <div style={popupStyles.popup}>
            <div style={popupStyles.loader}>
              <i className="fas fa-spinner fa-pulse" style={popupStyles.spinner}></i>
              <p style={popupStyles.text}>
                {loading ? "Creating your account..." : "Signing in..."}
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

const popupStyles = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  popup: {
    background: 'white',
    borderRadius: '12px',
    padding: '24px 32px',
    boxShadow: '0 10px 40px rgba(0, 0, 0, 0.2)',
    minWidth: '200px',
  },
  loader: {
    textAlign: 'center',
  },
  spinner: {
    fontSize: '2rem',
    color: '#6AA6DA',
    marginBottom: '0.75rem',
  },
  text: {
    color: '#6b7280',
    fontSize: '0.9rem',
    margin: 0,
  },
};