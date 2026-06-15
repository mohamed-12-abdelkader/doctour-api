const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const { QueryTypes } = require('sequelize');
const { sequelize } = require('../config/database');
const { PAYMENT_METHODS, PAYMENT_METHOD_LABELS } = require('../constants/paymentMethods');

const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_REGEX = /^\d{4}-\d{2}$/;
const MONEY_EPSILON = 0.009;
const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 200;
const EXPORT_LIMIT = 100000;

const PAYMENT_METHOD_ORDER = {
    cash: 1,
    vodafone_cash: 2,
    instapay: 3,
    visa: 4
};

function roundMoney(value) {
    const num = Number(value || 0);
    return Math.round(num * 100) / 100;
}

function formatDate(date) {
    return date.toISOString().slice(0, 10);
}

function parseDateOnly(value, fallback = null) {
    const str = String(value || '').trim().slice(0, 10);
    if (!DATE_ONLY_REGEX.test(str)) return fallback;
    const date = new Date(`${str}T00:00:00.000Z`);
    return Number.isNaN(date.getTime()) ? fallback : date;
}

function addDays(date, days) {
    const next = new Date(date);
    next.setUTCDate(next.getUTCDate() + days);
    return next;
}

function startOfWeek(date) {
    const day = date.getUTCDay();
    const diff = day === 0 ? -6 : 1 - day;
    return addDays(date, diff);
}

function endOfMonth(year, monthIndex) {
    return new Date(Date.UTC(year, monthIndex + 1, 0));
}

function parsePeriodRange(query = {}) {
    const now = new Date();
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const period = String(query.period || query.range || '').trim().toLowerCase();
    const startDate = parseDateOnly(query.startDate);
    const endDate = parseDateOnly(query.endDate);
    const date = parseDateOnly(query.date, today);

    if (startDate && endDate) {
        if (startDate > endDate) {
            const error = new Error('startDate must be before or equal to endDate.');
            error.statusCode = 400;
            throw error;
        }
        return {
            type: 'custom',
            startDate: formatDate(startDate),
            endDate: formatDate(endDate),
            label: `${formatDate(startDate)} إلى ${formatDate(endDate)}`
        };
    }

    if (period === 'week' || query.weekStart) {
        const weekStart = parseDateOnly(query.weekStart) || startOfWeek(date);
        const weekEnd = addDays(weekStart, 6);
        return {
            type: 'week',
            startDate: formatDate(weekStart),
            endDate: formatDate(weekEnd),
            label: `أسبوع ${formatDate(weekStart)} إلى ${formatDate(weekEnd)}`
        };
    }

    if (period === 'month' || query.month) {
        const monthValue = String(query.month || '').trim().slice(0, 7);
        let year = date.getUTCFullYear();
        let monthIndex = date.getUTCMonth();
        if (MONTH_REGEX.test(monthValue)) {
            const parts = monthValue.split('-').map(Number);
            year = parts[0];
            monthIndex = parts[1] - 1;
        }
        const monthStart = new Date(Date.UTC(year, monthIndex, 1));
        const monthEnd = endOfMonth(year, monthIndex);
        return {
            type: 'month',
            startDate: formatDate(monthStart),
            endDate: formatDate(monthEnd),
            label: `${year}-${String(monthIndex + 1).padStart(2, '0')}`
        };
    }

    const singleDay = period === 'day' || query.date ? date : today;
    return {
        type: 'day',
        startDate: formatDate(singleDay),
        endDate: formatDate(singleDay),
        label: formatDate(singleDay)
    };
}

function paginationFromQuery(query = {}) {
    const page = Math.max(parseInt(query.page, 10) || 1, 1);
    const rawLimit = parseInt(query.limit, 10) || DEFAULT_LIMIT;
    const limit = Math.min(Math.max(rawLimit, 1), MAX_LIMIT);
    return { page, limit, offset: (page - 1) * limit };
}

function normalizePaymentBreakdown(rows) {
    const byMethod = {};
    for (const method of PAYMENT_METHODS) {
        byMethod[method] = {
            method,
            label: PAYMENT_METHOD_LABELS[method] || method,
            amount: 0,
            count: 0
        };
    }
    for (const row of rows) {
        if (!byMethod[row.method]) continue;
        byMethod[row.method].amount = roundMoney(row.amount);
        byMethod[row.method].count = Number(row.count || 0);
    }
    return PAYMENT_METHODS
        .slice()
        .sort((a, b) => PAYMENT_METHOD_ORDER[a] - PAYMENT_METHOD_ORDER[b])
        .map((method) => byMethod[method]);
}

