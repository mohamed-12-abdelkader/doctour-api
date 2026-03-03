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

module.exports = {
    setIO,
    getIO,
    emitBookingUpdateForDate
};
