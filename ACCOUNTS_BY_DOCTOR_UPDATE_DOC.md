# تحديث الحسابات الشهرية — إجمالي العيادة + تفصيل كل طبيب

هذا الملف يوثّق **التعديل الأخير** على نظام الحسابات: إمكانية رؤية **دخل الحجوزات إجمالًا** و**موزّعًا حسب الطبيب** في نفس الفترة.

**الكود:** `src/controllers/accountController.js` (دالة مساعدة `getBookingIncomeByDoctor`).

---

## 1) الفكرة العامة

| البند | المعنى |
|--------|--------|
| **إجمالي العيادة** | يبقى كما هو: `incomeFromBookings` + `manualIncome` − `totalExpenses` في `summary` |
| **تفصيل الأطباء** | يُحسب من **الحجوزات فقط**: مجموع `amountPaid` لكل `doctorId` ضمن الفترة |
| **حجوزات بدون طبيب** | `doctorId` فارغ (بيانات قديمة) → تظهر كصف واحد باسم **«بدون طبيب»** |

**مهم:** الدخل اليدوي (`IncomeEntries`) والمصروفات (`Expenses`) **لا يوجد لها حقل طبيب** في الموديل الحالي، لذلك تبقى **على مستوى العيادة فقط** ولا تُقسَّم على الأطباء.

---

## 2) `GET /api/accounts/summary`

**المسار:** `GET /api/accounts/summary`  
**الصلاحية:** `manage_accounts` + `Authorization: Bearer <token>`

**اختيار الفترة:** كما في باقي الحسابات (`month` أو `startDate`+`endDate` أو `startMonth`+`endMonth`) — راجع `ACCOUNTS_MONTHLY_SYSTEM_DOC.md`.

### حقول جديدة في الاستجابة (JSON)

| الحقل | الوصف |
|--------|--------|
| `incomeFromBookingsByDoctor` | مصفوفة: لكل طبيب `{ doctorId, doctorName, specialty, amount }` + صف اختياري لـ `doctorId: null` (بدون طبيب) |
| `note` | نص يوضح أن التوزيع بالطبيب يخص دخل الحجوزات، واليدوي/المصروفات على مستوى العيادة |

### الحقول القديمة (بدون تغيير في المعنى)

- `incomeFromBookings` — إجمالي دخل الحجوزات في الفترة  
- `manualIncome` — الدخل اليدوي  
- `totalIncome` — `incomeFromBookings + manualIncome`  
- `totalExpenses` — المصروفات  
- `balance` — `totalIncome - totalExpenses`  
- `period` — تسمية الفترة  

### مثال استجابة (مختصر)

```json
{
  "period": "2026-04",
  "incomeFromBookings": 15000.5,
  "incomeFromBookingsByDoctor": [
    { "doctorId": 1, "doctorName": "د. أحمد", "specialty": "جلدية", "amount": 9000 },
    { "doctorId": 2, "doctorName": "د. سارة", "specialty": "أسنان", "amount": 6000.5 }
  ],
  "manualIncome": 500,
  "totalIncome": 15500.5,
  "totalExpenses": 3000,
  "balance": 12500.5,
  "note": "الدخل اليدوي والمصروفات على مستوى العيادة (غير موزعة على الأطباء). دخل الحجوزات موزّع في incomeFromBookingsByDoctor."
}
```

---

## 3) `GET /api/accounts/income/bookings`

**المسار:** `GET /api/accounts/income/bookings`  
**نفس الصلاحية والفترة.**

### حقول جديدة في الاستجابة

| الحقل | الوصف |
|--------|--------|
| `byDoctor` | نفس منطق التفصيل حسب الطبيب (مجموع `amountPaid` لكل طبيب) |
| `totalByDoctor` | مجموع مبالغ `byDoctor` (يُفترض أن يطابق `total` القادم من تجميع `byCustomer` من حيث إجمالي دخل الحجوزات) |

### الحقول السابقة

- `period`  
- `byCustomer` — تفصيل حسب اسم العميل + نوع الزيارة (كما كان)  
- `total` — إجمالي دخل الحجوزات في الفترة  

---

## 4) من أين يأتي اسم الطبيب؟

- من جدول `DoctorProfiles` مرتبطًا بـ `Users` (حقل `name` للعرض في `doctorName`).

---

## 5) تطوير مستقبلي (اختياري)

لو احتجت **مصروفات أو دخل يدوي لكل طبيب**، يُقترح إضافة `doctorId` اختياري في `IncomeEntries` و/أو `Expenses` ثم توسيع الملخص بنفس الفكرة.
