const { WorkingDay } = require('../models/index');
const { Op } = require('sequelize');

/**
 * Set or update working hours for a specific date. Creates or updates one record per date.
 */
async function setWorkingHours(date, startTime, endTime, adminId, doctorId) {
    const [wd, created] = await WorkingDay.upsert(
        {
            date,
            startTime: String(startTime).trim(),
            endTime: String(endTime).trim(),
            doctorId,
            isActive: true,
            createdBy: adminId
        },
        { conflictFields: ['doctorId', 'date'] }
    );
    return wd;
}

/**
 * Update existing working day by id (admin only).
 */
async function updateWorkingHours(id, payload) {
    const wd = await WorkingDay.findByPk(id);
    if (!wd) return null;
    if (payload.date !== undefined) wd.date = payload.date;
    if (payload.startTime !== undefined) wd.startTime = String(payload.startTime).trim();
    if (payload.endTime !== undefined) wd.endTime = String(payload.endTime).trim();
    if (payload.doctorId !== undefined) wd.doctorId = payload.doctorId;
    if (payload.isActive !== undefined) wd.isActive = !!payload.isActive;
    await wd.save();
    return wd;
}

const DEFAULT_CLINIC_START_TIME = process.env.DEFAULT_CLINIC_START_TIME || '09:00';
const DEFAULT_CLINIC_END_TIME = process.env.DEFAULT_CLINIC_END_TIME || '22:00';

/**
 * Get working day for a specific date. Returns null if not set or inactive.
 */
async function getWorkingDayByDate(date, doctorId) {
    const wd = await WorkingDay.findOne({
        where: { date, doctorId, isActive: true }
    });
    if (wd) return wd;
    if (doctorId != null) {
        return WorkingDay.findOne({
            where: { date, doctorId: null, isActive: true }
        });
    }
    return null;
}

/**
 * يوم عمل للحجز: يُستخدم الموجود، أو يُنشأ افتراضياً (09:00–22:00) إن لم يُضبط مسبقاً.
 */
async function getOrCreateWorkingDayForBooking(dateStr, doctorId, createdBy, transaction) {
    const doctorIdNum = Number(doctorId);

    let wd = await WorkingDay.findOne({
        where: { date: dateStr, doctorId: doctorIdNum },
        lock: transaction.LOCK.UPDATE,
        transaction
    });

    if (wd) {
        if (!wd.isActive) {
            wd.isActive = true;
            await wd.save({ transaction });
        }
        return { workingDay: wd, autoCreated: false };
    }

    wd = await WorkingDay.findOne({
        where: { date: dateStr, doctorId: null, isActive: true },
        lock: transaction.LOCK.UPDATE,
        transaction
    });
    if (wd) {
        return { workingDay: wd, autoCreated: false };
    }

    await WorkingDay.create(
        {
            date: dateStr,
            startTime: DEFAULT_CLINIC_START_TIME,
            endTime: DEFAULT_CLINIC_END_TIME,
            doctorId: doctorIdNum,
            isActive: true,
            createdBy: createdBy || null
        },
        { transaction }
    );

    wd = await WorkingDay.findOne({
        where: { date: dateStr, doctorId: doctorIdNum, isActive: true },
        lock: transaction.LOCK.UPDATE,
        transaction
    });

    return { workingDay: wd, autoCreated: true };
}

/**
 * List working days (optional date range).
 */
async function listWorkingDays({ startDate, endDate, doctorId, limit = 100 } = {}) {
    const where = {};
    if (doctorId) where.doctorId = doctorId;
    if (startDate || endDate) {
        where.date = {};
        if (startDate) where.date[Op.gte] = startDate;
        if (endDate) where.date[Op.lte] = endDate;
    }
    const list = await WorkingDay.findAll({
        where,
        order: [['date', 'ASC']],
        limit: Math.min(Number(limit) || 100, 500)
    });
    return list;
}

module.exports = {
    setWorkingHours,
    updateWorkingHours,
    getWorkingDayByDate,
    getOrCreateWorkingDayForBooking,
    listWorkingDays,
    DEFAULT_CLINIC_START_TIME,
    DEFAULT_CLINIC_END_TIME
};
