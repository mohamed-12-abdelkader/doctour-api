const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const ExpenseCategory = sequelize.define(
    'ExpenseCategory',
    {
        id: {
            type: DataTypes.INTEGER,
            autoIncrement: true,
            primaryKey: true
        },
        name: {
            type: DataTypes.STRING(255),
            allowNull: false
        }
    },
    {
        timestamps: true,
        tableName: 'expense_categories'
    }
);

module.exports = ExpenseCategory;