function baseCte() {
    return `
      WITH filtered_bookings AS (
        SELECT
          b.id,
          b."customerName",
          b."customerPhone",
          b."appointmentDate",
          b."slotDate",
          b."createdAt",
          b."bookingType",
          b."visitType",
          b."procedureType",
          b."procedureTypes",
          b."status",
          b."doctorId" AS doctor_id,
          COALESCE(u.name, CASE WHEN b."doctorId" IS NULL THEN 'بدون طبيب' ELSE 'Doctor #' || b."doctorId"::text END) AS doctor_name,
          dp.specialty AS doctor_specialty,
          dp.phone AS doctor_phone,
          b."paymentMethod",
          b."paymentDetails",
          COALESCE(b."slotDate", b."appointmentDate"::date, b."createdAt"::date) AS booking_date,
          COALESCE(b."totalAmount", b."amountPaid", 0)::numeric AS total_amount,
          COALESCE(b."amountPaid", 0)::numeric AS recorded_paid_amount
        FROM "Bookings" b
        LEFT JOIN "DoctorProfiles" dp ON dp.id = b."doctorId"
        LEFT JOIN "Users" u ON u.id = dp."userId"
        WHERE b."status" NOT IN ('cancelled', 'rejected')
          AND COALESCE(b."slotDate", b."appointmentDate"::date, b."createdAt"::date)
              BETWEEN :startDate::date AND :endDate::date
      ),
      payment_rows AS (
        SELECT
          fb.id AS booking_id,
          payment_item->>'method' AS method,
          CASE
            WHEN (payment_item->>'amount') ~ '^-?[0-9]+(\\.[0-9]+)?$'
            THEN (payment_item->>'amount')::numeric
            ELSE 0
          END AS amount
        FROM filtered_bookings fb
        CROSS JOIN LATERAL jsonb_array_elements(
          CASE
            WHEN jsonb_typeof(fb."paymentDetails") = 'array' THEN fb."paymentDetails"
            ELSE '[]'::jsonb
          END
        ) AS payment_item
        WHERE payment_item->>'method' IN (:paymentMethods)
        UNION ALL
        SELECT
          fb.id AS booking_id,
          fb."paymentMethod"::text AS method,
          fb.recorded_paid_amount AS amount
        FROM filtered_bookings fb
        WHERE (
            fb."paymentDetails" IS NULL
            OR jsonb_typeof(fb."paymentDetails") <> 'array'
            OR jsonb_array_length(fb."paymentDetails") = 0
          )
          AND fb."paymentMethod" IN (:paymentMethods)
          AND fb.recorded_paid_amount > 0
      ),
      payment_by_booking AS (
        SELECT
          booking_id,
          SUM(amount)::numeric AS collected_amount,
          jsonb_agg(
            jsonb_build_object(
              'method', method,
              'label', CASE method
                WHEN 'cash' THEN 'نقدي'
                WHEN 'vodafone_cash' THEN 'فودافون كاش'
                WHEN 'instapay' THEN 'انستا باي'
                WHEN 'visa' THEN 'فيزا'
                ELSE method
              END,
              'amount', amount
            )
            ORDER BY method
          ) AS payment_details
        FROM payment_rows
        WHERE amount > 0
        GROUP BY booking_id
      ),
      booking_amounts AS (
        SELECT
          fb.*,
          COALESCE(pbb.collected_amount, 0)::numeric AS collected_amount,
          COALESCE(pbb.payment_details, '[]'::jsonb) AS normalized_payment_details,
          GREATEST(fb.total_amount - COALESCE(pbb.collected_amount, 0), 0)::numeric AS remaining_amount,
          CASE
            WHEN fb.total_amount <= 0 AND COALESCE(pbb.collected_amount, 0) <= 0 THEN 'zero_due'
            WHEN COALESCE(pbb.collected_amount, 0) <= 0 THEN 'unpaid'
            WHEN fb.total_amount - COALESCE(pbb.collected_amount, 0) > 0.009 THEN 'partial'
            WHEN COALESCE(pbb.collected_amount, 0) - fb.total_amount > 0.009 THEN 'overpaid'
            ELSE 'paid'
          END AS payment_status
        FROM filtered_bookings fb
        LEFT JOIN payment_by_booking pbb ON pbb.booking_id = fb.id
      )
    `;
}

function baseReplacements(period) {
    return {
        startDate: period.startDate,
        endDate: period.endDate,
        paymentMethods: PAYMENT_METHODS
    };
}

