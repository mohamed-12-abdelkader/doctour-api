const { Booking, WorkingDay, Patient } = require('../models/index');
const { Op } = require('sequelize');
const { generateSlots, filterOutPastSlots } = require('../utils/slotHelper');
const messages = require('../constants/bookingMessages');

const MAX_PER_SLOT = messages.MAX_BOOKINGS_PER_SLOT;

/**
 * Get available time slots for a date.
 * - If no working day for date → returns { available: false, message: الحجز غير متاح اليوم }
 * - If all slots full → returns { available: false, message: مواعيد اليوم اكتملت }
 * - If all remaining slots in the past → returns { available: false, message: انتهت مواعيد الحجز لليوم }
 * - Otherwise → returns { available: true, slots: [{ timeSlot, available, count }], message?: }
 */
async function getAvailableSlots(dateStr) {
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

    const counts = await getBookingCountsBySlot(dateStr, futureSlots);
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
 * Efficient aggregation: count non-cancelled bookings per (date, timeSlot).
 * Uses single query with GROUP BY for performance.
 */
async function getBookingCountsBySlot(dateStr, timeSlots) {
    if (!timeSlots || timeSlots.length === 0) return {};
    const rows = await Booking.sequelize.query(
        `SELECT "timeSlot", COUNT(*)::int AS count
         FROM "Bookings"
         WHERE "slotDate" = :date AND "timeSlot" IN (:slots)
           AND "status" != 'cancelled'
         GROUP BY "timeSlot"`,
        {
            replacements: { date: dateStr, slots: timeSlots },
            type: Booking.sequelize.QueryTypes.SELECT
        }
    );
    const map = {};
    (rows || []).forEach(r => { map[r.timeSlot] = r.count; });
    return map;
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
            status: { [Op.not]: 'cancelled' }
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
