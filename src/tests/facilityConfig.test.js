/**
 * facilityConfig.test.js
 *
 * US12 — Configure Facility Hours and Capacity
 * Tests for slot availability logic (TDD).
 *
 * Run with:  npx vitest  or  npx jest
 */

import { describe, it, expect } from "vitest";
import {
    generateTimeSlots,
    isSlotAvailable,
    validateFacilityConfig,
    getTotalCapacity,
} from "../utils/facilityConfig.utils";

// ─────────────────────────────────────────────────────────────
// generateTimeSlots
// ─────────────────────────────────────────────────────────────
describe("generateTimeSlots", () => {
    it("generates correct slots between 09:00 and 16:00", () => {
        const slots = generateTimeSlots("09:00", "16:00");
        expect(slots).toEqual([
            "09:00 - 10:00",
            "10:00 - 11:00",
            "11:00 - 12:00",
            "12:00 - 13:00",
            "13:00 - 14:00",
            "14:00 - 15:00",
            "15:00 - 16:00",
        ]);
    });

    it("returns exactly (closeHour - openHour) slots", () => {
        const slots = generateTimeSlots("08:00", "12:00");
        expect(slots).toHaveLength(4);
    });

    it("returns an empty array when openTime equals closeTime", () => {
        expect(generateTimeSlots("10:00", "10:00")).toEqual([]);
    });

    it("returns an empty array when openTime is after closeTime", () => {
        expect(generateTimeSlots("17:00", "09:00")).toEqual([]);
    });

    it("returns an empty array when either argument is missing", () => {
        expect(generateTimeSlots("", "16:00")).toEqual([]);
        expect(generateTimeSlots("09:00", "")).toEqual([]);
        expect(generateTimeSlots(null, null)).toEqual([]);
    });
});

// ─────────────────────────────────────────────────────────────
// isSlotAvailable  (the UAT from US12)
// ─────────────────────────────────────────────────────────────
describe("isSlotAvailable", () => {
    const config = { openTime: "09:00", closeTime: "16:00", slotsPerHour: 1 };

    // ── Core UAT ──────────────────────────────────────────────
    // Given admin updates facility to close at 16:00,
    // When a student tries to book a 17:00 slot,
    // Then the slot is NOT available.
    it("UAT: rejects a 17:00 slot when facility closes at 16:00", () => {
        expect(isSlotAvailable(config, "17:00 - 18:00")).toBe(false);
    });

    it("accepts a slot that falls within operating hours", () => {
        expect(isSlotAvailable(config, "09:00 - 10:00")).toBe(true);
        expect(isSlotAvailable(config, "13:00 - 14:00")).toBe(true);
        expect(isSlotAvailable(config, "15:00 - 16:00")).toBe(true);
    });

    it("rejects the closing-hour slot itself (16:00 - 17:00)", () => {
        expect(isSlotAvailable(config, "16:00 - 17:00")).toBe(false);
    });

    it("rejects a slot before opening time", () => {
        expect(isSlotAvailable(config, "08:00 - 09:00")).toBe(false);
    });

    it("returns false when config is null", () => {
        expect(isSlotAvailable(null, "10:00 - 11:00")).toBe(false);
    });

    it("returns false when requestedSlot is empty", () => {
        expect(isSlotAvailable(config, "")).toBe(false);
    });

    it("reflects a config change — closing at 12:00 blocks afternoon slots", () => {
        const shorterConfig = { openTime: "09:00", closeTime: "12:00", slotsPerHour: 1 };
        expect(isSlotAvailable(shorterConfig, "12:00 - 13:00")).toBe(false);
        expect(isSlotAvailable(shorterConfig, "11:00 - 12:00")).toBe(true);
    });
});

// ─────────────────────────────────────────────────────────────
// validateFacilityConfig
// ─────────────────────────────────────────────────────────────
describe("validateFacilityConfig", () => {
    it("returns valid for a well-formed config", () => {
        expect(
            validateFacilityConfig({ openTime: "09:00", closeTime: "16:00", slotsPerHour: 2 })
        ).toEqual({ valid: true });
    });

    it("rejects a config with no openTime", () => {
        const result = validateFacilityConfig({ closeTime: "16:00", slotsPerHour: 1 });
        expect(result.valid).toBe(false);
        expect(result.error).toMatch(/open time/i);
    });

    it("rejects a config with no closeTime", () => {
        const result = validateFacilityConfig({ openTime: "09:00", slotsPerHour: 1 });
        expect(result.valid).toBe(false);
        expect(result.error).toMatch(/close time/i);
    });

    it("rejects when openTime >= closeTime", () => {
        const result = validateFacilityConfig({ openTime: "16:00", closeTime: "09:00", slotsPerHour: 1 });
        expect(result.valid).toBe(false);
        expect(result.error).toMatch(/before/i);
    });

    it("rejects equal open and close times", () => {
        const result = validateFacilityConfig({ openTime: "10:00", closeTime: "10:00", slotsPerHour: 1 });
        expect(result.valid).toBe(false);
    });

    it("rejects missing slotsPerHour", () => {
        const result = validateFacilityConfig({ openTime: "09:00", closeTime: "16:00" });
        expect(result.valid).toBe(false);
        expect(result.error).toMatch(/slots per hour/i);
    });

    it("rejects slotsPerHour of 0", () => {
        const result = validateFacilityConfig({ openTime: "09:00", closeTime: "16:00", slotsPerHour: 0 });
        expect(result.valid).toBe(false);
    });

    it("rejects slotsPerHour greater than 4", () => {
        const result = validateFacilityConfig({ openTime: "09:00", closeTime: "16:00", slotsPerHour: 5 });
        expect(result.valid).toBe(false);
    });

    it("rejects a null config", () => {
        expect(validateFacilityConfig(null).valid).toBe(false);
    });
});

// ─────────────────────────────────────────────────────────────
// getTotalCapacity
// ─────────────────────────────────────────────────────────────
describe("getTotalCapacity", () => {
    it("calculates capacity: 7 slots × 2 per hour = 14", () => {
        expect(
            getTotalCapacity({ openTime: "09:00", closeTime: "16:00", slotsPerHour: 2 })
        ).toBe(14);
    });

    it("calculates capacity: 4 slots × 1 per hour = 4", () => {
        expect(
            getTotalCapacity({ openTime: "08:00", closeTime: "12:00", slotsPerHour: 1 })
        ).toBe(4);
    });

    it("returns 0 for a null config", () => {
        expect(getTotalCapacity(null)).toBe(0);
    });
});