async function getSummary(period) {
    const [summaryRow] = await sequelize.query(
        `${baseCte()}
        SELECT
          COUNT(*)::int AS "totalBookings",
          COALESCE(SUM(total_amount), 0)::float AS "grossIncome",
          COALESCE(SUM(collected_amount), 0)::float AS "totalCollected",
          COALESCE(SUM(remaining_amount), 0)::float AS "totalOutstanding",
          COUNT(*) FILTER (WHERE collected_amount > 0.009)::int AS "casesWithPayments",
          COUNT(*) FILTER (WHERE collected_amount <= 0.009 AND total_amount > 0)::int AS "casesWithoutPayments",
          COUNT(*) FILTER (WHERE payment_status IN ('paid', 'overpaid') AND total_amount > 0)::int AS "fullyPaidCases",
          COUNT(*) FILTER (WHERE payment_status IN ('unpaid', 'partial'))::int AS "outstandingCases",
          COUNT(*) FILTER (WHERE payment_status = 'partial')::int AS "partialCases",
          COUNT(*) FILTER (WHERE payment_status = 'overpaid')::int AS "overpaidCases"
        FROM booking_amounts;`,
        { replacements: baseReplacements(period), type: QueryTypes.SELECT }
    );

    const paymentRows = await sequelize.query(
        `${baseCte()}
        SELECT method, COALESCE(SUM(amount), 0)::float AS amount, COUNT(DISTINCT booking_id)::int AS count
        FROM payment_rows
        WHERE amount > 0
        GROUP BY method;`,
        { replacements: baseReplacements(period), type: QueryTypes.SELECT }
    );

    const paymentBreakdown = normalizePaymentBreakdown(paymentRows);
    const methodTotal = roundMoney(paymentBreakdown.reduce((sum, row) => sum + row.amount, 0));
    const grossIncome = roundMoney(summaryRow.grossIncome);
    const totalCollected = roundMoney(summaryRow.totalCollected);
    const totalOutstanding = roundMoney(summaryRow.totalOutstanding);

    return {
        totalIncome: totalCollected,
        grossIncome,
        totalDue: grossIncome,
        totalCollected,
        totalOutstanding,
        totalBookings: Number(summaryRow.totalBookings || 0),
        casesWithPayments: Number(summaryRow.casesWithPayments || 0),
        casesWithoutPayments: Number(summaryRow.casesWithoutPayments || 0),
        fullyPaidCases: Number(summaryRow.fullyPaidCases || 0),
        outstandingCases: Number(summaryRow.outstandingCases || 0),
        partialCases: Number(summaryRow.partialCases || 0),
        overpaidCases: Number(summaryRow.overpaidCases || 0),
        paymentBreakdown,
        paymentBreakdownTotal: methodTotal,
        paymentBreakdownMatchesCollected: Math.abs(methodTotal - totalCollected) <= MONEY_EPSILON
    };
}

async function getTrends(period) {
    const trendQuery = (bucket) => sequelize.query(
        `${baseCte()}
        SELECT
          ${bucket} AS "periodStart",
          COUNT(*)::int AS "bookingCount",
          COALESCE(SUM(total_amount), 0)::float AS "grossIncome",
          COALESCE(SUM(collected_amount), 0)::float AS "totalCollected",
          COALESCE(SUM(remaining_amount), 0)::float AS "totalOutstanding"
        FROM booking_amounts
        GROUP BY "periodStart"
        ORDER BY "periodStart" ASC;`,
        { replacements: baseReplacements(period), type: QueryTypes.SELECT }
    );

    const [daily, weekly, monthly] = await Promise.all([
        trendQuery('booking_date'),
        trendQuery("date_trunc('week', booking_date::timestamp)::date"),
        trendQuery("date_trunc('month', booking_date::timestamp)::date")
    ]);

    const normalize = (rows) => rows.map((row) => ({
        periodStart: row.periodStart,
        bookingCount: Number(row.bookingCount || 0),
        grossIncome: roundMoney(row.grossIncome),
        totalCollected: roundMoney(row.totalCollected),
        totalOutstanding: roundMoney(row.totalOutstanding)
    }));

    return {
        daily: normalize(daily),
        weekly: normalize(weekly),
        monthly: normalize(monthly)
    };
}

