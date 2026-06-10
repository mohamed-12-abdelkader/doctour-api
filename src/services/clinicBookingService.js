const { Op } = require('sequelize');
const { sequelize } = require('../config/database');
const { Booking } = require('../models/index');
const { normalizePhone } = require('../utils/clinicProcedureHelper');
const { parseTimeToMinutes, SLOT_DURATION_MINUTES } = require('../utils/slotHelper');
const { getOrCreateWorkingDayForBooking } = require('./workingDayService');

const ACTIVE_STATUSES = { [Op.notIn]: ['cancelled', 'rejected'] };

function calculateCapacity(startTime, endTime) {
    const startMin = parseTimeToMinutes(startTime);
    const endMin = parseTimeToMinutes(endTime);
    if (Number.isNaN(startMin) || Number.isNaN(endMin) || startMin >= endMin) return 1;
    return Math.max(1, Math.floor((endMin - startMin) / SLOT_DURATION_MINUTES));
}

function clinicDayRange(dateStr) {
    return {
        startOfDay: new Date(dateStr + 'T00:00:00.000Z'),
        endOfDay: new Date(dateStr + 'T23:59:59.999Z')
    };
}

function clinicDayWhere(dateStr, doctorId) {
    const { startOfDay, endOfDay } = clinicDayRange(dateStr);
    return {
        bookingType: 'clinic',
        doctorId: Number(doctorId),
        status: ACTIVE_STATUSES,
        [Op.or]: [
            { appointmentDate: { [Op.between]: [startOfDay, endOfDay] } },
            { slotDate: dateStr }
        ]
    };
}

async function getActiveClinicBookingsCount(dateStr, doctorId, transaction) {
    return Booking.count({
        where: clinicDayWhere(dateStr, doctorId),
        transaction
    });
}

/**
 * يبحث عن حجز عيادة مكرر: نفس الطبيب + نفس الهاتف + نفس اليوم (أو نفس الطلب خلال 20 ثانية).
 */
async function findDuplicateClinicBooking({ doctorId, phone, appointmentDate, slotDate, dateStr, clientRequestId }, transaction) {
    if (clientRequestId) {
        const byRequestId = await Booking.findOne({
            where: {
                bookingType: 'clinic',
                clientRequestId: String(clientRequestId).trim(),
                status: ACTIVE_STATUSES
            },
            transaction
        });
        if (byRequestId) return byRequestId;
    }

    const normalized = normalizePhone(phone);
    if (!normalized) return null;

    const dayStr = slotDate || dateStr || (appointmentDate ? String(appointmentDate).slice(0, 10) : null);
    if (!dayStr) return null;

    const recentSince = new Date(Date.now() - 20000);
    const { startOfDay, endOfDay } = clinicDayRange(dayStr);

    const timeConditions = [{ createdAt: { [Op.gte]: recentSince } }];
    if (appointmentDate) {
        const apptMs = new Date(appointmentDate).getTime();
        timeConditions.push({
            appointmentDate: {
                [Op.between]: [new Date(apptMs - 60000), new Date(apptMs + 60000)]
            }
        });
    }

    const candidates = await Booking.findAll({
        where: {
            bookingType: 'clinic',
            doctorId: Number(doctorId),
            status: ACTIVE_STATUSES,
            [Op.and]: [
                {
                    [Op.or]: [
                        { appointmentDate: { [Op.between]: [startOfDay, endOfDay] } },
                        { slotDate: dayStr }
                    ]
                },
                { [Op.or]: timeConditions }
            ]
        },
        order: [['id', 'DESC']],
        limit: 20,
        transaction
    });

    return (
        candidates.find((b) => normalizePhone(b.customerPhone) === normalized) || null
    );
}

/**
 * إنشاء حجز عيادة داخل transaction مع قفل يوم العمل لمنع تجاوز السعة والتكرار.
 */
async function createClinicBookingAtomic({
    dateStr,
    doctorId,
    name,
    phone,
    appointmentDate,
    slotDate,
    amountPaid,
    paymentMethod,
    paymentDetails,
    visitType,
    procedureType,
    procedureTypes,
    assignedBy,
    age,
    clientRequestId,
    allowExtraBooking = false
}) {
    const doctorIdNum = Number(doctorId);

    return sequelize.transaction(async (transaction) => {
        const duplicate = await findDuplicateClinicBooking(
            { doctorId: doctorIdNum, phone, appointmentDate, slotDate, dateStr, clientRequestId },
            transaction
        );
        if (duplicate) {
            return { duplicate: true, booking: duplicate };
        }

        const { workingDay, autoCreated: workingDayAutoCreated } = await getOrCreateWorkingDayForBooking(
            dateStr,
            doctorIdNum,
            assignedBy,
            transaction
        );

        const capacity = calculateCapacity(workingDay.startTime, workingDay.endTime);
        const currentCount = await getActiveClinicBookingsCount(dateStr, doctorIdNum, transaction);
        const isAtCapacity = currentCount >= capacity;

        if (isAtCapacity && !allowExtraBooking) {
            const err = new Error('CAPACITY_FULL');
            err.code = 'CAPACITY_FULL';
            err.details = {
                date: dateStr,
                workingHours: `${workingDay.startTime} → ${workingDay.endTime}`,
                maxBookings: capacity,
                currentBookings: currentCount,
                hint: 'Send allowExtraBooking: true to add an overflow booking for this day.'
            };
            throw err;
        }

        const booking = await Booking.create(
            {
                customerName: name,
                customerPhone: phone,
                doctorId: doctorIdNum,
                assignedBy,
                appointmentDate: appointmentDate || null,
                slotDate: slotDate || null,
                bookingType: 'clinic',
                amountPaid: amountPaid || 0,
                paymentMethod: paymentMethod || null,
                paymentDetails: paymentDetails || null,
                visitType,
                procedureType,
                procedureTypes,
                status: 'confirmed',
                age: age ?? null,
                clientRequestId: clientRequestId ? String(clientRequestId).trim() : null,
                isExtraBooking: allowExtraBooking && isAtCapacity
            },
            { transaction }
        );

        return {
            duplicate: false,
            booking,
            isExtraBooking: booking.isExtraBooking,
            workingDayAutoCreated,
            workingHours: {
                start: workingDay.startTime,
                end: workingDay.endTime
            }
        };
    });
}

module.exports = {
    findDuplicateClinicBooking,
    createClinicBookingAtomic,
    getActiveClinicBookingsCount,
    calculateCapacity
};
