/**
 * Time slot helpers: parse "HH:mm", generate slots between start and end,
 * and check if a slot is in the past.
 * 
 * Slot duration is configured in minutes. Currently: 10 minutes
 * → 6 slots لكل ساعة (00، 10، 20، 30، 40، 50).
 */

const SLOT_DURATION_MINUTES = 10;

/**
 * Parse "HH:mm" to minutes since midnight.
 * @param {string} timeStr - e.g. "10:00"
 * @returns {number} minutes since midnight, or NaN if invalid
 */
function parseTimeToMinutes(timeStr) {
    if (!timeStr || typeof timeStr !== 'string') return NaN;
    const parts = timeStr.trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!parts) return NaN;
    const h = parseInt(parts[1], 10);
    const m = parseInt(parts[2], 10);
    if (h < 0 || h > 23 || m < 0 || m > 59) return NaN;
    return h * 60 + m;
}

/**
 * Format minutes since midnight to "HH:mm".
 * @param {number} minutes
 * @returns {string}
 */
function minutesToTimeStr(minutes) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Generate slots between startTime and endTime (end exclusive).
 * @param {string} startTime - e.g. "10:00"
 * @param {string} endTime - e.g. "18:00"
 * @returns {string[]} e.g. ["10:00", "10:10", "10:20", ...]
 */
function generateSlots(startTime, endTime) {
    const startMin = parseTimeToMinutes(startTime);
    const endMin = parseTimeToMinutes(endTime);
    if (Number.isNaN(startMin) || Number.isNaN(endMin) || startMin >= endMin) return [];
    const slots = [];
    for (let m = startMin; m < endMin; m += SLOT_DURATION_MINUTES) {
        slots.push(minutesToTimeStr(m));
    }
    return slots;
}

/**
 * Check if the given date + timeSlot is in the past (compared to now).
 * Uses local date/time interpretation: date is YYYY-MM-DD, timeSlot is HH:mm.
 * @param {string} dateStr - YYYY-MM-DD
 * @param {string} timeSlot - HH:mm
 * @param {Date} [now=new Date()]
 * @returns {boolean}
 */
function isSlotInPast(dateStr, timeSlot, now = new Date()) {
    const slotMin = parseTimeToMinutes(timeSlot);
    if (Number.isNaN(slotMin)) return true;
    const d = new Date(dateStr + 'T00:00:00');
    const slotDate = new Date(d);
    slotDate.setHours(Math.floor(slotMin / 60), slotMin % 60, 0, 0);
    return slotDate.getTime() <= now.getTime();
}

/**
 * Filter slots to only those not in the past for the given date.
 * @param {string} dateStr - YYYY-MM-DD
 * @param {string[]} slots - ["10:00", "11:00", ...]
 * @param {Date} [now=new Date()]
 * @returns {string[]}
 */
function filterOutPastSlots(dateStr, slots, now = new Date()) {
    const today = now.toISOString().slice(0, 10);
    if (dateStr < today) return [];
    if (dateStr > today) return slots;
    return slots.filter(slot => !isSlotInPast(dateStr, slot, now));
}

/**
 * Get the 10-minute slot (HH:mm) that a given Date falls into (round down).
 * Used to treat appointmentDate-based bookings as occupying a slot.
 * @param {Date} date - appointment date/time
 * @returns {string} e.g. "13:00" or "13:10"
 */
function dateToSlotString(date) {
    if (!date || !(date instanceof Date) || Number.isNaN(date.getTime())) return null;
    const totalMinutes = date.getHours() * 60 + date.getMinutes();
    const slotMinutes = Math.floor(totalMinutes / SLOT_DURATION_MINUTES) * SLOT_DURATION_MINUTES;
    return minutesToTimeStr(slotMinutes);
}

/**
 * Normalize user input to "HH:mm" (24h) for comparison with available_slots.
 * @param {string} str - e.g. "9:05" or "09:05"
 * @returns {string|null}
 */
function normalizeTimeSlot(str) {
    if (!str || typeof str !== 'string') return null;
    const parts = String(str).trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!parts) return null;
    const h = parseInt(parts[1], 10);
    const m = parseInt(parts[2], 10);
    if (h < 0 || h > 23 || m < 0 || m > 59) return null;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

module.exports = {
    parseTimeToMinutes,
    minutesToTimeStr,
    generateSlots,
    isSlotInPast,
    filterOutPastSlots,
    dateToSlotString,
    normalizeTimeSlot,
    SLOT_DURATION_MINUTES
};