async function getDoctorBreakdown(period) {
    const rows = await sequelize.query(
        `${baseCte()}
        SELECT
          doctor_id AS "doctorId",
          doctor_name AS "doctorName",
          doctor_specialty AS specialty,
          doctor_phone AS phone,
          COUNT(*)::int AS "totalBookings",
          COALESCE(SUM(total_amount), 0)::float AS "grossIncome",
          COALESCE(SUM(collected_amount), 0)::float AS "totalCollected",
          COALESCE(SUM(remaining_amount), 0)::float AS "totalOutstanding",
          COUNT(*) FILTER (WHERE collected_amount > 0.009)::int AS "casesWithPayments",
          COUNT(*) FILTER (WHERE collected_amount <= 0.009 AND total_amount > 0)::int AS "casesWithoutPayments",
          COUNT(*) FILTER (WHERE payment_status IN ('paid', 'overpaid') AND total_amount > 0)::int AS "fullyPaidCases",
          COUNT(*) FILTER (WHERE payment_status IN ('unpaid', 'partial'))::int AS "outstandingCases",
          COUNT(*) FILTER (WHERE payment_status = 'partial')::int AS "partialCases",
          COUNT(*) FILTER (WHERE payment_status = 'overpaid')::int AS "overpaidCases"
        FROM booking_amounts
        GROUP BY doctor_id, doctor_name, doctor_specialty, doctor_phone
        ORDER BY COALESCE(SUM(collected_amount), 0) DESC, doctor_name ASC;`,
        { replacements: baseReplacements(period), type: QueryTypes.SELECT }
    );

    return rows.map((row) => ({
        doctorId: row.doctorId === null ? null : Number(row.doctorId),
        doctorName: row.doctorName,
        specialty: row.specialty,
        phone: row.phone,
        grossIncome: roundMoney(row.grossIncome),
        totalCollected: roundMoney(row.totalCollected),
        totalOutstanding: roundMoney(row.totalOutstanding),
        totalBookings: Number(row.totalBookings || 0),
        casesWithPayments: Number(row.casesWithPayments || 0),
        casesWithoutPayments: Number(row.casesWithoutPayments || 0),
        fullyPaidCases: Number(row.fullyPaidCases || 0),
        outstandingCases: Number(row.outstandingCases || 0),
        partialCases: Number(row.partialCases || 0),
        overpaidCases: Number(row.overpaidCases || 0)
    }));
}

async function getValidation(period, summary) {
    const [excludedStatuses] = await sequelize.query(
        `SELECT COUNT(*)::int AS count
         FROM "Bookings" b
         WHERE b."status" IN ('cancelled', 'rejected')
           AND COALESCE(b."slotDate", b."appointmentDate"::date, b."createdAt"::date)
               BETWEEN :startDate::date AND :endDate::date;`,
        { replacements: baseReplacements(period), type: QueryTypes.SELECT }
    );

    const [anomalies] = await sequelize.query(
        `${baseCte()}
        SELECT
          COUNT(*) FILTER (WHERE ABS(recorded_paid_amount - collected_amount) > 0.009)::int AS "paymentMismatchCount",
          COUNT(*) FILTER (WHERE collected_amount - total_amount > 0.009)::int AS "overpaidCount",
          COUNT(*) FILTER (WHERE recorded_paid_amount > 0 AND collected_amount <= 0)::int AS "missingPaymentMethodCount",
          COUNT(*) FILTER (WHERE total_amount < 0 OR recorded_paid_amount < 0)::int AS "negativeAmountCount"
        FROM booking_amounts;`,
        { replacements: baseReplacements(period), type: QueryTypes.SELECT }
    );

    const duplicateCandidates = await sequelize.query(
        `${baseCte()},
        duplicate_payment_candidates AS (
          SELECT
            fb.id,
            payment_item->>'method' AS method,
            payment_item->>'amount' AS amount,
            COALESCE(payment_item->>'transferFromPhone', '') AS "transferFromPhone",
            COUNT(*)::int AS duplicate_count
          FROM filtered_bookings fb
          CROSS JOIN LATERAL jsonb_array_elements(
            CASE
              WHEN jsonb_typeof(fb."paymentDetails") = 'array' THEN fb."paymentDetails"
              ELSE '[]'::jsonb
            END
          ) AS payment_item
          GROUP BY fb.id, method, amount, "transferFromPhone"
          HAVING COUNT(*) > 1
        )
        SELECT COUNT(*)::int AS count FROM duplicate_payment_candidates;`,
        { replacements: baseReplacements(period), type: QueryTypes.SELECT }
    );

    const checks = {
        cancelledBookingsExcluded: true,
        paymentMethodsMatchCollected: summary.paymentBreakdownMatchesCollected,
        noPaymentAmountMismatch: Number(anomalies.paymentMismatchCount || 0) === 0,
        noMissingPaymentMethodForPaidBookings: Number(anomalies.missingPaymentMethodCount || 0) === 0,
        noOverpaidBookings: Number(anomalies.overpaidCount || 0) === 0,
        noNegativeAmounts: Number(anomalies.negativeAmountCount || 0) === 0,
        noDuplicatePaymentCandidates: Number(duplicateCandidates[0]?.count || 0) === 0
    };

    return {
        isBalanced: Object.values(checks).every(Boolean),
        checks,
        excludedCancelledOrRejectedBookings: Number(excludedStatuses.count || 0),
        anomalies: {
            paymentMismatchCount: Number(anomalies.paymentMismatchCount || 0),
            missingPaymentMethodCount: Number(anomalies.missingPaymentMethodCount || 0),
            overpaidCount: Number(anomalies.overpaidCount || 0),
            negativeAmountCount: Number(anomalies.negativeAmountCount || 0),
            duplicatePaymentCandidateCount: Number(duplicateCandidates[0]?.count || 0)
        }
    };
}

