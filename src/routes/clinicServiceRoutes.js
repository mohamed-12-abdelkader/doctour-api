const express = require('express');
const router = express.Router();
const clinicServiceController = require('../controllers/clinicServiceController');
const { protect } = require('../middlewares/authMiddleware');
const { admin, adminOrSecretary } = require('../middlewares/roleMiddleware');

function canViewClinicServices(req, res, next) {
    if (req.user && req.user.role === 'admin') return next();
    if (req.user && ['secretary', 'staff', 'doctor'].includes(req.user.role)) return next();

    const permissions = req.user.permissions ? req.user.permissions.map((p) => p.name) : [];
    if (permissions.includes('manage_daily_bookings') || permissions.includes('manage_online_bookings')) {
        return next();
    }

    return res.status(403).json({ message: 'Access denied.' });
}

// قائمة الخدمات النشطة — للحجز والواجهة
router.get('/', protect, canViewClinicServices, clinicServiceController.listActiveServices);

// إدارة الخدمات — أدمن فقط
router.get('/admin/all', protect, admin, clinicServiceController.listAllServicesAdmin);
router.post('/admin', protect, admin, clinicServiceController.createClinicService);
router.put('/admin/:id', protect, admin, clinicServiceController.updateClinicService);
router.delete('/admin/:id', protect, admin, clinicServiceController.deleteClinicService);

module.exports = router;
