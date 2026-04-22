/**
 * facilityConfig.utils.js
 * Pure utility functions for trade facility operating hours & slot availability.
 * These are framework-agnostic so they can be tested without Firebase/React.
 */

/**
 * Generate all hourly time-slot strings (e.g. "09:00 - 10:00")
 * between openTime and closeTime (both "HH:MM" strings, 24-hour).
 *
 * @param {string} openTime   - e.g. "09:00"
 * @param {string} closeTime  - e.g. "16:00"
 * @returns {string[]}        - ordered array of slot strings
 */
export function generateTimeSlots(openTime, closeTime) {
    if (!openTime || !closeTime) return [];

    const [openH]  = openTime.split(":").map(Number);
    const [closeH] = closeTime.split(":").map(Number);

    if (isNaN(openH) || isNaN(closeH)) return [];
    if (openH >= closeH) return [];

    const slots = [];
    for (let h = openH; h < closeH; h++) {
        const start = String(h).padStart(2, "0") + ":00";
        const end   = String(h + 1).padStart(2, "0") + ":00";
        slots.push(`${start} - ${end}`);
    }
    return slots;
}

/**
 * Given a facility config and a requested time slot string,
 * return whether that slot falls within operating hours.
 *
 * @param {{ openTime: string, closeTime: string }} config
 * @param {string} requestedSlot - e.g. "17:00 - 18:00"
 * @returns {boolean}
 */
export function isSlotAvailable(config, requestedSlot) {
    if (!config || !requestedSlot) return false;

    const validSlots = generateTimeSlots(config.openTime, config.closeTime);
    return validSlots.includes(requestedSlot);
}

/**
 * Validate a facility config object before saving to Firestore.
 *
 * @param {{ openTime: string, closeTime: string, slotsPerHour: number }} config
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateFacilityConfig(config) {
    if (!config) return { valid: false, error: "No config provided" };

    const { openTime, closeTime, slotsPerHour } = config;

    if (!openTime)  return { valid: false, error: "Missing open time" };
    if (!closeTime) return { valid: false, error: "Missing close time" };

    const [openH]  = openTime.split(":").map(Number);
    const [closeH] = closeTime.split(":").map(Number);

    if (isNaN(openH)  || openH  < 0 || openH  > 23)
        return { valid: false, error: "Invalid open time" };
    if (isNaN(closeH) || closeH < 0 || closeH > 23)
        return { valid: false, error: "Invalid close time" };
    if (openH >= closeH)
        return { valid: false, error: "Open time must be before close time" };

    if (slotsPerHour === undefined || slotsPerHour === null)
        return { valid: false, error: "Missing slots per hour" };
    if (!Number.isInteger(slotsPerHour) || slotsPerHour < 1 || slotsPerHour > 4)
        return { valid: false, error: "Slots per hour must be an integer between 1 and 4" };

    return { valid: true };
}

/**
 * Return the total booking capacity for a given config
 * (number of slots × slotsPerHour, i.e. max concurrent bookings per slot).
 *
 * @param {{ openTime: string, closeTime: string, slotsPerHour: number }} config
 * @returns {number}
 */
export function getTotalCapacity(config) {
    if (!config) return 0;
    const slots = generateTimeSlots(config.openTime, config.closeTime);
    return slots.length * (config.slotsPerHour || 1);
}
