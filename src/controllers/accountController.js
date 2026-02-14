const { Booking, IncomeEntry, Expense } = require('../models/index');
const { Op } = require('sequelize');
const sequelize = require('sequelize');

// Helpers: start/end of month from YYYY-MM
function getMonthRange(monthStr) {
    if (!monthStr || !/^\d{4}-\d{2}$/.test(monthStr)) {
        const now = new Date();
        monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    }
    const [y, m] = monthStr.split('-').map(Number);
    const start = new Date(y, m - 1, 1);
    const end = new Date(y, m, 0, 23, 59, 59, 999);
    return { start, end, month: monthStr };
}

// GET /api/accounts/income/bookings?month=YYYY-MM — دخل الحجوزات لشهر: تجميع باسم العميل + التوتال
exports.getIncomeFromBookings = async (req, res, next) => {
    try {
        const { month } = req.query;
        const { start, end, month: monthLabel } = getMonthRange(month);

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
            month: monthLabel,
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

// GET /api/accounts/income/manual?month=YYYY-MM — قائمة الدخل اليدوي لشهر
exports.getManualIncome = async (req, res, next) => {
    try {
        const { month } = req.query;
        const { start, end, month: monthLabel } = getMonthRange(month);

        const entries = await IncomeEntry.findAll({
            where: {
                entryDate: { [Op.between]: [start, end] }
            },
            order: [['entryDate', 'DESC'], ['id', 'DESC']]
        });

        const total = entries.reduce((sum, e) => sum + parseFloat(e.amount || 0), 0);

        res.status(200).json({
            month: monthLabel,
            entries,
            total: Math.round(total * 100) / 100
        });
    } catch (error) {
        next(error);
    }
};

// GET /api/accounts/expenses?month=YYYY-MM — قائمة المصروفات لشهر
exports.getExpenses = async (req, res, next) => {
    try {
        const { month } = req.query;
        const { start, end, month: monthLabel } = getMonthRange(month);

        const expenses = await Expense.findAll({
            where: {
                expenseDate: { [Op.between]: [start, end] }
            },
            order: [['expenseDate', 'DESC'], ['id', 'DESC']]
        });

        const total = expenses.reduce((sum, e) => sum + parseFloat(e.amount || 0), 0);

        res.status(200).json({
            month: monthLabel,
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

// GET /api/accounts/summary?month=YYYY-MM — ملخص: إجمالي دخل (حجوزات + يدوي)، إجمالي مصروفات، الرصيد
exports.getSummary = async (req, res, next) => {
    try {
        const { month } = req.query;
        const { start, end, month: monthLabel } = getMonthRange(month);

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
            month: monthLabel,
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
