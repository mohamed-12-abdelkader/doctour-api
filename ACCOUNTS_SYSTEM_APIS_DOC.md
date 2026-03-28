# توثيق واجهات برمجة تطبيقات نظام الحسابات

**Base URL:** `http://localhost:8000`  
**المسار الأساسي:** `/api/accounts`

---

## الصلاحيات والترويسات

كل مسارات الحسابات تتطلب:
- `Authorization: Bearer <token>`
- صلاحية `manage_accounts`

بدون ذلك يتم الرد بـ `401` أو `403`.

---

## اختيار الفترة (تطبق على معظم الـ GET الخاصة بالعرض)

تدعم واجهات العرض (GET) أحد الخيارات التالية:

1. شهر واحد:
   - `month=YYYY-MM` (اختياري)
2. مجموعة أيام:
   - `startDate=YYYY-MM-DD` و `endDate=YYYY-MM-DD` (اختياري)
3. مجموعة شهور:
   - `startMonth=YYYY-MM` و `endMonth=YYYY-MM` (اختياري)

إذا لم تُمرّر أي فترة → يُستخدم الشهر الحالي.

في الرد يرجع الحقل `period` بوصف الفترة.

---

## 1) الوصول للوحة الحسابات

### GET ` /api/accounts`
- **Headers:** `Authorization: Bearer <token>`
- **Auth:** `manage_accounts`
- **Response (200):**
```json
{ "message": "Access granted to Accounts dashboard" }
```

---

## 2) دخل الحجوزات (تجميع باسم العميل)

### GET `/api/accounts/income/bookings`
- **Query (اختياري):** `month` أو `startDate&endDate` أو `startMonth&endMonth`
- **Auth:** `manage_accounts`
- **يتم احتساب الحجوزات المؤكدة وغير الملغاة/المرفوضة** (`appointmentDate` داخل الفترة و `status` not in `cancelled/rejected`)

**Response (200):**
```json
{
  "period": "2026-02",
  "byCustomer": [
    { "customerName": "أحمد علي", "amount": 350.5 }
  ],
  "total": 550.5
}
```

---

## 3) إضافة دخل يدوي

### POST `/api/accounts/income`
- **Body (JSON):**
```json
{
  "description": "اسم العملية أو وصف الدخل",
  "amount": 1000,
  "entryDate": "YYYY-MM-DD"
}
```
- `entryDate` اختياري (افتراضي: اليوم)

**Response (201):**
```json
{
  "message": "Income entry added successfully.",
  "entry": { "...": "..." }
}
```

---

## 4) قائمة الدخل اليدوي

### GET `/api/accounts/income/manual`
- **Query (اختياري):** نفس خيارات الفترة (`month` أو `startDate&endDate` أو `startMonth&endMonth`)
- **Auth:** `manage_accounts`

**Response (200):**
```json
{
  "period": "2026-02",
  "entries": [ { "...": "..." } ],
  "total": 1500
}
```

---

## 5) المصروفات (Expenses) مع التصنيف

## 5.1) إضافة مصروف

### POST `/api/accounts/expenses`
- **Auth:** `manage_accounts`
- **Body (JSON):**
```json
{
  "description": "وصف المصروف",
  "amount": 200,
  "date": "YYYY-MM-DD",
  "category_id": 1,
  "subcategory_id": 10,
  "notes": "ملاحظة اختيارية"
}
```
- `date` اختياري لكن مستحسن استخدامه (بديل قديم اسمه `expenseDate` مازال مدعوم).
- `category_id` و `subcategory_id` **مطلوبان** في النظام الجديد.

**Response (201):**
```json
{
  "message": "Expense added successfully.",
  "expense": { "...": "..." }
}
```

---

## 5.2) قائمة المصروفات

### GET `/api/accounts/expenses`
- **Query (اختياري):** نفس خيارات الفترة
- **Auth:** `manage_accounts`

**Response (200):**
```json
{
  "period": "2026-01",
  "expenses": [
    {
      "id": 1,
      "description": "أدوات طبية",
      "amount": "500.00",
      "expenseDate": "2026-01-10",
      "category": { "id": 1, "name": "..." },
      "subcategory": { "id": 10, "name": "...", "categoryId": 1 }
    }
  ],
  "total": 500
}
```

---

## 6) تصنيفات المصروفات (Categories)

### GET `/api/accounts/expense-categories`
- **Auth:** `manage_accounts`
**Response (200):**
```json
{ "categories": [ { "id": 1, "name": "..." } ] }
```

### POST `/api/accounts/expense-categories`
- **Body:**
```json
{ "name": "مصروفات أخرى (Other Expenses)" }
```
- **Response (201):**
```json
{ "message": "Category created successfully.", "category": { "id": 1, "name": "..." } }
```

### PUT `/api/accounts/expense-categories/:id`
- **Body:**
```json
{ "name": "اسم جديد" }
```

### DELETE `/api/accounts/expense-categories/:id`

---

## 7) تصنيفات المصروفات الفرعية (Subcategories)

### GET `/api/accounts/expense-subcategories?category_id=...`
- **Auth:** `manage_accounts`
**Response (200):**
```json
{ "subcategories": [ { "id": 10, "name": "...", "categoryId": 1 } ] }
```

### POST `/api/accounts/expense-subcategories`
- **Body (JSON):**
```json
{
  "name": "فيلر",
  "category_id": 1
}
```

### PUT `/api/accounts/expense-subcategories/:id`
- **Body (JSON):**
```json
{
  "name": "اسم جديد",
  "category_id": 1
}
```

### DELETE `/api/accounts/expense-subcategories/:id`

---

## 8) ملخص الحسابات

### GET `/api/accounts/summary`
- **Query (اختياري):** نفس خيارات الفترة
- **Auth:** `manage_accounts`

**Response (200):**
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

