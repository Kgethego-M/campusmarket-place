// src/components/AccessDenied.jsx
// Shown when a user tries to access a page they don't have permission for
// Written by: Dev 3
import React from 'react';

const AccessDenied = () => {
  return (
    <div style={styles.container}>
      <div style={styles.icon}>
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
          <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
        </svg>
      </div>
      <h1 style={styles.title}>Access Denied</h1>
      <p style={styles.message}>
        You don't have permission to view this page.
        If you think this is a mistake, contact your admin.
      </p>
      <a href="/" style={styles.button}>Go back home</a>
    </div>
  );
};

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '60vh',
    textAlign: 'center',
    gap: '1rem',
    padding: '2rem',
  },
  icon: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: '1.5rem',
    fontWeight: '600',
    color: '#1a1a1a',
  },
  message: {
    color: '#666',
    fontSize: '0.95rem',
    maxWidth: '360px',
  },
  button: {
    marginTop: '0.5rem',
    padding: '10px 20px',
    background: '#2563eb',
    color: '#fff',
    borderRadius: '6px',
    fontSize: '0.9rem',
    textDecoration: 'none',
  },
};

export default AccessDenied;