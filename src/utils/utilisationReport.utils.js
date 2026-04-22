/**
 * utilisationReport.utils.js
 * Pure functions for US20 — Trade Facility Utilisation Report
 */

import { generateTimeSlots } from "./facilityConfig.utils.js";

/**
 * Given raw booking docs and facility config, build a report structure:
 * {
 *   [date]: {
 *     [slot]: { booked: number, capacity: number, utilisation: number }
 *   }
 * }
 *
 * @param {Array<{date: string, timeSlot: string}>} bookings
 * @param {{ openTime: string, closeTime: string, slotsPerHour: number }} config
 * @param {string[]} dates  — the date range to include (YYYY-MM-DD strings)
 * @returns {Object}
 */
export function buildUtilisationReport(bookings, config, dates) {
  if (!config || !dates || dates.length === 0) return {};

  const slots = generateTimeSlots(config.openTime, config.closeTime);
  const capacity = config.slotsPerHour;

  // Initialise every date+slot with 0 bookings
  const report = {};
  for (const date of dates) {
    report[date] = {};
    for (const slot of slots) {
      report[date][slot] = { booked: 0, capacity, utilisation: 0 };
    }
  }

  // Tally actual bookings
  for (const b of bookings) {
    if (report[b.date] && report[b.date][b.timeSlot] !== undefined) {
      report[b.date][b.timeSlot].booked += 1;
    }
  }

  // Calculate utilisation %
  for (const date of dates) {
    for (const slot of slots) {
      const cell = report[date][slot];
      cell.utilisation = capacity > 0
        ? Math.round((cell.booked / capacity) * 100)
        : 0;
    }
  }

  return report;
}

/**
 * Calculate the overall utilisation % for a single day across all slots.
 * @param {{ [slot]: { booked, capacity } }} dayReport
 * @returns {number} 0-100
 */
export function getDayUtilisation(dayReport) {
  if (!dayReport) return 0;
  const slots = Object.values(dayReport);
  if (slots.length === 0) return 0;

  const totalBooked   = slots.reduce((s, c) => s + c.booked,   0);
  const totalCapacity = slots.reduce((s, c) => s + c.capacity, 0);

  return totalCapacity > 0 ? Math.round((totalBooked / totalCapacity) * 100) : 0;
}

/**
 * Return the 7 calendar dates starting from (and including) startDate.
 * @param {string} startDate  YYYY-MM-DD
 * @returns {string[]}
 */
export function getWeekDates(startDate) {
  if (!startDate) return [];
  const dates = [];
  const base  = new Date(startDate);
  for (let i = 0; i < 7; i++) {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    dates.push(d.toISOString().split("T")[0]);
  }
  return dates;
}

/**
 * Format a YYYY-MM-DD string to a short human label e.g. "Mon 22 Apr"
 * @param {string} dateStr
 * @returns {string}
 */
export function formatDateLabel(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-ZA", {
    weekday: "short",
    day:     "numeric",
    month:   "short",
  });
}

/**
 * Return a CSS-friendly colour token based on utilisation %.
 * 0-49  → "low"  (green)
 * 50-79 → "mid"  (amber)
 * 80+   → "high" (red)
 * @param {number} pct
 * @returns {"low"|"mid"|"high"}
 */
export function utilisationLevel(pct) {
  if (pct >= 80) return "high";
  if (pct >= 50) return "mid";
  return "low";
}
