/**
 * Arabic messages for booking availability and validation (production-ready).
 */
module.exports = {
    BOOKING_NOT_AVAILABLE_TODAY: 'الحجز غير متاح اليوم',
    SLOT_FULL: 'هذا الموعد ممتلئ',
    ALL_SLOTS_FULL: 'مواعيد اليوم اكتملت',
    BOOKING_SLOTS_ENDED: 'انتهت مواعيد الحجز لليوم',
    // في نظام السلاطات الحالي: كل 10 دقائق → 6 سلاطات في الساعة
    // لذلك يكون الحد الأقصى لحجز واحد فقط لكل سلات (موعد 10 دقائق).
    MAX_BOOKINGS_PER_SLOT: 1,
    SLOT_DURATION_MINUTES: 10
};
