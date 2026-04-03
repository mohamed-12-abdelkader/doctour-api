const express = require('express');
const router = express.Router();
const workingDayController = require('../controllers/workingDayController');
const { protect } = require('../middlewares/authMiddleware');
const { adminOrSecretary } = require('../middlewares/roleMiddleware');

router.use(protect, adminOrSecretary);

router.post('/', workingDayController.setWorkingHours);
router.put('/:id', workingDayController.updateWorkingHours);
router.get('/', workingDayController.getWorkingDays);

module.exports = router;
