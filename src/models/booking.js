const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Booking = sequelize.define('Booking', {
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
    },
    customerName: {
        type: DataTypes.STRING,
        allowNull: false
    },
    customerPhone: {
        type: DataTypes.STRING,
        allowNull: false
    },
    age: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: 'عمر العميل'
    },
    appointmentDate: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: 'موعد الحجز — اختياري للحجز أونلاين'
    },
    bookingType: {
        type: DataTypes.ENUM('online', 'clinic'),
        defaultValue: 'online',
        allowNull: false
    },
    amountPaid: {
        type: DataTypes.DECIMAL(10, 2),
        defaultValue: 0.00,
        allowNull: true
    },
    visitType: {
        type: DataTypes.ENUM('checkup', 'followup', 'consultation'),
        defaultValue: 'checkup',
        allowNull: false
    },
    status: {
        type: DataTypes.ENUM('pending', 'confirmed', 'cancelled', 'rejected'),
        defaultValue: 'pending'
    },
    // حالة الكشف: في الانتظار (افتراضي) أو تم الكشف — يحدّثها الأدمن فقط
    examinationStatus: {
        type: DataTypes.ENUM('waiting', 'done'),
        defaultValue: 'waiting',
        allowNull: false
    }
}, {
    timestamps: true
});

module.exports = Booking;
