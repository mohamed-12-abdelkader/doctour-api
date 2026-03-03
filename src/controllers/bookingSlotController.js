const bookingSlotService = require('../services/bookingSlotService');
const { validateDateQuery, validateCreateSlotBooking } = require('../validators/bookingSlotValidator');

/**
 * GET /api/bookings/available-slots?date=YYYY-MM-DD
 * Get available time slots for a date. Returns Arabic message when booking is unavailable.
 */
exports.getAvailableSlots = async (req, res, next) => {
    try {
        const validation = validateDateQuery(req.query.date);
        if (validation) {
            return res.status(400).json({ message: validation.error });
        }
        const dateStr = String(req.query.date).trim();
        const result = await bookingSlotService.getAvailableSlots(dateStr);
        if (result.available === false) {
            return res.status(400).json({
                available: false,
                message: result.message
            });
        }
        res.status(200).json(result);
    } catch (err) {
        next(err);
    }
};

/**
 * POST /api/bookings/slots
 * Create a slot-based booking (online or clinic). Validates working hours, capacity, past, duplicate.
 */
exports.createSlotBooking = async (req, res, next) => {
    try {
        const validation = validateCreateSlotBooking(req.body);
        if (validation) {
            return res.status(400).json({ message: validation.error });
        }
        const patientId = parseInt(req.body.patientId, 10);
        const dateStr = String(req.body.date).trim();
        const timeSlot = String(req.body.timeSlot).trim();
        const bookingType = (req.body.bookingType || 'online').toLowerCase();

        const result = await bookingSlotService.createSlotBooking(patientId, dateStr, timeSlot, bookingType);
        if (!result.success) {
            return res.status(400).json({ message: result.message });
        }
        res.status(201).json({
            message: 'تم الحجز بنجاح',
            booking: result.booking
        });
    } catch (err) {
        next(err);
    }
};

/**
 * PATCH /api/bookings/slots/:id/cancel
 * Cancel a slot booking by id.
 */
exports.cancelSlotBooking = async (req, res, next) => {
    try {
        const id = parseInt(req.params.id, 10);
        if (Number.isNaN(id)) {
            return res.status(400).json({ message: 'معرف الحجز غير صحيح' });
        }
        const result = await bookingSlotService.cancelSlotBooking(id);
        if (!result.success) {
            return res.status(400).json({ message: result.message });
        }
        res.status(200).json({
            message: 'تم إلغاء الحجز',
            booking: result.booking
        });
    } catch (err) {
        next(err);
    }
};
