# توثيق النظام الحالي للحسابات والتقارير المالية

**Base URL:** `http://localhost:8000`

**المسار الأساسي:** `/api/accounts`

هذا الملف يوضح الوضع الحالي لنظام الحسابات بعد إضافة نظام التقارير المالية الاحترافي. النظام يحتوي على جزئين:

- واجهات الحسابات القديمة للدخل اليدوي والمصروفات والملخص العام.
- واجهات التقارير المالية الجديدة المبنية على بيانات الحجوزات الفعلية مع الفلاتر، الجداول، الرسوم البيانية، التصدير، والتحقق المحاسبي.

---

## 1. الصلاحيات

كل مسارات الحسابات تتطلب:

- تسجيل الدخول باستخدام `Authorization: Bearer <token>`.
- صلاحية `manage_accounts`.

في حالة عدم وجود توكن صحيح يرجع النظام `401`. في حالة عدم وجود الصلاحية يرجع `403`.

---

## 2. مصادر البيانات المالية

يعتمد النظام الحالي على الجداول والحقول التالية:

### الحجوزات

المصدر الأساسي للتقارير المالية الجديدة هو جدول `Bookings`.

أهم الحقول المالية:

- `totalAmount`: إجمالي قيمة الحجز المستحقة.
- `amountPaid`: إجمالي المبلغ المدفوع المسجل على الحجز.
- `paymentMethod`: وسيلة الدفع الأساسية أو أول وسيلة دفع في حالة الدفع المقسم.
- `paymentDetails`: تفاصيل الدفع المقسم بصيغة JSON مثل `[{ method, amount, transferFromPhone }]`.
- `status`: حالة الحجز.
- `appointmentDate`: تاريخ/وقت الحجز عند وجود وقت محدد.
- `slotDate`: تاريخ الحجز عند استخدام نظام اليوم أو الموعد.
- `createdAt`: fallback للتاريخ إذا لم يوجد `appointmentDate` أو `slotDate`.
- `procedureType`: الخدمة أو الكشف كنص مختصر.
- `procedureTypes`: قائمة الخدمات المختارة.

الحجوزات الملغاة أو المرفوضة لا يتم احتسابها:

- `cancelled`
- `rejected`

### الدخل اليدوي

الدخل اليدوي ما زال موجودًا في جدول `IncomeEntries` ويستخدمه النظام القديم فقط:

- `description`
- `amount`
- `entryDate`

التقارير المالية الجديدة الخاصة بالحجوزات لا تضيف الدخل اليدوي تلقائيًا، لأنها مصممة لمراجعة دخل الحجوزات الفعلي من قاعدة البيانات.

### المصروفات

المصروفات موجودة في جدول `Expenses`:

- `description`
- `amount`
- `expenseDate`
- `notes`
- `categoryId`
- `subcategoryId`

المصروفات تظهر في واجهات الحسابات القديمة، وليست جزءًا من تقرير دخل الحجوزات الجديد.

---

## 3. طرق الدفع المدعومة

النظام يدعم طرق الدفع التالية:

- `cash`: نقدي.
- `vodafone_cash`: فودافون كاش.
- `instapay`: إنستا باي.
- `visa`: فيزا / ماستر كارد.

عند وجود أكثر من وسيلة دفع لنفس الحجز، يتم الاعتماد على `paymentDetails` في التحليل بدل `paymentMethod` حتى لا يتم احتساب المبلغ على وسيلة واحدة فقط.

---

## 4. تحديد الفترة الزمنية في التقرير الجديد

التقرير الجديد يدعم أكثر من طريقة لاختيار الفترة.

### يوم محدد

```http
GET /api/accounts/financial-report?date=2026-06-15
```

### أسبوع كامل

يتم حساب الأسبوع من يوم الاثنين إلى الأحد.

```http
GET /api/accounts/financial-report?period=week&date=2026-06-15
```

يمكن أيضًا تحديد بداية الأسبوع مباشرة:

```http
GET /api/accounts/financial-report?period=week&weekStart=2026-06-15
```

### شهر كامل

```http
GET /api/accounts/financial-report?month=2026-06
```

أو:

```http
GET /api/accounts/financial-report?period=month&month=2026-06
```

### فترة مخصصة

```http
GET /api/accounts/financial-report?startDate=2026-06-01&endDate=2026-06-15
```

