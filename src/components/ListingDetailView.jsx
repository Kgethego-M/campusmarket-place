import { useState } from "react";
import {
  signInWithPopup,
  signOut,
  GoogleAuthProvider,
} from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { auth, db, isValidWitsEmail, getUserType } from "../firebase";
import GoogleIcon from "./GoogleIcon";
import Message from "./Message";

export default function LoginForm({ onSwitchToSignup, onLoginSuccess }) {
  const [msg, setMsg] = useState({ text: "", error: false });
  const [loading, setLoading] = useState(false);
  const [showPopup, setShowPopup] = useState(false);

  const show = (text, error = false) => setMsg({ text, error });

  async function handleGoogleLogin(e) {
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
      const docRef = doc(db, "users", user.uid);
      const docSnap = await getDoc(docRef);
      const userData = docSnap.exists()
        ? docSnap.data()
        : { email: user.email, firstName, lastName, userType };

      await setDoc(docRef, {
        email: user.email, firstName, lastName, userType,
        role: userType,
        photoURL: user.photoURL || "",
        lastLogin: new Date().toISOString(),
      }, { merge: true });

      localStorage.setItem("loggedInUserId", user.uid);

      const resolvedUserType = userData.userType || userType;
      
      // Small delay to show loading popup
      setTimeout(() => {
        setShowPopup(false);
        onLoginSuccess({ ...userData, userType: resolvedUserType });
      }, 1000);

    } catch (err) {
      setShowPopup(false);
      if (!["auth/popup-closed-by-user", "auth/cancelled-popup-request"].includes(err.code))
        show("Sign-in failed: " + err.message, true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="form-card">
        <header>Login</header>
        <p className="form-subtitle">Use your Wits account to continue</p>

        <Message text={msg.text} isError={msg.error} />

        <div style={{ marginTop: 20 }}>
          <button className="google-btn" onClick={handleGoogleLogin} disabled={loading}>
            <GoogleIcon /> Continue with Google
          </button>
        </div>

        <div className="wits-note">
          <i className="fas fa-info-circle"></i>{" "}
          Only <strong>@School email</strong> accounts are accepted.
        </div>

        <div className="divider" />

        <div className="form-link" style={{ marginTop: 14 }}>
          <span>
            Don't have an account?{" "}
            <a href="#" onClick={e => { e.preventDefault(); onSwitchToSignup(); }}>
              Sign Up
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
              <p style={popupStyles.text}>Logging in...</p>
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
    padding: '16px',
    boxSizing: 'border-box',
  },
  popup: {
    background: 'white',
    borderRadius: '12px',
    padding: '24px 28px',
    boxShadow: '0 10px 40px rgba(0, 0, 0, 0.2)',
    width: '100%',
    maxWidth: '240px',
    boxSizing: 'border-box',
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