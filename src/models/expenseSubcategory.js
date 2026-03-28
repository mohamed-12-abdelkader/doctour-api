const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const ExpenseSubcategory = sequelize.define(
    'ExpenseSubcategory',
    {
        id: {
            type: DataTypes.INTEGER,
            autoIncrement: true,
            primaryKey: true
        },
        categoryId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: {
                model: 'expense_categories',
                key: 'id'
            }
        },
        name: {
            type: DataTypes.STRING(255),
            allowNull: false
        }
    },
    {
        timestamps: true,
        tableName: 'expense_subcategories',
        indexes: [{ fields: ['categoryId'] }]
    }
);

module.exports = ExpenseSubcategory;

