import { useState } from "react";
import LoginForm  from "./LoginForm";
import SignupForm from "./SignupForm";

/* Scoped styles injected here so no global CSS file needs touching */
const FORM_STYLES = `
  .forms-overlay {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    padding: 16px;
    box-sizing: border-box;
  }

  .form-card {
    width: 100%;
    max-width: 420px;
    padding: 32px 28px;
    box-sizing: border-box;
    border-radius: 16px;
    background: #fff;
    box-shadow: 0 4px 24px rgba(0, 0, 0, 0.1);
  }

  .form-card header {
    display: block;
    font-size: 1.5rem;
    font-weight: 700;
    color: #1a1a1a;
    margin-bottom: 4px;
  }

  .form-subtitle {
    font-size: 0.875rem;
    color: #6b7280;
    margin: 0 0 8px;
  }

  .google-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    width: 100%;
    padding: 12px 16px;
    font-size: 0.95rem;
    font-weight: 600;
    border-radius: 10px;
    border: 1.5px solid #e2e6ea;
    background: #fff;
    color: #1a1a1a;
    cursor: pointer;
    transition: background 0.15s, box-shadow 0.15s;
    box-sizing: border-box;
  }
  .google-btn:hover  { background: #f5f8fc; box-shadow: 0 2px 8px rgba(106,166,218,0.2); }
  .google-btn:disabled { opacity: 0.6; cursor: not-allowed; }

  .wits-note {
    font-size: 0.8rem;
    color: #6b7280;
    background: #f0f6fb;
    border-radius: 8px;
    padding: 10px 12px;
    margin-top: 14px;
    line-height: 1.4;
  }

  .divider {
    height: 1px;
    background: #e8eaed;
    margin: 16px 0 0;
  }

  .form-link {
    font-size: 0.875rem;
    color: #6b7280;
    text-align: center;
  }
  .form-link a {
    color: #6AA6DA;
    font-weight: 600;
    text-decoration: none;
  }
  .form-link a:hover { text-decoration: underline; }

  /* ── Phone (≤ 480px) ── */
  @media (max-width: 480px) {
    .forms-overlay {
      align-items: flex-start;
      padding: 12px;
      padding-top: 48px;
    }

    .form-card {
      padding: 22px 18px;
      border-radius: 14px;
      box-shadow: 0 2px 16px rgba(0, 0, 0, 0.08);
    }

    .form-card header { font-size: 1.3rem; }

    .google-btn {
      padding: 14px 14px;
      font-size: 0.9rem;
    }

    .wits-note { font-size: 0.78rem; }
  }

  /* ── Very small Android (≤ 360px) ── */
  @media (max-width: 360px) {
    .forms-overlay  { padding: 8px; padding-top: 32px; }
    .form-card      { padding: 18px 14px; }
    .form-card header { font-size: 1.15rem; }
  }
`;

export default function FormsOverlay({ onLoginSuccess }) {
  const [view, setView] = useState("login"); // "login" | "signup"

  return (
    <>
      {/* Inject scoped styles once at the overlay level */}
      <style>{FORM_STYLES}</style>

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
    </>
  );
}