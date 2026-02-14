const express = require('express');
const router = express.Router();
const { protect } = require('../middlewares/authMiddleware');
const { hasPermission } = require('../middlewares/permissionMiddleware');
const accountController = require('../controllers/accountController');

// كل مسارات الحسابات: الأدمن أو الموظف بصلاحية manage_accounts
const accountsAccess = [protect, hasPermission('manage_accounts')];

// لوحة الحسابات (الوصول)
router.get('/', protect, hasPermission('manage_accounts'), (req, res) => {
    res.status(200).json({ message: 'Access granted to Accounts dashboard' });
});

// ——— دخل الحجوزات (تجميع شهر باسم العميل + التوتال)
// GET /api/accounts/income/bookings?month=YYYY-MM
router.get('/income/bookings', accountsAccess, accountController.getIncomeFromBookings);

// ——— دخل يدوي (إضافة دخل: اسم العملية + المبلغ)
// POST /api/accounts/income — Body: { description, amount, entryDate? }
router.post('/income', accountsAccess, accountController.addManualIncome);
// GET /api/accounts/income/manual?month=YYYY-MM — قائمة الدخل اليدوي لشهر
router.get('/income/manual', accountsAccess, accountController.getManualIncome);

// ——— مصروفات (إضافة مصروف + قائمة شهر)
// POST /api/accounts/expenses — Body: { description, amount, expenseDate?, notes? }
router.post('/expenses', accountsAccess, accountController.addExpense);
// GET /api/accounts/expenses?month=YYYY-MM — قائمة المصروفات لشهر
router.get('/expenses', accountsAccess, accountController.getExpenses);

// ——— ملخص الحسابات لشهر
// GET /api/accounts/summary?month=YYYY-MM — إجمالي دخل (حجوزات + يدوي)، مصروفات، رصيد
router.get('/summary', accountsAccess, accountController.getSummary);

module.exports = router;
