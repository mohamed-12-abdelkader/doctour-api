const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const IncomeEntry = sequelize.define('IncomeEntry', {
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
    },
    description: {
        type: DataTypes.STRING(500),
        allowNull: false,
        comment: 'اسم العملية / وصف الدخل'
    },
    amount: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false
    },
    entryDate: {
        type: DataTypes.DATEONLY,
        allowNull: true,
        comment: 'تاريخ الدخل (افتراضي: اليوم)'
    }
}, {
    timestamps: true,
    tableName: 'IncomeEntries'
});

module.exports = IncomeEntry;
