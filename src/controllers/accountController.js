const { Booking, IncomeEntry, Expense, ExpenseCategory, ExpenseSubcategory, DoctorProfile, User } = require('../models/index');
const { Op } = require('sequelize');
const sequelize = require('sequelize');

/**
 * مجموع amountPaid للحجوزات في الفترة، مجمّع حسب doctorId، مع أسماء الأطباء.
 */
async function getBookingIncomeByDoctor(appointmentWhere) {
    const rows = await Booking.findAll({
        attributes: [
            'doctorId',
            [sequelize.fn('SUM', sequelize.cast(sequelize.col('amountPaid'), 'DECIMAL')), 'total']
        ],
        where: appointmentWhere,
        group: ['doctorId'],
        raw: true
    });

    const doctorIds = rows.map(r => r.doctorId).filter(id => id != null);
    let profiles = [];
    if (doctorIds.length > 0) {
        profiles = await DoctorProfile.findAll({
            where: { id: doctorIds },
            include: [{ model: User, as: 'user', attributes: ['id', 'name', 'email'] }],
            attributes: ['id', 'specialty', 'phone']
        });
    }
    const profileById = {};
    for (const p of profiles) {
        const plain = p.get ? p.get({ plain: true }) : p;
        profileById[plain.id] = plain;
    }

    const byDoctor = rows.map(r => {
        const amt = parseFloat(r.total || 0);
        const id = r.doctorId;
        if (id == null) {
            return {
                doctorId: null,
                doctorName: 'بدون طبيب',
                specialty: null,
                amount: Math.round(amt * 100) / 100
            };
        }
        const prof = profileById[id];
        const user = prof && prof.user;
        return {
            doctorId: id,
            doctorName: user ? user.name : `Doctor #${id}`,
            specialty: prof ? prof.specialty : null,
            amount: Math.round(amt * 100) / 100
        };
    });

    const sumByDoctor = byDoctor.reduce((s, x) => s + x.amount, 0);
    return { byDoctor, sumByDoctor: Math.round(sumByDoctor * 100) / 100 };
}

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
                'visitType',
                'procedureType',
                [sequelize.fn('SUM', sequelize.cast(sequelize.col('amountPaid'), 'DECIMAL')), 'total']
            ],
            where: {
                appointmentDate: { [Op.between]: [start, end] },
                status: { [Op.notIn]: ['cancelled', 'rejected'] }
            },
            group: ['customerName', 'visitType', 'procedureType'],
            raw: true
        });

        const rows = list.map(r => ({
            customerName: r.customerName,
            visitType: r.visitType,
            procedureType: r.procedureType,
            amount: parseFloat(r.total || 0)
        }));

        const total = rows.reduce((sum, r) => sum + r.amount, 0);

        const bookingWhere = {
            appointmentDate: { [Op.between]: [start, end] },
            status: { [Op.notIn]: ['cancelled', 'rejected'] }
        };
        const { byDoctor, sumByDoctor } = await getBookingIncomeByDoctor(bookingWhere);

        res.status(200).json({
            period: periodLabel,
            byCustomer: rows,
            byDoctor,
            total: Math.round(total * 100) / 100,
            totalByDoctor: sumByDoctor
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
            order: [['expenseDate', 'DESC'], ['id', 'DESC']],
            include: [
                { model: ExpenseCategory, as: 'category', attributes: ['id', 'name'] },
                { model: ExpenseSubcategory, as: 'subcategory', attributes: ['id', 'name', 'categoryId'] }
            ]
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
        const { description, amount, date, expenseDate, notes, category_id, subcategory_id } = req.body;

        if (!description || amount == null || amount === '') {
            return res.status(400).json({ message: 'description and amount are required.' });
        }
        if (category_id == null) {
            return res.status(400).json({ message: 'category_id is required.' });
        }

        const numAmount = parseFloat(amount);
        if (isNaN(numAmount) || numAmount < 0) {
            return res.status(400).json({ message: 'amount must be a positive number.' });
        }

        const numCategoryId = parseInt(category_id, 10);
        if (Number.isNaN(numCategoryId)) {
            return res.status(400).json({ message: 'category_id must be a number.' });
        }

        const category = await ExpenseCategory.findByPk(numCategoryId);
        if (!category) {
            return res.status(400).json({ message: 'Invalid category_id.' });
        }

        let numSubcategoryId = null;
        if (subcategory_id != null) {
            numSubcategoryId = parseInt(subcategory_id, 10);
            if (Number.isNaN(numSubcategoryId)) {
                return res.status(400).json({ message: 'subcategory_id must be a number.' });
            }
            const subcategory = await ExpenseSubcategory.findOne({
                where: { id: numSubcategoryId, categoryId: numCategoryId }
            });
            if (!subcategory) {
                return res.status(400).json({ message: 'Invalid subcategory_id for the given category_id.' });
            }
        }

        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        const expenseDateFinal = (date || expenseDate || new Date().toISOString().slice(0, 10));
        if (!dateRegex.test(String(expenseDateFinal).slice(0, 10))) {
            return res.status(400).json({ message: 'date must be in YYYY-MM-DD format.' });
        }

        const expense = await Expense.create({
            description: String(description).trim(),
            amount: numAmount,
            expenseDate: String(expenseDateFinal).slice(0, 10),
            notes: notes || null,
            categoryId: numCategoryId,
            subcategoryId: numSubcategoryId
        });

        res.status(201).json({
            message: 'Expense added successfully.',
            expense
        });
    } catch (error) {
        next(error);
    }
};