إذا لم يتم إرسال أي فترة، يستخدم النظام تاريخ اليوم.

---

## 5. التقرير المالي الرئيسي

### المسار

```http
GET /api/accounts/financial-report
```

### الهدف

يرجع هذا المسار كل البيانات اللازمة لبناء لوحة مالية كاملة:

- كروت الإحصائيات.
- إجماليات الدخل والمدفوع والمتبقي.
- عدد الحجوزات.
- عدد الحالات التي دفعت.
- عدد الحالات التي لم تدفع.
- توزيع المدفوعات حسب وسيلة الدفع.
- حسابات كل دكتور داخل الفترة.
- بيانات الرسوم البيانية اليومية والأسبوعية والشهرية.
- نتيجة التحقق المحاسبي.

### مثال استجابة مختصر

```json
{
  "period": {
    "type": "day",
    "startDate": "2026-06-15",
    "endDate": "2026-06-15",
    "label": "2026-06-15"
  },
  "cards": {
    "totalIncome": 400,
    "totalPayments": 400,
    "totalOutstanding": 0,
    "totalBookings": 2,
    "paidCases": 2,
    "unpaidCases": 0
  },
  "summary": {
    "grossIncome": 400,
    "totalCollected": 400,
    "totalOutstanding": 0,
    "paymentBreakdownMatchesCollected": true,
    "byDoctor": [
      {
        "doctorId": 1,
        "doctorName": "Dr. Example",
        "specialty": "Dermatology",
        "grossIncome": 400,
        "totalCollected": 400,
        "totalOutstanding": 0,
        "totalBookings": 2,
        "fullyPaidCases": 2,
        "outstandingCases": 0
      }
    ]
  },
  "validation": {
    "isBalanced": true
  }
}
```

---

## 6. شرح الأرقام المحاسبية

### إجمالي الدخل

يمثل إجمالي قيمة الحجوزات المستحقة داخل الفترة:

```text
grossIncome = SUM(totalAmount)
```

### إجمالي المدفوعات

يمثل إجمالي المبالغ المحصلة فعليًا من وسائل الدفع:

```text
totalCollected = SUM(paymentDetails.amount)
```

إذا كان الحجز قديمًا ولا يحتوي على `paymentDetails`، يستخدم النظام:

```text
amountPaid + paymentMethod
```

### إجمالي المتبقي

```text
remainingAmount = MAX(totalAmount - collectedAmount, 0)
```

### حالة الدفع

الحالة المالية لكل حجز يتم حسابها كالتالي:

- `paid`: الحجز مدفوع بالكامل.
- `partial`: يوجد مبلغ مدفوع لكن ما زال هناك متبقي.
- `unpaid`: لم يتم دفع أي مبلغ مع وجود قيمة مستحقة.
- `overpaid`: المدفوع أكبر من المطلوب.
- `zero_due`: الحجز لا يحتوي على قيمة مستحقة.

---

## 7. جدول الحالات

### المسار

```http
GET /api/accounts/financial-report/cases
```

### الهدف

يرجع جدول الحالات داخل الفترة المختارة مع دعم البحث والتصفية والصفحات.

### أهم معاملات البحث

- `date`: يوم محدد.
- `startDate` و `endDate`: فترة مخصصة.
- `month`: شهر كامل.
- `paymentStatus`: فلترة حسب حالة الدفع.
- `paymentMethod`: فلترة حسب وسيلة الدفع.
- `search`: بحث باسم الحالة أو رقم الهاتف أو الخدمة.
- `page`: رقم الصفحة.
- `limit`: عدد النتائج في الصفحة.
- `sortBy`: ترتيب حسب حقل معين.
- `sortDir`: `asc` أو `desc`.

### قيم `paymentStatus`

- `all`: كل الحالات.
- `paid`: الحالات المدفوعة بالكامل.
- `unpaid`: الحالات غير المسددة.
- `partial`: الحالات المدفوعة جزئيًا.
- `outstanding`: الحالات غير المسددة أو المدفوعة جزئيًا.
- `with_payment`: الحالات التي لديها أي مبلغ مدفوع.
- `without_payment`: الحالات التي لم تدفع أي مبلغ.

### مثال

```http
GET /api/accounts/financial-report/cases?date=2026-06-15&paymentStatus=outstanding&page=1&limit=25
```