async function getFinancialReport(query = {}) {
    const period = parsePeriodRange(query);
    const [summary, trends, byDoctor] = await Promise.all([
        getSummary(period),
        getTrends(period),
        getDoctorBreakdown(period)
    ]);
    const validation = await getValidation(period, summary);
    summary.byDoctor = byDoctor;
    return {
        period,
        cards: {
            totalIncome: summary.grossIncome,
            totalPayments: summary.totalCollected,
            totalOutstanding: summary.totalOutstanding,
            totalBookings: summary.totalBookings,
            paidCases: summary.fullyPaidCases,
            unpaidCases: summary.outstandingCases
        },
        summary,
        charts: {
            paymentMethodDistribution: summary.paymentBreakdown,
            doctorIncomeDistribution: byDoctor,
            dailyIncome: trends.daily,
            weeklyIncome: trends.weekly,
            monthlyIncome: trends.monthly
        },
        validation
    };
}

function caseFilters(query = {}, replacements) {
    const filters = [];
    const status = String(query.paymentStatus || query.status || 'all').trim().toLowerCase();
    if (status === 'paid') filters.push("payment_status IN ('paid', 'overpaid')");
    if (status === 'unpaid') filters.push("payment_status = 'unpaid'");
    if (status === 'partial') filters.push("payment_status = 'partial'");
    if (status === 'unpaid_or_partial' || status === 'outstanding') filters.push("payment_status IN ('unpaid', 'partial')");
    if (status === 'with_payment') filters.push('collected_amount > 0.009');
    if (status === 'without_payment') filters.push('collected_amount <= 0.009 AND total_amount > 0');

    const search = String(query.search || '').trim();
    if (search) {
        replacements.search = `%${search}%`;
        filters.push(`(
          "customerName" ILIKE :search
          OR "customerPhone" ILIKE :search
          OR COALESCE("procedureType", '') ILIKE :search
        )`);
    }

    const paymentMethod = String(query.paymentMethod || '').trim();
    if (paymentMethod) {
        if (!PAYMENT_METHODS.includes(paymentMethod)) {
            const error = new Error('Invalid paymentMethod.');
            error.statusCode = 400;
            throw error;
        }
        replacements.paymentMethod = paymentMethod;
        filters.push(`EXISTS (
          SELECT 1 FROM payment_rows pr
          WHERE pr.booking_id = booking_amounts.id
            AND pr.method = :paymentMethod
            AND pr.amount > 0
        )`);
    }

    if (query.doctorId !== undefined && query.doctorId !== null && String(query.doctorId).trim() !== '') {
        const doctorId = Number(query.doctorId);
        if (!Number.isInteger(doctorId) || doctorId <= 0) {
            const error = new Error('doctorId must be a positive integer.');
            error.statusCode = 400;
            throw error;
        }
        replacements.doctorId = doctorId;
        filters.push('doctor_id = :doctorId');
    }

    return filters.length ? `WHERE ${filters.join(' AND ')}` : '';
}

function sortClause(query = {}) {
    const sortMap = {
        bookingDate: 'booking_date',
        doctorName: 'doctor_name',
        patientName: '"customerName"',
        totalAmount: 'total_amount',
        amountPaid: 'collected_amount',
        remainingAmount: 'remaining_amount',
        paymentStatus: 'payment_status'
    };
    const sortBy = sortMap[query.sortBy] || 'booking_date';
    const sortDir = String(query.sortDir || '').toLowerCase() === 'asc' ? 'ASC' : 'DESC';
    return `ORDER BY ${sortBy} ${sortDir}, id DESC`;
}

function mapCaseRow(row) {
    const totalAmount = roundMoney(row.bookingValue);
    const amountPaid = roundMoney(row.amountPaid);
    const remainingAmount = roundMoney(row.remainingAmount);
    return {
        bookingId: row.bookingId,
        doctorId: row.doctorId === null ? null : Number(row.doctorId),
        doctorName: row.doctorName,
        doctorSpecialty: row.doctorSpecialty,
        patientName: row.patientName,
        phone: row.phone,
        bookingDate: row.bookingDate,
        service: row.service,
        bookingValue: totalAmount,
        totalAmount,
        amountPaid,
        remainingAmount,
        paymentStatus: row.paymentStatus,
        paymentStatusLabel: {
            paid: 'مدفوع بالكامل',
            partial: 'مدفوع جزئيًا',
            unpaid: 'غير مسدد',
            overpaid: 'مدفوع بزيادة',
            zero_due: 'بدون قيمة'
        }[row.paymentStatus] || row.paymentStatus,
        paymentMethods: Array.isArray(row.paymentMethods) ? row.paymentMethods : []
    };
}

