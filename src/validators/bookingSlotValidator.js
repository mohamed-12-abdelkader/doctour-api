/**
 * Validation for slot-based booking and available slots.
 */

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const TIME_REGEX = /^\d{1,2}:\d{2}$/;

function validateDateQuery(date) {
    if (!date || !DATE_REGEX.test(String(date).trim())) {
        return { error: 'التاريخ مطلوب بصيغة YYYY-MM-DD' };
    }
    return null;
}

function validateCreateSlotBooking(body) {
    const { patientId, date, timeSlot, bookingType, doctorId } = body || {};
    if (patientId == null || (typeof patientId !== 'number' && (typeof patientId !== 'string' || !/^\d+$/.test(String(patientId))))) {
        return { error: 'معرف المريض مطلوب' };
    }
    if (!date || !DATE_REGEX.test(String(date).trim())) {
        return { error: 'التاريخ مطلوب بصيغة YYYY-MM-DD' };
    }
    if (!timeSlot || !TIME_REGEX.test(String(timeSlot).trim())) {
        return { error: 'موعد الحجز مطلوب بصيغة HH:mm' };
    }
    if (doctorId == null || !/^\d+$/.test(String(doctorId))) {
        return { error: 'doctorId مطلوب' };
    }
    const type = (bookingType || 'online').toLowerCase();
    if (type !== 'online' && type !== 'clinic') {
        return { error: 'نوع الحجز يجب أن يكون online أو clinic' };
    }
    return null;
}

module.exports = {
    validateDateQuery,
    validateCreateSlotBooking
};
