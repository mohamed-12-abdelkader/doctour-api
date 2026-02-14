const { Booking, PatientReport, ReportMedication } = require('../models/index');
const { Op } = require('sequelize');

const reportWithMedicationsInclude = [
    { model: PatientReport, include: [{ model: ReportMedication, as: 'medications' }] }
];

// Public: Create a new online booking — الاسم، رقم التليفون، العمر، نوع الكشف (حجز أو استشارة). بدون تاريخ.
exports.createBooking = async (req, res, next) => {
    try {
        const { name, phone, age, visitType } = req.body;

        if (!name || !phone) {
            return res.status(400).json({ message: 'الاسم ورقم التليفون مطلوبان. / name and phone are required.' });
        }

        // نوع الكشف: حجز (checkup) أو استشارة (consultation)
        const visitTypeMap = {
            checkup: 'checkup',
            consultation: 'consultation',
            حجز: 'checkup',
            استشارة: 'consultation'
        };
        const rawVisit = (visitType || 'حجز').toString().trim().toLowerCase();
        const mappedVisit = visitTypeMap[rawVisit] || visitTypeMap[visitType] || 'checkup';
        if (!['checkup', 'consultation'].includes(mappedVisit)) {
            return res.status(400).json({
                message: 'نوع الكشف غير صحيح. استخدم: حجز أو استشارة (أو checkup / consultation).'
            });
        }

        const ageNum = age != null && age !== '' ? parseInt(age, 10) : null;

        const booking = await Booking.create({
            customerName: name.trim(),
            customerPhone: phone.toString().trim(),
            age: Number.isInteger(ageNum) && ageNum >= 0 ? ageNum : null,
            appointmentDate: null,
            bookingType: 'online',
            visitType: mappedVisit,
            status: 'pending'
        });

        res.status(201).json({
            message: 'تم تقديم طلب الحجز بنجاح. / Booking request submitted successfully.',
            booking
        });
    } catch (error) {
        next(error);
    }
};

// Protected: Create a clinic booking (Admin/Staff with manage_daily_bookings)
exports.createClinicBooking = async (req, res, next) => {
    try {
        const { name, phone, date, amountPaid, visitType } = req.body;

        if (!name || !phone || !date) {
            return res.status(400).json({ message: 'Please provide name, phone, and appointment date.' });
        }

        // Validate visitType if provided
        if (visitType && !['checkup', 'followup', 'consultation'].includes(visitType)) {
            return res.status(400).json({ message: 'Invalid visitType. Use checkup, followup, or consultation.' });
        }

        // توحيد التاريخ ليكون ضمن نفس اليوم عند الفلترة (YYYY-MM-DD → منتصف اليوم UTC)
        const dateStr = String(date).trim().slice(0, 10);
        const appointmentDate = /^\d{4}-\d{2}-\d{2}$/.test(dateStr)
            ? new Date(dateStr + 'T12:00:00.000Z')
            : new Date(date);

        const booking = await Booking.create({
            customerName: name,
            customerPhone: phone,
            appointmentDate,
            bookingType: 'clinic',
            amountPaid: amountPaid || 0,
            visitType: visitType || 'checkup',
            status: 'confirmed' // Clinic bookings are confirmed by default
        });

        res.status(201).json({
            message: 'Clinic booking created successfully.',
            booking
        });
    } catch (error) {
        next(error);
    }
};

// Protected: Get all online bookings (with optional filters)
exports.getOnlineBookings = async (req, res, next) => {
    try {
        const { status, date } = req.query;
        const whereClause = { bookingType: 'online' };

        if (status) {
            whereClause.status = status;
        }

        if (date) {
            // نفس اليوم (بداية ونهاية اليوم بالتوقيت المحلي) + حجوزات بدون موعد
            const dateStr = String(date).trim().slice(0, 10); // YYYY-MM-DD
            const startOfDay = new Date(dateStr + 'T00:00:00');
            const endOfDay = new Date(dateStr + 'T23:59:59.999');

            whereClause[Op.or] = [
                { appointmentDate: { [Op.between]: [startOfDay, endOfDay] } },
                { appointmentDate: null }
            ];
        }

        const bookings = await Booking.findAll({
            where: whereClause,
            order: [['appointmentDate', 'ASC'], ['id', 'ASC']]
        });

        res.status(200).json(bookings);
    } catch (error) {
        next(error);
    }
};

// Protected: Get all bookings (online + clinic) with filters
exports.getAllBookings = async (req, res, next) => {
    try {
        const { type, status, date, visitType } = req.query;
        const whereClause = {};

        // Filter by booking type: default = كل الحجوزات (أونلاين بأي حالة + عيادة)
        if (type) {
            whereClause.bookingType = type;
        } else {
            whereClause[Op.or] = [
                { bookingType: 'clinic' },
                { bookingType: 'online' }
            ];
        }

        // Filter by status
        if (status) {
            whereClause.status = status;
        }

        // Filter by visitType
        if (visitType) {
            if (!['checkup', 'followup', 'consultation'].includes(visitType)) {
                return res.status(400).json({ message: 'Invalid visitType. Use checkup, followup, or consultation.' });
            }
            whereClause.visitType = visitType;
        }

        // Filter by date: نفس اليوم (من 00:00 إلى 23:59 بتوقيت UTC) أو حجوزات بدون موعد
        if (date) {
            const dateStr = String(date).trim().slice(0, 10);
            const startOfDay = new Date(dateStr + 'T00:00:00.000Z');
            const endOfDay = new Date(dateStr + 'T23:59:59.999Z');
            whereClause[Op.and] = whereClause[Op.and] || [];
            whereClause[Op.and].push({
                [Op.or]: [
                    { appointmentDate: { [Op.between]: [startOfDay, endOfDay] } },
                    { appointmentDate: null }
                ]
            });
        }

        const bookings = await Booking.findAll({
            where: whereClause,
            order: [['appointmentDate', 'ASC'], ['id', 'ASC']]
        });

        res.status(200).json(bookings);
    } catch (error) {
        next(error);
    }
};

