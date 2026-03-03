const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');
const User = require('./user');
const Permission = require('./permission');
const Booking = require('./booking');
const Patient = require('./Patient');
const WorkingDay = require('./WorkingDay');
const PatientReport = require('./patientReport');
const ReportMedication = require('./reportMedication');
const IncomeEntry = require('./incomeEntry');
const Expense = require('./expense');
const Notification = require('./Notification');

const UserPermission = sequelize.define('UserPermission', {
    userId: {
        type: DataTypes.INTEGER,
        references: {
            model: User,
            key: 'id'
        }
    },
    permissionId: {
        type: DataTypes.INTEGER,
        references: {
            model: Permission,
            key: 'id'
        }
    }
}, {
    timestamps: false
});

// Define associations
User.belongsToMany(Permission, { through: UserPermission, foreignKey: 'userId', as: 'permissions' });
Permission.belongsToMany(User, { through: UserPermission, foreignKey: 'permissionId' });

WorkingDay.belongsTo(User, { foreignKey: 'createdBy' });
User.hasMany(WorkingDay, { foreignKey: 'createdBy' });

Patient.hasMany(Booking, { foreignKey: 'patientId' });
Booking.belongsTo(Patient, { foreignKey: 'patientId' });

Booking.hasMany(PatientReport, { foreignKey: 'bookingId', as: 'reports' });
PatientReport.belongsTo(Booking, { foreignKey: 'bookingId' });
PatientReport.hasMany(ReportMedication, { foreignKey: 'reportId', as: 'medications' });
ReportMedication.belongsTo(PatientReport, { foreignKey: 'reportId' });

module.exports = { User, Permission, UserPermission, Booking, Patient, WorkingDay, PatientReport, ReportMedication, IncomeEntry, Expense, Notification };
