const { Booking, PatientReport, ReportMedication, User, BookingActivity } = require('../models/index');
const { Op } = require('sequelize');
const workingDayService = require('../services/workingDayService');
const bookingSlotService = require('../services/bookingSlotService');
const { notifyNewOnlineBooking, notifyBookingStatusChange } = require('../services/notificationService');
const { emitBookingListChange } = require('../socket');
const { parseTimeToMinutes, minutesToTimeStr, SLOT_DURATION_MINUTES, normalizeTimeSlot } = require('../utils/slotHelper');
const {
    parseProcedureTypesFromBody,
    validateProcedureTypes,
    resolveLegacyVisitEnum,
    procedureTypesToLegacyString,
    enrichBookingProcedures,
    normalizePhone
} = require('../utils/clinicProcedureHelper');
const {
    getActiveServiceNames,
    getFollowupServiceNames
} = require('../services/clinicServiceCatalog');
const { createClinicBookingAtomic } = require('../services/clinicBookingService');
const { validatePaymentPayload, enrichPaymentMethod } = require('../utils/paymentMethodHelper');
const { PAYMENT_METHODS, PAYMENT_METHOD_LABELS } = require('../constants/paymentMethods');

const reportWithMedicationsInclude = [
    {
        model: PatientReport,
        as: 'reports',
        attributes: ['id', 'bookingId', 'medicalCondition', 'notes', 'prescriptionImageUrl', 'createdAt', 'updatedAt'],
        include: [{ model: ReportMedication, as: 'medications', attributes: ['id', 'medicationName', 'dosage', 'frequency', 'notes'] }]
    }
];

const BOOKING_ACTION_LABELS = {
    created: 'إنشاء الحجز',
    updated: 'تعديل الحجز',
    cancelled: 'إلغاء الحجز',
    status_changed: 'تغيير حالة الحجز',
    examination_status_changed: 'تغيير حالة الكشف'
};

function publicUser(user) {
    if (!user) return null;
    return {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role
    };
}

async function logBookingActivity(bookingId, user, action, metadata = null) {
    if (!bookingId) return null;
    return BookingActivity.create({
        bookingId,
        userId: user ? user.id : null,
        action,
        metadata
    });
}

