const { Booking, WorkingDay, Patient } = require('../models/index');
const { Op } = require('sequelize');
const { generateSlots, filterOutPastSlots, dateToSlotString } = require('../utils/slotHelper');
const messages = require('../constants/bookingMessages');

const MAX_PER_SLOT = messages.MAX_BOOKINGS_PER_SLOT;

/** Statuses that do NOT hold a slot (cancelled/rejected = slot stays available) */
const SLOT_HOLDING_STATUSES = ['pending', 'confirmed'];

/**
 * Get available time slots for a date.
 * @param {string} dateStr - YYYY-MM-DD
 * @param {{ excludeBookingId?: number }} [options] - exclude this booking from slot counts (e.g. pending online confirm)
 * - If no working day for date → returns { available: false, message: الحجز غير متاح اليوم }
 * - If all slots full → returns { available: false, message: مواعيد اليوم اكتملت }
 * - If all remaining slots in the past → returns { available: false, message: انتهت مواعيد الحجز لليوم }
 * - Otherwise → returns { available: true, slots: [{ timeSlot, available, count }], message?: }
 */
async function getAvailableSlots(dateStr, options = {}) {
    const excludeBookingId = options.excludeBookingId || null;
    const wd = await WorkingDay.findOne({
        where: { date: dateStr, isActive: true }
    });
    if (!wd) {
        return { available: false, message: messages.BOOKING_NOT_AVAILABLE_TODAY };
    }

    const allSlots = generateSlots(wd.startTime, wd.endTime);
    if (allSlots.length === 0) {
        return { available: false, message: messages.BOOKING_NOT_AVAILABLE_TODAY };
    }

    const now = new Date();
    const futureSlots = filterOutPastSlots(dateStr, allSlots, now);
    if (futureSlots.length === 0) {
        return { available: false, message: messages.BOOKING_SLOTS_ENDED };
    }

    const [countsSlot, countsAppointment] = await Promise.all([
        getBookingCountsBySlot(dateStr, futureSlots, excludeBookingId),
        getAppointmentDateCountsBySlot(dateStr, futureSlots, excludeBookingId)
    ]);
    const counts = mergeSlotCounts(countsSlot, countsAppointment);
    const slots = futureSlots.map(timeSlot => ({
        timeSlot,
        count: counts[timeSlot] || 0,
        available: (counts[timeSlot] || 0) < MAX_PER_SLOT
    }));

    const availableSlots = slots.filter(s => s.available).map(s => s.timeSlot);
    if (availableSlots.length === 0) {
        return { available: false, message: messages.ALL_SLOTS_FULL };
    }

    return {
        available: true,
        date: dateStr,
        workingHours: { start: wd.startTime, end: wd.endTime },
        slots,
        availableSlots
    };
}

/**
 * Count slot-based bookings per timeSlot (slotDate + timeSlot).
 * Only pending/confirmed hold the slot; cancelled and rejected do not.
 */
async function getBookingCountsBySlot(dateStr, timeSlots, excludeBookingId = null) {
    if (!timeSlots || timeSlots.length === 0) return {};
    let sql = `SELECT "timeSlot", COUNT(*)::int AS count
         FROM "Bookings"
         WHERE "slotDate" = :date AND "timeSlot" IN (:slots)
           AND "status" IN (:statuses)`;
    const replacements = { date: dateStr, slots: timeSlots, statuses: SLOT_HOLDING_STATUSES };
    if (excludeBookingId) {
        sql += ` AND "id" != :excludeId`;
        replacements.excludeId = excludeBookingId;
    }
    sql += ` GROUP BY "timeSlot"`;
    const rows = await Booking.sequelize.query(sql, {
        replacements,
        type: Booking.sequelize.QueryTypes.SELECT
    });
    const map = {};
    (rows || []).forEach(r => { map[r.timeSlot] = r.count; });
    return map;
}

/**
 * Count bookings that use appointmentDate on the given date (clinic/online).
 * Converts appointmentDate to 10-min slot and adds to counts so those slots are excluded from available.
 */