// GET /api/accounts/expense-categories — list categories
exports.getExpenseCategories = async (req, res, next) => {
    try {
        const categories = await ExpenseCategory.findAll({ order: [['id', 'ASC']] });
        res.status(200).json({ categories });
    } catch (error) {
        next(error);
    }
};

// POST /api/accounts/expense-categories
exports.addExpenseCategory = async (req, res, next) => {
    try {
        const { name } = req.body;
        if (!name) return res.status(400).json({ message: 'name is required.' });
        const category = await ExpenseCategory.create({ name: String(name).trim() });
        res.status(201).json({ message: 'Category created successfully.', category });
    } catch (error) {
        next(error);
    }
};

// PUT /api/accounts/expense-categories/:id
exports.updateExpenseCategory = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { name } = req.body;
        const category = await ExpenseCategory.findByPk(id);
        if (!category) return res.status(404).json({ message: 'Category not found.' });
        if (name) category.name = String(name).trim();
        await category.save();
        res.status(200).json({ message: 'Category updated successfully.', category });
    } catch (error) {
        next(error);
    }
};

// DELETE /api/accounts/expense-categories/:id
exports.deleteExpenseCategory = async (req, res, next) => {
    try {
        const { id } = req.params;
        const category = await ExpenseCategory.findByPk(id);
        if (!category) return res.status(404).json({ message: 'Category not found.' });
        await category.destroy();
        res.status(200).json({ message: 'Category deleted successfully.' });
    } catch (error) {
        next(error);
    }
};

// GET /api/accounts/expense-subcategories?category_id=...
exports.getExpenseSubcategories = async (req, res, next) => {
    try {
        const { category_id } = req.query;
        const where = {};
        if (category_id != null) {
            const num = parseInt(category_id, 10);
            if (!Number.isNaN(num)) where.categoryId = num;
        }
        const subcategories = await ExpenseSubcategory.findAll({
            where,
            order: [['id', 'ASC']]
        });
        res.status(200).json({ subcategories });
    } catch (error) {
        next(error);
    }
};

// POST /api/accounts/expense-subcategories
exports.addExpenseSubcategory = async (req, res, next) => {
    try {
        const { name, category_id } = req.body;
        if (!name || category_id == null) {
            return res.status(400).json({ message: 'name and category_id are required.' });
        }
        const numCategoryId = parseInt(category_id, 10);
        if (Number.isNaN(numCategoryId)) {
            return res.status(400).json({ message: 'category_id must be a number.' });
        }
        const category = await ExpenseCategory.findByPk(numCategoryId);
        if (!category) return res.status(400).json({ message: 'Invalid category_id.' });

        const subcategory = await ExpenseSubcategory.create({
            name: String(name).trim(),
            categoryId: numCategoryId
        });
        res.status(201).json({ message: 'Subcategory created successfully.', subcategory });
    } catch (error) {
        next(error);
    }
};

// PUT /api/accounts/expense-subcategories/:id
exports.updateExpenseSubcategory = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { name, category_id } = req.body;
        const subcategory = await ExpenseSubcategory.findByPk(id);
        if (!subcategory) return res.status(404).json({ message: 'Subcategory not found.' });

        if (name) subcategory.name = String(name).trim();
        if (category_id != null) {
            const numCategoryId = parseInt(category_id, 10);
            if (Number.isNaN(numCategoryId)) return res.status(400).json({ message: 'category_id must be a number.' });
            const category = await ExpenseCategory.findByPk(numCategoryId);
            if (!category) return res.status(400).json({ message: 'Invalid category_id.' });
            subcategory.categoryId = numCategoryId;
        }

        await subcategory.save();
        res.status(200).json({ message: 'Subcategory updated successfully.', subcategory });
    } catch (error) {
        next(error);
    }
};

// DELETE /api/accounts/expense-subcategories/:id
exports.deleteExpenseSubcategory = async (req, res, next) => {
    try {
        const { id } = req.params;
        const subcategory = await ExpenseSubcategory.findByPk(id);
        if (!subcategory) return res.status(404).json({ message: 'Subcategory not found.' });
        await subcategory.destroy();
        res.status(200).json({ message: 'Subcategory deleted successfully.' });
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

        const { byDoctor: incomeFromBookingsByDoctor } = await getBookingIncomeByDoctor(bookingWhere);

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
            incomeFromBookingsByDoctor,
            manualIncome: Math.round(manualIncome * 100) / 100,
            totalIncome: Math.round(totalIncome * 100) / 100,
            totalExpenses: Math.round(totalExpenses * 100) / 100,
            balance: Math.round(balance * 100) / 100,
            note:
                'الدخل اليدوي والمصروفات على مستوى العيادة (غير موزعة على الأطباء). دخل الحجوزات موزّع في incomeFromBookingsByDoctor.'
        });
    } catch (error) {
        next(error);
    }
};
