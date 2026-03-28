# توثيق تفصيلي — نظام الحسابات الشهرية (Monthly Accounts APIs)

**Base URL:** `http://localhost:8000`  
**المسار الأساسي:** `/api/accounts`

هذا الملف يشرح **كل واجهات الـ API** الخاصة بنظام الحسابات في المشروع، مع التركيز على **اختيار الفترة (شهر واحد / أيام / عدة شهور)** وكيفية استخدامها في الطلبات.

---

## المحتويات

1. [نظرة عامة](#1-نظرة-عامة)
2. [المصادقة والصلاحيات](#2-المصادقة-والصلاحيات)
3. [اختيار الفترة (المنطق الفعلي في الكود)](#3-اختيار-الفترة-المنطق-الفعلي-في-الكود)
4. [جدول ملخص سريع لجميع المسارات](#4-جدول-ملخص-سريع-لجميع-المسارات)
5. [واجهات الدخل](#5-واجهات-الدخل)
6. [واجهات المصروفات والتصنيف](#6-واجهات-المصروفات-والتصنيف)
7. [ملخص الحسابات](#7-ملخص-الحسابات)
8. [أكواد الأخطاء الشائعة](#8-أكواد-الأخطاء-الشائعة)

---

## 1. نظرة عامة

نظام الحسابات يوفّر:

| الوظيفة | الوصف |
|---------|--------|
| **دخل الحجوزات** | تجميع `amountPaid` من الحجوزات حسب اسم العميل ضمن فترة زمنية |
| **دخل يدوي** | إدخال وعرض قيود دخل يدوية (`IncomeEntry`) |
| **مصروفات** | إدخال وعرض مصروفات مع **تصنيف رئيسي + فرعي** (`category_id` / `subcategory_id`) |
| **تصنيفات المصروفات** | CRUD لـ Categories و Subcategories |
| **الملخص** | إجمالي دخل الحجوزات + الدخل اليدوي − إجمالي المصروفات = الرصيد |

**ملاحظة:** معظم واجهات **العرض (GET)** تعتمد على نفس دالة الفترة `getPeriodRange` في `accountController.js`، لذلك سلوك `month` و `period` موحّد.

---

## 2. المصادقة والصلاحيات

| المتطلب | القيمة |
|---------|--------|
| Header | `Authorization: Bearer <token>` |
| صلاحية | `manage_accounts` |

**استثناء:** مسار `GET /api/accounts` يستخدم `protect` + `hasPermission('manage_accounts')` مباشرة (نفس الصلاحية).

بدون توكن صالح → غالباً **401**. بدون الصلاحية → **403**.

---

## 3. اختيار الفترة (المنطق الفعلي في الكود)

الدالة `getPeriodRange(req.query)` تحدد `start` و `end` و `periodLabel` بالترتيب التالي:

### أولوية التطبيق

1. **إذا وُجد** `startDate` **و** `endDate` (كلاهما بصيغة `YYYY-MM-DD`) **و** `start <= end`  
   → الفترة = من بداية اليوم الأول إلى نهاية اليوم الأخير (UTC في بداية/نهاية النطاق).  
   → `periodLabel` = `"YYYY-MM-DD → YYYY-MM-DD"`

2. **وإلا إذا وُجد** `startMonth` **و** `endMonth` (كلاهما `YYYY-MM`) **و** الفترة منطقية  
   → من أول يوم في `startMonth` إلى آخر يوم في `endMonth` (حسب منطق `Date` في Node).  
   → `periodLabel` = `"YYYY-MM → YYYY-MM"`

3. **وإلا**  
   → يُعتبر طلب **شهر واحد** عبر `month=YYYY-MM`  
   → إذا `month` غير صالح أو غير مُمرَّر → **الشهر الحالي** للسيرفر.  
   → `periodLabel` = `"YYYY-MM"` (نفس قيمة الشهر المستخدمة)

### معاملات Query المدعومة

| المعامل | الصيغة | الاستخدام |
|---------|--------|-----------|
| `month` | `YYYY-MM` | شهر تقويمي واحد |
| `startDate` | `YYYY-MM-DD` | بداية نطاق أيام (يجب مع `endDate`) |
| `endDate` | `YYYY-MM-DD` | نهاية نطاق أيام |
| `startMonth` | `YYYY-MM` | بداية نطاق شهور (يجب مع `endMonth`) |
| `endMonth` | `YYYY-MM` | نهاية نطاق شهور |

### أي مسارات تستخدم الفترة؟

- `GET /api/accounts/income/bookings`
- `GET /api/accounts/income/manual`
- `GET /api/accounts/expenses`
- `GET /api/accounts/summary`

**لا** تُستخدم الفترة في: إضافة دخل يدوي، إضافة مصروف، أو CRUD التصنيفات (هذه عمليات فورية بتاريخ في الـ body أو بدون فلترة).

---

## 4. جدول ملخص سريع لجميع المسارات

| Method | المسار | الوصف |
|--------|--------|--------|
| GET | `/api/accounts` | التحقق من الوصول للوحة الحسابات |
| GET | `/api/accounts/income/bookings` | دخل الحجوزات مجمّع حسب العميل للفترة |
| POST | `/api/accounts/income` | إضافة دخل يدوي |
| GET | `/api/accounts/income/manual` | قائمة الدخل اليدوي للفترة |
| POST | `/api/accounts/expenses` | إضافة مصروف (مع تصنيف) |
| GET | `/api/accounts/expenses` | قائمة المصروفات للفترة |
| GET | `/api/accounts/expense-categories` | قائمة التصنيفات الرئيسية |
| POST | `/api/accounts/expense-categories` | إنشاء تصنيف |
| PUT | `/api/accounts/expense-categories/:id` | تعديل تصنيف |
| DELETE | `/api/accounts/expense-categories/:id` | حذف تصنيف |
| GET | `/api/accounts/expense-subcategories` | قائمة التصنيفات الفرعية (اختياري `category_id`) |
| POST | `/api/accounts/expense-subcategories` | إنشاء تصنيف فرعي |
| PUT | `/api/accounts/expense-subcategories/:id` | تعديل تصنيف فرعي |
| DELETE | `/api/accounts/expense-subcategories/:id` | حذف تصنيف فرعي |
| GET | `/api/accounts/summary` | ملخص الدخل والمصروفات والرصيد للفترة |

---

## 5. واجهات الدخل

### 5.1 التحقق من الوصول

**`GET /api/accounts`**

- **Headers:** `Authorization: Bearer <token>`
- **Response (200):**
```json
{ "message": "Access granted to Accounts dashboard" }
```

---

### 5.2 دخل الحجوزات (تجميع حسب اسم العميل)

**`GET /api/accounts/income/bookings`**

- **Query:** نفس [اختيار الفترة](#3-اختيار-الفترة-المنطق-الفعلي-في-الكود).
- **منطق الاحتساب:**
  - `appointmentDate` ضمن `[start, end]`
  - `status` **ليس** من: `cancelled`, `rejected`
  - تجميع بـ `customerName` و sum لـ `amountPaid`

**Response (200):**
```json
{
  "period": "2026-03",
  "byCustomer": [
    { "customerName": "أحمد علي", "amount": 1200.5 }
  ],
  "total": 1200.5
}
```

| الحقل | الوصف |
|--------|--------|
| `period` | وصف الفترة كما في `getPeriodRange` |
| `byCustomer` | مصفوفة: اسم العميل + مجموع المدفوع |
| `total` | مجموع كل العملاء |

---

### 5.3 إضافة دخل يدوي

**`POST /api/accounts/income`**

- **Body (JSON):**

| الحقل | النوع | مطلوب | الوصف |
|-------|------|--------|--------|
| `description` | string | نعم | وصف العملية / اسم الدخل |
| `amount` | number | نعم | المبلغ ≥ 0 |
| `entryDate` | string | لا | `YYYY-MM-DD` — الافتراضي: تاريخ اليوم (UTC slice في الكود) |

**Response (201):**
```json
{
  "message": "Income entry added successfully.",
  "entry": {
    "id": 1,
    "description": "...",
    "amount": "1000.00",
    "entryDate": "2026-03-15",
    "createdAt": "...",
    "updatedAt": "..."
  }
}
```

**أخطاء شائعة (400):**
- `description and amount are required.`
- `amount must be a positive number.`

---

### 5.4 قائمة الدخل اليدوي للفترة

**`GET /api/accounts/income/manual`**

- **Query:** [اختيار الفترة](#3-اختيار-الفترة-المنطق-الفعلي-في-الكود)
- **فلترة:** `entryDate` بين `start` و `end`
- **ترتيب:** `entryDate` تنازلياً ثم `id` تنازلياً

**Response (200):**
```json
{
  "period": "2026-03",
  "entries": [ { "...": "..." } ],
  "total": 2500
}
```

---

## 6. واجهات المصروفات والتصنيف

### 6.1 إضافة مصروف

**`POST /api/accounts/expenses`**

| الحقل | النوع | مطلوب | الوصف |
|-------|------|--------|--------|
| `description` | string | نعم | وصف المصروف |
| `amount` | number | نعم | المبلغ ≥ 0 |
| `category_id` | number | نعم | معرف التصنيف الرئيسي |
| `subcategory_id` | number | نعم | معرف التصنيف الفرعي **التابع لنفس** `category_id` |
| `date` | string | لا* | `YYYY-MM-DD` — تاريخ المصروف |
| `expenseDate` | string | لا* | بديل قديم لـ `date` |
| `notes` | string | لا | ملاحظات |

\* إذا لم تُرسل `date` ولا `expenseDate` يُستخدم تاريخ اليوم (UTC `YYYY-MM-DD` من `toISOString`).

**التحقق:** يجب أن يوجد `ExpenseSubcategory` بـ `id = subcategory_id` و `categoryId = category_id`.

**Response (201):**
```json
{
  "message": "Expense added successfully.",
  "expense": {
    "id": 1,
    "description": "...",
    "amount": "500.00",
    "expenseDate": "2026-03-10",
    "notes": null,
    "categoryId": 2,
    "subcategoryId": 15,
    "createdAt": "...",
    "updatedAt": "..."
  }
}
```

**أخطاء 400 (أمثلة):**
- `category_id and subcategory_id are required.`
- `Invalid category_id.`
- `Invalid subcategory_id for the given category_id.`
- `date must be in YYYY-MM-DD format.`

---

### 6.2 قائمة المصروفات للفترة

**`GET /api/accounts/expenses`**

- **Query:** [اختيار الفترة](#3-اختيار-الفترة-المنطق-الفعلي-في-الكود)
- **فلترة:** `expenseDate` بين `start` و `end`
- **يشمل:** `category` و `subcategory` (أسماء التصنيف)

**Response (200):**
```json
{
  "period": "2026-03",
  "expenses": [
    {
      "id": 1,
      "description": "...",
      "amount": "500.00",
      "expenseDate": "2026-03-10",
      "notes": null,
      "categoryId": 2,
      "subcategoryId": 15,
      "category": { "id": 2, "name": "..." },
      "subcategory": { "id": 15, "name": "...", "categoryId": 2 },
      "createdAt": "...",
      "updatedAt": "..."
    }
  ],
  "total": 500
}
```

---

### 6.3 التصنيفات الرئيسية (Categories)

| Method | المسار | Body / Params |
|--------|--------|----------------|
| GET | `/api/accounts/expense-categories` | — |
| POST | `/api/accounts/expense-categories` | `{ "name": "..." }` |
| PUT | `/api/accounts/expense-categories/:id` | `{ "name": "..." }` |
| DELETE | `/api/accounts/expense-categories/:id` | — |

**POST — Response (201):** `{ "message": "Category created successfully.", "category": { ... } }`  
**PUT — Response (200):** `{ "message": "Category updated successfully.", "category": { ... } }`  
**DELETE — Response (200):** `{ "message": "Category deleted successfully." }`  
**GET — Response (200):** `{ "categories": [ ... ] }`

---

### 6.4 التصنيفات الفرعية (Subcategories)

| Method | المسار | Query / Body |
|--------|--------|---------------|
| GET | `/api/accounts/expense-subcategories` | اختياري: `?category_id=1` لتصفية حسب التصنيف الرئيسي |
| POST | `/api/accounts/expense-subcategories` | `{ "name": "...", "category_id": 1 }` |
| PUT | `/api/accounts/expense-subcategories/:id` | `{ "name": "...", "category_id": 1 }` (الحقول اختيارية للتعديل الجزئي) |
| DELETE | `/api/accounts/expense-subcategories/:id` | — |

**GET — Response (200):** `{ "subcategories": [ ... ] }`

---

## 7. ملخص الحسابات

**`GET /api/accounts/summary`**

- **Query:** [اختيار الفترة](#3-اختيار-الفترة-المنطق-الفعلي-في-الكود)

**المعادلات:**

- `incomeFromBookings` = مجموع `amountPaid` للحجوزات حيث `appointmentDate` في الفترة و `status ∉ { cancelled, rejected }`
- `manualIncome` = مجموع `amount` في `IncomeEntry` حيث `entryDate` في الفترة
- `totalIncome` = `incomeFromBookings + manualIncome`
- `totalExpenses` = مجموع `amount` في `Expenses` حيث `expenseDate` في الفترة
- `balance` = `totalIncome - totalExpenses`

**Response (200):**
```json
{
  "period": "2026-03",
  "incomeFromBookings": 10000,
  "manualIncome": 500,
  "totalIncome": 10500,
  "totalExpenses": 3200,
  "balance": 7300
}
```

---

## 8. أكواد الأخطاء الشائعة

| الحالة | السبب المحتمل |
|--------|----------------|
| 401 | توكن مفقود أو غير صالح |
| 403 | المستخدم لا يملك صلاحية `manage_accounts` |
| 400 | حقول مطلوبة ناقصة، أو `amount` غير رقمي، أو تصنيف مصروف غير متطابق |
| 404 | تصنيف غير موجود عند PUT/DELETE للـ categories أو subcategories |

---

## أمثلة سريعة — «شهر واحد»

```http
GET /api/accounts/summary?month=2026-03
GET /api/accounts/income/bookings?month=2026-03
GET /api/accounts/income/manual?month=2026-03
GET /api/accounts/expenses?month=2026-03
```

بدون query → يُستخدم **الشهر الحالي** حسب تاريخ السيرفر.

---

*هذا الملف يعكس سلوك `src/controllers/accountController.js` و `src/routes/accountRoutes.js` في المشروع.*