async function getFinancialCases(query = {}, options = {}) {
    const period = parsePeriodRange(query);
    const pagination = options.exportAll
        ? { page: 1, limit: EXPORT_LIMIT, offset: 0 }
        : paginationFromQuery(query);
    const replacements = {
        ...baseReplacements(period),
        limit: pagination.limit,
        offset: pagination.offset
    };
    const filters = caseFilters(query, replacements);
    const orderBy = sortClause(query);

    const rows = await sequelize.query(
        `${baseCte()}
        SELECT
          id AS "bookingId",
          doctor_id AS "doctorId",
          doctor_name AS "doctorName",
          doctor_specialty AS "doctorSpecialty",
          "customerName" AS "patientName",
          "customerPhone" AS phone,
          booking_date AS "bookingDate",
          COALESCE("procedureType", "visitType"::text, "bookingType"::text) AS service,
          total_amount::float AS "bookingValue",
          collected_amount::float AS "amountPaid",
          remaining_amount::float AS "remainingAmount",
          payment_status AS "paymentStatus",
          normalized_payment_details AS "paymentMethods"
        FROM booking_amounts
        ${filters}
        ${orderBy}
        LIMIT :limit OFFSET :offset;`,
        { replacements, type: QueryTypes.SELECT }
    );

    const [countRow] = await sequelize.query(
        `${baseCte()}
        SELECT COUNT(*)::int AS count
        FROM booking_amounts
        ${filters};`,
        { replacements, type: QueryTypes.SELECT }
    );

    const total = Number(countRow.count || 0);
    return {
        period,
        pagination: {
            page: pagination.page,
            limit: pagination.limit,
            total,
            totalPages: Math.ceil(total / pagination.limit)
        },
        cases: rows.map(mapCaseRow)
    };
}

function addWorksheetRows(sheet, rows, columns) {
    sheet.columns = columns;
    for (const row of rows) sheet.addRow(row);
    sheet.getRow(1).font = { bold: true };
    sheet.columns.forEach((column) => {
        column.width = Math.max(column.header.length + 2, 18);
    });
}

async function buildExcelReport(query = {}) {
    const report = await getFinancialReport(query);
    const paidCases = await getFinancialCases({ ...query, paymentStatus: 'paid' }, { exportAll: true });
    const outstandingCases = await getFinancialCases({ ...query, paymentStatus: 'outstanding' }, { exportAll: true });

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Doctor API';
    workbook.created = new Date();

    addWorksheetRows(workbook.addWorksheet('Summary'), [
        { metric: 'الفترة', value: report.period.label },
        { metric: 'إجمالي قيمة الحجوزات', value: report.summary.grossIncome },
        { metric: 'إجمالي المحصل', value: report.summary.totalCollected },
        { metric: 'إجمالي المتبقي', value: report.summary.totalOutstanding },
        { metric: 'عدد الحجوزات', value: report.summary.totalBookings },
        { metric: 'حالات قامت بالدفع', value: report.summary.casesWithPayments },
        { metric: 'حالات لم تدفع', value: report.summary.casesWithoutPayments },
        { metric: 'التقرير متوازن', value: report.validation.isBalanced ? 'نعم' : 'لا' }
    ], [
        { header: 'Metric', key: 'metric' },
        { header: 'Value', key: 'value' }
    ]);

    addWorksheetRows(workbook.addWorksheet('Payment Methods'), report.summary.paymentBreakdown, [
        { header: 'Method', key: 'label' },
        { header: 'Amount', key: 'amount' },
        { header: 'Cases', key: 'count' }
    ]);

    addWorksheetRows(workbook.addWorksheet('Doctors'), report.summary.byDoctor, [
        { header: 'Doctor', key: 'doctorName' },
        { header: 'Specialty', key: 'specialty' },
        { header: 'Bookings', key: 'totalBookings' },
        { header: 'Gross Income', key: 'grossIncome' },
        { header: 'Collected', key: 'totalCollected' },
        { header: 'Outstanding', key: 'totalOutstanding' },
        { header: 'Paid Cases', key: 'fullyPaidCases' },
        { header: 'Outstanding Cases', key: 'outstandingCases' },
        { header: 'Partial Cases', key: 'partialCases' }
    ]);

    const caseColumns = [
        { header: 'Doctor', key: 'doctorName' },
        { header: 'Patient Name', key: 'patientName' },
        { header: 'Phone', key: 'phone' },
        { header: 'Booking Date', key: 'bookingDate' },
        { header: 'Service', key: 'service' },
        { header: 'Booking Value', key: 'bookingValue' },
        { header: 'Paid', key: 'amountPaid' },
        { header: 'Remaining', key: 'remainingAmount' },
        { header: 'Payment Status', key: 'paymentStatusLabel' },
        { header: 'Payment Methods', key: 'paymentMethodText' }
    ];
    const caseRow = (item) => ({
        ...item,
        paymentMethodText: item.paymentMethods.map((p) => `${p.label}: ${p.amount}`).join(', ')
    });
    addWorksheetRows(workbook.addWorksheet('Paid Cases'), paidCases.cases.map(caseRow), caseColumns);
    addWorksheetRows(workbook.addWorksheet('Outstanding Cases'), outstandingCases.cases.map(caseRow), caseColumns);
    addWorksheetRows(workbook.addWorksheet('Daily Trend'), report.charts.dailyIncome, [
        { header: 'Date', key: 'periodStart' },
        { header: 'Bookings', key: 'bookingCount' },
        { header: 'Gross Income', key: 'grossIncome' },
        { header: 'Collected', key: 'totalCollected' },
        { header: 'Outstanding', key: 'totalOutstanding' }
    ]);
    addWorksheetRows(workbook.addWorksheet('Validation'), Object.entries(report.validation.checks).map(([check, value]) => ({ check, value })), [
        { header: 'Check', key: 'check' },
        { header: 'Passed', key: 'value' }
    ]);

    return workbook;
}

