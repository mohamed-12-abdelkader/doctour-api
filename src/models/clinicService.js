const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const ClinicService = sequelize.define(
    'ClinicService',
    {
        id: {
            type: DataTypes.INTEGER,
            autoIncrement: true,
            primaryKey: true
        },
        name: {
            type: DataTypes.STRING(255),
            allowNull: false,
            unique: true
        },
        treatAsFollowup: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false,
            comment: 'If true, booking visitType resolves to followup when this service is selected'
        },
        sortOrder: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 0
        },
        isActive: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: true
        }
    },
    {
        timestamps: true,
        tableName: 'clinic_services'
    }
);

module.exports = ClinicService;