async function enrichBookingsWithAudit(bookings) {
    const bookingIds = bookings.map((b) => b.id).filter(Boolean);
    if (bookingIds.length === 0) return [];

    const assignedByIds = [
        ...new Set(bookings.map((b) => b.assignedBy).filter(Boolean))
    ];

    const [assignedUsers, activities] = await Promise.all([
        assignedByIds.length > 0
            ? User.findAll({
                where: { id: { [Op.in]: assignedByIds } },
                attributes: ['id', 'name', 'email', 'role']
            })
            : [],
        BookingActivity.findAll({
            where: { bookingId: { [Op.in]: bookingIds } },
            include: [{ model: User, as: 'user', attributes: ['id', 'name', 'email', 'role'] }],
            order: [['createdAt', 'ASC'], ['id', 'ASC']]
        })
    ]);

    const usersById = new Map(assignedUsers.map((user) => [Number(user.id), publicUser(user)]));
    const activitiesByBooking = new Map();
    for (const activity of activities) {
        const plain = activity.get({ plain: true });
        const list = activitiesByBooking.get(plain.bookingId) || [];
        list.push({
            id: plain.id,
            action: plain.action,
            actionLabel: BOOKING_ACTION_LABELS[plain.action] || plain.action,
            metadata: plain.metadata,
            createdAt: plain.createdAt,
            user: publicUser(plain.user)
        });
        activitiesByBooking.set(plain.bookingId, list);
    }

    return bookings.map((booking) => {
        const plain = booking.get ? booking.get({ plain: true }) : booking;
        return {
            ...enrichPaymentMethod({
                ...enrichBookingProcedures(plain),
                appointmentTime: getBookingTimeStr(booking, true),
                appointmentTime24: getBookingTimeStr(booking, false),
                hasSpecificTime: !!plain.appointmentDate,
                isExtraBooking: !!plain.isExtraBooking
            }),
            assignedByUser: usersById.get(Number(plain.assignedBy)) || null,
            actions: activitiesByBooking.get(plain.id) || []
        };
    });
}

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

        // ─── الخدمات المطلوبة / نوع الكشف ─────────────────────────────
        const visitTypeMap = { checkup: 'checkup', consultation: 'consultation', حجز: 'checkup', استشارة: 'consultation' };
        const rawVisit = (visitType || 'checkup').toString().trim();
        const mappedLegacyVisit = visitTypeMap[rawVisit.toLowerCase()];
        const hasServicePayload =
            req.body.visitTypes !== undefined ||
            req.body.procedureTypes !== undefined ||
            req.body.services !== undefined ||
            (visitType !== undefined && !mappedLegacyVisit);

        let mappedVisit = mappedLegacyVisit || 'checkup';
        let procedureType = null;
        let procedureTypes = null;

        if (hasServicePayload) {
            const requestedProcedureTypes = parseProcedureTypesFromBody(req.body);
            const [allowedServices, followupServices] = await Promise.all([
                getActiveServiceNames(),
                getFollowupServiceNames()
            ]);
            const procedureValidation = validateProcedureTypes(requestedProcedureTypes, allowedServices);
            if (!procedureValidation.valid) {
                return res.status(400).json({
                    message: procedureValidation.message,
                    invalid: procedureValidation.invalid,
                    allowedVisitTypes: procedureValidation.allowedVisitTypes
                });
            }

            const allowedLegacy = ['checkup', 'followup', 'consultation'];
            const clinicOnly = requestedProcedureTypes.filter((t) => allowedServices.includes(t));
            if (clinicOnly.length > 0) {
                mappedVisit = resolveLegacyVisitEnum(clinicOnly, followupServices);
                procedureTypes = clinicOnly;
                procedureType = procedureTypesToLegacyString(clinicOnly);
            } else if (allowedLegacy.includes(requestedProcedureTypes[0])) {
                mappedVisit = requestedProcedureTypes[0];
            }
        } else if (!['checkup', 'consultation'].includes(mappedVisit)) {
            return res.status(400).json({
                message: 'نوع الكشف غير صحيح. استخدم: checkup أو consultation أو services لاختيار الخدمات.'
            });
        }

        // ─── إنشاء الحجز ─────────────────────────────────────────────
        const booking = await Booking.create({
            customerName: name.trim(),
            customerPhone: normalizedPhone,
            appointmentDate: null,   // يحدده الأدمن عند التأكيد
            bookingType: 'online',
            visitType: mappedVisit,
            procedureType,
            procedureTypes,
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
            booking: enrichBookingProcedures(booking.get({ plain: true }))
        });
    } catch (error) {
        next(error);
    }
};

