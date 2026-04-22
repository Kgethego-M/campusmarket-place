// src/components/ReportModal.jsx
import { useState } from 'react';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { notifyAdminsOfReport } from '../services/notificationService';
import styles from './ReportModal.module.css';

const REASONS = [
  'Abusive or offensive content',
  'Spam or misleading information',
  'Harassment or threatening behaviour',
  'Inappropriate images',
  'Fraud or scam attempt',
  'Other',
];

/**
 * ReportModal
 *
 * Props:
 *  open        – boolean
 *  onClose     – () => void
 *  reportType  – 'user' | 'listing' | 'review'
 *  reportedId  – uid / listingId / reviewId
 *  reportedName – display name shown in the modal
 */
export default function ReportModal({ open, onClose, reportType = 'user', reportedId, reportedName = '' }) {
  const [reason, setReason]       = useState('');
  const [details, setDetails]     = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone]           = useState(false);
  const [error, setError]         = useState('');

  if (!open) return null;

  const handleClose = () => {
    setReason('');
    setDetails('');
    setError('');
    setDone(false);
    onClose();
  };

  const handleSubmit = async () => {
    if (!reason) { setError('Please select a reason.'); return; }
    setError('');
    setSubmitting(true);

    try {
      const user = auth.currentUser;
      const reporterName = user?.displayName || user?.email || 'Anonymous';

      // Save report to Firestore
      const reportRef = await addDoc(collection(db, 'reports'), {
        reportType,
        reportedId,
        reportedName,
        reporterId: user?.uid || null,
        reporterName,
        reason,
        details: details.trim() || null,
        status: 'pending',    // pending | reviewed | resolved
        createdAt: serverTimestamp(),
      });

      // Notify all admins
      await notifyAdminsOfReport({
        reportId: reportRef.id,
        reportType,
        reportedId,
        reportedName,
        reporterName,
        reason,
      });

      setDone(true);
    } catch (err) {
      console.error('Report submission error:', err);
      setError('Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const typeLabel = reportType === 'listing' ? 'listing' : reportType === 'review' ? 'review' : 'user';

  return (
    <div className={styles.overlay} onClick={(e) => e.target === e.currentTarget && handleClose()}>
      <div className={styles.modal}>
        {done ? (
          <div className={styles.successWrap}>
            <div className={styles.successIcon}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" /><polyline points="9 12 12 15 16 9" />
              </svg>
            </div>
            <h3 className={styles.successTitle}>Report Submitted</h3>
            <p className={styles.successMsg}>
              Thank you for helping keep the campus marketplace safe. Our admin team will review this {typeLabel}.
            </p>
            <button className={styles.doneBtn} onClick={handleClose}>Done</button>
          </div>
        ) : (
          <>
            <div className={styles.header}>
              <div className={styles.headerIcon}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" /><line x1="4" y1="22" x2="4" y2="15" />
                </svg>
              </div>
              <div>
                <h3 className={styles.title}>Report {typeLabel}</h3>
                {reportedName && <p className={styles.subtitle}>{reportedName}</p>}
              </div>
              <button className={styles.closeBtn} onClick={handleClose} aria-label="Close">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <div className={styles.body}>
              <p className={styles.sectionLabel}>Why are you reporting this {typeLabel}?</p>
              <div className={styles.reasonList}>
                {REASONS.map((r) => (
                  <button
                    key={r}
                    className={`${styles.reasonBtn} ${reason === r ? styles.reasonSelected : ''}`}
                    onClick={() => setReason(r)}
                  >
                    <span className={styles.radioCircle}>{reason === r && <span className={styles.radioDot} />}</span>
                    {r}
                  </button>
                ))}
              </div>

              <label className={styles.detailsLabel}>
                Additional details <span className={styles.optional}>(optional)</span>
              </label>
              <textarea
                className={styles.textarea}
                placeholder="Describe what happened…"
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                rows={3}
                maxLength={400}
              />
              <span className={styles.charCount}>{details.length}/400</span>

              {error && <p className={styles.errorMsg}>{error}</p>}
            </div>

            <div className={styles.footer}>
              <button className={styles.cancelBtn} onClick={handleClose}>Cancel</button>
              <button className={styles.submitBtn} onClick={handleSubmit} disabled={submitting}>
                {submitting ? (
                  <><span className={styles.spinner} /> Submitting…</>
                ) : 'Submit Report'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}