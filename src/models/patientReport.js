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
        allowNull: false,
        unique: true
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
    }
}, {
    timestamps: true,
    tableName: 'PatientReports'
});

module.exports = PatientReport;
