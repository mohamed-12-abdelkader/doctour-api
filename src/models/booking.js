const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Booking = sequelize.define('Booking', {
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
    },
    customerName: {
        type: DataTypes.STRING,
        allowNull: false
    },
    customerPhone: {
        type: DataTypes.STRING,
        allowNull: false
    },
    age: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: 'عمر العميل'
    },
    appointmentDate: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: 'موعد الحجز — اختياري للحجز أونلاين'
    },
    bookingType: {
        type: DataTypes.ENUM('online', 'clinic'),
        defaultValue: 'online',
        allowNull: false
    },
    amountPaid: {
        type: DataTypes.DECIMAL(10, 2),
        defaultValue: 0.00,
        allowNull: true
    },
    totalAmount: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: true,
        comment: 'إجمالي قيمة الحجز المستحقة قبل خصم المدفوع'
    },
    paymentMethod: {
        type: DataTypes.ENUM('visa', 'cash', 'vodafone_cash', 'instapay'),
        allowNull: true,
        comment: 'طريقة الدفع: فيزا | نقدي | فودافون كاش | انستا باي'
    },
    paymentDetails: {
        type: DataTypes.JSONB,
        allowNull: true,
        comment: 'تفاصيل الدفع المقسم: [{ method, amount }]'
    },
    visitType: {
        type: DataTypes.ENUM('checkup', 'followup', 'consultation'),
        defaultValue: 'checkup',
        allowNull: false
    },
    // نوع الزيارة التفصيلي (Botox, filler, تنضيف بشرة عميق، ...)
    procedureType: {
        type: DataTypes.STRING(191),
        allowNull: true,
        comment: 'نوع الزيارة التفصيلي الذي يراه المستخدم (أول خدمة أو ملخص نصي)'
    },
    procedureTypes: {
        type: DataTypes.JSONB,
        allowNull: true,
        comment: 'قائمة الخدمات: ["كشف"] أو [{ name, price }]'
    },
    clientRequestId: {
        type: DataTypes.STRING(64),
        allowNull: true,
        comment: 'معرّف من الواجهة لمنع تكرار الطلب عند الضغط المزدوج'
    },
    status: {
        type: DataTypes.ENUM('pending', 'confirmed', 'cancelled', 'rejected'),
        defaultValue: 'pending'
    },
    // حالة الكشف: في الانتظار (افتراضي) أو تم الكشف — يحدّثها الأدمن أو السكرتيرة أو الطبيب
    examinationStatus: {
        type: DataTypes.ENUM('waiting', 'done'),
        defaultValue: 'waiting',
        allowNull: false
    },
    // Slot-based booking (working hours): date + 1-hour slot
    patientId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: 'FK to Patient for slot-based bookings'
    },
    slotDate: {
        type: DataTypes.DATEONLY,
        allowNull: true,
        comment: 'تاريخ الموعد YYYY-MM-DD'
    },
    timeSlot: {
        type: DataTypes.STRING(5),
        allowNull: true,
        comment: 'مثل 10:00 (ساعة كاملة)'
    },
    // الحجز الأونلاين: التاريخ والوقت المفضل (يختاره المريض)
    preferredDate: {
        type: DataTypes.DATEONLY,
        allowNull: true,
        comment: 'التاريخ المفضل للحجز الأونلاين YYYY-MM-DD'
    },
    preferredTime: {
        type: DataTypes.STRING(5),
        allowNull: true,
        comment: 'الوقت المفضل للحجز الأونلاين مثل 10:00'
    },
    doctorId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: 'FK to DoctorProfile (required for clinic and confirmed online bookings)'
    },
    assignedBy: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: 'Admin/Secretary user id who assigned this booking'
    },
    isExtraBooking: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: 'حجز إضافي بعد امتلاء سعة اليوم'
    }
}, {
    timestamps: true
    // Indexes (slotDate, timeSlot) and (patientId, slotDate, timeSlot) are created by runSlotBookingMigration in config/database.js
    // so that columns exist before index creation; do not add indexes here or sync() fails when columns are missing.
});

module.exports = Booking;
