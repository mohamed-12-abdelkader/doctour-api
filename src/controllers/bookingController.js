const { Booking, PatientReport, ReportMedication } = require('../models/index');
const { Op } = require('sequelize');
const workingDayService = require('../services/workingDayService');
const { notifyNewOnlineBooking, notifyBookingStatusChange } = require('../services/notificationService');
const { emitBookingUpdateForDate } = require('../socket');
const { parseTimeToMinutes, minutesToTimeStr } = require('../utils/slotHelper');

const reportWithMedicationsInclude = [
    {
        model: PatientReport,
        as: 'reports',
        attributes: ['id', 'bookingId', 'medicalCondition', 'notes', 'prescriptionImageUrl', 'createdAt', 'updatedAt'],
        include: [{ model: ReportMedication, as: 'medications', attributes: ['id', 'medicationName', 'dosage', 'frequency', 'notes'] }]
    }
];

/** Get YYYY-MM-DD from booking (slotDate or appointmentDate) for real-time room. */
function getBookingDateStr(booking) {
    if (booking.slotDate) return String(booking.slotDate).trim().slice(0, 10);
    if (booking.appointmentDate) {
        const d = new Date(booking.appointmentDate);
        return d.toISOString().slice(0, 10);
    }
    return null;
}

/**
 * حساب وقت الكشف المتوقع لحجز مؤكد حسب ترتيبه في نفس اليوم وساعات العمل.
 * @param {object} booking - حجز له appointmentDate أو slotDate في يوم معين
 * @returns {Promise<{ expectedExaminationTime: string, positionInQueue: number, workingHours: { start, end } } | null>}
 */
async function getExpectedExaminationTime(booking) {
    const dateStr = getBookingDateStr(booking);
    if (!dateStr) return null;

    const workingDay = await workingDayService.getWorkingDayByDate(dateStr);
    if (!workingDay) return null;

    const startMin = parseTimeToMinutes(workingDay.startTime);
    const endMin = parseTimeToMinutes(workingDay.endTime);
    if (Number.isNaN(startMin) || Number.isNaN(endMin)) return null;

    const startOfDay = new Date(dateStr + 'T00:00:00.000Z');
    const endOfDay = new Date(dateStr + 'T23:59:59.999Z');

    const sameDayBookings = await Booking.findAll({
        where: {
            status: 'confirmed',
            [Op.or]: [
                { appointmentDate: { [Op.between]: [startOfDay, endOfDay] } },
                { slotDate: dateStr }
            ]
        },
        order: [['id', 'ASC']],
        attributes: ['id', 'timeSlot', 'appointmentDate', 'slotDate']
    });

    sameDayBookings.sort((a, b) => {
        const slotA = a.timeSlot || (a.appointmentDate ? new Date(a.appointmentDate).toISOString().slice(11, 16) : '99:99');
        const slotB = b.timeSlot || (b.appointmentDate ? new Date(b.appointmentDate).toISOString().slice(11, 16) : '99:99');
        return slotA.localeCompare(slotB) || (a.id - b.id);
    });

    const position = sameDayBookings.findIndex(b => b.id === booking.id) + 1;
    if (position < 1) return null;

    const slotMinutes = 60;
    let expectedMin = startMin + (position - 1) * slotMinutes;
    if (expectedMin >= endMin) expectedMin = endMin - slotMinutes;
    if (expectedMin < startMin) expectedMin = startMin;

    return {
        expectedExaminationTime: minutesToTimeStr(expectedMin),
        positionInQueue: position,
        totalInDay: sameDayBookings.length,
        workingHours: { start: workingDay.startTime, end: workingDay.endTime }
    };
}

/**
 * حساب الطاقة الاستيعابية لليوم بناءً على ساعات العمل.
 * كل ساعة = حجز واحد. مثال: 10:00 → 14:00 = 4 حجوزات كحد أقصى.
 */
function calculateCapacity(startTime, endTime) {
    const [sh, sm] = startTime.split(':').map(Number);
    const [eh, em] = endTime.split(':').map(Number);
    const diffMinutes = (eh * 60 + em) - (sh * 60 + sm);
    return Math.max(1, Math.floor(diffMinutes / 60));
}

