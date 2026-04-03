const { Booking, PatientReport, ReportMedication } = require('../models/index');
const { Op } = require('sequelize');
const workingDayService = require('../services/workingDayService');
const bookingSlotService = require('../services/bookingSlotService');
const { notifyNewOnlineBooking, notifyBookingStatusChange } = require('../services/notificationService');
const { emitBookingListChange } = require('../socket');
const { parseTimeToMinutes, minutesToTimeStr, SLOT_DURATION_MINUTES, normalizeTimeSlot } = require('../utils/slotHelper');

// قائمة أنواع الزيارة التفصيلية المتاحة لحجوزات العيادة
const CLINIC_PROCEDURE_TYPES = [
    'كشف',
    'إعادة',
    'Botox',
    'filler',
    'تنعيم علاجي للشعر',
    'Skin booster',
    'جلسة أوكسجينو',
    'تقشير بارد',
    'تقشير كيميائي',
    'ديرما بن بلازما أو ميزو',
    'جلسة تساقط الشعر',
    'إزالة الزوائد الجلدية',
    'توريد علاجي للشفايف',
    'تنضيف بشرة Basic',
    'تنضيف بشرة عميق'
];

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
 * وقت الموعد الفعلي للعرض — من timeSlot أو من appointmentDate (ساعة:دقيقة بتوقيت السيرفر).
 * @param {object} booking - حجز (model أو plain)
 * @returns {string|null} مثل "13:10" أو "1:10" (12 ساعة) — null إن لم يوجد موعد
 */
