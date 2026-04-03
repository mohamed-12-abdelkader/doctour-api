const bookingSlotService = require('../services/bookingSlotService');
const { validateDateQuery, validateCreateSlotBooking } = require('../validators/bookingSlotValidator');
const { emitBookingListChange } = require('../socket');

/**
 * GET /api/bookings/available-slots?date=YYYY-MM-DD&doctorId=1
 * Get available time slots for a date. Returns Arabic message when booking is unavailable.
 */
exports.getAvailableSlots = async (req, res, next) => {
    try {
        const validation = validateDateQuery(req.query.date);
        if (validation) {
            return res.status(400).json({ message: validation.error });
        }
        const doctorId = parseInt(req.query.doctorId, 10);
        if (Number.isNaN(doctorId)) {
            return res.status(400).json({ message: 'doctorId query is required' });
        }
        const dateStr = String(req.query.date).trim();
        const result = await bookingSlotService.getAvailableSlots(dateStr, { doctorId });

        if (result.available === false) {
            return res.status(400).json({
                available: false,
                message: result.message
            });
        }

        // API contract: return only non-booked slots for the day,
        // sorted ascending by time.
        // Example:
        // {
        //   "date": "2026-03-12",
        //   "available_slots": ["10:00", "10:10", "10:20"]
        // }
        res.status(200).json({
            date: result.date,
            available_slots: result.availableSlots
        });
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
        const doctorId = parseInt(req.body.doctorId, 10);

        const result = await bookingSlotService.createSlotBooking(patientId, dateStr, timeSlot, bookingType, doctorId);
        if (!result.success) {
            return res.status(400).json({ message: result.message });
        }
        emitBookingListChange(result.booking, 'created');
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
        emitBookingListChange(result.booking, 'cancelled');
        res.status(200).json({
            message: 'تم إلغاء الحجز',
            booking: result.booking
        });
    } catch (err) {
        next(err);
    }
};