### شكل العنصر داخل الجدول

```json
{
  "bookingId": 84,
  "patientName": "احمد خالد",
  "phone": "01225487965",
  "bookingDate": "2026-06-15",
  "service": "كشف",
  "bookingValue": 200,
  "totalAmount": 200,
  "amountPaid": 200,
  "remainingAmount": 0,
  "paymentStatus": "paid",
  "paymentStatusLabel": "مدفوع بالكامل",
  "paymentMethods": [
    {
      "method": "cash",
      "label": "نقدي",
      "amount": 200
    }
  ]
}
```

---

## 8. حسابات الأطباء

التقرير الرئيسي يرجع حسابات كل دكتور داخل الفترة في:

```json
"summary": {
  "byDoctor": [
    {
      "doctorId": 1,
      "doctorName": "اسم الدكتور",
      "specialty": "التخصص",
      "phone": "رقم الهاتف",
      "grossIncome": 1000,
      "totalCollected": 800,
      "totalOutstanding": 200,
      "totalBookings": 5,
      "casesWithPayments": 4,
      "casesWithoutPayments": 1,
      "fullyPaidCases": 3,
      "outstandingCases": 2,
      "partialCases": 1,
      "overpaidCases": 0
    }
  ]
}
```

نفس البيانات ترجع أيضًا في:

```json
"charts": {
  "doctorIncomeDistribution": []
}
```

لعرض كل حالات دكتور معين داخل الفترة:

```http
GET /api/accounts/financial-report/cases?doctorId=1&startDate=2026-06-01&endDate=2026-06-15
```

كل صف حالة يحتوي على:

- `doctorId`
- `doctorName`
- `doctorSpecialty`

---

## 9. توزيع المدفوعات حسب وسيلة الدفع

التقرير الرئيسي يرجع `summary.paymentBreakdown` و `charts.paymentMethodDistribution`.

النظام يتأكد من أن:

```text
SUM(paymentBreakdown.amount) == totalCollected
```

نتيجة هذا الفحص تظهر في:

```json
{
  "paymentBreakdownMatchesCollected": true
}
```

---

## 10. بيانات الرسوم البيانية

يرجع التقرير الرئيسي البيانات اللازمة للرسوم البيانية في `charts`.

### توزيع الدخل حسب وسيلة الدفع

```json
"paymentMethodDistribution": [
  { "method": "cash", "label": "نقدي", "amount": 200, "count": 1 }
]
```

### تطور الدخل يوميًا

```json
"dailyIncome": [
  {
    "periodStart": "2026-06-15",
    "bookingCount": 2,
    "grossIncome": 400,
    "totalCollected": 400,
    "totalOutstanding": 0
  }
]
```

### تطور الدخل أسبوعيًا وشهريًا

نفس الشكل يرجع داخل:

- `weeklyIncome`
- `monthlyIncome`

---

## 11. التحقق المحاسبي

كل تقرير يرجع جزء `validation`.

أهم الفحوصات:

- التأكد أن الحجوزات الملغاة والمرفوضة غير محسوبة.
- التأكد أن مجموع وسائل الدفع يساوي إجمالي المدفوعات.
- اكتشاف أي اختلاف بين `amountPaid` ومجموع `paymentDetails`.
- اكتشاف الحجوزات المدفوعة بدون وسيلة دفع.
- اكتشاف المدفوعات الزائدة عن قيمة الحجز.
- اكتشاف القيم السالبة.
- اكتشاف احتمالات تكرار نفس عملية الدفع داخل نفس الحجز.

مثال:

```json
{
  "validation": {
    "isBalanced": true,
    "checks": {
      "cancelledBookingsExcluded": true,
      "paymentMethodsMatchCollected": true,
      "noPaymentAmountMismatch": true,
      "noMissingPaymentMethodForPaidBookings": true,
      "noOverpaidBookings": true,
      "noNegativeAmounts": true,
      "noDuplicatePaymentCandidates": true
    },
    "excludedCancelledOrRejectedBookings": 3,
    "anomalies": {
      "paymentMismatchCount": 0,
      "missingPaymentMethodCount": 0,
      "overpaidCount": 0,
      "negativeAmountCount": 0,
      "duplicatePaymentCandidateCount": 0
    }
  }
}
```

---

## 12. التصدير والطباعة

### Excel

