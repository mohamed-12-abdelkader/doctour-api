const { Booking, IncomeEntry, Expense } = require('../models/index');
const { Op } = require('sequelize');
const sequelize = require('sequelize');

const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_REGEX = /^\d{4}-\d{2}$/;

/** نطاق شهر واحد: start, end, periodLabel */
function getMonthRange(monthStr) {
    if (!monthStr || !MONTH_REGEX.test(monthStr)) {
        const now = new Date();
        monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    }
    const [y, m] = monthStr.split('-').map(Number);
    const start = new Date(y, m - 1, 1);
    const end = new Date(y, m, 0, 23, 59, 59, 999);
    return { start, end, periodLabel: monthStr };
}

/**
 * نطاق فترة مرن من query:
 * - startDate + endDate (YYYY-MM-DD) → مجموعة أيام
 * - startMonth + endMonth (YYYY-MM) → مجموعة شهور
 * - month (YYYY-MM) → شهر واحد (كما هو حالياً)
 * - بدون شيء → الشهر الحالي
 */
function getPeriodRange(query) {
    const q = query || {};
    const startDateStr = String(q.startDate || '').trim().slice(0, 10);
    const endDateStr = String(q.endDate || '').trim().slice(0, 10);
    const startMonthStr = String(q.startMonth || '').trim().slice(0, 7);
    const endMonthStr = String(q.endMonth || '').trim().slice(0, 7);
    const monthStr = String(q.month || '').trim().slice(0, 7);

    if (startDateStr && endDateStr && DATE_ONLY_REGEX.test(startDateStr) && DATE_ONLY_REGEX.test(endDateStr)) {
        const start = new Date(startDateStr + 'T00:00:00.000Z');
        const end = new Date(endDateStr + 'T23:59:59.999Z');
        if (start.getTime() <= end.getTime()) {
            return { start, end, periodLabel: `${startDateStr} → ${endDateStr}` };
        }
    }

    if (startMonthStr && endMonthStr && MONTH_REGEX.test(startMonthStr) && MONTH_REGEX.test(endMonthStr)) {
        const [sy, sm] = startMonthStr.split('-').map(Number);
        const [ey, em] = endMonthStr.split('-').map(Number);
        const start = new Date(sy, sm - 1, 1);
        const end = new Date(ey, em, 0, 23, 59, 59, 999);
        if (start.getTime() <= end.getTime()) {
            return { start, end, periodLabel: `${startMonthStr} → ${endMonthStr}` };
        }
    }

    return getMonthRange(monthStr);
}

// GET /api/accounts/income/bookings — دخل الحجوزات: شهر أو فترة (month | startDate+endDate | startMonth+endMonth)
exports.getIncomeFromBookings = async (req, res, next) => {
    try {
        const { start, end, periodLabel } = getPeriodRange(req.query);

        const list = await Booking.findAll({
            attributes: [
                'customerName',
                [sequelize.fn('SUM', sequelize.cast(sequelize.col('amountPaid'), 'DECIMAL')), 'total']
            ],
            where: {
                appointmentDate: { [Op.between]: [start, end] },
                status: { [Op.notIn]: ['cancelled', 'rejected'] }
            },
            group: ['customerName'],
            raw: true
        });

        const rows = list.map(r => ({
            customerName: r.customerName,
            amount: parseFloat(r.total || 0)
        }));

        const total = rows.reduce((sum, r) => sum + r.amount, 0);

        res.status(200).json({
            period: periodLabel,
            byCustomer: rows,
            total: Math.round(total * 100) / 100
        });
    } catch (error) {
        next(error);
    }
};

// POST /api/accounts/income — إضافة دخل يدوي (اسم العملية + المبلغ)
exports.addManualIncome = async (req, res, next) => {
    try {
        const { description, amount, entryDate } = req.body;

        if (!description || amount == null || amount === '') {
            return res.status(400).json({ message: 'description and amount are required.' });
        }

        const numAmount = parseFloat(amount);
        if (isNaN(numAmount) || numAmount < 0) {
            return res.status(400).json({ message: 'amount must be a positive number.' });
        }

        const entry = await IncomeEntry.create({
            description: String(description).trim(),
            amount: numAmount,
            entryDate: entryDate || new Date().toISOString().slice(0, 10)
        });

        res.status(201).json({
            message: 'Income entry added successfully.',
            entry
        });
    } catch (error) {
        next(error);
    }
};

