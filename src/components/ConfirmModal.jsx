// src/components/ConfirmModal.jsx
import styles from './ConfirmModal.module.css';

/**
 * ConfirmModal  – replaces window.confirm / window.alert
 *
 * Props
 *  open        boolean
 *  title       string
 *  message     string
 *  confirmLabel string  (default "Confirm")
 *  cancelLabel  string  (default "Cancel")
 *  variant      'danger' | 'warning' | 'info'  (default 'danger')
 *  onConfirm   () => void
 *  onCancel    () => void
 *
 * For simple alerts pass onCancel={null} and confirmLabel="OK"
 */
export default function ConfirmModal({
  open,
  title = 'Are you sure?',
  message = '',
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'danger',
  onConfirm,
  onCancel,
}) {
  if (!open) return null;

  const iconColor = variant === 'danger' ? '#dc2626' : variant === 'warning' ? '#d97706' : '#2563eb';
  const btnClass  = variant === 'danger' ? styles.btnDanger : variant === 'warning' ? styles.btnWarning : styles.btnInfo;

  return (
    <div className={styles.overlay} onClick={(e) => e.target === e.currentTarget && onCancel?.()}>
      <div className={styles.modal}>
        <div className={styles.iconWrap} style={{ background: variant === 'danger' ? '#fef2f2' : variant === 'warning' ? '#fffbeb' : '#eff6ff' }}>
          {variant === 'danger' ? (
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><circle cx="12" cy="16" r="0.5" fill={iconColor}/>
            </svg>
          ) : variant === 'warning' ? (
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><circle cx="12" cy="17" r="0.5" fill={iconColor}/>
            </svg>
          ) : (
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
            </svg>
          )}
        </div>

        <h3 className={styles.title}>{title}</h3>
        {message && <p className={styles.message}>{message}</p>}

        <div className={styles.actions}>
          {onCancel && (
            <button className={styles.btnCancel} onClick={onCancel}>{cancelLabel}</button>
          )}
          <button className={`${styles.btn} ${btnClass}`} onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}