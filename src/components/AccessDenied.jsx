// src/components/AccessDenied.jsx
// Shown when a user tries to access a page they don't have permission for
// Written by: Dev 3

import React from 'react';

const AccessDenied = () => {
return (
    <div style={styles.container}>
    <div style={styles.icon}>🔒</div>
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
    fontSize: '3rem',
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