async function getAppointmentDateCountsBySlot(dateStr, timeSlots, excludeBookingId = null) {
    if (!timeSlots || timeSlots.length === 0) return {};
    const slotSet = new Set(timeSlots);
    const startOfDay = new Date(dateStr + 'T00:00:00.000Z');
    const endOfDay = new Date(dateStr + 'T23:59:59.999Z');
    const where = {
        appointmentDate: { [Op.gte]: startOfDay, [Op.lte]: endOfDay },
        status: { [Op.in]: SLOT_HOLDING_STATUSES }
    };
    if (excludeBookingId) {
        where.id = { [Op.ne]: excludeBookingId };
    }
    const list = await Booking.findAll({
        where,
        attributes: ['appointmentDate']
    });
    const map = {};
    for (const row of list) {
        const slot = dateToSlotString(row.appointmentDate);
        if (slot && slotSet.has(slot)) {
            map[slot] = (map[slot] || 0) + 1;
        }
    }
    return map;
}

/**
 * Merge two count maps (slot-based + appointmentDate-based) so any booking on a slot marks it taken.
 */
function mergeSlotCounts(countsSlot, countsAppointment) {
    const merged = { ...countsSlot };
    for (const [slot, n] of Object.entries(countsAppointment || {})) {
        merged[slot] = (merged[slot] || 0) + n;
    }
    return merged;
}

/**
 * Create a slot-based booking. Validates:
 * - Working day exists and is active
 * - timeSlot within working hours
 * - Slot not full (< 10)
 * - Slot not in the past
 * - No duplicate: same patient doesn't have another non-cancelled booking for same date+slot
 * Returns { success, booking?, message? } with Arabic message on failure.
 */
async function createSlotBooking(patientId, dateStr, timeSlot, bookingType) {
    const wd = await WorkingDay.findOne({
        where: { date: dateStr, isActive: true }
    });
    if (!wd) {
        return { success: false, message: messages.BOOKING_NOT_AVAILABLE_TODAY };
    }

    const allSlots = generateSlots(wd.startTime, wd.endTime);
    if (!allSlots.includes(timeSlot)) {
        return { success: false, message: messages.BOOKING_NOT_AVAILABLE_TODAY };
    }

    const { isSlotInPast } = require('../utils/slotHelper');
    if (isSlotInPast(dateStr, timeSlot)) {
        return { success: false, message: messages.BOOKING_SLOTS_ENDED };
    }

    const counts = await getBookingCountsBySlot(dateStr, [timeSlot]);
    if ((counts[timeSlot] || 0) >= MAX_PER_SLOT) {
        return { success: false, message: messages.SLOT_FULL };
    }

    const existing = await Booking.findOne({
        where: {
            patientId,
            slotDate: dateStr,
            timeSlot,
            status: { [Op.in]: SLOT_HOLDING_STATUSES }
        }
    });
    if (existing) {
        return { success: false, message: 'لديك حجز بالفعل في هذا الموعد' };
    }

    const patient = await Patient.findByPk(patientId);
    if (!patient) {
        return { success: false, message: 'المريض غير موجود' };
    }

    const booking = await Booking.create({
        patientId,
        customerName: patient.name,
        customerPhone: patient.phone,
        slotDate: dateStr,
        timeSlot,
        bookingType: bookingType === 'clinic' ? 'clinic' : 'online',
        status: 'confirmed',
        appointmentDate: new Date(dateStr + 'T12:00:00.000Z')
    });

    return { success: true, booking };
}

/**
 * Cancel a slot booking by id. Returns { success, message? }.
 */
async function cancelSlotBooking(bookingId) {
    const booking = await Booking.findByPk(bookingId);
    if (!booking) {
        return { success: false, message: 'الحجز غير موجود' };
    }
    if (!booking.slotDate || !booking.timeSlot) {
        return { success: false, message: 'هذا الحجز ليس حجز موعد محدد' };
    }
    if (booking.status === 'cancelled') {
        return { success: true, message: 'تم إلغاء الحجز مسبقاً' };
    }
    booking.status = 'cancelled';
    await booking.save();
    return { success: true, booking };
}

module.exports = {
    getAvailableSlots,
    getBookingCountsBySlot,
    createSlotBooking,
    cancelSlotBooking
};