// Protected: Update booking status (confirm/cancel)
exports.updateBookingStatus = async (req, res, next) => {
    try {
        const { status } = req.body;
        const { id } = req.params;

        if (!['confirmed', 'cancelled', 'pending', 'rejected'].includes(status)) {
            return res.status(400).json({ message: 'Invalid status. Use confirmed, cancelled, rejected, or pending.' });
        }

        const booking = await Booking.findByPk(id);

        if (!booking) {
            return res.status(404).json({ message: 'Booking not found.' });
        }

        booking.status = status;
        await booking.save();

        res.status(200).json({
            message: `Booking ${status} successfully.`,
            booking
        });
    } catch (error) {
        next(error);
    }
};

// Protected: Update booking details
exports.updateBooking = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { name, phone, date, amountPaid, visitType } = req.body;

        const booking = await Booking.findByPk(id);

        if (!booking) {
            return res.status(404).json({ message: 'Booking not found.' });
        }

        // Validate visitType if provided
        if (visitType && !['checkup', 'followup', 'consultation'].includes(visitType)) {
            return res.status(400).json({ message: 'Invalid visitType. Use checkup, followup, or consultation.' });
        }

        // Update fields if provided
        if (name) booking.customerName = name;
        if (phone) booking.customerPhone = phone;
        if (date) booking.appointmentDate = date;
        if (amountPaid !== undefined) booking.amountPaid = amountPaid;
        if (visitType) booking.visitType = visitType;
        if (req.body.age !== undefined) booking.age = req.body.age;

        await booking.save();

        res.status(200).json({
            message: 'Booking updated successfully.',
            booking
        });
    } catch (error) {
        next(error);
    }
};

// Protected: Cancel booking
exports.cancelBooking = async (req, res, next) => {
    try {
        const { id } = req.params;

        const booking = await Booking.findByPk(id);

        if (!booking) {
            return res.status(404).json({ message: 'Booking not found.' });
        }

        booking.status = 'cancelled';
        await booking.save();

        res.status(200).json({
            message: 'Booking cancelled successfully.',
            booking
        });
    } catch (error) {
        next(error);
    }
};

// Admin only: Update examination status (حالة الكشف) — waiting | done
exports.updateExaminationStatus = async (req, res, next) => {
    try {
        const { id } = req.params;
        const examinationStatus = req.body?.examinationStatus;

        if (examinationStatus === undefined || examinationStatus === null || examinationStatus === '') {
            return res.status(400).json({
                message: 'examinationStatus is required. Send { "examinationStatus": "done" } or { "examinationStatus": "waiting" }.'
            });
        }

        if (!['waiting', 'done'].includes(String(examinationStatus).toLowerCase())) {
            return res.status(400).json({
                message: 'Invalid examinationStatus. Use "waiting" (في الانتظار) or "done" (تم الكشف).'
            });
        }

        const value = String(examinationStatus).toLowerCase();
        const booking = await Booking.findByPk(id);

        if (!booking) {
            return res.status(404).json({ message: 'Booking not found.' });
        }

        booking.examinationStatus = value;
        await booking.save();
        await booking.reload();

        res.status(200).json({
            message: value === 'done' ? 'Examination marked as done (تم الكشف).' : 'Examination status set to waiting (في الانتظار).',
            booking
        });
    } catch (error) {
        if (error.name === 'SequelizeDatabaseError' && error.message && error.message.includes('examinationStatus')) {
            return res.status(503).json({
                message: 'Database migration required. Run: node run-examination-status-migration.js'
            });
        }
        next(error);
    }
};

// Protected: Get booking details with patient history (includes report + medications per visit)
exports.getBookingWithHistory = async (req, res, next) => {
    try {
        const { id } = req.params;

        // Get the current booking with report and medications
        const currentBooking = await Booking.findByPk(id, {
            include: reportWithMedicationsInclude
        });

        if (!currentBooking) {
            return res.status(404).json({ message: 'Booking not found.' });
        }

        // Get all past bookings with the same phone number (with report + medications)
        const pastBookings = await Booking.findAll({
            where: {
                customerPhone: currentBooking.customerPhone,
                id: { [Op.ne]: currentBooking.id },
                appointmentDate: { [Op.lt]: new Date() }
            },
            order: [['appointmentDate', 'DESC']],
            include: reportWithMedicationsInclude
        });

        // Calculate statistics
        const totalVisits = pastBookings.length;
        const totalPaid = pastBookings.reduce((sum, booking) => {
            return sum + parseFloat(booking.amountPaid || 0);
        }, 0);

        const lastVisit = pastBookings.length > 0 ? pastBookings[0] : null;

        res.status(200).json({
            currentBooking,
            patientHistory: {
                totalPastVisits: totalVisits,
                totalAmountPaid: totalPaid.toFixed(2),
                lastVisit: lastVisit ? {
                    date: lastVisit.appointmentDate,
                    visitType: lastVisit.visitType,
                    amountPaid: lastVisit.amountPaid,
                    status: lastVisit.status
                } : null,
                pastBookings
            }
        });
    } catch (error) {
        next(error);
    }
};