function resolvePdfFont(doc) {
    const candidates = [
        'C:\\Windows\\Fonts\\arial.ttf',
        'C:\\Windows\\Fonts\\tahoma.ttf',
        '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
        '/Library/Fonts/Arial Unicode.ttf'
    ];
    const fontPath = candidates.find((candidate) => fs.existsSync(candidate));
    if (fontPath) {
        doc.registerFont('reportFont', fontPath);
        doc.font('reportFont');
    }
}

async function buildPdfReport(query = {}) {
    const report = await getFinancialReport(query);
    const paidCases = await getFinancialCases({ ...query, paymentStatus: 'paid', limit: 50 }, { exportAll: true });
    const outstandingCases = await getFinancialCases({ ...query, paymentStatus: 'outstanding', limit: 50 }, { exportAll: true });

    const doc = new PDFDocument({ margin: 36, size: 'A4' });
    resolvePdfFont(doc);

    doc.fontSize(18).text('Financial Report', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(11).text(`Period: ${report.period.label}`);
    doc.text(`Generated At: ${new Date().toISOString()}`);
    doc.moveDown();

    const summaryLines = [
        ['Gross Income', report.summary.grossIncome],
        ['Collected Payments', report.summary.totalCollected],
        ['Outstanding', report.summary.totalOutstanding],
        ['Bookings', report.summary.totalBookings],
        ['Paid Cases', report.summary.fullyPaidCases],
        ['Outstanding Cases', report.summary.outstandingCases],
        ['Balanced', report.validation.isBalanced ? 'Yes' : 'No']
    ];
    doc.fontSize(13).text('Summary');
    doc.fontSize(10);
    summaryLines.forEach(([label, value]) => doc.text(`${label}: ${value}`));
    doc.moveDown();

    doc.fontSize(13).text('Payment Methods');
    doc.fontSize(10);
    report.summary.paymentBreakdown.forEach((row) => {
        doc.text(`${row.label}: ${row.amount}`);
    });
    doc.moveDown();

    doc.fontSize(13).text('Doctors');
    doc.fontSize(9);
    report.summary.byDoctor.forEach((row) => {
        doc.text(`${row.doctorName} | bookings ${row.totalBookings} | gross ${row.grossIncome} | collected ${row.totalCollected} | outstanding ${row.totalOutstanding}`);
    });
    doc.moveDown();

    const writeCases = (title, rows) => {
        doc.fontSize(13).text(title);
        doc.fontSize(8);
        rows.slice(0, 60).forEach((item) => {
            const methods = item.paymentMethods.map((p) => `${p.label}:${p.amount}`).join(', ');
            doc.text(`${item.bookingDate} | ${item.doctorName || 'No doctor'} | ${item.patientName} | ${item.phone} | value ${item.bookingValue} | paid ${item.amountPaid} | remaining ${item.remainingAmount} | ${methods}`);
        });
        doc.moveDown();
    };

    writeCases('Paid Cases', paidCases.cases);
    writeCases('Outstanding Cases', outstandingCases.cases);

    doc.fontSize(8).text('Note: PDF includes detailed rows up to export safety limit. Use Excel export for audit workbooks and filtering.');
    doc.end();
    return doc;
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

async function buildPrintableHtml(query = {}) {
    const report = await getFinancialReport(query);
    const allCases = await getFinancialCases({ ...query, paymentStatus: 'all' }, { exportAll: true });
    const doctorsHtml = report.summary.byDoctor.map((doctor) => `
      <tr>
        <td>${escapeHtml(doctor.doctorName)}</td>
        <td>${escapeHtml(doctor.specialty || '')}</td>
        <td>${doctor.totalBookings}</td>
        <td>${doctor.grossIncome}</td>
        <td>${doctor.totalCollected}</td>
        <td>${doctor.totalOutstanding}</td>
        <td>${doctor.fullyPaidCases}</td>
        <td>${doctor.outstandingCases}</td>
      </tr>
    `).join('');
    const rowsHtml = allCases.cases.map((item) => `
      <tr>
        <td>${escapeHtml(item.doctorName || '')}</td>
        <td>${escapeHtml(item.patientName)}</td>
        <td>${escapeHtml(item.phone)}</td>
        <td>${escapeHtml(item.bookingDate)}</td>
        <td>${escapeHtml(item.service)}</td>
        <td>${item.bookingValue}</td>
        <td>${item.amountPaid}</td>
        <td>${item.remainingAmount}</td>
        <td>${escapeHtml(item.paymentStatusLabel)}</td>
        <td>${escapeHtml(item.paymentMethods.map((p) => `${p.label}: ${p.amount}`).join(', '))}</td>
      </tr>
    `).join('');

    return `<!doctype html>
    <html lang="ar" dir="rtl">
    <head>
      <meta charset="utf-8" />
      <title>Financial Report ${escapeHtml(report.period.label)}</title>
      <style>
        body { font-family: Arial, Tahoma, sans-serif; margin: 24px; color: #111827; }
        .cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin: 20px 0; }
        .card { border: 1px solid #d1d5db; border-radius: 8px; padding: 12px; }
        .label { color: #6b7280; font-size: 12px; }
        .value { font-size: 20px; font-weight: 700; margin-top: 6px; }
        table { width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 12px; }
        th, td { border: 1px solid #d1d5db; padding: 8px; text-align: right; }
        th { background: #f3f4f6; }
        @media print { button { display: none; } body { margin: 0; } }
      </style>
    </head>
    <body>
      <button onclick="window.print()">طباعة التقرير</button>
      <h1>التقرير المالي</h1>
      <p>الفترة: ${escapeHtml(report.period.label)}</p>
      <div class="cards">
        <div class="card"><div class="label">إجمالي الدخل</div><div class="value">${report.cards.totalIncome}</div></div>
        <div class="card"><div class="label">إجمالي المدفوعات</div><div class="value">${report.cards.totalPayments}</div></div>
        <div class="card"><div class="label">إجمالي المتبقي</div><div class="value">${report.cards.totalOutstanding}</div></div>
        <div class="card"><div class="label">عدد الحجوزات</div><div class="value">${report.cards.totalBookings}</div></div>
        <div class="card"><div class="label">عدد الحالات المدفوعة</div><div class="value">${report.cards.paidCases}</div></div>
        <div class="card"><div class="label">عدد الحالات غير المدفوعة</div><div class="value">${report.cards.unpaidCases}</div></div>
      </div>
      <h2>وسائل الدفع</h2>
      <ul>${report.summary.paymentBreakdown.map((row) => `<li>${escapeHtml(row.label)}: ${row.amount}</li>`).join('')}</ul>
      <h2>حسابات الأطباء</h2>
      <table>
        <thead>
          <tr>
            <th>الدكتور</th><th>التخصص</th><th>عدد الحجوزات</th><th>إجمالي الدخل</th>
            <th>المدفوع</th><th>المتبقي</th><th>حالات مدفوعة</th><th>حالات عليها متبقي</th>
          </tr>
        </thead>
        <tbody>${doctorsHtml}</tbody>
      </table>
      <h2>الحالات</h2>
      <table>
        <thead>
          <tr>
            <th>الدكتور</th><th>اسم الحالة</th><th>الهاتف</th><th>تاريخ الحجز</th><th>الخدمة</th>
            <th>قيمة الحجز</th><th>المدفوع</th><th>المتبقي</th><th>حالة الدفع</th><th>وسيلة الدفع</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </body>
    </html>`;
}

module.exports = {
    parsePeriodRange,
    getFinancialReport,
    getFinancialCases,
    buildExcelReport,
    buildPdfReport,
    buildPrintableHtml
};
