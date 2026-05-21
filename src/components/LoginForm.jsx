import { useState } from "react";
import { signInWithPopup, signOut, GoogleAuthProvider } from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { auth, db, isValidWitsEmail, getUserType } from "../firebase";
import Message from "./Message";

const WHITELISTED_GMAILS = [
  'nontokozombatha797@gmail.com', 's08027456@gmail.com',
  'tshegomaphefo48@gmail.com',   'hyginusvictor11@gmail.com',
  'dantesebopela@gmail.com',     'kgethim25.o@gmail.com',
  'mphelanekgethego20060325@gmail.com', 'anelevanwyk49@gmail.com',
  'mbathamathamsanqa@gmail.com', 'masegelakamogelo5@gmail.com',
  'kgethie35@gmail.com',         'lialabelle71@gmail.com', 'hyginusvictor7@gmail.com'
];

const isWhitelisted  = (email) => WHITELISTED_GMAILS.includes(email);
const isStudentEmail = (email) => email.endsWith('@students.wits.ac.za');
const isStaffEmail   = (email) => email.endsWith('@wits.ac.za') && !isStudentEmail(email) && isWhitelisted;
const isAdminEmail   = (email) => email.endsWith('@gmail.com');

const styles = `
  .role-btn {
    display: flex;
    align-items: center;
    gap: 14px;
    width: 100%;
    padding: 14px 18px;
    border: 1.5px solid #e5e7eb;
    border-radius: 12px;
    background: #fff;
    cursor: pointer;
    transition: border-color 0.2s, box-shadow 0.2s, background 0.2s;
    text-align: left;
  }
  .role-btn:hover {
    border-color: #6AA6DA;
    box-shadow: 0 2px 12px rgba(106,166,218,0.15);
    background: #f0f7ff;
  }
  .role-btn:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }
  .role-btn-icon {
    width: 40px; height: 40px;
    border-radius: 10px;
    background: #e8f2fb;
    display: flex; align-items: center; justify-content: center;
    color: #6AA6DA;
    font-size: 1.1rem;
    flex-shrink: 0;
  }
  .role-btn-text {
    flex: 1;
    display: flex; flex-direction: column; gap: 2px;
  }
  .role-btn-text strong { font-size: 0.92rem; color: #1a1a1a; }
  .role-btn-text span   { font-size: 0.75rem; color: #6b7280; }
  .role-btn-arrow { color: #9ca3af; font-size: 0.8rem; }
  .role-section-label {
    font-size: 0.72rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #9ca3af;
    margin: 20px 0 10px;
  }
`;

const GoogleSVG = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
    <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
    <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
    <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
    <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
  </svg>
);