// Protected: Create a clinic booking (Admin/Staff with manage_daily_bookings)
exports.createClinicBooking = async (req, res, next) => {
    try {
        const { name, phone, date, doctorId, clientRequestId, age } = req.body;

        if (!name || !phone || !date || !doctorId) {
            return res.status(400).json({ message: 'Please provide name, phone, appointment date, and doctorId.' });
        }

        const paymentValidation = validatePaymentPayload(req.body, { required: true });
        if (!paymentValidation.valid) {
            return res.status(400).json({
                message: paymentValidation.message,
                allowedPaymentMethods: paymentValidation.allowedPaymentMethods || PAYMENT_METHODS,
                paymentMethodLabels: paymentValidation.labels || PAYMENT_METHOD_LABELS,
                calculatedAmountPaid: paymentValidation.calculatedAmountPaid
            });
        }

        const procedureTypes = parseProcedureTypesFromBody(req.body);
        const [allowedServices, followupServices] = await Promise.all([
            getActiveServiceNames(),
            getFollowupServiceNames()
        ]);
        const procedureValidation = validateProcedureTypes(procedureTypes, allowedServices);
        if (!procedureValidation.valid) {
            return res.status(400).json({
                message: procedureValidation.message,
                invalid: procedureValidation.invalid,
                allowedVisitTypes: procedureValidation.allowedVisitTypes
            });
        }

        const dateStr = String(date).trim().slice(0, 10);

        const allowExtraBooking =
            req.body.allowExtraBooking === true ||
            req.body.allowExtraBooking === 'true' ||
            req.body.extraBooking === true ||
            req.body.extraBooking === 'true';

        const noTime =
            req.body.noTime === true ||
            req.body.noTime === 'true';

        const rawTime = req.body.time;
        const hasExplicitTime =
            rawTime !== undefined &&
            rawTime !== null &&
            String(rawTime).trim() !== '';

        let appointmentDate = null;
        let slotDate = null;

        if (noTime) {
            slotDate = dateStr;
        } else if (hasExplicitTime && /^\d{1,2}:\d{2}$/.test(String(rawTime).trim())) {
            const [h, m] = String(rawTime).trim().split(':').map(Number);
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

        const legacyVisitEnum = resolveLegacyVisitEnum(procedureTypes, followupServices);
        const procedureType = procedureTypesToLegacyString(procedureTypes);

        let result;
        try {
            result = await createClinicBookingAtomic({
                dateStr,
                doctorId,
                name,
                phone,
                appointmentDate,
                slotDate,
                amountPaid: paymentValidation.amountPaid,
                paymentMethod: paymentValidation.paymentMethod,
                paymentDetails: paymentValidation.paymentDetails,
                visitType: legacyVisitEnum,
                procedureType,
                procedureTypes: procedureTypes.length > 0 ? procedureTypes : null,
                assignedBy: req.user.id,
                age,
                clientRequestId,
                allowExtraBooking
            });
        } catch (err) {
            if (err.code === 'CAPACITY_FULL') {
                return res.status(409).json({
                    message: `الوقت انتهى — لا يمكن إضافة حجوزات جديدة في ${dateStr}. أرسل allowExtraBooking: true لإضافة حجز إضافي. / Booking slots are full for ${dateStr}.`,
                    details: err.details
                });
            }
            if (err.name === 'SequelizeUniqueConstraintError') {
                const existing = await Booking.findOne({
                    where: {
                        clientRequestId: String(clientRequestId).trim(),
                        bookingType: 'clinic'
                    }
                });
                if (existing) {
                    return res.status(200).json({
                        message: 'Clinic booking already exists.',
                        duplicate: true,
                        booking: enrichPaymentMethod(enrichBookingProcedures(existing.get({ plain: true })))
                    });
                }
            }
            throw err;
        }

        const { booking, duplicate, isExtraBooking, workingDayAutoCreated, workingHours } = result;
        const plain = enrichPaymentMethod(enrichBookingProcedures(booking.get({ plain: true })));

        if (!duplicate) {
            await logBookingActivity(booking.id, req.user, 'created', {
                bookingType: 'clinic'
            });
            emitBookingListChange(booking, 'created');
        }

        res.status(duplicate ? 200 : 201).json({
            message: duplicate
                ? 'Clinic booking already exists (duplicate request ignored).'
                : isExtraBooking
                    ? 'Extra clinic booking created (beyond daily capacity).'
                    : noTime
                        ? 'Clinic booking created for the day without a specific time.'
                        : 'Clinic booking created successfully.',
            duplicate: !!duplicate,
            isExtraBooking: !!isExtraBooking,
            workingDayAutoCreated: !!workingDayAutoCreated,
            workingHours: workingHours || null,
            hasSpecificTime: !noTime && !!appointmentDate,
            booking: {
                ...plain,
                appointmentTime: getBookingTimeStr(booking, true),
                appointmentTime24: getBookingTimeStr(booking, false),
                hasSpecificTime: !noTime && !!appointmentDate,
                isExtraBooking: !!isExtraBooking,
                workingDayAutoCreated: !!workingDayAutoCreated,
                workingHours: workingHours || null
            }
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

        const list = bookings.map((booking) => enrichPaymentMethod(
            enrichBookingProcedures(booking.get({ plain: true }))
        ));

        res.status(200).json(list);
    } catch (error) {
        next(error);
    }
};

// Protected: Get all bookings (online + clinic) with filters
// Supports: ?date=YYYY-MM-DD | ?startDate=...&endDate=... | or combined
exports.getAllBookings = async (req, res, next) => {
    try {
        const { type, status, date, startDate, endDate, visitType, doctorId, page, limit } = req.query;
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
            const activeServices = await getActiveServiceNames();
            if (allowedLegacyVisit.includes(visitType)) {
                whereClause.visitType = visitType;
            } else if (activeServices.includes(visitType)) {
                whereClause[Op.and] = whereClause[Op.and] || [];
                whereClause[Op.and].push({
                    [Op.or]: [
                        { procedureType: visitType },
                        { procedureTypes: { [Op.contains]: [visitType] } }
                    ]
                });
            } else {
                return res.status(400).json({
                    message: 'Invalid visitType. Use checkup, followup, consultation, or one of active clinic services.',
                    allowedVisitTypes: [...allowedLegacyVisit, ...activeServices]
                });
            }
        }

        // ── تطبيق فلتر التاريخ ──────────────────────────────────────────
        if (hasDateFilter) {
            whereClause[Op.and] = whereClause[Op.and] || [];

            if (date) {
                // يوم واحد محدد — appointmentDate أو slotDate (حجز بدون وقت)
                const dateStr = String(date).trim().slice(0, 10);
                const startOfDay = new Date(dateStr + 'T00:00:00.000Z');
                const endOfDay = new Date(dateStr + 'T23:59:59.999Z');
                whereClause[Op.and].push({
                    [Op.or]: [
                        { appointmentDate: { [Op.between]: [startOfDay, endOfDay] } },
                        { slotDate: dateStr }
                    ]
                });
            } else {
                const apptFilter = {};
                const slotFilter = {};
                let hasRangeFilter = false;

                if (startDate) {
                    const startStr = String(startDate).trim().slice(0, 10);
                    if (!/^\d{4}-\d{2}-\d{2}$/.test(startStr)) {
                        return res.status(400).json({ message: 'Invalid startDate format. Use YYYY-MM-DD.' });
                    }
                    apptFilter[Op.gte] = new Date(startStr + 'T00:00:00.000Z');
                    slotFilter[Op.gte] = startStr;
                    hasRangeFilter = true;
                }

                if (endDate) {
                    const endStr = String(endDate).trim().slice(0, 10);
                    if (!/^\d{4}-\d{2}-\d{2}$/.test(endStr)) {
                        return res.status(400).json({ message: 'Invalid endDate format. Use YYYY-MM-DD.' });
                    }
                    apptFilter[Op.lte] = new Date(endStr + 'T23:59:59.999Z');
                    slotFilter[Op.lte] = endStr;
                    hasRangeFilter = true;
                }

                if (hasRangeFilter) {
                    whereClause[Op.and].push({
                        [Op.or]: [
                            { appointmentDate: apptFilter },
                            { slotDate: slotFilter }
                        ]
                    });
                }
            }
        }

        const order = [['slotDate', 'ASC'], ['appointmentDate', 'ASC'], ['id', 'ASC']];
        const pageNum = page !== undefined ? Math.max(parseInt(page, 10) || 1, 1) : null;
        const limitNum = limit !== undefined ? Math.min(Math.max(parseInt(limit, 10) || 25, 1), 200) : null;
        const queryOptions = {
            where: whereClause,
            order
        };

        let bookings;
        let total;

        if (pageNum && limitNum) {
            const result = await Booking.findAndCountAll({
                ...queryOptions,
                limit: limitNum,
                offset: (pageNum - 1) * limitNum
            });
            bookings = result.rows;
            total = result.count;
        } else {
            bookings = await Booking.findAll(queryOptions);
            total = bookings.length;
        }

        const list = await enrichBookingsWithAudit(bookings);

        const response = { total, bookings: list };
        if (pageNum && limitNum) {
            response.page = pageNum;
            response.limit = limitNum;
            response.totalPages = Math.ceil(total / limitNum);
        }

        res.status(200).json(response);
    } catch (error) {
        next(error);
    }
};

// Protected: Get all registered cases grouped by patient phone
exports.getAllCases = async (req, res, next) => {
    try {
        const { page, limit, search, doctorId } = req.query;
        const whereClause = {};

        if (req.user.role === 'doctor') {
            const myDoctorId = req.user.doctorProfile && req.user.doctorProfile.id;
            if (!myDoctorId) return res.status(403).json({ message: 'Doctor profile not found for this account.' });
            whereClause.doctorId = myDoctorId;
        } else if (doctorId) {
            whereClause.doctorId = Number(doctorId);
        }

        if (search && String(search).trim()) {
            const term = `%${String(search).trim()}%`;
            whereClause[Op.or] = [
                { customerName: { [Op.iLike]: term } },
                { customerPhone: { [Op.iLike]: term } }
            ];
        }

        const bookings = await Booking.findAll({
            where: whereClause,
            order: [['createdAt', 'DESC'], ['id', 'DESC']]
        });

        const casesByPhone = new Map();
        for (const booking of bookings) {
            const plain = booking.get({ plain: true });
            const phoneKey = normalizePhone(plain.customerPhone) || String(plain.customerPhone || '').trim();
            if (!phoneKey) continue;

            const enrichedBooking = enrichPaymentMethod({
                ...enrichBookingProcedures(plain),
                appointmentTime: getBookingTimeStr(booking, true),
                appointmentTime24: getBookingTimeStr(booking, false),
                hasSpecificTime: !!plain.appointmentDate,
                isExtraBooking: !!plain.isExtraBooking
            });

            if (!casesByPhone.has(phoneKey)) {
                casesByPhone.set(phoneKey, {
                    name: plain.customerName,
                    phone: plain.customerPhone,
                    normalizedPhone: phoneKey,
                    totalBookings: 0,
                    statusCounts: {},
                    bookingTypeCounts: {},
                    firstRegisteredAt: plain.createdAt,
                    lastRegisteredAt: plain.createdAt,
                    lastBookingDate: getBookingDateStr(plain),
                    lastBooking: enrichedBooking
                });
            }

            const patientCase = casesByPhone.get(phoneKey);
            patientCase.totalBookings += 1;
            patientCase.statusCounts[plain.status] = (patientCase.statusCounts[plain.status] || 0) + 1;
            patientCase.bookingTypeCounts[plain.bookingType] = (patientCase.bookingTypeCounts[plain.bookingType] || 0) + 1;
            patientCase.firstRegisteredAt = plain.createdAt;
        }

        const allCases = [...casesByPhone.values()];
        const pageNum = page !== undefined ? Math.max(parseInt(page, 10) || 1, 1) : null;
        const limitNum = limit !== undefined ? Math.min(Math.max(parseInt(limit, 10) || 25, 1), 200) : null;
        const total = allCases.length;
        const cases = pageNum && limitNum
            ? allCases.slice((pageNum - 1) * limitNum, pageNum * limitNum)
            : allCases;

        const response = { total, cases };
        if (pageNum && limitNum) {
            response.page = pageNum;
            response.limit = limitNum;
            response.totalPages = Math.ceil(total / limitNum);
        }

        res.status(200).json(response);
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

        const previousStatus = booking.status;
        booking.status = status;
        await booking.save();

        await logBookingActivity(booking.id, req.user, 'status_changed', {
            from: previousStatus,
            to: status,
            bookingType: booking.bookingType
        });

        emitBookingListChange(booking, 'statusChanged');

        // إرسال إشعار (non-blocking)
        notifyBookingStatusChange(booking, status).catch(err =>
            console.error('⚠️  Notification failed (non-blocking):', err.message)
        );

        const responsePayload = {
            message: `Booking ${status} successfully.`,
            booking: enrichPaymentMethod(enrichBookingProcedures(booking.get({ plain: true })))
        };

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

        const hasProcedurePayload =
            req.body.visitTypes !== undefined ||
            req.body.procedureTypes !== undefined ||
            req.body.services !== undefined ||
            visitType !== undefined;

        if (hasProcedurePayload) {
            const procedureTypes = parseProcedureTypesFromBody(req.body);
            const [allowedServices, followupServices] = await Promise.all([
                getActiveServiceNames(),
                getFollowupServiceNames()
            ]);
            const procedureValidation = validateProcedureTypes(procedureTypes, allowedServices);
            if (!procedureValidation.valid) {
                return res.status(400).json({
                    message: procedureValidation.message,
                    invalid: procedureValidation.invalid,
                    allowedVisitTypes: procedureValidation.allowedVisitTypes
                });
            }
            if (procedureTypes.length > 0) {
                const allowedLegacy = ['checkup', 'followup', 'consultation'];
                const clinicOnly = procedureTypes.filter((t) => allowedServices.includes(t));
                if (clinicOnly.length > 0) {
                    booking.visitType = resolveLegacyVisitEnum(clinicOnly, followupServices);
                    booking.procedureTypes = clinicOnly;
                    booking.procedureType = procedureTypesToLegacyString(clinicOnly);
                } else if (allowedLegacy.includes(procedureTypes[0])) {
                    booking.visitType = procedureTypes[0];
                    booking.procedureType = null;
                    booking.procedureTypes = null;
                }
            } else {
                booking.procedureType = null;
                booking.procedureTypes = null;
            }
        }

        // Update fields if provided
        if (name) booking.customerName = name;
        if (phone) booking.customerPhone = phone;
        const hasPaymentPayload =
            req.body.amountPaid !== undefined ||
            req.body.paymentMethod !== undefined ||
            req.body.paymentDetails !== undefined ||
            req.body.payments !== undefined ||
            req.body.paymentMethods !== undefined;

        if (hasPaymentPayload) {
            const hasSplitPaymentPayload =
                req.body.paymentDetails !== undefined ||
                req.body.payments !== undefined ||
                req.body.paymentMethods !== undefined;
            const paymentValidation = validatePaymentPayload(
                {
                    ...req.body,
                    amountPaid: req.body.amountPaid !== undefined
                        ? req.body.amountPaid
                        : (hasSplitPaymentPayload ? undefined : booking.amountPaid),
                    paymentMethod: req.body.paymentMethod !== undefined ? req.body.paymentMethod : booking.paymentMethod
                },
                { required: true }
            );
            if (!paymentValidation.valid) {
                return res.status(400).json({
                    message: paymentValidation.message,
                    allowedPaymentMethods: paymentValidation.allowedPaymentMethods || PAYMENT_METHODS,
                    paymentMethodLabels: paymentValidation.labels || PAYMENT_METHOD_LABELS,
                    calculatedAmountPaid: paymentValidation.calculatedAmountPaid
                });
            }
            booking.amountPaid = paymentValidation.amountPaid;
            booking.paymentMethod = paymentValidation.paymentMethod;
            booking.paymentDetails = paymentValidation.paymentDetails;
        }
        if (doctorId !== undefined) booking.doctorId = Number(doctorId);
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

        const changedFields = booking.changed() || [];
        await booking.save();

        if (changedFields.length > 0) {
            await logBookingActivity(booking.id, req.user, 'updated', {
                fields: changedFields
            });
        }

        emitBookingListChange(booking, 'updated', prevDateStr);

        res.status(200).json({
            message: 'Booking updated successfully.',
            booking: enrichPaymentMethod(enrichBookingProcedures(booking.get({ plain: true })))
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

        const previousStatus = booking.status;
        booking.status = 'cancelled';
        await booking.save();

        await logBookingActivity(booking.id, req.user, 'cancelled', {
            from: previousStatus,
            to: 'cancelled'
        });

        emitBookingListChange(booking, 'cancelled');

        res.status(200).json({
            message: 'Booking cancelled successfully.',
            booking: enrichPaymentMethod(enrichBookingProcedures(booking.get({ plain: true })))
        });
    } catch (error) {
        next(error);
    }
};

// Update examination status (حالة الكشف) — waiting | done (admin, secretary, doctor)
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

        const previousExaminationStatus = booking.examinationStatus;
        booking.examinationStatus = value;
        await booking.save();
        await booking.reload();

        await logBookingActivity(booking.id, req.user, 'examination_status_changed', {
            from: previousExaminationStatus,
            to: value
        });

        emitBookingListChange(booking, 'examinationStatus');

        res.status(200).json({
            message: value === 'done' ? 'Examination marked as done (تم الكشف).' : 'Examination status set to waiting (في الانتظار).',
            booking: enrichPaymentMethod(enrichBookingProcedures(booking.get({ plain: true })))
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

        const enrichedCurrentBooking = enrichPaymentMethod(
            enrichBookingProcedures(currentBooking.get({ plain: true }))
        );
        const enrichedPastBookings = pastBookings.map((booking) => enrichPaymentMethod(
            enrichBookingProcedures(booking.get({ plain: true }))
        ));

        res.status(200).json({
            currentBooking: enrichedCurrentBooking,
            patientHistory: {
                totalPastVisits: totalVisits,
                totalAmountPaid: totalPaid.toFixed(2),
                lastVisit: lastVisit ? {
                    date: lastVisit.appointmentDate,
                    visitType: lastVisit.visitType,
                    amountPaid: lastVisit.amountPaid,
                    status: lastVisit.status
                } : null,
                pastBookings: enrichedPastBookings
            }
        });
    } catch (error) {
        next(error);
    }
};