/**
 * عدد الحجوزات النشطة (مش ملغية أو مرفوضة) ليوم معين — حجوزات العيادة فقط.
 * الحجوزات الأونلاين لا تحتسب ضمن الطاقة اليومية.
 * @param {string} dateStr - YYYY-MM-DD
 * @param {number|null} excludeId - حجز يتم تعديله (لا يُحسب في العداد)
 */
async function getActiveBookingsCount(dateStr, excludeId = null) {
    const startOfDay = new Date(dateStr + 'T00:00:00.000Z');
    const endOfDay = new Date(dateStr + 'T23:59:59.999Z');
    const where = {
        bookingType: 'clinic',
        appointmentDate: { [Op.between]: [startOfDay, endOfDay] },
        status: { [Op.notIn]: ['cancelled', 'rejected'] }
    };
    if (excludeId) where.id = { [Op.ne]: excludeId };
    return Booking.count({ where });
}

// Public: إنشاء حجز أونلاين جديد — لا يحتاج تسجيل دخول
exports.createBooking = async (req, res, next) => {
    try {
        const { name, phone, preferredDate, preferredTime, visitType } = req.body;

        // ─── التحقق من الحقول الإجبارية ───────────────────────────────
        if (!name || !phone) {
            return res.status(400).json({ message: 'الاسم ورقم التليفون مطلوبان. / name and phone are required.' });
        }

        // ─── التحقق من رقم الهاتف المصري ──────────────────────────────
        const phoneStr = phone.toString().trim().replace(/\s+/g, '');
        const egyptianPhoneRegex = /^(\+20|0020|0)?1[0125][0-9]{8}$/;
        if (!egyptianPhoneRegex.test(phoneStr)) {
            return res.status(400).json({
                message: 'رقم الهاتف غير صحيح. يجب أن يكون رقم مصري صحيح مثل 01012345678. / Invalid Egyptian phone number.'
            });
        }
        // توحيد رقم الهاتف → 11 رقم يبدأ بـ 01
        const normalizedPhone = phoneStr.replace(/^(\+20|0020)/, '0');

        // ─── التحقق من الوقت المفضل ────────────────────────────────────
        if (preferredTime) {
            const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
            if (!timeRegex.test(preferredTime)) {
                return res.status(400).json({
                    message: 'صيغة الوقت غير صحيحة. استخدم HH:MM مثل 10:00. / Invalid time format. Use HH:MM e.g. 10:00.'
                });
            }
        }

        // ─── التحقق من التاريخ ────────────────────────────────────────
        if (preferredDate) {
            const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
            if (!dateRegex.test(preferredDate)) {
                return res.status(400).json({
                    message: 'صيغة التاريخ غير صحيحة. استخدم YYYY-MM-DD. / Invalid date format. Use YYYY-MM-DD.'
                });
            }
        }

        // ─── منع تكرار الحجز (نفس الهاتف + نفس التاريخ + نفس الوقت) ──
        if (preferredDate && preferredTime) {
            const duplicate = await Booking.findOne({
                where: {
                    customerPhone: normalizedPhone,
                    preferredDate,
                    preferredTime,
                    status: { [Op.notIn]: ['cancelled', 'rejected'] }
                }
            });
            if (duplicate) {
                return res.status(409).json({
                    message: `يوجد حجز مسبق بنفس رقم الهاتف في نفس التاريخ والوقت (${preferredDate} - ${preferredTime}). / Duplicate booking detected.`
                });
            }
        }

        // ─── نوع الكشف ────────────────────────────────────────────────
        const visitTypeMap = { checkup: 'checkup', consultation: 'consultation', حجز: 'checkup', استشارة: 'consultation' };
        const rawVisit = (visitType || 'checkup').toString().trim().toLowerCase();
        const mappedVisit = visitTypeMap[rawVisit] || 'checkup';
        if (!['checkup', 'consultation'].includes(mappedVisit)) {
            return res.status(400).json({
                message: 'نوع الكشف غير صحيح. استخدم: checkup أو consultation.'
            });
        }

        // ─── إنشاء الحجز ─────────────────────────────────────────────
        const booking = await Booking.create({
            customerName: name.trim(),
            customerPhone: normalizedPhone,
            appointmentDate: null,   // يحدده الأدمن عند التأكيد
            bookingType: 'online',
            visitType: mappedVisit,
            status: 'pending',
            preferredDate: preferredDate || null,
            preferredTime: preferredTime || null
        });

        // ─── إرسال إشعار للأدمن والستاف ───────────────────────────────
        notifyNewOnlineBooking(booking).catch(err =>
            console.error('⚠️  Notification failed (non-blocking):', err.message)
        );

        res.status(201).json({
            message: 'تم تقديم طلب الحجز بنجاح. سيتواصل معك الفريق لتأكيد الموعد. / Booking request submitted successfully.',
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

        // ❌ منع إنشاء حجز لو الأدمن مش محدد يوم عمل لهذا التاريخ
        const workingDay = await workingDayService.getWorkingDayByDate(dateStr);
        if (!workingDay) {
            return res.status(400).json({
                message: `لا يمكن إنشاء حجز في ${dateStr} — لم يتم تحديد يوم عمل نشط لهذا التاريخ. / No active working day is set for ${dateStr}. Please configure working hours first.`
            });
        }

        // ❌ منع إنشاء حجز لو الطاقة الاستيعابية امتلأت
        const capacity = calculateCapacity(workingDay.startTime, workingDay.endTime);
        const currentCount = await getActiveBookingsCount(dateStr);
        if (currentCount >= capacity) {
            return res.status(409).json({
                message: `الوقت انتهى — لا يمكن إضافة حجوزات جديدة في ${dateStr}. / Booking slots are full for ${dateStr}.`,
                details: {
                    date: dateStr,
                    workingHours: `${workingDay.startTime} → ${workingDay.endTime}`,
                    maxBookings: capacity,
                    currentBookings: currentCount
                }
            });
        }

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
// Supports: ?date=YYYY-MM-DD | ?startDate=...&endDate=... | or combined
exports.getAllBookings = async (req, res, next) => {
    try {
        const { type, status, date, startDate, endDate, visitType } = req.query;
        const whereClause = {};

        // ── نوع الحجز ───────────────────────────────────────────────────
        if (type) {
            whereClause.bookingType = type;
        } else {
            whereClause[Op.or] = [
                { bookingType: 'clinic' },
                { bookingType: 'online' }
            ];
        }

        // ── تحديد نطاق التاريخ ──────────────────────────────────────────
        // أي فلتر تاريخ بدون status صريح → confirmed فقط
        const hasDateFilter = !!(date || startDate || endDate);

        if (status) {
            whereClause.status = status;
        } else if (hasDateFilter) {
            whereClause.status = 'confirmed';
        }

        // ── فلتر visitType ──────────────────────────────────────────────
        if (visitType) {
            if (!['checkup', 'followup', 'consultation'].includes(visitType)) {
                return res.status(400).json({ message: 'Invalid visitType. Use checkup, followup, or consultation.' });
            }
            whereClause.visitType = visitType;
        }

        // ── تطبيق فلتر التاريخ ──────────────────────────────────────────
        if (hasDateFilter) {
            whereClause[Op.and] = whereClause[Op.and] || [];

            if (date) {
                // يوم واحد محدد — الأولوية لـ date على startDate/endDate
                const dateStr = String(date).trim().slice(0, 10);
                const startOfDay = new Date(dateStr + 'T00:00:00.000Z');
                const endOfDay = new Date(dateStr + 'T23:59:59.999Z');
                whereClause[Op.and].push({
                    appointmentDate: { [Op.between]: [startOfDay, endOfDay] }
                });
            } else {
                // نطاق تاريخ ─ startDate و/أو endDate
                const dateFilter = {};

                if (startDate) {
                    const startStr = String(startDate).trim().slice(0, 10);
                    if (!/^\d{4}-\d{2}-\d{2}$/.test(startStr)) {
                        return res.status(400).json({ message: 'Invalid startDate format. Use YYYY-MM-DD.' });
                    }
                    dateFilter[Op.gte] = new Date(startStr + 'T00:00:00.000Z');
                }

                if (endDate) {
                    const endStr = String(endDate).trim().slice(0, 10);
                    if (!/^\d{4}-\d{2}-\d{2}$/.test(endStr)) {
                        return res.status(400).json({ message: 'Invalid endDate format. Use YYYY-MM-DD.' });
                    }
                    dateFilter[Op.lte] = new Date(endStr + 'T23:59:59.999Z');
                }

                whereClause[Op.and].push({ appointmentDate: dateFilter });
            }
        }

        const bookings = await Booking.findAll({
            where: whereClause,
            order: [['appointmentDate', 'ASC'], ['id', 'ASC']]
        });

        res.status(200).json({ total: bookings.length, bookings });
    } catch (error) {
        next(error);
    }
};

// Protected: تأكيد أو رفض حجز أونلاين (manage_online_bookings)
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

        // عند تأكيد حجز أونلاين → نحدد appointmentDate من preferredDate أو من body.date
        const confirmDate = status === 'confirmed' && booking.bookingType === 'online' && (req.body.date || booking.preferredDate);
        if (confirmDate) {
            const dateStr = String(req.body.date || booking.preferredDate).trim().slice(0, 10);
            if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
                booking.appointmentDate = new Date(dateStr + 'T12:00:00.000Z');
            }
        }

        booking.status = status;
        await booking.save();

        // إرسال إشعار (non-blocking)
        notifyBookingStatusChange(booking, status).catch(err =>
            console.error('⚠️  Notification failed (non-blocking):', err.message)
        );

        const responsePayload = { message: `Booking ${status} successfully.`, booking };

        if (status === 'confirmed' && booking.bookingType === 'online' && getBookingDateStr(booking)) {
            const expected = await getExpectedExaminationTime(booking);
            if (expected) {
                responsePayload.expectedExaminationTime = expected.expectedExaminationTime;
                responsePayload.positionInQueue = expected.positionInQueue;
                responsePayload.totalInDay = expected.totalInDay;
                responsePayload.workingHours = expected.workingHours;
            }
        }

        res.status(200).json(responsePayload);
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
        if (amountPaid !== undefined) booking.amountPaid = amountPaid;
        if (visitType) booking.visitType = visitType;
        if (req.body.age !== undefined) booking.age = req.body.age;

        // لو بيتحدد/بيتغير التاريخ → نتحقق من يوم العمل والطاقة الاستيعابية
        if (date) {
            const newDateStr = String(date).trim().slice(0, 10);

            // تحقق من وجود يوم عمل نشط
            const workingDay = await workingDayService.getWorkingDayByDate(newDateStr);
            if (!workingDay) {
                return res.status(400).json({
                    message: `لا يمكن تحديد موعد في ${newDateStr} — لم يتم تحديد يوم عمل نشط لهذا التاريخ. / No active working day is set for ${newDateStr}.`
                });
            }

            // تحقق من الطاقة الاستيعابية (استثناء الحجز الحالي من العداد)
            const capacity = calculateCapacity(workingDay.startTime, workingDay.endTime);
            const currentCount = await getActiveBookingsCount(newDateStr, booking.id);
            if (currentCount >= capacity) {
                return res.status(409).json({
                    message: `الوقت انتهى — لا يمكن إضافة حجوزات جديدة في ${newDateStr}. / Booking slots are full for ${newDateStr}.`,
                    details: {
                        date: newDateStr,
                        workingHours: `${workingDay.startTime} → ${workingDay.endTime}`,
                        maxBookings: capacity,
                        currentBookings: currentCount
                    }
                });
            }

            booking.appointmentDate = date;
        }

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

        const dateStr = getBookingDateStr(booking);
        if (dateStr) {
            emitBookingUpdateForDate(dateStr, { action: 'examinationStatus', booking: booking.toJSON() });
        }

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

