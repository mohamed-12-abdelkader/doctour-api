const express = require('express');
const router = express.Router();
const staffController = require('../controllers/staffController');
const { protect } = require('../middlewares/authMiddleware');
const { admin } = require('../middlewares/roleMiddleware');

// Protect all routes
router.use(protect);
router.use(admin);

router.post('/', staffController.createStaff);
router.get('/', staffController.getAllStaff);
router.get('/:id', staffController.getStaffById);
router.put('/:id', staffController.updateStaff);
router.patch('/:id/status', staffController.toggleStaffStatus);
router.delete('/:id', staffController.deleteStaff);

module.exports = router;
