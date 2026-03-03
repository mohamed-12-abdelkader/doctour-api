const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notificationController');
const { protect } = require('../middlewares/authMiddleware');
const { admin } = require('../middlewares/roleMiddleware');

// All routes require authentication
router.use(protect);

router.get('/', notificationController.getNotifications); // ?unreadOnly=true&limit=20&page=1
router.patch('/read-all', notificationController.markAllAsRead);
router.patch('/:id/read', notificationController.markAsRead);
router.delete('/:id', admin, notificationController.deleteNotification);

module.exports = router;
