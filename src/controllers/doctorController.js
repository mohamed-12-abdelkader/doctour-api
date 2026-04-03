const { Booking, DoctorProfile, User, WorkingDay } = require('../models/index');
const { Op } = require('sequelize');

exports.getDoctors = async (req, res, next) => {
    try {
        const doctors = await DoctorProfile.findAll({
            include: [{ model: User, as: 'user', attributes: ['id', 'name', 'email', 'isActive'] }],
            order: [['id', 'ASC']]
        });
        res.status(200).json({ doctors });
    } catch (error) {
        next(error);
    }
};

exports.getMyDashboard = async (req, res, next) => {
    try {
        const doctorId = req.user.doctorProfile && req.user.doctorProfile.id;
        if (!doctorId) {
            return res.status(403).json({ message: 'Doctor profile not found for this account.' });
        }
        const today = new Date().toISOString().slice(0, 10);
        const startToday = new Date(`${today}T00:00:00.000Z`);
        const endToday = new Date(`${today}T23:59:59.999Z`);

        const [todayBookings, upcomingBookings, workingDays] = await Promise.all([
            Booking.findAll({
                where: { doctorId, appointmentDate: { [Op.between]: [startToday, endToday] }, status: { [Op.not]: 'cancelled' } },
                order: [['appointmentDate', 'ASC'], ['id', 'ASC']]
            }),
            Booking.findAll({
                where: { doctorId, appointmentDate: { [Op.gt]: endToday }, status: { [Op.not]: 'cancelled' } },
                order: [['appointmentDate', 'ASC'], ['id', 'ASC']],
                limit: 20
            }),
            WorkingDay.findAll({
                where: { doctorId, date: { [Op.gte]: today }, isActive: true },
                order: [['date', 'ASC']],
                limit: 14
            })
        ]);

        res.status(200).json({
            doctor: req.user.doctorProfile,
            today,
            todayBookings,
            upcomingBookings,
            workingSchedule: workingDays
        });
    } catch (error) {
        next(error);
    }
};
