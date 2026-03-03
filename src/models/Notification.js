const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

/**
 * Notification — إشعارات النظام الداخلية
 * يتم إنشاؤها عند أحداث مهمة (حجز أونلاين جديد، تأكيد، إلخ)
 * يقرأها الأدمن والستاف عبر polling أو websocket لاحقاً
 */
const Notification = sequelize.define('Notification', {
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
    },
    type: {
        type: DataTypes.ENUM('new_online_booking', 'booking_confirmed', 'booking_rejected', 'booking_cancelled'),
        allowNull: false,
        comment: 'نوع الإشعار'
    },
    title: {
        type: DataTypes.STRING(255),
        allowNull: false
    },
    message: {
        type: DataTypes.TEXT,
        allowNull: false
    },
    data: {
        type: DataTypes.JSONB,
        allowNull: true,
        comment: 'بيانات إضافية مرتبطة بالحدث (bookingId, patientName, ...)'
    },
    isRead: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        allowNull: false
    },
    // الإشعار موجه لـ: role معين أو user معين
    targetRole: {
        type: DataTypes.ENUM('admin', 'staff', 'all'),
        allowNull: true,
        comment: 'admin | staff | all — لو null يبص على targetUserId'
    },
    targetUserId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: 'لو الإشعار لمستخدم محدد'
    }
}, {
    timestamps: true,
    tableName: 'Notifications',
    indexes: [
        { fields: ['isRead', 'createdAt'] },
        { fields: ['targetRole'] },
        { fields: ['targetUserId'] }
    ]
});

module.exports = Notification;
