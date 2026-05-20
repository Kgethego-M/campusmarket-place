import { useState, useRef } from 'react';
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

const CLOUDINARY_CLOUD_NAME    = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
const CLOUDINARY_UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET;
const MAX_PHOTOS = 5;


async function uploadToCloudinary(file) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
  formData.append('folder', 'report_proofs');
  const res  = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`, {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) throw new Error('Image upload failed');
  const data = await res.json();
  return data.secure_url;
}

export default function ReportModal({
  open, onClose,
  reportType = 'user',
  reportedId, reportedName = '',
  extraData = {},
}) {
  const [reason,     setReason]     = useState('');
  const [details,    setDetails]    = useState('');
  const [proofFiles, setProofFiles] = useState([]);   // File[]
  const [proofPreviews, setProofPreviews] = useState([]); // object URL[]
  const [submitting, setSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const [done,       setDone]       = useState(false);
  const [error,      setError]      = useState('');
  const fileInputRef = useRef(null);

  if (!open) return null;

  const isUserReport   = reportType === 'user';
  const isReviewReport = reportType === 'review';
  const detailsRequired = !isReviewReport; // optional only for reviews
  const proofRequired = isUserReport;
  const showProofSection = isUserReport;

  const handleClose = () => {
    setReason(''); setDetails(''); setProofFiles([]);
    setProofPreviews([]); setError(''); setDone('');
    setUploadProgress('');
    onClose();
  };

  const handleFileChange = (e) => {
    const selected = Array.from(e.target.files || []);
    const allowed  = selected.filter(f => f.type.startsWith('image/'));
    const merged   = [...proofFiles, ...allowed].slice(0, 5);
    setProofFiles(merged);
    setProofPreviews(merged.map(f => URL.createObjectURL(f)));
    if (error) setError('');
    // Reset input so same file can be re-added after removal
    e.target.value = '';
  };

  const removePhoto = (idx) => {
    const next = proofFiles.filter((_, i) => i !== idx);
    setProofFiles(next);
    setProofPreviews(next.map(f => URL.createObjectURL(f)));
  };

  const handleSubmit = async () => {
    if (!reason) { setError('Please select a reason.'); return; }
    if (detailsRequired && !details.trim()) {
      setError('Please provide a reason of report.'); return;
    }
    if (proofRequired && proofFiles.length === 0) {
      setError('Please upload at least one photo as proof.'); return;
    }

    setError('');
    setSubmitting(true);

    try {
      const user         = auth.currentUser;
      const reporterName = user?.displayName || user?.email || 'Anonymous';

      // Upload all proof images to Cloudinary
      let proofUrls = [];
      if (proofFiles.length > 0) {
        setUploadProgress(`Uploading proof (0/${proofFiles.length})…`);
        proofUrls = await Promise.all(
          proofFiles.map(async (file, i) => {
            const url = await uploadToCloudinary(file);
            setUploadProgress(`Uploading proof (${i + 1}/${proofFiles.length})…`);
            return url;
          })
        );
        setUploadProgress('');
      }

      const reportRef = await addDoc(collection(db, 'reports'), {
        reportType,
        reportedId,
        reportedName,
        reporterId:   user?.uid || null,
        reporterName,
        reason,
        details:      details.trim() || null,
        proofUrls,
        ...extraData,
        status:    'pending',
        createdAt: serverTimestamp(),
      });

      setDone(true);

      try {
        await notifyAdminsOfReport({
          reportId: reportRef.id,
          reportType, reportedId, reportedName, reporterName, reason,
        });
      } catch (notifyErr) {
        console.warn('[ReportModal] Admin notification failed:', notifyErr);
      }
    } catch (err) {
      console.error('[ReportModal] ERROR:', err);
      setError(`Something went wrong: ${err?.message || 'unknown error'}`);
    } finally {
      setSubmitting(false);
      setUploadProgress('');
    }
  };

  const typeLabel = reportType === 'listing' ? 'listing' : reportType === 'review' ? 'review' : 'user';

  return (
    <div className={styles.overlay} onClick={e => e.target === e.currentTarget && handleClose()}>
      <div className={styles.modal}>
        {done ? (
          <div className={styles.successWrap}>
            <div className={styles.successIcon}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/><polyline points="9 12 12 15 16 9"/>
              </svg>
            </div>
            <h3 className={styles.successTitle}>Report Submitted</h3>
            <p className={styles.successMsg}>
              Thank you. Our admin team will review this {typeLabel} and the proof you provided.
            </p>
            <button className={styles.doneBtn} onClick={handleClose}>Done</button>
          </div>
        ) : (
          <>
            <div className={styles.header}>
              <div className={styles.headerIcon}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/>
                </svg>
              </div>
              <div>
                <h3 className={styles.title}>Report {typeLabel}</h3>
                {reportedName && <p className={styles.subtitle}>{reportedName}</p>}
              </div>
              <button className={styles.closeBtn} onClick={handleClose} aria-label="Close">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>

            <div className={styles.body}>
              <p className={styles.sectionLabel}>Why are you reporting this {typeLabel}?</p>
              <div className={styles.reasonList}>
                {REASONS.map(r => (
                  <button
                    key={r}
                    className={`${styles.reasonBtn} ${reason === r ? styles.reasonSelected : ''}`}
                    onClick={() => { setReason(r); if (error) setError(''); }}
                  >
                    <span className={styles.radioCircle}>{reason === r && <span className={styles.radioDot}/>}</span>
                    {r}
                  </button>
                ))}
              </div>

              <label className={styles.detailsLabel}>
                {isReviewReport ? 'Share your experience' : 'Reason of report'}{' '}
                {detailsRequired
                  ? <span className={styles.required}>(required)</span>
                  : <span className={styles.optional}>(optional)</span>
                }
              </label>
              <textarea
                className={`${styles.textarea} ${error && detailsRequired && !details.trim() ? styles.textareaError : ''}`}
                placeholder={isReviewReport ? 'Share your experience… (optional)' : 'Reason of report…'}
                value={details}
                onChange={e => { setDetails(e.target.value); if (error && e.target.value.trim()) setError(''); }}
                rows={3}
                maxLength={400}
              />
              <span className={styles.charCount}>{details.length}/400</span>

              {/* ── Upload proof (user reports only) ── */}
              {showProofSection && (
              <div style={{ marginTop: 16 }}>
                <label className={styles.detailsLabel} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <i className="fas fa-camera" style={{ color: '#6AA6DA', fontSize: '0.85rem' }} />
                  Upload proof{' '}
                  {proofRequired
                    ? <span className={styles.required}>(required — up to 5 photos)</span>
                    : <span className={styles.optional}>(optional — up to 5 photos)</span>
                  }
                </label>

                {/* Preview grid */}
                {proofPreviews.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, margin: '10px 0' }}>
                    {proofPreviews.map((src, idx) => (
                      <div key={idx} style={{ position: 'relative', width: 72, height: 72, borderRadius: 8, overflow: 'hidden', border: '1.5px solid #e2e8f0', flexShrink: 0 }}>
                        <img src={src} alt={`proof ${idx + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        <button
                          onClick={() => removePhoto(idx)}
                          style={{
                            position: 'absolute', top: 2, right: 2,
                            background: 'rgba(0,0,0,0.55)', border: 'none',
                            borderRadius: '50%', width: 20, height: 20,
                            color: '#fff', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: '0.7rem', lineHeight: 1,
                          }}
                          title="Remove"
                        >
                          <i className="fas fa-times" />
                        </button>
                      </div>
                    ))}
                    {proofFiles.length < 5 && (
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        style={{
                          width: 72, height: 72, borderRadius: 8,
                          border: '2px dashed #cbd5e1', background: '#f8fafc',
                          display: 'flex', flexDirection: 'column', alignItems: 'center',
                          justifyContent: 'center', gap: 4, cursor: 'pointer',
                          color: '#94a3b8', fontSize: '0.68rem', fontWeight: 600,
                        }}
                      >
                        <i className="fas fa-plus" style={{ fontSize: '1rem' }} />
                        Add
                      </button>
                    )}
                  </div>
                )}

                {proofFiles.length === 0 && (
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    style={{
                      marginTop: 8, width: '100%', padding: '14px',
                      border: '2px dashed #cbd5e1', borderRadius: 10,
                      background: '#f8fafc', cursor: 'pointer',
                      display: 'flex', flexDirection: 'column', alignItems: 'center',
                      gap: 6, color: '#64748b',
                    }}
                  >
                    <i className="fas fa-cloud-upload-alt" style={{ fontSize: '1.4rem', color: '#6AA6DA' }} />
                    <span style={{ fontSize: '0.82rem', fontWeight: 600 }}>Click to upload photos</span>
                    <span style={{ fontSize: '0.73rem', color: '#94a3b8' }}>JPG, PNG, WEBP · up to 5 photos</span>
                  </button>
                )}

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleFileChange}
                  style={{ display: 'none' }}
                />
              </div>
              )}

              {error && <p className={styles.errorMsg} style={{ marginTop: 10 }}>{error}</p>}
              {uploadProgress && (
                <p style={{ marginTop: 8, fontSize: '0.8rem', color: '#6AA6DA', fontWeight: 600 }}>
                  <i className="fas fa-spinner fa-spin" style={{ marginRight: 6 }} />{uploadProgress}
                </p>
              )}
            </div>

            <div className={styles.footer}>
              <button className={styles.cancelBtn} onClick={handleClose}>Cancel</button>
              <button className={styles.submitBtn} onClick={handleSubmit} disabled={submitting}>
                {submitting
                  ? <><span className={styles.spinner}/> {uploadProgress || 'Submitting…'}</>
                  : 'Submit Report'
                }
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}