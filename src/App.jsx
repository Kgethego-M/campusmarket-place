import { useState, useEffect } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "./firebase";

import LandingPage  from "./components/LandingPage";
import FormsOverlay from "./components/FormsOverlay";
import Dashboard    from "./components/Dashboard";

export default function App() {
  // "landing" | "forms" | "dashboard"
  const [screen,   setScreen]   = useState("landing");
  const [userData, setUserData] = useState(null);

  // Restore session on mount
  useEffect(() => {
    const uid = localStorage.getItem("loggedInUserId");
    if (!uid) return;

    const unsubscribe = onAuthStateChanged(auth, async user => {
      if (user) {
        try {
          const snap = await getDoc(doc(db, "users", user.uid));
          if (snap.exists()) {
            setUserData(snap.data());
            setScreen("dashboard");
          }
        } catch (err) {
          console.error("Session restore error:", err);
        }
      }
    });

    return () => unsubscribe();
  }, []);

  function handleLoginSuccess(data) {
    setUserData(data);
    setScreen("dashboard");
  }

  function handleLogout() {
    setUserData(null);
    setScreen("landing");
  }

  return (
    <>
      {screen === "landing"   && <LandingPage   onGetStarted={() => setScreen("forms")} />}
      {screen === "forms"     && <FormsOverlay   onLoginSuccess={handleLoginSuccess} />}
      {screen === "dashboard" && <Dashboard      user={userData || {}} onLogout={handleLogout} />}
    </>
  );
}
