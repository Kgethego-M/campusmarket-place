import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth } from '../firebase';

export default function SuspendedPage() {
  const navigate = useNavigate();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    
    setTimeout(async () => {
      try {
        await signOut(auth);
        navigate('/login');
      } catch (error) {
        console.error('Logout error:', error);
        setIsLoggingOut(false);
      }
    }, 2000);
  };

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={styles.iconWrap}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
          </svg>
        </div>

        <h1 style={styles.title}>Account Suspended</h1>
        <p style={styles.message}>
          Your account has been suspended by an administrator due to a violation of our community guidelines.
        </p>
        <p style={styles.sub}>
          If you believe this is a mistake, please contact campus support and reference your student email address.
        </p>

        <div style={styles.contactBox}>
          <i className="fas fa-envelope" style={{ color: '#6AA6DA', marginRight: 8 }} />
          <span style={styles.contactText}> nontokozombatha@icloud.com</span>
        </div>

        <button style={styles.logoutBtn} onClick={handleLogout} disabled={isLoggingOut}>
          <svg width="20" height="20" viewBox="0 0 25 25" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
            <polyline points="16 17 21 12 16 7"/>
            <line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
          Log out
        </button>
      </div>

      {/* popup */}
      {isLoggingOut && (
        <div style={popupStyles.overlay}>
          <div style={popupStyles.popup}>
            <div style={popupStyles.loader}>
              <i className="fas fa-spinner fa-pulse" style={popupStyles.spinner}></i>
              <p style={popupStyles.text}>Logging out...</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  page: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#dbe3e9',
    padding: 24,
    fontFamily: 'Segoe UI, system-ui, sans-serif',
    position: 'relative',
  },
  card: {
    background: '#fff',
    borderRadius: 20,
    padding: '48px 36px',
    maxWidth: 460,
    width: '100%',
    boxShadow: '0 20px 60px rgba(0,0,0,0.08)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
    gap: 14,
  },
  iconWrap: {
    width: 88,
    height: 88,
    borderRadius: '50%',
    background: '#fef2f2',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  title: {
    fontSize: '1.6rem',
    fontWeight: 800,
    color: '#0f172a',
    margin: 0,
  },
  message: {
    fontSize: '0.95rem',
    color: '#475569',
    lineHeight: 1.65,
    margin: 0,
  },
  sub: {
    fontSize: '0.85rem',
    color: '#94a3b8',
    lineHeight: 1.6,
    margin: 0,
  },
  contactBox: {
    display: 'flex',
    alignItems: 'center',
    background: '#f0f7ff',
    border: '1px solid #bdd6f0',
    borderRadius: 10,
    padding: '10px 18px',
    marginTop: 4,
  },
  contactText: {
    fontSize: '0.88rem',
    color: '#1d4ed8',
    fontWeight: 500,
  },
  logoutBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
    padding: '12px 28px',
    borderRadius: 10,
    border: '1.5px solid #e2e8f0',
    background: '#fff',
    color: '#374151',
    fontSize: '0.9rem',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'background 0.15s',
  },
};

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