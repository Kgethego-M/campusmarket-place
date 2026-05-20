// src/components/AlertModal.jsx
import React from 'react';
import styles from './AlertModal.module.css';

export default function AlertModal({ 
  open, 
  onClose, 
  title, 
  message, 
  type = 'error',
  confirmText = 'OK',
  onConfirm,
  showCancel = false,
  cancelText = 'Cancel'
}) {
  if (!open) return null;

  const getIcon = () => {
    switch (type) {
      case 'error':
        return (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        );
      case 'warning':
        return (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 9v4M12 17h.01" />
            <path d="M12 2L2 20h20L12 2z" />
          </svg>
        );
      case 'success':
        return (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <polyline points="9 12 12 15 16 9" />
          </svg>
        );
      default:
        return (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        );
    }
  };

  const getHeaderBg = () => {
    switch (type) {
      case 'error': return '#fef2f2';
      case 'warning': return '#fffbeb';
      case 'success': return '#f0fdf4';
      default: return '#eff6ff';
    }
  };

  const getButtonClass = () => {
    switch (type) {
      case 'error': return styles.errorBtn;
      case 'warning': return styles.warningBtn;
      case 'success': return styles.successBtn;
      default: return styles.infoBtn;
    }
  };

  const handleConfirm = () => {
    if (onConfirm) onConfirm();
    onClose();
  };

  return (
    <div className={styles.overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <div className={styles.headerIcon} style={{ background: getHeaderBg() }}>
            {getIcon()}
          </div>
          <h3 className={styles.title}>{title}</h3>
          <button className={styles.closeBtn} onClick={onClose}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className={styles.body}>
          <p className={styles.message}>{message}</p>
        </div>

        <div className={styles.footer}>
          {showCancel && (
            <button className={styles.cancelBtn} onClick={onClose}>
              {cancelText}
            </button>
          )}
          <button className={`${styles.submitBtn} ${getButtonClass()}`} onClick={handleConfirm}>
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}