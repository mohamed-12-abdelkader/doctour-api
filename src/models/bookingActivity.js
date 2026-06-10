const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const BookingActivity = sequelize.define(
    'BookingActivity',
    {
        id: {
            type: DataTypes.INTEGER,
            autoIncrement: true,
            primaryKey: true
        },
        bookingId: {
            type: DataTypes.INTEGER,
            allowNull: false
        },
        userId: {
            type: DataTypes.INTEGER,
            allowNull: true
        },
        action: {
            type: DataTypes.STRING(64),
            allowNull: false
        },
        metadata: {
            type: DataTypes.JSONB,
            allowNull: true
        }
    },
    {
        timestamps: true,
        tableName: 'booking_activities'
    }
);

module.exports = BookingActivity;
