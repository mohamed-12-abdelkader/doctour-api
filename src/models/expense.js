const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Expense = sequelize.define('Expense', {
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
    },
    description: {
        type: DataTypes.STRING(500),
        allowNull: false,
        comment: 'اسم العملية / وصف المصروف'
    },
    amount: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false
    },
    expenseDate: {
        type: DataTypes.DATEONLY,
        allowNull: true,
        comment: 'تاريخ المصروف (افتراضي: اليوم)'
    },
    notes: {
        type: DataTypes.TEXT,
        allowNull: true
    }
}, {
    timestamps: true,
    tableName: 'Expenses'
});

module.exports = Expense;
