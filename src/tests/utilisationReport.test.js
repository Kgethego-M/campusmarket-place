/**
 * utilisationReport.test.js
 * US20 — Trade Facility Utilisation Report
 *
 * Run: npx vitest src/tests/utilisationReport.test.js
 */

import { describe, it, expect } from "vitest";
import {
  buildUtilisationReport,
  getDayUtilisation,
  getWeekDates,
  formatDateLabel,
  utilisationLevel,
} from "../utils/utilisationReport.utils.js";

// ── Shared test config ────────────────────────────────────────────
const CONFIG = { openTime: "09:00", closeTime: "12:00", slotsPerHour: 2 };
// Slots: ["09:00 - 10:00", "10:00 - 11:00", "11:00 - 12:00"] × 2 capacity each

const DATES  = ["2026-04-22", "2026-04-23"];

// ── UAT: Given an admin views the facility report,
//         When all bookings for the week are loaded,
//         Then utilisation percentage is shown per day and time slot ──

describe("US20 – UAT: utilisation shown per day and time slot", () => {
  it("shows 50% utilisation for a slot with 1 of 2 bookings filled", () => {
    const bookings = [{ date: "2026-04-22", timeSlot: "09:00 - 10:00" }];
    const report   = buildUtilisationReport(bookings, CONFIG, DATES);
    expect(report["2026-04-22"]["09:00 - 10:00"].utilisation).toBe(50);
  });

  it("shows 100% utilisation when slot is fully booked", () => {
    const bookings = [
      { date: "2026-04-22", timeSlot: "10:00 - 11:00" },
      { date: "2026-04-22", timeSlot: "10:00 - 11:00" },
    ];
    const report = buildUtilisationReport(bookings, CONFIG, DATES);
    expect(report["2026-04-22"]["10:00 - 11:00"].utilisation).toBe(100);
  });

  it("shows 0% for a slot with no bookings", () => {
    const report = buildUtilisationReport([], CONFIG, DATES);
    expect(report["2026-04-22"]["09:00 - 10:00"].utilisation).toBe(0);
  });

  it("produces a report entry for every date in the range", () => {
    const report = buildUtilisationReport([], CONFIG, DATES);
    expect(Object.keys(report)).toEqual(DATES);
  });

  it("produces a report entry for every time slot within each day", () => {
    const report = buildUtilisationReport([], CONFIG, DATES);
    const slots  = Object.keys(report["2026-04-22"]);
    expect(slots).toEqual(["09:00 - 10:00", "10:00 - 11:00", "11:00 - 12:00"]);
  });
});

// ── buildUtilisationReport ────────────────────────────────────────
describe("buildUtilisationReport", () => {
  it("ignores bookings outside the requested date range", () => {
    const bookings = [{ date: "2026-05-01", timeSlot: "09:00 - 10:00" }];
    const report   = buildUtilisationReport(bookings, CONFIG, DATES);
    expect(report["2026-05-01"]).toBeUndefined();
    expect(report["2026-04-22"]["09:00 - 10:00"].booked).toBe(0);
  });

  it("ignores bookings for slots outside the facility hours", () => {
    const bookings = [{ date: "2026-04-22", timeSlot: "17:00 - 18:00" }];
    const report   = buildUtilisationReport(bookings, CONFIG, DATES);
    // report for that date should only have 3 slots, all with 0 bookings
    const totalBooked = Object.values(report["2026-04-22"])
      .reduce((s, c) => s + c.booked, 0);
    expect(totalBooked).toBe(0);
  });

  it("returns empty object when dates array is empty", () => {
    const report = buildUtilisationReport([], CONFIG, []);
    expect(report).toEqual({});
  });

  it("returns empty object when config is null", () => {
    const report = buildUtilisationReport([], null, DATES);
    expect(report).toEqual({});
  });

  it("stores booked count and capacity separately", () => {
    const bookings = [{ date: "2026-04-22", timeSlot: "11:00 - 12:00" }];
    const report   = buildUtilisationReport(bookings, CONFIG, DATES);
    const cell     = report["2026-04-22"]["11:00 - 12:00"];
    expect(cell.booked).toBe(1);
    expect(cell.capacity).toBe(2);
  });
});

// ── getDayUtilisation ─────────────────────────────────────────────
describe("getDayUtilisation", () => {
  it("returns 0 for a day with no bookings", () => {
    const report = buildUtilisationReport([], CONFIG, ["2026-04-22"]);
    expect(getDayUtilisation(report["2026-04-22"])).toBe(0);
  });

  it("returns correct overall % when some slots are partially filled", () => {
    // 1 booking out of 6 total capacity (3 slots × 2) = 16.6% → 17%
    const bookings = [{ date: "2026-04-22", timeSlot: "09:00 - 10:00" }];
    const report   = buildUtilisationReport(bookings, CONFIG, ["2026-04-22"]);
    expect(getDayUtilisation(report["2026-04-22"])).toBe(17);
  });

  it("returns 100 when every slot is fully booked", () => {
    const bookings = [
      { date: "2026-04-22", timeSlot: "09:00 - 10:00" },
      { date: "2026-04-22", timeSlot: "09:00 - 10:00" },
      { date: "2026-04-22", timeSlot: "10:00 - 11:00" },
      { date: "2026-04-22", timeSlot: "10:00 - 11:00" },
      { date: "2026-04-22", timeSlot: "11:00 - 12:00" },
      { date: "2026-04-22", timeSlot: "11:00 - 12:00" },
    ];
    const report = buildUtilisationReport(bookings, CONFIG, ["2026-04-22"]);
    expect(getDayUtilisation(report["2026-04-22"])).toBe(100);
  });

  it("returns 0 for null input", () => {
    expect(getDayUtilisation(null)).toBe(0);
  });
});

// ── getWeekDates ──────────────────────────────────────────────────
describe("getWeekDates", () => {
  it("returns exactly 7 dates", () => {
    expect(getWeekDates("2026-04-22")).toHaveLength(7);
  });

  it("starts on the given date", () => {
    const dates = getWeekDates("2026-04-22");
    expect(dates[0]).toBe("2026-04-22");
  });

  it("ends 6 days after the start", () => {
    const dates = getWeekDates("2026-04-22");
    expect(dates[6]).toBe("2026-04-28");
  });

  it("returns empty array for null input", () => {
    expect(getWeekDates(null)).toEqual([]);
  });
});

// ── utilisationLevel ──────────────────────────────────────────────
describe("utilisationLevel", () => {
  it("returns 'low' for 0%",  () => expect(utilisationLevel(0)).toBe("low"));
  it("returns 'low' for 49%", () => expect(utilisationLevel(49)).toBe("low"));
  it("returns 'mid' for 50%", () => expect(utilisationLevel(50)).toBe("mid"));
  it("returns 'mid' for 79%", () => expect(utilisationLevel(79)).toBe("mid"));
  it("returns 'high' for 80%",  () => expect(utilisationLevel(80)).toBe("high"));
  it("returns 'high' for 100%", () => expect(utilisationLevel(100)).toBe("high"));
});

// ── formatDateLabel ───────────────────────────────────────────────
describe("formatDateLabel", () => {
  it("returns a non-empty string for a valid date", () => {
    expect(formatDateLabel("2026-04-22").length).toBeGreaterThan(0);
  });

  it("returns empty string for null", () => {
    expect(formatDateLabel(null)).toBe("");
  });
});
