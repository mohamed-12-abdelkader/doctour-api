const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const ReportMedication = sequelize.define('ReportMedication', {
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
    },
    reportId: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    medicationName: {
        type: DataTypes.STRING(255),
        allowNull: false
    },
    dosage: {
        type: DataTypes.STRING(255),
        allowNull: true,
        comment: 'الجرعة'
    },
    frequency: {
        type: DataTypes.STRING(255),
        allowNull: true,
        comment: 'مثال: مرتين يومياً'
    },
    notes: {
        type: DataTypes.TEXT,
        allowNull: true
    }
}, {
    timestamps: true,
    tableName: 'ReportMedications'
});

module.exports = ReportMedication;
