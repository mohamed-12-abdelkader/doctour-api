const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const WorkingDay = sequelize.define('WorkingDay', {
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
    },
    date: {
        type: DataTypes.DATEONLY,
        allowNull: false,
        comment: 'تاريخ العمل YYYY-MM-DD'
    },
    startTime: {
        type: DataTypes.STRING(5),
        allowNull: false,
        comment: 'وقت البداية مثل 10:00'
    },
    endTime: {
        type: DataTypes.STRING(5),
        allowNull: false,
        comment: 'وقت النهاية مثل 18:00'
    },
    doctorId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: 'FK to DoctorProfile'
    },
    isActive: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        allowNull: false
    },
    createdBy: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: 'admin user id'
    }
}, {
    timestamps: true,
    indexes: [
        { fields: ['date'] },
        { fields: ['date', 'isActive'] }
    ]
});

module.exports = WorkingDay;
