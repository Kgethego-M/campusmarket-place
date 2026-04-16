import { useState } from "react";
import LoginForm  from "./LoginForm";
import SignupForm from "./SignupForm";

export default function FormsOverlay({ onLoginSuccess }) {
  const [view, setView] = useState("login"); // "login" | "signup"

  return (
    <div className="forms-overlay">
      {view === "login" ? (
        <LoginForm
          onSwitchToSignup={() => setView("signup")}
          onLoginSuccess={onLoginSuccess}
        />
      ) : (
        <SignupForm
          onSwitchToLogin={() => setView("login")}
          onLoginSuccess={onLoginSuccess}
        />
      )}
    </div>
  );
}
