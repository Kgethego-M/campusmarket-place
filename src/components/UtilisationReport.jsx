/**
 * UtilisationReport.jsx
 * US20 — Trade Facility Utilisation Report
 */

import { useState, useEffect } from "react";
import { db } from "../firebase.js";
import { collection, query, where, getDocs, doc, getDoc } from "firebase/firestore";
import { generateTimeSlots } from "../utils/facilityConfig.utils.js";
import {
  buildUtilisationReport,
  getDayUtilisation,
  getWeekDates,
  formatDateLabel,
  utilisationLevel,
} from "../utils/utilisationReport.utils.js";
import styles from "./UtilisationReport.module.css";

const FALLBACK_CONFIG = { openTime: "09:00", closeTime: "16:00", slotsPerHour: 1 };

// Monday of the week containing `date`
function getMondayOf(date) {
  const d   = new Date(date);
  const day = d.getDay(); // 0 Sun … 6 Sat
  const diff = (day === 0 ? -6 : 1 - day);
  d.setDate(d.getDate() + diff);
  return d.toISOString().split("T")[0];
}

export default function UtilisationReport() {
  const today        = new Date().toISOString().split("T")[0];
  const [weekStart,  setWeekStart]  = useState(getMondayOf(today));
  const [config,     setConfig]     = useState(FALLBACK_CONFIG);
  const [report,     setReport]     = useState({});
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState("");

  // Load facility config once
  useEffect(() => {
    (async () => {
      try {
        const snap = await getDoc(doc(db, "facilityConfig", "default"));
        if (snap.exists()) {
          const d = snap.data();
          setConfig({
            openTime:     d.openTime     ?? FALLBACK_CONFIG.openTime,
            closeTime:    d.closeTime    ?? FALLBACK_CONFIG.closeTime,
            slotsPerHour: d.slotsPerHour ?? FALLBACK_CONFIG.slotsPerHour,
          });
        }
      } catch (err) {
        console.warn("Could not load facility config:", err.message);
      }
    })();
  }, []);

  // Load bookings whenever weekStart or config changes
  useEffect(() => {
    const dates = getWeekDates(weekStart);

    (async () => {
      setLoading(true);
      setError("");
      try {
        const snap = await getDocs(
          query(
            collection(db, "bookings"),
            where("date", ">=", dates[0]),
            where("date", "<=", dates[6]),
          )
        );

        const bookings = snap.docs.map(d => ({
          date:     d.data().date,
          timeSlot: d.data().timeSlot,
        }));

        setReport(buildUtilisationReport(bookings, config, dates));
      } catch (err) {
        console.error(err);
        setError("Failed to load booking data: " + err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [weekStart, config]);

  function shiftWeek(delta) {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + delta * 7);
    setWeekStart(d.toISOString().split("T")[0]);
  }

  const dates = getWeekDates(weekStart);
  const slots = generateTimeSlots(config.openTime, config.closeTime);

  return (
    <div className={styles.wrap}>

      {/* ── Header ── */}
      <div className={styles.header}>
        <div>
          <h2 className={styles.title}>Facility Utilisation Report</h2>
          <p className={styles.subtitle}>
            Slot bookings vs capacity · {config.slotsPerHour} booking{config.slotsPerHour !== 1 ? "s" : ""} per slot
          </p>
        </div>

        {/* Week navigator */}
        <div className={styles.weekNav}>
          <button className={styles.navBtn} onClick={() => shiftWeek(-1)} title="Previous week">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" strokeWidth="2">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
          </button>
          <span className={styles.weekLabel}>
            {formatDateLabel(dates[0])} – {formatDateLabel(dates[6])}
          </span>
          <button className={styles.navBtn} onClick={() => shiftWeek(1)} title="Next week">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" strokeWidth="2">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
          </button>
        </div>
      </div>

      {/* ── Legend ── */}
      <div className={styles.legend}>
        <span className={`${styles.legendDot} ${styles.low}`}  /> Low (&lt;50%)
        <span className={`${styles.legendDot} ${styles.mid}`}  /> Medium (50–79%)
        <span className={`${styles.legendDot} ${styles.high}`} /> High (≥80%)
      </div>

      {/* ── Error ── */}
      {error && <p className={styles.errorMsg}>{error}</p>}

      {/* ── Table ── */}
      <div className={styles.tableWrap}>
        {loading ? (
          <div className={styles.loadingGrid}>
            {Array.from({ length: 21 }).map((_, i) => (
              <div key={i} className={`${styles.shimmerCell}`} />
            ))}
          </div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.slotHeader}>Time Slot</th>
                {dates.map(date => {
                  const dayPct = getDayUtilisation(report[date]);
                  const level  = utilisationLevel(dayPct);
                  return (
                    <th key={date} className={styles.dayHeader}>
                      <span className={styles.dayName}>{formatDateLabel(date)}</span>
                      <span className={`${styles.dayBadge} ${styles[level]}`}>
                        {dayPct}%
                      </span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {slots.map(slot => (
                <tr key={slot} className={styles.row}>
                  <td className={styles.slotCell}>{slot}</td>
                  {dates.map(date => {
                    const cell  = report[date]?.[slot] ?? { booked: 0, capacity: config.slotsPerHour, utilisation: 0 };
                    const level = utilisationLevel(cell.utilisation);
                    return (
                      <td key={date} className={`${styles.cell} ${styles[`cell_${level}`]}`}>
                        <span className={styles.pct}>{cell.utilisation}%</span>
                        <span className={styles.fraction}>
                          {cell.booked}/{cell.capacity}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Summary cards ── */}
      {!loading && (
        <div className={styles.summaryRow}>
          {dates.map(date => {
            const dayPct = getDayUtilisation(report[date]);
            const level  = utilisationLevel(dayPct);
            const totalBooked = Object.values(report[date] ?? {})
              .reduce((s, c) => s + c.booked, 0);
            const totalCap = slots.length * config.slotsPerHour;
            return (
              <div key={date} className={`${styles.summaryCard} ${styles[`card_${level}`]}`}>
                <p className={styles.summaryDate}>{formatDateLabel(date)}</p>
                <p className={styles.summaryPct}>{dayPct}%</p>
                <p className={styles.summaryDetail}>{totalBooked} / {totalCap} bookings</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
