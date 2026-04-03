const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const DoctorProfile = sequelize.define('DoctorProfile', {
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
    },
    userId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        unique: true
    },
    specialty: {
        type: DataTypes.STRING(191),
        allowNull: false
    },
    phone: {
        type: DataTypes.STRING(30),
        allowNull: false
    },
    imageUrl: {
        type: DataTypes.STRING(512),
        allowNull: true
    },
    isActive: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        allowNull: false
    }
}, {
    timestamps: true
});

module.exports = DoctorProfile;
