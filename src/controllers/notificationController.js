const { Notification } = require('../models/index');
const { Op } = require('sequelize');

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/notifications
// جلب إشعارات المستخدم الحالي (أدمن أو ستاف)
// Query: ?unreadOnly=true | ?limit=20 | ?page=1
// ─────────────────────────────────────────────────────────────────────────────
exports.getNotifications = async (req, res, next) => {
    try {
        const { unreadOnly, limit = 20, page = 1 } = req.query;
        const userId = req.user.id;
        const userRole = req.user.role;

        const offset = (Number(page) - 1) * Number(limit);

        // الإشعارات المناسبة للمستخدم = (إشعارات موجهة لـ role بتاعه) أو (موجهة ليه شخصياً)
        const roleTargets = userRole === 'admin' ? ['admin', 'all'] : ['staff', 'all'];

        const where = {
            [Op.or]: [
                { targetRole: { [Op.in]: roleTargets } },
                { targetUserId: userId }
            ]
        };

        if (unreadOnly === 'true') {
            where.isRead = false;
        }

        const { count, rows: notifications } = await Notification.findAndCountAll({
            where,
            order: [['createdAt', 'DESC']],
            limit: Math.min(Number(limit), 100),
            offset
        });

        const unreadCount = await Notification.count({
            where: {
                ...where,
                isRead: false
            }
        });

        res.status(200).json({
            total: count,
            unreadCount,
            page: Number(page),
            notifications
        });
    } catch (error) {
        next(error);
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/notifications/:id/read
// تحديد إشعار معين كمقروء
// ─────────────────────────────────────────────────────────────────────────────
exports.markAsRead = async (req, res, next) => {
    try {
        const { id } = req.params;
        const notification = await Notification.findByPk(id);

        if (!notification) {
            return res.status(404).json({ message: 'Notification not found.' });
        }

        notification.isRead = true;
        await notification.save();

        res.status(200).json({ message: 'Notification marked as read.', notification });
    } catch (error) {
        next(error);
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/notifications/read-all
// تحديد كل إشعارات المستخدم الحالي كمقروءة
// ─────────────────────────────────────────────────────────────────────────────
exports.markAllAsRead = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const userRole = req.user.role;
        const roleTargets = userRole === 'admin' ? ['admin', 'all'] : ['staff', 'all'];

        const [updatedCount] = await Notification.update(
            { isRead: true },
            {
                where: {
                    isRead: false,
                    [Op.or]: [
                        { targetRole: { [Op.in]: roleTargets } },
                        { targetUserId: userId }
                    ]
                }
            }
        );

        res.status(200).json({ message: `${updatedCount} notifications marked as read.` });
    } catch (error) {
        next(error);
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/notifications/:id
// حذف إشعار محدد (Admin only)
// ─────────────────────────────────────────────────────────────────────────────
exports.deleteNotification = async (req, res, next) => {
    try {
        const { id } = req.params;
        const deleted = await Notification.destroy({ where: { id } });

        if (!deleted) {
            return res.status(404).json({ message: 'Notification not found.' });
        }

        res.status(200).json({ message: 'Notification deleted.' });
    } catch (error) {
        next(error);
    }
};