function getBookingTimeStr(booking, use12h = true) {
    if (booking.timeSlot && /^\d{1,2}:\d{2}$/.test(String(booking.timeSlot).trim())) {
        const s = String(booking.timeSlot).trim();
        if (!use12h) return s;
        const [h, m] = s.split(':').map(Number);
        if (h === 0) return `12:${String(m).padStart(2, '0')}`;
        if (h < 12) return `${h}:${String(m).padStart(2, '0')}`;
        return `${h === 12 ? 12 : h - 12}:${String(m).padStart(2, '0')}`;
    }
    if (booking.appointmentDate) {
        const d = new Date(booking.appointmentDate);
        const h = d.getHours(), m = d.getMinutes();
        if (!use12h) return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
        if (h === 0) return `12:${String(m).padStart(2, '0')}`;
        if (h < 12) return `${h}:${String(m).padStart(2, '0')}`;
        return `${h === 12 ? 12 : h - 12}:${String(m).padStart(2, '0')}`;
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

    if (!booking.doctorId) return null;
    const workingDay = await workingDayService.getWorkingDayByDate(dateStr, booking.doctorId);
    if (!workingDay) return null;

    const startMin = parseTimeToMinutes(workingDay.startTime);
    const endMin = parseTimeToMinutes(workingDay.endTime);
    if (Number.isNaN(startMin) || Number.isNaN(endMin)) return null;

    const startOfDay = new Date(dateStr + 'T00:00:00.000Z');
    const endOfDay = new Date(dateStr + 'T23:59:59.999Z');

    const sameDayBookings = await Booking.findAll({
        where: {
            doctorId: booking.doctorId,
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
 * كل 10 دقائق = موعد واحد (نفس نظام السلاطات). مثال: 21:00 → 22:00 = 6 مواعيد.
 */
function calculateCapacity(startTime, endTime) {
    const startMin = parseTimeToMinutes(startTime);
    const endMin = parseTimeToMinutes(endTime);
    if (Number.isNaN(startMin) || Number.isNaN(endMin) || startMin >= endMin) return 1;
    const diffMinutes = endMin - startMin;
    return Math.max(1, Math.floor(diffMinutes / SLOT_DURATION_MINUTES));
}

/**
 * عدد الحجوزات النشطة (مش ملغية أو مرفوضة) ليوم معين — حجوزات العيادة فقط.
 * الحجوزات الأونلاين لا تحتسب ضمن الطاقة اليومية.
 * @param {string} dateStr - YYYY-MM-DD
 * @param {number|null} excludeId - حجز يتم تعديله (لا يُحسب في العداد)
 */
async function getActiveBookingsCount(dateStr, doctorId, excludeId = null) {
    const startOfDay = new Date(dateStr + 'T00:00:00.000Z');
    const endOfDay = new Date(dateStr + 'T23:59:59.999Z');
    const where = {
        bookingType: 'clinic',
        doctorId,
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
        const { name, phone, date, time, amountPaid, visitType, doctorId } = req.body;

        if (!name || !phone || !date || !doctorId) {
            return res.status(400).json({ message: 'Please provide name, phone, appointment date, and doctorId.' });
        }

        // Validate visitType (procedure name) if provided
        if (visitType && !CLINIC_PROCEDURE_TYPES.includes(visitType)) {
            return res.status(400).json({
                message: 'Invalid visitType. Use one of predefined clinic procedures.',
                allowedVisitTypes: CLINIC_PROCEDURE_TYPES
            });
        }

        // توحيد التاريخ ليكون ضمن نفس اليوم عند الفلترة (YYYY-MM-DD → منتصف اليوم UTC)
        const dateStr = String(date).trim().slice(0, 10);

        // ❌ منع إنشاء حجز لو الأدمن مش محدد يوم عمل لهذا التاريخ
        const workingDay = await workingDayService.getWorkingDayByDate(dateStr, Number(doctorId));
        if (!workingDay) {
            return res.status(400).json({
                message: `لا يمكن إنشاء حجز في ${dateStr} — لم يتم تحديد يوم عمل نشط لهذا التاريخ. / No active working day is set for ${dateStr}. Please configure working hours first.`
            });
        }

        // ❌ منع إنشاء حجز لو الطاقة الاستيعابية امتلأت
        const capacity = calculateCapacity(workingDay.startTime, workingDay.endTime);
        const currentCount = await getActiveBookingsCount(dateStr, Number(doctorId));
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

        let appointmentDate;
        if (time && /^\d{1,2}:\d{2}$/.test(String(time).trim())) {
            const [h, m] = String(time).trim().split(':').map(Number);
            if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
                const timePart = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;
                appointmentDate = new Date(dateStr + 'T' + timePart);
            } else {
                appointmentDate = new Date(dateStr + 'T12:00:00.000Z');
            }
        } else if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
            appointmentDate = new Date(dateStr + 'T12:00:00.000Z');
        } else {
            appointmentDate = new Date(date);
        }

        const legacyVisitEnum = visitType === 'إعادة'
            ? 'followup'
            : 'checkup';

        const booking = await Booking.create({
            customerName: name,
            customerPhone: phone,
            doctorId: Number(doctorId),
            assignedBy: req.user.id,
            appointmentDate,
            bookingType: 'clinic',
            amountPaid: amountPaid || 0,
            visitType: legacyVisitEnum,
            procedureType: visitType || null,
            status: 'confirmed' // Clinic bookings are confirmed by default
        });

        emitBookingListChange(booking, 'created');

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
        const { type, status, date, startDate, endDate, visitType, doctorId } = req.query;
        const whereClause = {};
        if (req.user.role === 'doctor') {
            const myDoctorId = req.user.doctorProfile && req.user.doctorProfile.id;
            if (!myDoctorId) return res.status(403).json({ message: 'Doctor profile not found for this account.' });
            whereClause.doctorId = myDoctorId;
        } else if (doctorId) {
            whereClause.doctorId = Number(doctorId);
        }

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
        const allowedLegacyVisit = ['checkup', 'followup', 'consultation'];
        if (visitType) {
            if (allowedLegacyVisit.includes(visitType)) {
                whereClause.visitType = visitType;
            } else if (CLINIC_PROCEDURE_TYPES.includes(visitType)) {
                whereClause.procedureType = visitType;
            } else {
                return res.status(400).json({
                    message: 'Invalid visitType. Use checkup, followup, consultation, or one of predefined clinic procedures.',
                    allowedVisitTypes: [...allowedLegacyVisit, ...CLINIC_PROCEDURE_TYPES]
                });
            }
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

        const list = bookings.map(b => {
            const plain = b.get ? b.get({ plain: true }) : b;
            return {
                ...plain,
                appointmentTime: getBookingTimeStr(b, true),
                appointmentTime24: getBookingTimeStr(b, false)
            };
        });

        res.status(200).json({ total: list.length, bookings: list });
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

        // تأكيد حجز أونلاين: إلزامي تحديد تاريخ + وقت من المواعيد المتاحة فقط (مثل حجز العيادة)
        if (status === 'confirmed' && booking.bookingType === 'online') {
            const dateInput = req.body.date;
            const timeRaw = req.body.time ?? req.body.timeSlot;
            if (!dateInput || timeRaw == null || String(timeRaw).trim() === '') {
                return res.status(400).json({
                    message:
                        'يجب تحديد تاريخ ووقت الموعد عند تأكيد حجز أونلاين. استخدم GET /api/bookings/available-slots?date=YYYY-MM-DD لمعرفة المواعيد المتاحة ثم أرسل date و time (HH:mm).',
                    required: ['date', 'time'],
                    hint: 'GET /api/bookings/available-slots?date=YYYY-MM-DD'
                });
            }
            const doctorId = Number(req.body.doctorId || booking.doctorId);
            if (!doctorId) {
                return res.status(400).json({ message: 'doctorId is required to confirm online booking.' });
            }
            const dateStr = String(dateInput).trim().slice(0, 10);
            if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
                return res.status(400).json({ message: 'Invalid date format. Use YYYY-MM-DD.' });
            }
            const normalizedTime = normalizeTimeSlot(String(timeRaw));
            if (!normalizedTime) {
                return res.status(400).json({ message: 'Invalid time format. Use HH:mm (e.g. 13:10).' });
            }

            const slotsResult = await bookingSlotService.getAvailableSlots(dateStr, { excludeBookingId: booking.id, doctorId });
            if (!slotsResult.available) {
                return res.status(400).json({
                    message:
                        'لا يوجد مواعيد عمل متاحة لهذا اليوم — لا يمكن تأكيد الحجز الأونلاين. / ' + (slotsResult.message || ''),
                    messageEn: slotsResult.message || 'No available working slots for this date.',
                    details: { date: dateStr }
                });
            }
            if (!slotsResult.availableSlots.includes(normalizedTime)) {
                return res.status(400).json({
                    message:
                        'الموعد المحدد غير متاح. اختر يوماً ووقتاً من قائمة المواعيد المتاحة فقط لهذا اليوم.',
                    date: dateStr,
                    requestedTime: normalizedTime,
                    available_slots: slotsResult.availableSlots
                });
            }

            const [h, m] = normalizedTime.split(':').map(Number);
            booking.appointmentDate = new Date(
                `${dateStr}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`
            );
            booking.doctorId = doctorId;
            booking.assignedBy = req.user.id;
        }

        booking.status = status;
        await booking.save();

        emitBookingListChange(booking, 'statusChanged');

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
        const { name, phone, date, amountPaid, visitType, doctorId } = req.body;

        const booking = await Booking.findByPk(id);

        if (!booking) {
            return res.status(404).json({ message: 'Booking not found.' });
        }

        const prevDateStr = getBookingDateStr(booking);

        // Validate visitType if provided (قيم قديمة أو أنواع الإجراءات)
        const allowedLegacy = ['checkup', 'followup', 'consultation'];
        if (visitType && !allowedLegacy.includes(visitType) && !CLINIC_PROCEDURE_TYPES.includes(visitType)) {
            return res.status(400).json({
                message: 'Invalid visitType. Use checkup, followup, consultation, or one of predefined clinic procedures.',
                allowedVisitTypes: [...allowedLegacy, ...CLINIC_PROCEDURE_TYPES]
            });
        }

        // Update fields if provided
        if (name) booking.customerName = name;
        if (phone) booking.customerPhone = phone;
        if (amountPaid !== undefined) booking.amountPaid = amountPaid;
        if (doctorId !== undefined) booking.doctorId = Number(doctorId);
        if (visitType) {
            if (CLINIC_PROCEDURE_TYPES.includes(visitType)) {
                booking.visitType = visitType === 'إعادة' ? 'followup' : 'checkup';
                booking.procedureType = visitType;
            } else {
                booking.visitType = visitType;
                booking.procedureType = null;
            }
        }
        if (req.body.age !== undefined) booking.age = req.body.age;

        // لو بيتحدد/بيتغير التاريخ → نتحقق من يوم العمل والطاقة الاستيعابية
        if (date) {
            const newDateStr = String(date).trim().slice(0, 10);

            // تحقق من وجود يوم عمل نشط
            if (!booking.doctorId) {
                return res.status(400).json({ message: 'doctorId is required before assigning appointment date.' });
            }
            const workingDay = await workingDayService.getWorkingDayByDate(newDateStr, booking.doctorId);
            if (!workingDay) {
                return res.status(400).json({
                    message: `لا يمكن تحديد موعد في ${newDateStr} — لم يتم تحديد يوم عمل نشط لهذا التاريخ. / No active working day is set for ${newDateStr}.`
                });
            }

            // تحقق من الطاقة الاستيعابية (استثناء الحجز الحالي من العداد)
            const capacity = calculateCapacity(workingDay.startTime, workingDay.endTime);
            const currentCount = await getActiveBookingsCount(newDateStr, booking.doctorId, booking.id);
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

        emitBookingListChange(booking, 'updated', prevDateStr);

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

        emitBookingListChange(booking, 'cancelled');

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

        emitBookingListChange(booking, 'examinationStatus');

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
        const doctorScopeId = req.user && req.user.role === 'doctor'
            ? (req.user.doctorProfile && req.user.doctorProfile.id)
            : null;

        // Get the current booking with report and medications
        const currentBooking = await Booking.findByPk(id, {
            include: reportWithMedicationsInclude
        });

        if (!currentBooking) {
            return res.status(404).json({ message: 'Booking not found.' });
        }
        if (doctorScopeId && Number(currentBooking.doctorId) !== Number(doctorScopeId)) {
            return res.status(403).json({ message: 'Access denied. This booking does not belong to this doctor.' });
        }

        // Get all past bookings with the same phone number (with report + medications)
        const pastWhere = {
            customerPhone: currentBooking.customerPhone,
            id: { [Op.ne]: currentBooking.id },
            appointmentDate: { [Op.lt]: new Date() }
        };
        if (doctorScopeId) {
            // Doctor must only see this patient's visits with the same doctor.
            pastWhere.doctorId = doctorScopeId;
        }
        const pastBookings = await Booking.findAll({
            where: pastWhere,
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

