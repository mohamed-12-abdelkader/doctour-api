const { WorkingDay } = require('../models/index');
const { Op } = require('sequelize');

/**
 * Set or update working hours for a specific date. Creates or updates one record per date.
 */
async function setWorkingHours(date, startTime, endTime, adminId) {
    const [wd, created] = await WorkingDay.upsert(
        {
            date,
            startTime: String(startTime).trim(),
            endTime: String(endTime).trim(),
            isActive: true,
            createdBy: adminId
        },
        { conflictFields: ['date'] }
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
    if (payload.isActive !== undefined) wd.isActive = !!payload.isActive;
    await wd.save();
    return wd;
}

/**
 * Get working day for a specific date. Returns null if not set or inactive.
 */
async function getWorkingDayByDate(date) {
    const wd = await WorkingDay.findOne({
        where: { date, isActive: true }
    });
    return wd;
}

/**
 * List working days (optional date range).
 */
async function listWorkingDays({ startDate, endDate, limit = 100 } = {}) {
    const where = {};
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
    listWorkingDays
};
