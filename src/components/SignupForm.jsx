import { useState } from "react";
import {
  createUserWithEmailAndPassword,
  signInWithPopup,
  signOut,
  GoogleAuthProvider,
} from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";
import { auth, db, isValidWitsEmail, getUserType } from "../firebase";
import GoogleIcon from "./GoogleIcon";
import Message from "./Message";

export default function SignupForm({ onSwitchToLogin, onLoginSuccess }) {
  const [form, setForm] = useState({
    fname: "", lname: "", email: "", password: "", cpassword: "",
  });
  const [msg,     setMsg]     = useState({ text: "", error: false });
  const [loading, setLoading] = useState(false);

  const show   = (text, error = false) => setMsg({ text, error });
  const update = key => e => setForm(f => ({ ...f, [key]: e.target.value }));

  async function handleGoogleSignup(e) {
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
      const userData  = {
        email: user.email, firstName, lastName, userType,
        photoURL: user.photoURL || "",
        createdAt: new Date().toISOString(),
        isVerified: true,
      };

      await setDoc(doc(db, "users", user.uid), userData, { merge: true });
      localStorage.setItem("loggedInUserId", user.uid);
      onLoginSuccess(userData);
    } catch (err) {
      if (!["auth/popup-closed-by-user", "auth/cancelled-popup-request"].includes(err.code))
        show("Sign-up failed: " + err.message, true);
    } finally {
      setLoading(false);
    }
  }

  async function handleEmailSignup(e) {
    e.preventDefault();
    const { fname, lname, email, password, cpassword } = form;

    if (!fname || !lname || !email || !password || !cpassword) {
      show("Please fill all required fields.", true); return;
    }
    if (!isValidWitsEmail(email)) { show("Only Wits emails are allowed!", true); return; }
    if (password !== cpassword)   { show("Passwords do not match!", true); return; }
    if (password.length < 8)      { show("Password must be at least 8 characters.", true); return; }

    setLoading(true);
    try {
      const cred     = await createUserWithEmailAndPassword(auth, email, password);
      const userType = getUserType(email);
      const userData = {
        email, firstName: fname, lastName: lname, userType,
        createdAt: new Date().toISOString(),
        isVerified: true,
      };
      await setDoc(doc(db, "users", cred.user.uid), userData);
      localStorage.setItem("loggedInUserId", cred.user.uid);
      onLoginSuccess(userData);
    } catch (err) {
      const codes = {
        "auth/email-already-in-use": "Email already exists. Please login instead.",
        "auth/invalid-email":        "Invalid email format.",
        "auth/weak-password":        "Password is too weak.",
      };
      show(codes[err.code] || "Sign-up failed: " + err.message, true);
    } finally {
      setLoading(false);
    }
  }

  const fields = [
    { key: "fname",     type: "text",     placeholder: "First Name" },
    { key: "lname",     type: "text",     placeholder: "Last Name" },
    { key: "email",     type: "email",    placeholder: "Email (@wits.ac.za)" },
    { key: "password",  type: "password", placeholder: "Password" },
    { key: "cpassword", type: "password", placeholder: "Confirm Password" },
  ];

  return (
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
        Only <strong>@students.wits.ac.za</strong> and{" "}
        <strong>@wits.ac.za</strong> accounts are accepted.
      </div>

      <div className="divider" />

      <form onSubmit={handleEmailSignup}>
        {fields.map(({ key, type, placeholder }) => (
          <div className="field" key={key}>
            <input
              type={type}
              placeholder={placeholder}
              value={form[key]}
              onChange={update(key)}
            />
          </div>
        ))}
        <div className="field" style={{ marginTop: 20 }}>
          <button type="submit" disabled={loading}>
            {loading ? "Creating account…" : "Sign Up"}
          </button>
        </div>
      </form>

      <div className="form-link" style={{ marginTop: 14 }}>
        <span>
          Already have an account?{" "}
          <a href="#" onClick={e => { e.preventDefault(); onSwitchToLogin(); }}>
            Login
          </a>
        </span>
      </div>
    </div>
  );
}
