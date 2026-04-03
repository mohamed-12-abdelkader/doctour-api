const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');
const User = require('./user');
const Permission = require('./permission');
const Booking = require('./booking');
const Patient = require('./Patient');
const WorkingDay = require('./WorkingDay');
const DoctorProfile = require('./DoctorProfile');
const PatientReport = require('./patientReport');
const ReportMedication = require('./reportMedication');
const IncomeEntry = require('./incomeEntry');
const Expense = require('./expense');
const ExpenseCategory = require('./expenseCategory');
const ExpenseSubcategory = require('./expenseSubcategory');
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
DoctorProfile.belongsTo(User, { foreignKey: 'userId', as: 'user' });
User.hasOne(DoctorProfile, { foreignKey: 'userId', as: 'doctorProfile' });

WorkingDay.belongsTo(DoctorProfile, { foreignKey: 'doctorId', as: 'doctor' });
DoctorProfile.hasMany(WorkingDay, { foreignKey: 'doctorId', as: 'workingDays' });

Patient.hasMany(Booking, { foreignKey: 'patientId' });
Booking.belongsTo(Patient, { foreignKey: 'patientId' });
Booking.belongsTo(DoctorProfile, { foreignKey: 'doctorId', as: 'doctor' });
DoctorProfile.hasMany(Booking, { foreignKey: 'doctorId', as: 'bookings' });

Booking.hasMany(PatientReport, { foreignKey: 'bookingId', as: 'reports' });
PatientReport.belongsTo(Booking, { foreignKey: 'bookingId' });
PatientReport.hasMany(ReportMedication, { foreignKey: 'reportId', as: 'medications' });
ReportMedication.belongsTo(PatientReport, { foreignKey: 'reportId' });

// Expense classification associations
ExpenseCategory.hasMany(ExpenseSubcategory, { foreignKey: 'categoryId', as: 'subcategories' });
ExpenseSubcategory.belongsTo(ExpenseCategory, { foreignKey: 'categoryId', as: 'category' });

Expense.belongsTo(ExpenseCategory, { foreignKey: 'categoryId', as: 'category' });
Expense.belongsTo(ExpenseSubcategory, { foreignKey: 'subcategoryId', as: 'subcategory' });

module.exports = {
    User,
    Permission,
    UserPermission,
    Booking,
    Patient,
    WorkingDay,
    DoctorProfile,
    PatientReport,
    ReportMedication,
    IncomeEntry,
    Expense,
    ExpenseCategory,
    ExpenseSubcategory,
    Notification
};
