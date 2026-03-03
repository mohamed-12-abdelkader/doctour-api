# توثيق نظام الحسابات
# Accounts System Documentation

**Base URL:** `http://localhost:8000`  
**المسار الأساسي:** `/api/accounts`

---

## المحتويات

1. [نظرة عامة](#نظرة-عامة)
2. [الصلاحيات](#الصلاحيات)
3. [اختيار الفترة (شهر / أيام / شهور)](#اختيار-الفترة)
4. [واجهات الدخل](#واجهات-الدخل)
5. [واجهات المصروفات](#واجهات-المصروفات)
6. [ملخص الحسابات](#ملخص-الحسابات)
7. [أمثلة الاستجابة](#أمثلة-الاستجابة)

---

## نظرة عامة

نظام الحسابات يتيح:

- **دخل الحجوزات**: تجميع المبالغ المدفوعة من الحجوزات (المؤكدة وغير الملغاة) حسب اسم العميل وإجمالي الدخل.
- **دخل يدوي**: إدخال دخل آخر (عمليات، إيرادات إضافية) مع التاريخ.
- **المصروفات**: تسجيل المصروفات مع التاريخ وملاحظات اختيارية.
- **الملخص**: إجمالي الدخل (حجوزات + يدوي)، إجمالي المصروفات، والرصيد (الدخل − المصروفات).

يمكن عرض كل ذلك **لفترة مرنة**: شهر واحد، أو مجموعة أيام، أو مجموعة شهور.

---

## الصلاحيات

جميع مسارات الحسابات تتطلب:

- **تسجيل الدخول**: `Authorization: Bearer <token>`
- **صلاحية**: `manage_accounts` (أدمن أو موظف مُمنوح الصلاحية)

بدون ذلك يتم الرد بـ `401` أو `403`.

---

## اختيار الفترة

جميع واجهات **عرض** البيانات (GET) تدعم تحديد الفترة بإحدى الطرق التالية:

| الطريقة | معاملات Query | الوصف |
|---------|----------------|--------|
| **شهر واحد** | `month=YYYY-MM` | مثال: `month=2026-02` |
| **مجموعة أيام** | `startDate=YYYY-MM-DD` و `endDate=YYYY-MM-DD` | من تاريخ إلى تاريخ |
| **مجموعة شهور** | `startMonth=YYYY-MM` و `endMonth=YYYY-MM` | من شهر إلى شهر |

- إذا **لم تُمرّر** أي معاملات فترة → يُستخدم **الشهر الحالي** تلقائياً.
- في الاستجابة يُرجع الحقل **`period`** وصف الفترة، مثلاً:
  - `"2026-02"` (شهر واحد)
  - `"2026-02-01 → 2026-02-15"` (أيام)
  - `"2026-01 → 2026-03"` (شهور)

---

## واجهات الدخل

### 1. دخل الحجوزات (تجميع حسب العميل)

عرض إيرادات الحجوزات (المبلغ المدفوع) مجمّعة حسب اسم العميل، للفترة المحددة. تُحسب فقط الحجوزات المؤكدة وغير الملغاة/المرفوضة حسب `appointmentDate`.

- **المسار:** `GET /api/accounts/income/bookings`
- **الصلاحية:** `manage_accounts`
- **Query (اختياري):** نفس خيارات الفترة أعلاه (`month` أو `startDate`+`endDate` أو `startMonth`+`endMonth`)

**مثال:**
```http
GET /api/accounts/income/bookings?month=2026-02
GET /api/accounts/income/bookings?startDate=2026-02-01&endDate=2026-02-15
GET /api/accounts/income/bookings?startMonth=2026-01&endMonth=2026-03
```

**استجابة (200):**
```json
{
  "period": "2026-02",
  "byCustomer": [
    { "customerName": "أحمد محمد", "amount": 350.5 },
    { "customerName": "سارة علي", "amount": 200 }
  ],
  "total": 550.5
}
```

---

### 2. إضافة دخل يدوي

- **المسار:** `POST /api/accounts/income`
- **الصلاحية:** `manage_accounts`
- **Body (JSON):**

| الحقل | النوع | مطلوب | الوصف |
|-------|--------|--------|--------|
| `description` | string | نعم | وصف العملية / اسم الدخل |
| `amount` | number | نعم | المبلغ (موجب) |
| `entryDate` | string | لا | تاريخ الدخل YYYY-MM-DD (افتراضي: اليوم) |

**مثال طلب:**
```http
POST /api/accounts/income
Content-Type: application/json

{
  "description": "استشارة هاتفية",
  "amount": 150,
  "entryDate": "2026-02-18"
}
```

**استجابة (201):**
```json
{
  "message": "Income entry added successfully.",
  "entry": {
    "id": 1,
    "description": "استشارة هاتفية",
    "amount": "150.00",
    "entryDate": "2026-02-18",
    "createdAt": "...",
    "updatedAt": "..."
  }
}
```

---

### 3. قائمة الدخل اليدوي للفترة

- **المسار:** `GET /api/accounts/income/manual`
- **الصلاحية:** `manage_accounts`
- **Query:** نفس خيارات الفترة (`month` أو `startDate`+`endDate` أو `startMonth`+`endMonth`)

**استجابة (200):**
```json
{
  "period": "2026-02",
  "entries": [
    {
      "id": 1,
      "description": "استشارة هاتفية",
      "amount": "150.00",
      "entryDate": "2026-02-18",
      "createdAt": "...",
      "updatedAt": "..."
    }
  ],
  "total": 150
}
```

---

## واجهات المصروفات

### 4. قائمة المصروفات للفترة

- **المسار:** `GET /api/accounts/expenses`
- **الصلاحية:** `manage_accounts`
- **Query:** نفس خيارات الفترة

**استجابة (200):**
```json
{
  "period": "2026-02",
  "expenses": [
    {
      "id": 1,
      "description": "أدوات طبية",
      "amount": "500.00",
      "expenseDate": "2026-02-10",
      "notes": "طلب شهري",
      "createdAt": "...",
      "updatedAt": "..."
    }
  ],
  "total": 500
}
```

---

### 5. إضافة مصروف

- **المسار:** `POST /api/accounts/expenses`
- **الصلاحية:** `manage_accounts`
- **Body (JSON):**

| الحقل | النوع | مطلوب | الوصف |
|-------|--------|--------|--------|
| `description` | string | نعم | وصف المصروف |
| `amount` | number | نعم | المبلغ (موجب) |
| `expenseDate` | string | لا | تاريخ المصروف YYYY-MM-DD (افتراضي: اليوم) |
| `notes` | string | لا | ملاحظات |

**مثال طلب:**
```http
POST /api/accounts/expenses
Content-Type: application/json

{
  "description": "أدوات طبية",
  "amount": 500,
  "expenseDate": "2026-02-10",
  "notes": "طلب شهري"
}
```

**استجابة (201):**
```json
{
  "message": "Expense added successfully.",
  "expense": {
    "id": 1,
    "description": "أدوات طبية",
    "amount": "500.00",
    "expenseDate": "2026-02-10",
    "notes": "طلب شهري",
    "createdAt": "...",
    "updatedAt": "..."
  }
}
```

---

## ملخص الحسابات

عرض ملخص واحد للفترة: دخل الحجوزات + الدخل اليدوي، إجمالي المصروفات، والرصيد.

- **المسار:** `GET /api/accounts/summary`
- **الصلاحية:** `manage_accounts`
- **Query:** نفس خيارات الفترة

**استجابة (200):**
```json
{
  "period": "2026-02",
  "incomeFromBookings": 550.5,
  "manualIncome": 150,
  "totalIncome": 700.5,
  "totalExpenses": 500,
  "balance": 200.5
}
```

| الحقل | الوصف |
|--------|--------|
| `period` | الفترة المعروضة (شهر أو نطاق أيام/شهور) |
| `incomeFromBookings` | إجمالي المبالغ المدفوعة من الحجوزات في الفترة |
| `manualIncome` | إجمالي الدخل اليدوي في الفترة |
| `totalIncome` | دخل الحجوزات + الدخل اليدوي |
| `totalExpenses` | إجمالي المصروفات في الفترة |
| `balance` | الرصيد = totalIncome − totalExpenses |

---

## أمثلة الاستجابة

### شهر واحد
```http
GET /api/accounts/summary?month=2026-02
```
→ `"period": "2026-02"`

### مجموعة أيام
```http
GET /api/accounts/summary?startDate=2026-02-01&endDate=2026-02-15
```
→ `"period": "2026-02-01 → 2026-02-15"`

### مجموعة شهور
```http
GET /api/accounts/summary?startMonth=2026-01&endMonth=2026-03
```
→ `"period": "2026-01 → 2026-03"`

### بدون معاملات (الشهر الحالي)
```http
GET /api/accounts/summary
```
→ `"period": "YYYY-MM"` للشهر الحالي

---

## ملخص المسارات

| Method | المسار | الوصف |
|--------|--------|--------|
| GET | `/api/accounts` | التحقق من الوصول للوحة الحسابات |
| GET | `/api/accounts/income/bookings` | دخل الحجوزات مجمّع حسب العميل |
| POST | `/api/accounts/income` | إضافة دخل يدوي |
| GET | `/api/accounts/income/manual` | قائمة الدخل اليدوي للفترة |
| GET | `/api/accounts/expenses` | قائمة المصروفات للفترة |
| POST | `/api/accounts/expenses` | إضافة مصروف |
| GET | `/api/accounts/summary` | ملخص (دخل + مصروفات + رصيد) للفترة |

---

*آخر تحديث: نظام الحسابات مع دعم الفترات (شهر / أيام / شهور).*
