const express = require('express');
const router = express.Router();
const bookingController = require('../controllers/bookingController');
const bookingSlotController = require('../controllers/bookingSlotController');
const reportController = require('../controllers/reportController');
const { protect } = require('../middlewares/authMiddleware');
const { hasPermission } = require('../middlewares/permissionMiddleware');
const { admin } = require('../middlewares/roleMiddleware');
const upload = require('../middlewares/uploadMiddleware');

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

// Admin only: Update examination status (حالة الكشف — تم الكشف / في الانتظار)
router.patch('/:id/examination-status', protect, admin, bookingController.updateExaminationStatus);

// Admin only: Patient reports — أكثر من تقرير لنفس الحجز
// Content-Type: multipart/form-data | field name for image: 'prescription'
router.post('/:id/reports', protect, admin, upload.single('prescription'), reportController.createReport);
router.get('/:id/reports', protect, admin, reportController.getReports);
router.get('/:id/reports/:reportId', protect, admin, reportController.getReport);
router.put('/:id/reports/:reportId', protect, admin, upload.single('prescription'), reportController.updateReport);
router.delete('/:id/reports/:reportId', protect, admin, reportController.deleteReport);
router.delete('/:id/reports/:reportId/prescription', protect, admin, reportController.deletePrescriptionImage);

// Protected Routes: Update and cancel bookings
// Requires 'manage_daily_bookings' permission
router.put('/:id', protect, hasPermission('manage_daily_bookings'), bookingController.updateBooking);
router.delete('/:id', protect, hasPermission('manage_daily_bookings'), bookingController.cancelBooking);

// Protected Route: Get booking details with patient history
// Requires 'manage_daily_bookings' permission
router.get('/:id/history', protect, hasPermission('manage_daily_bookings'), bookingController.getBookingWithHistory);

module.exports = router;