// GET /api/accounts/income/manual — قائمة الدخل اليدوي: شهر أو فترة
exports.getManualIncome = async (req, res, next) => {
    try {
        const { start, end, periodLabel } = getPeriodRange(req.query);

        const entries = await IncomeEntry.findAll({
            where: {
                entryDate: { [Op.between]: [start, end] }
            },
            order: [['entryDate', 'DESC'], ['id', 'DESC']]
        });

        const total = entries.reduce((sum, e) => sum + parseFloat(e.amount || 0), 0);

        res.status(200).json({
            period: periodLabel,
            entries,
            total: Math.round(total * 100) / 100
        });
    } catch (error) {
        next(error);
    }
};

// GET /api/accounts/expenses — شهر أو فترة — قائمة المصروفات لشهر
exports.getExpenses = async (req, res, next) => {
    try {
        const { start, end, periodLabel } = getPeriodRange(req.query);

        const expenses = await Expense.findAll({
            where: {
                expenseDate: { [Op.between]: [start, end] }
            },
            order: [['expenseDate', 'DESC'], ['id', 'DESC']]
        });

        const total = expenses.reduce((sum, e) => sum + parseFloat(e.amount || 0), 0);

        res.status(200).json({
            period: periodLabel,
            expenses,
            total: Math.round(total * 100) / 100
        });
    } catch (error) {
        next(error);
    }
};

// POST /api/accounts/expenses — إضافة مصروف (اسم العملية + المبلغ)
exports.addExpense = async (req, res, next) => {
    try {
        const { description, amount, expenseDate, notes } = req.body;

        if (!description || amount == null || amount === '') {
            return res.status(400).json({ message: 'description and amount are required.' });
        }

        const numAmount = parseFloat(amount);
        if (isNaN(numAmount) || numAmount < 0) {
            return res.status(400).json({ message: 'amount must be a positive number.' });
        }

        const expense = await Expense.create({
            description: String(description).trim(),
            amount: numAmount,
            expenseDate: expenseDate || new Date().toISOString().slice(0, 10),
            notes: notes || null
        });

        res.status(201).json({
            message: 'Expense added successfully.',
            expense
        });
    } catch (error) {
        next(error);
    }
};

// GET /api/accounts/summary — ملخص: شهر أو فترة (دخل حجوزات + يدوي، مصروفات، رصيد)
exports.getSummary = async (req, res, next) => {
    try {
        const { start, end, periodLabel } = getPeriodRange(req.query);

        const bookingWhere = {
            appointmentDate: { [Op.between]: [start, end] },
            status: { [Op.notIn]: ['cancelled', 'rejected'] }
        };
        const incomeFromBookings = parseFloat(await Booking.sum('amountPaid', { where: bookingWhere }) || 0);

        const manualIncome = parseFloat(await IncomeEntry.sum('amount', {
            where: { entryDate: { [Op.between]: [start, end] } }
        }) || 0);

        const totalExpenses = parseFloat(await Expense.sum('amount', {
            where: { expenseDate: { [Op.between]: [start, end] } }
        }) || 0);

        const totalIncome = incomeFromBookings + manualIncome;
        const balance = totalIncome - totalExpenses;

        res.status(200).json({
            period: periodLabel,
            incomeFromBookings: Math.round(incomeFromBookings * 100) / 100,
            manualIncome: Math.round(manualIncome * 100) / 100,
            totalIncome: Math.round(totalIncome * 100) / 100,
            totalExpenses: Math.round(totalExpenses * 100) / 100,
            balance: Math.round(balance * 100) / 100
        });
    } catch (error) {
        next(error);
    }
};
