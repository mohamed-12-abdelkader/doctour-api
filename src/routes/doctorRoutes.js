const express = require('express');
const router = express.Router();
const doctorController = require('../controllers/doctorController');
const { protect } = require('../middlewares/authMiddleware');
const { adminOrSecretary, doctorOnly } = require('../middlewares/roleMiddleware');

router.get('/', protect, adminOrSecretary, doctorController.getDoctors);
router.get('/me/dashboard', protect, doctorOnly, doctorController.getMyDashboard);

module.exports = router;
