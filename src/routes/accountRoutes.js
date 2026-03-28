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

// ——— دخل الحجوزات (تجميع باسم العميل + التوتال)
// GET .../income/bookings?month=YYYY-MM | ?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD | ?startMonth=YYYY-MM&endMonth=YYYY-MM
router.get('/income/bookings', accountsAccess, accountController.getIncomeFromBookings);

// ——— دخل يدوي
// POST /api/accounts/income — Body: { description, amount, entryDate? }
router.post('/income', accountsAccess, accountController.addManualIncome);
// GET .../income/manual — نفس خيارات الفترة أعلاه
router.get('/income/manual', accountsAccess, accountController.getManualIncome);

// ——— مصروفات
// POST /api/accounts/expenses — Body: { description, amount, date?, notes?, category_id, subcategory_id }
router.post('/expenses', accountsAccess, accountController.addExpense);
// GET .../expenses — نفس خيارات الفترة
router.get('/expenses', accountsAccess, accountController.getExpenses);

// ——— تصنيفات المصروفات (Categories)
router.get('/expense-categories', accountsAccess, accountController.getExpenseCategories);
router.post('/expense-categories', accountsAccess, accountController.addExpenseCategory);
router.put('/expense-categories/:id', accountsAccess, accountController.updateExpenseCategory);
router.delete('/expense-categories/:id', accountsAccess, accountController.deleteExpenseCategory);

// ——— تصنيفات المصروفات الفرعية (Subcategories)
router.get('/expense-subcategories', accountsAccess, accountController.getExpenseSubcategories);
router.post('/expense-subcategories', accountsAccess, accountController.addExpenseSubcategory);
router.put('/expense-subcategories/:id', accountsAccess, accountController.updateExpenseSubcategory);
router.delete('/expense-subcategories/:id', accountsAccess, accountController.deleteExpenseSubcategory);

// ——— ملخص الحسابات (دخل + مصروفات + رصيد)
// GET .../summary — نفس خيارات الفترة
router.get('/summary', accountsAccess, accountController.getSummary);

module.exports = router;
