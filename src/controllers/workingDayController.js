const workingDayService = require('../services/workingDayService');
const { validateSetWorkingHours, validateUpdateWorkingHours } = require('../validators/workingDayValidator');

/**
 * POST /api/admin/working-days
 * Set working hours for a specific date (creates or replaces).
 */
exports.setWorkingHours = async (req, res, next) => {
    try {
        const validation = validateSetWorkingHours(req.body);
        if (validation) {
            return res.status(400).json({ message: validation.error });
        }
        const { date, startTime, endTime, doctorId } = req.body;
        const workingDay = await workingDayService.setWorkingHours(
            String(date).trim(),
            startTime,
            endTime,
            req.user.id,
            parseInt(doctorId, 10)
        );
        res.status(201).json({
            message: 'تم تعيين ساعات العمل بنجاح',
            workingDay
        });
    } catch (err) {
        next(err);
    }
};

/**
 * PUT /api/admin/working-days/:id
 * Update working hours by id.
 */
exports.updateWorkingHours = async (req, res, next) => {
    try {
        const validation = validateUpdateWorkingHours(req.body);
        if (validation) {
            return res.status(400).json({ message: validation.error });
        }
        const id = parseInt(req.params.id, 10);
        if (Number.isNaN(id)) {
            return res.status(400).json({ message: 'معرف غير صحيح' });
        }
        const workingDay = await workingDayService.updateWorkingHours(id, req.body);
        if (!workingDay) {
            return res.status(404).json({ message: 'يوم العمل غير موجود' });
        }
        res.status(200).json({
            message: 'تم تحديث ساعات العمل',
            workingDay
        });
    } catch (err) {
        next(err);
    }
};

/**
 * GET /api/admin/working-days?date=YYYY-MM-DD
 * GET /api/admin/working-days?startDate=...&endDate=...
 * Get working day for a date or list in range.
 */
exports.getWorkingDays = async (req, res, next) => {
    try {
        const { date, startDate, endDate, doctorId, limit } = req.query;
        if (!doctorId || !/^\d+$/.test(String(doctorId))) {
            return res.status(400).json({ message: 'doctorId query is required' });
        }
        const doctorIdInt = parseInt(doctorId, 10);
        if (date) {
            const wd = await workingDayService.getWorkingDayByDate(String(date).trim(), doctorIdInt);
            if (!wd) {
                return res.status(404).json({ message: 'الحجز غير متاح اليوم', workingDay: null });
            }
            return res.status(200).json({ workingDay: wd });
        }
        const list = await workingDayService.listWorkingDays({
            startDate: startDate ? String(startDate).trim() : undefined,
            endDate: endDate ? String(endDate).trim() : undefined,
            doctorId: doctorIdInt,
            limit
        });
        res.status(200).json({ workingDays: list });
    } catch (err) {
        next(err);
    }
};
