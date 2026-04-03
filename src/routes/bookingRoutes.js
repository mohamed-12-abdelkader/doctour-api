const express = require('express');
const router = express.Router();
const bookingController = require('../controllers/bookingController');
const bookingSlotController = require('../controllers/bookingSlotController');
const reportController = require('../controllers/reportController');
const { Booking } = require('../models/index');
const { protect } = require('../middlewares/authMiddleware');
const { hasPermission } = require('../middlewares/permissionMiddleware');
const upload = require('../middlewares/uploadMiddleware');

async function doctorOwnBookingOrDailyPermission(req, res, next) {
    if (req.user && req.user.role === 'admin') return next();

    if (req.user && req.user.role === 'doctor') {
        const doctorId = req.user.doctorProfile && req.user.doctorProfile.id;
        if (!doctorId) {
            return res.status(403).json({ message: 'Doctor profile not found for this account.' });
        }
        const booking = await Booking.findByPk(req.params.id, { attributes: ['id', 'doctorId'] });
        if (!booking) return res.status(404).json({ message: 'Booking not found.' });
        if (Number(booking.doctorId) !== Number(doctorId)) {
            return res.status(403).json({ message: 'Access denied. This booking does not belong to this doctor.' });
        }
        return next();
    }

    const permissions = req.user.permissions ? req.user.permissions.map(p => p.name) : [];
    if (permissions.includes('manage_daily_bookings')) return next();
    return res.status(403).json({ message: 'Access denied. Requires doctor ownership or manage_daily_bookings permission.' });
}

async function doctorOwnBookingForExamination(req, res, next) {
    if (req.user && req.user.role === 'admin') return next();

    if (!(req.user && req.user.role === 'doctor')) {
        return res.status(403).json({ message: 'Access denied. Doctor owner only.' });
    }

    const doctorId = req.user.doctorProfile && req.user.doctorProfile.id;
    if (!doctorId) {
        return res.status(403).json({ message: 'Doctor profile not found for this account.' });
    }

    const booking = await Booking.findByPk(req.params.id, { attributes: ['id', 'doctorId'] });
    if (!booking) return res.status(404).json({ message: 'Booking not found.' });
    if (Number(booking.doctorId) !== Number(doctorId)) {
        return res.status(403).json({ message: 'Access denied. This booking does not belong to this doctor.' });
    }
    return next();
}

// Slot-based booking (working hours): public read slots, public create/cancel
router.get('/available-slots', bookingSlotController.getAvailableSlots);
router.post('/slots', bookingSlotController.createSlotBooking);
router.patch('/slots/:id/cancel', bookingSlotController.cancelSlotBooking);

// Public Route: Make an online booking
router.post('/online', bookingController.createBooking);

// Protected Routes: Manage online bookings
// Requires 'manage_online_bookings' permission
router.get('/online', protect, hasPermission('manage_online_bookings'), bookingController.getOnlineBookings);
router.patch('/online/:id/status', protect, hasPermission('manage_online_bookings'), bookingController.updateBookingStatus);

// Protected Routes: Manage clinic bookings
// Requires 'manage_daily_bookings' permission
router.post('/clinic', protect, hasPermission('manage_daily_bookings'), bookingController.createClinicBooking);

// Protected Routes: Get all bookings (unified view)
// Requires either 'manage_online_bookings' OR 'manage_daily_bookings' permission
router.get('/all', protect, (req, res, next) => {
    // Admin bypasses all checks
    if (req.user && req.user.role === 'admin') {
        return next();
    }
    if (req.user && req.user.role === 'doctor') {
        return next();
    }

    // Check if user has permissions array
    const permissions = req.user.permissions || [];
    const hasOnlinePermission = permissions.some(p => p.name === 'manage_online_bookings');
    const hasDailyPermission = permissions.some(p => p.name === 'manage_daily_bookings');

    if (hasOnlinePermission || hasDailyPermission) {
        next();
    } else {
        return res.status(403).json({ message: 'Access denied. You need manage_online_bookings or manage_daily_bookings permission.' });
    }
}, bookingController.getAllBookings);

// Examination status: booking owner doctor (or admin)
router.patch('/:id/examination-status', protect, doctorOwnBookingForExamination, bookingController.updateExaminationStatus);

// Patient reports: Admin or Doctor (doctor must own this booking)
// Content-Type: multipart/form-data | field name for image: 'prescription'
router.post('/:id/reports', protect, doctorOwnBookingOrDailyPermission, upload.single('prescription'), reportController.createReport);
router.get('/:id/reports', protect, doctorOwnBookingOrDailyPermission, reportController.getReports);
router.get('/:id/reports/:reportId', protect, doctorOwnBookingOrDailyPermission, reportController.getReport);
router.put('/:id/reports/:reportId', protect, doctorOwnBookingOrDailyPermission, upload.single('prescription'), reportController.updateReport);
router.delete('/:id/reports/:reportId', protect, doctorOwnBookingOrDailyPermission, reportController.deleteReport);
router.delete('/:id/reports/:reportId/prescription', protect, doctorOwnBookingOrDailyPermission, reportController.deletePrescriptionImage);

// Protected Routes: Update and cancel bookings
// Requires 'manage_daily_bookings' permission
router.put('/:id', protect, hasPermission('manage_daily_bookings'), bookingController.updateBooking);
router.delete('/:id', protect, hasPermission('manage_daily_bookings'), bookingController.cancelBooking);

// Protected Route: Get booking details with patient history
// Doctor allowed only for own booking; staff requires manage_daily_bookings
router.get('/:id/history', protect, doctorOwnBookingOrDailyPermission, bookingController.getBookingWithHistory);

module.exports = router;