```http
GET /api/accounts/financial-report/export?format=excel&startDate=2026-06-01&endDate=2026-06-15
```

يرجع ملف `.xlsx` يحتوي على:

- Summary.
- Payment Methods.
- Doctors.
- Paid Cases.
- Outstanding Cases.
- Daily Trend.
- Validation.

### PDF

```http
GET /api/accounts/financial-report/export?format=pdf&date=2026-06-15
```

يرجع ملف PDF يحتوي على ملخص التقرير، توزيع وسائل الدفع، وقوائم مختصرة للحالات.

### Print / HTML

```http
GET /api/accounts/financial-report/export?format=print&date=2026-06-15
```

يرجع صفحة HTML قابلة للطباعة من المتصفح.

---

## 13. واجهات الحسابات القديمة

هذه الواجهات ما زالت موجودة للحفاظ على التوافق مع الواجهة الحالية.

### دخل الحجوزات القديم

```http
GET /api/accounts/income/bookings
```

يدعم:

- `month=YYYY-MM`
- `startDate=YYYY-MM-DD&endDate=YYYY-MM-DD`
- `startMonth=YYYY-MM&endMonth=YYYY-MM`

يعتمد على `amountPaid` ويجمع الدخل حسب العميل والطبيب.

### الدخل اليدوي

```http
POST /api/accounts/income
GET /api/accounts/income/manual
```

### المصروفات

```http
POST /api/accounts/expenses
GET /api/accounts/expenses
```

### تصنيفات المصروفات

```http
GET /api/accounts/expense-categories
POST /api/accounts/expense-categories
PUT /api/accounts/expense-categories/:id
DELETE /api/accounts/expense-categories/:id
```

### تصنيفات المصروفات الفرعية

```http
GET /api/accounts/expense-subcategories
POST /api/accounts/expense-subcategories
PUT /api/accounts/expense-subcategories/:id
DELETE /api/accounts/expense-subcategories/:id
```

### الملخص القديم

```http
GET /api/accounts/summary
```

يعرض:

- دخل الحجوزات.
- الدخل اليدوي.
- المصروفات.
- الرصيد.

---

## 14. إنشاء وتحديث الحجز ماليًا

عند إنشاء أو تعديل حجز عيادة يمكن إرسال قيمة الحجز المستحقة بأكثر من اسم لتسهيل توافق الواجهة:

- `totalAmount`
- `bookingValue`
- `requiredAmount`
- `amountDue`
- `price`
- `value`

مثال:

```json
{
  "name": "احمد خالد",
  "phone": "01225487965",
  "date": "2026-06-15",
  "doctorId": 1,
  "totalAmount": 500,
  "paymentDetails": [
    { "method": "cash", "amount": 300 },
    { "method": "instapay", "amount": 200, "transferFromPhone": "01000000000" }
  ]
}
```

النظام يرفض الحجز إذا كان:

```text
amountPaid > totalAmount
```

كما يرفض الدفع المقسم إذا لم يكن:

```text
amountPaid == SUM(paymentDetails.amount)
```

---

## 15. ملاحظات مهمة

- التقارير الجديدة تعتمد على `Bookings` فقط، وهي الأنسب لمراجعة دخل الحجوزات.
- الدخل اليدوي والمصروفات ما زالت في النظام القديم.
- الحجوزات القديمة التي لم يكن لديها `totalAmount` يتم ملء قيمتها تلقائيًا من `amountPaid`.
- في حالة الدفع المقسم، المصدر الأدق هو `paymentDetails`.
- `paymentMethod` وحده غير كافٍ لمعرفة توزيع الدفع إذا تم استخدام أكثر من وسيلة دفع.
- النظام يستخدم Aggregation Queries مباشرة على PostgreSQL لتحسين الأداء مع عدد كبير من الحجوزات.
- جداول الحالات تدعم pagination لتجنب تحميل آلاف السجلات دفعة واحدة.

---

## 16. الملفات البرمجية المرتبطة

- `src/routes/accountRoutes.js`
- `src/controllers/accountController.js`
- `src/services/financialReportService.js`
- `src/models/booking.js`
- `src/controllers/bookingController.js`
- `src/services/clinicBookingService.js`
- `src/services/bookingSlotService.js`
- `src/utils/paymentMethodHelper.js`
- `src/constants/paymentMethods.js`
- `src/config/database.js`

