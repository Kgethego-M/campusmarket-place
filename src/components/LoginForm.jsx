import { useState } from "react";
import {
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  GoogleAuthProvider,
} from "firebase/auth";


import { doc, getDoc, setDoc } from "firebase/firestore";
import { auth, db, isValidWitsEmail, getUserType } from "../firebase";
import GoogleIcon from "./GoogleIcon";
import Message from "./Message";

export default function LoginForm({ onSwitchToSignup, onLoginSuccess }) {
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [msg,      setMsg]      = useState({ text: "", error: false });
  const [loading,  setLoading]  = useState(false);

  const show = (text, error = false) => setMsg({ text, error });

  async function handleEmailLogin(e) {
    e.preventDefault();
    if (!email || !password) { show("Please enter both email and password.", true); return; }
    if (!isValidWitsEmail(email)) { show("Only Wits emails are allowed!", true); return; }

    setLoading(true);
    try {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      const snap = await getDoc(doc(db, "users", cred.user.uid));
      localStorage.setItem("loggedInUserId", cred.user.uid);
      onLoginSuccess(snap.exists() ? snap.data() : { email, userType: getUserType(email), firstName: "", lastName: "" });
    } catch (err) {
      const codes = {
        "auth/user-not-found":     "No account found. Please sign up first.",
        "auth/wrong-password":     "Incorrect password.",
        "auth/invalid-credential": "Invalid email or password.",
        "auth/too-many-requests":  "Too many attempts. Try again later.",
      };
      show(codes[err.code] || "Login failed: " + err.message, true);
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleLogin(e) {
    e.preventDefault();
    setLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      const result = await signInWithPopup(auth, provider);
      const user   = result.user;

      if (!isValidWitsEmail(user.email)) {
        await signOut(auth);
        show(`❌ Only Wits emails allowed. You used: ${user.email}`, true);
        return;
      }

      const userType  = getUserType(user.email);
      const nameParts = (user.displayName || "").split(" ");
      const firstName = nameParts[0] || "";
      const lastName  = nameParts.slice(1).join(" ") || "";
      const docRef    = doc(db, "users", user.uid);
      const docSnap   = await getDoc(docRef);
      const userData  = docSnap.exists()
        ? docSnap.data()
        : { email: user.email, firstName, lastName, userType };

      await setDoc(docRef, {
        email: user.email, firstName, lastName, userType,
        photoURL: user.photoURL || "",
        lastLogin: new Date().toISOString(),
      }, { merge: true });

      localStorage.setItem("loggedInUserId", user.uid);
      onLoginSuccess(userData);
    } catch (err) {
      if (!["auth/popup-closed-by-user", "auth/cancelled-popup-request"].includes(err.code))
        show("Sign-in failed: " + err.message, true);
    } finally {
      setLoading(false);
    }
  }

  return (
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
        Only <strong>@students.wits.ac.za</strong> and{" "}
        <strong>@wits.ac.za</strong> accounts are accepted.
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
  );
}
