const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const PatientReport = sequelize.define('PatientReport', {
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
    },
    bookingId: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    medicalCondition: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: 'الحالة المرضية'
    },
    notes: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: 'ملاحظات إضافية'
    },
    prescriptionImageUrl: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: 'رابط صورة الروشتة على Cloudinary'
    },
    prescriptionPublicId: {
        type: DataTypes.STRING(512),
        allowNull: true,
        comment: 'Cloudinary public_id لحذف/تحديث الصورة'
    }
}, {
    timestamps: true,
    tableName: 'PatientReports'
});

module.exports = PatientReport;
