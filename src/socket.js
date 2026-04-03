/**
 * Socket.io instance for real-time booking updates (e.g. examination status).
 * Clients join room "bookings:YYYY-MM-DD" to receive updates for that date.
 */

let io = null;

function setIO(socketIO) {
    io = socketIO;
}

function getIO() {
    return io;
}

/**
 * Emit booking update to all clients watching this date.
 * @param {string} dateStr - YYYY-MM-DD
 * @param {object} payload - e.g. { booking }, { action: 'examinationStatus', booking }
 */
function emitBookingUpdateForDate(dateStr, payload) {
    if (!io || !dateStr) return;
    const room = `bookings:${String(dateStr).trim().slice(0, 10)}`;
    io.to(room).emit('bookings:updated', payload);
}

/**
 * تاريخ اليوم من الحجز (slotDate أو appointmentDate) لغرفة الريل تايم.
 * @param {object} booking - Sequelize model أو plain
 * @returns {string|null} YYYY-MM-DD
 */
function bookingToDateStr(booking) {
    if (!booking) return null;
    if (booking.slotDate) return String(booking.slotDate).trim().slice(0, 10);
    if (booking.appointmentDate) {
        const d = new Date(booking.appointmentDate);
        return d.toISOString().slice(0, 10);
    }
    return null;
}

/**
 * إشعار لتحديث قائمة الحجوزات (GET /api/bookings/all) بدون ريفرش.
 * يُرسل لغرفة كل يوم متأثر (مثلاً عند نقل الموعد بين يومين).
 * @param {object} booking
 * @param {string} change - created | updated | statusChanged | cancelled | examinationStatus | ...
 * @param {string} [prevDateStr] - تاريخ الموعد قبل التعديل (إن وُجد)
 */
function emitBookingListChange(booking, change, prevDateStr) {
    if (!booking) return;
    const plain = booking.toJSON ? booking.toJSON() : booking;
    const newDateStr = bookingToDateStr(booking);
    const dates = new Set();
    if (prevDateStr) dates.add(String(prevDateStr).trim().slice(0, 10));
    if (newDateStr) dates.add(newDateStr);
    if (dates.size === 0) return;
    dates.forEach((dateStr) => {
        emitBookingUpdateForDate(dateStr, { action: 'bookingChanged', change, booking: plain });
    });
}

module.exports = {
    setIO,
    getIO,
    emitBookingUpdateForDate,
    bookingToDateStr,
    emitBookingListChange
};