export default function LoginForm({ onSwitchToSignup, onLoginSuccess }) {
  const [msg,       setMsg]       = useState({ text: "", error: false });
  const [loading,   setLoading]   = useState(false);
  const [showPopup, setShowPopup] = useState(false);

  const show = (text, error = false) => setMsg({ text, error });

  async function handleLogin(selectedRole) {
    setLoading(true);
    setShowPopup(true);
    setMsg({ text: "", error: false });

    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      const result = await signInWithPopup(auth, provider);
      const user   = result.user;
      const email  = user.email;

      /* ── 1. Validate email is allowed at all ── */
      if (!isValidWitsEmail(email)) {
        await signOut(auth);
        setShowPopup(false);
        show(`This app only accepts Wits or approved emails. You used: ${email}`, true);
        return;
      }

      /* ── 2. Validate email matches chosen role ── */
      const expectedRole = isWhitelisted(email) ? getUserType(email) : null;

      if (selectedRole === 'student') {
        const allowed = isStudentEmail(email) || expectedRole === 'student';
        if (!allowed) {
          await signOut(auth);
          setShowPopup(false);
          show(`Student login requires a @students.wits.ac.za email. You used: ${email}`, true);
          return;
        }
      } else if (selectedRole === 'staff') {
        const allowed = isStaffEmail(email) || expectedRole === 'staff';
        if (!allowed) {
          await signOut(auth);
          setShowPopup(false);
          show(`Staff login requires a @wits.ac.za email. You used: ${email}`, true);
          return;
        }
      } else if (selectedRole === 'admin') {
        const allowed = isWhitelisted(email) && expectedRole === 'admin';
        if (!allowed) {
          await signOut(auth);
          setShowPopup(false);
          show(`Admin login requires an approved email address. You used: ${email}`, true);
          return;
        }
      }

      /* ── 3. Account must already exist ── */
      const docRef  = doc(db, "users", user.uid);
      const docSnap = await getDoc(docRef);

      if (!docSnap.exists()) {
        await signOut(auth);
        setShowPopup(false);
        show("No account found. Please sign up first.", true);
        return;
      }

      /* ── 4. Persist login ── */
      const userData = docSnap.data();
      localStorage.setItem("loggedInUserId", user.uid);

      await setDoc(docRef, { lastLogin: new Date().toISOString() }, { merge: true });

      setTimeout(() => {
        setShowPopup(false);
        onLoginSuccess({ ...userData, userType: selectedRole });
      }, 900);

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
      <style>{styles}</style>

      <div className="form-card">
        <header>Welcome back</header>
        <p className="form-subtitle">Sign in with your Wits Google account</p>

        <Message text={msg.text} isError={msg.error} />

        <p className="role-section-label">Choose your role to continue</p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <button className="role-btn" disabled={loading} onClick={() => handleLogin('student')}>
            <span className="role-btn-icon"><i className="fas fa-graduation-cap" /></span>
            <div className="role-btn-text">
              <strong>Student</strong>
              <span>@students.wits.ac.za</span>
            </div>
            <i className="fas fa-arrow-right role-btn-arrow" />
          </button>

          <button className="role-btn" disabled={loading} onClick={() => handleLogin('staff')}>
            <span className="role-btn-icon"><i className="fas fa-chalkboard-teacher" /></span>
            <div className="role-btn-text">
              <strong>Staff</strong>
              <span>@wits.ac.za</span>
            </div>
            <i className="fas fa-arrow-right role-btn-arrow" />
          </button>

          <button className="role-btn" disabled={loading} onClick={() => handleLogin('admin')}>
            <span className="role-btn-icon"><i className="fas fa-user-shield" /></span>
            <div className="role-btn-text">
              <strong>Admin</strong>
              <span>Approved email only</span>
            </div>
            <i className="fas fa-arrow-right role-btn-arrow" />
          </button>
        </div>

        <div style={{ marginTop: 20, textAlign: 'center', color: '#9ca3af', fontSize: '0.75rem' }}>
          <i className="fas fa-lock" style={{ marginRight: 5 }} />
          Secured via Google Sign-In
        </div>

        <div className="wits-note">
          <i className="fas fa-info-circle" />{" "}
          Only <strong>Wits</strong> or approved email accounts are accepted.
        </div>

        <div className="form-link" style={{ marginTop: 14 }}>
          <span>
            Don't have an account?{" "}
            <a href="#" onClick={e => { e.preventDefault(); onSwitchToSignup(); }}>
              Sign Up
            </a>
          </span>
        </div>
      </div>

      {showPopup && (
        <div style={popupStyles.overlay}>
          <div style={popupStyles.popup}>
            <GoogleSVG />
            <i className="fas fa-spinner fa-pulse" style={popupStyles.spinner} />
            <p style={popupStyles.text}>Signing you in…</p>
          </div>
        </div>
      )}
    </>
  );
}

const popupStyles = {
  overlay: { position:'fixed', inset:0, backgroundColor:'rgba(0,0,0,0.45)', display:'flex', justifyContent:'center', alignItems:'center', zIndex:1000 },
  popup:   { background:'#fff', borderRadius:'14px', padding:'28px 36px', boxShadow:'0 12px 48px rgba(0,0,0,0.18)', minWidth:'210px', textAlign:'center', display:'flex', flexDirection:'column', alignItems:'center', gap:'10px' },
  spinner: { fontSize:'1.8rem', color:'#6AA6DA' },
  text:    { color:'#6b7280', fontSize:'0.88rem', margin:0 },
};