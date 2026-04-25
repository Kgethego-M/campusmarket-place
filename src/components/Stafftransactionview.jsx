import { useState, useEffect } from "react";
import { db } from "../firebase.js";
import { doc, getDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import styles from "./StaffTransactionView.module.css";

/**
 * US15 – Staff Confirm Cash Shortfall Settled
 *
 * Shows the outstanding cash amount on the staff transaction view,
 * provides a "Confirm Cash Received" button that is locked until the
 * item is physically present, and updates Firestore to "Fully Paid"
 * on confirmation + release.
 *
 * Props
 * ─────
 * @prop {string}   transactionId  — Firestore document ID under "transactions/"
 * @prop {function} onReleased     — optional callback fired after release
 *
 * Expected Firestore document shape
 * ──────────────────────────────────
 * {
 *   buyerName:      string,
 *   sellerName:     string,
 *   itemTitle:      string,
 *   totalAmount:    number,   // full price agreed
 *   cashShortfall:  number,   // outstanding cash amount (0 if none)
 *   paymentStatus:  string,   // "Pending" | "Partially Paid" | "Fully Paid"
 * }
 */
export default function StaffTransactionView({ transactionId, onReleased }) {
    const [transaction, setTransaction] = useState(null);
    const [loading, setLoading]         = useState(true);
    const [error, setError]             = useState(null);

    // UI state
    const [itemPresent, setItemPresent]   = useState(false);
    const [cashConfirmed, setCashConfirmed] = useState(false);
    const [releasing, setReleasing]       = useState(false);
    const [released, setReleased]         = useState(false);

    /* ── Fetch transaction ── */
    useEffect(() => {
        if (!transactionId) return;

        const fetch_ = async () => {
            try {
                setLoading(true);
                const ref  = doc(db, "transactions", transactionId);
                const snap = await getDoc(ref);
                if (!snap.exists()) {
                    setError("Transaction not found.");
                } else {
                    const data = { id: snap.id, ...snap.data() };
                    setTransaction(data);
                    if (data.paymentStatus === "Fully Paid") {
                        setCashConfirmed(true);
                        setReleased(true);
                    }
                }
            } catch (err) {
                setError("Failed to load transaction.");
                console.error(err);
            } finally {
                setLoading(false);
            }
        };

        fetch_();
    }, [transactionId]);

    /* ── Derived booleans ── */
    const shortfall    = transaction?.cashShortfall ?? 0;
    const hasShortfall = shortfall > 0;

    // "Confirm Cash Received" is clickable only when:
    //   • item is physically present (checkbox ticked)
    //   • there IS a shortfall to confirm
    //   • staff haven't already confirmed it
    const canConfirmCash = itemPresent && hasShortfall && !cashConfirmed;

    // "Release Item" is clickable only when:
    //   • item is physically present
    //   • shortfall is either zero OR already confirmed by staff
    //   • item hasn't been released yet
    const canRelease = itemPresent && (!hasShortfall || cashConfirmed) && !released;

    /* ── Handlers ── */
    function handleConfirmCash() {
        setCashConfirmed(true);
    }

    async function handleRelease() {
        if (!canRelease) return;
        setReleasing(true);
        try {
            const ref = doc(db, "transactions", transactionId);
            await updateDoc(ref, {
                paymentStatus: "Fully Paid",
                cashShortfall: 0,
                releasedAt:       serverTimestamp(),
                releasedByStaff:  true,
            });
            setReleased(true);
            setTransaction((prev) => ({
                ...prev,
                paymentStatus: "Fully Paid",
                cashShortfall: 0,
            }));
            onReleased?.();
        } catch (err) {
            setError("Failed to update transaction. Please try again.");
            console.error(err);
        } finally {
            setReleasing(false);
        }
    }

    /* ── Render: loading ── */
    if (loading) {
        return (
            <div className={styles.card}>
                <div className={styles.skeleton} />
                <div className={`${styles.skeleton} ${styles.skeletonShort}`} />
                <div className={`${styles.skeleton} ${styles.skeletonShort}`} />
            </div>
        );
    }

    /* ── Render: error ── */
    if (error) {
        return (
            <div className={`${styles.card} ${styles.errorCard}`}>
                <span className={styles.errorIcon}>⚠</span>
                <p className={styles.errorText}>{error}</p>
            </div>
        );
    }

    if (!transaction) return null;

    const { buyerName, sellerName, itemTitle, totalAmount, paymentStatus } = transaction;

    return (
        <div className={styles.card}>

            {/* ── Header ── */}
            <div className={styles.header}>
                <div>
                    <h2 className={styles.itemTitle}>{itemTitle ?? "Unnamed Item"}</h2>
                    <p className={styles.meta}>
                        Buyer: <strong>{buyerName}</strong>
                        {" → "}
                        Seller: <strong>{sellerName}</strong>
                    </p>
                </div>
                <StatusBadge status={paymentStatus} released={released} />
            </div>

            <hr className={styles.divider} />

            {/* ── Financial summary ── */}
            <div className={styles.financials}>
                <FinancialRow label="Total Amount" value={totalAmount} />
                <FinancialRow
                    label="Outstanding Cash"
                    value={shortfall}
                    highlight={hasShortfall && !cashConfirmed}
                    strikethrough={cashConfirmed && hasShortfall}
                />
            </div>

            {/* ── Shortfall warning banner ── */}
            {hasShortfall && !cashConfirmed && (
                <div className={styles.shortfallBanner}>
                    <span className={styles.shortfallIcon}>💰</span>
                    <p>
                        Outstanding cash shortfall of{" "}
                        <strong>R{shortfall.toFixed(2)}</strong>. Collect from
                        buyer before releasing the item.
                    </p>
                </div>
            )}

            {/* ── Cash confirmed confirmation ── */}
            {cashConfirmed && hasShortfall && (
                <div className={styles.confirmedBanner}>
                    ✓ Cash of <strong>R{shortfall.toFixed(2)}</strong> confirmed received.
                </div>
            )}

            <hr className={styles.divider} />

            {/* ── Item presence checkbox (hidden after release) ── */}
            {!released && (
                <label className={styles.checkRow}>
                    <input
                        type="checkbox"
                        className={styles.checkbox}
                        checked={itemPresent}
                        onChange={(e) => setItemPresent(e.target.checked)}
                    />
                    <span>Item is physically present and ready for handover</span>
                </label>
            )}

            {/* ── Action buttons ── */}
            {!released && (
                <div className={styles.actions}>
                    {/* Only show if there is a shortfall */}
                    {hasShortfall && (
                        <button
                            className={styles.confirmBtn}
                            disabled={!canConfirmCash}
                            onClick={handleConfirmCash}
                            title={
                                !itemPresent
                                    ? "Tick 'item present' first"
                                    : cashConfirmed
                                    ? "Cash already confirmed"
                                    : "Confirm you have received the cash shortfall"
                            }
                        >
                            {cashConfirmed ? "✓ Cash Received" : "Confirm Cash Received"}
                        </button>
                    )}

                    <button
                        className={styles.releaseBtn}
                        disabled={!canRelease || releasing}
                        onClick={handleRelease}
                        title={
                            !itemPresent
                                ? "Tick 'item present' first"
                                : hasShortfall && !cashConfirmed
                                ? "Confirm cash received first"
                                : "Release item to buyer"
                        }
                    >
                        {releasing ? "Releasing…" : "Release Item"}
                    </button>
                </div>
            )}

            {/* ── Released confirmation ── */}
            {released && (
                <div className={styles.releasedBanner}>
                    🎉 Item released. Transaction marked <strong>Fully Paid</strong>.
                </div>
            )}
        </div>
    );
}

/* ── Sub-components ──────────────────────────────────────────────── */

function StatusBadge({ status, released }) {
    const label = released ? "Fully Paid" : (status ?? "Pending");
    const cls =
        label === "Fully Paid"   ? styles.badgeGreen :
        label === "Partially Paid" ? styles.badgeAmber :
        styles.badgeGrey;

    return <span className={`${styles.badge} ${cls}`}>{label}</span>;
}

function FinancialRow({ label, value, highlight, strikethrough }) {
    const valueClass = [
        styles.financialValue,
        highlight    ? styles.highlight    : "",
        strikethrough ? styles.strikethrough : "",
    ].filter(Boolean).join(" ");

    return (
        <div className={styles.financialRow}>
            <span className={styles.financialLabel}>{label}</span>
            <span className={valueClass}>R{(value ?? 0).toFixed(2)}</span>
        </div>
    );
}