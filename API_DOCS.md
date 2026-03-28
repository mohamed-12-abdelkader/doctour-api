# 📚 Doctor System API Documentation

Base URL: `http://localhost:8000`

## 🔐 Authentication

### 1. Login
Authenticate as Admin or Staff to receive an access token.

- **Endpoint**: `POST /api/auth/login`
- **Access**: Public
- **Body**:
  ```json
  {
    "email": "admin@example.com",
    "password": "your_password"
  }
  ```
- **Response (200 OK)**:
  ```json
  {
    "_id": 1,
    "name": "Super Admin",
    "email": "admin@example.com",
    "role": "admin",
    "permissions": ["manage_online_bookings", "manage_accounts"],
    "token": "eyJhbGciOiJIUzI1..."
  }
  ```

---

## 👥 Staff Management (Admin Only)

**Headers Required**: 
`Authorization: Bearer <your_token>`

### 2. Create Staff Account
Create a new staff member and assign permissions.

- **Endpoint**: `POST /api/admin/staff`
- **Access**: Admin
- **Body**:
  ```json
  {
    "name": "Dr. Ahmed",
    "email": "ahmed@example.com",
    "password": "password123",
    "permissions": [
      "manage_online_bookings",
      "manage_daily_bookings"
    ]
  }
  ```
- **Response (201 Created)**: Returns the created user object.

### 3. Get All Staff
Retrieve a list of all staff members.

- **Endpoint**: `GET /api/admin/staff`
- **Access**: Admin
- **Response (200 OK)**:
  ```json
  [
    {
      "id": 2,
      "name": "Dr. Ahmed",
      "email": "ahmed@example.com",
      "role": "staff",
      "isActive": true,
      "permissions": [
        { "name": "manage_online_bookings" }
      ]
    }
  ]
  ```

### 4. Get Staff by ID
- **Endpoint**: `GET /api/admin/staff/:id`
- **Access**: Admin

### 5. Update Staff Details
Update a staff member's info or permissions.

- **Endpoint**: `PUT /api/admin/staff/:id`
- **Access**: Admin
- **Body** (all fields optional):
  ```json
  {
    "name": "Dr. Ahmed Ali",
    "permissions": ["manage_accounts"] 
    // note: sending permissions array overwrites old permissions
  }
  ```

### 6. Activate / Deactivate Account
Enable or disable a staff account without deleting it.

- **Endpoint**: `PATCH /api/admin/staff/:id/status`
- **Access**: Admin
- **Body**:
  ```json
  {
    "isActive": false 
    // true to activate, false to deactivate
  }
  ```

### 7. Delete Staff
Permanently remove a staff account.

- **Endpoint**: `DELETE /api/admin/staff/:id`
- **Access**: Admin

---

## 📅 Booking API

### 1. Create Online Booking (Public)
حجز موعد أونلاين — بدون تسجيل دخول. **لا يُخزَّن تاريخ**؛ مطلوب: الاسم، رقم التليفون، العمر (اختياري)، ونوع الكشف (حجز أو استشارة).

- **Endpoint**: `POST /api/bookings/online`
- **Access**: Public (لا يتطلب توكن)
- **Body**:
  ```json
  {
    "name": "أحمد محمد",
    "phone": "01012345678",
    "age": 35,
    "visitType": "حجز"
  }
  ```
  | الحقل | مطلوب | الوصف |
  |-------|--------|--------|
  | `name` | نعم | اسم العميل |
  | `phone` | نعم | رقم التليفون |
  | `age` | لا | عمر العميل (رقم) |
  | `visitType` | لا | نوع الكشف: **حجز** أو **استشارة** (أو `checkup` / `consultation`). الافتراضي: حجز |
- **Response (201 Created)**:
  ```json
  {
    "message": "تم تقديم طلب الحجز بنجاح. / Booking request submitted successfully.",
    "booking": {
      "id": 1,
      "customerName": "أحمد محمد",
      "customerPhone": "01012345678",
      "age": 35,
      "visitType": "checkup",
      "appointmentDate": null,
      "bookingType": "online",
      "status": "pending",
      ...
    }
  }
  ```

### 2. Create Clinic Booking
Create a walk-in clinic booking with payment tracking.

- **Endpoint**: `POST /api/bookings/clinic`
- **Access**: Protected (Requires `manage_daily_bookings` permission)
- **Headers**: `Authorization: Bearer <token>`
- **Body**:
  ```json
  {
    "name": "Ahmed Ali",
    "phone": "01098765432",
    "date": "2023-12-25T14:30:00.000Z",
    "amountPaid": 250.50
  }
  ```
- **Response (201 Created)**:
  ```json
  {
    "message": "Clinic booking created successfully.",
    "booking": {
      "id": 2,
      "customerName": "Ahmed Ali",
      "customerPhone": "01098765432",
      "appointmentDate": "2023-12-25T14:30:00.000Z",
      "bookingType": "clinic",
      "amountPaid": "250.50",
      "status": "confirmed",
      "createdAt": "2023-12-20T11:00:00.000Z",
      "updatedAt": "2023-12-20T11:00:00.000Z"
    }
  }
  ```

### 3. Get Online Bookings
Retrieve all online bookings with optional filters.

- **Endpoint**: `GET /api/bookings/online`
- **Access**: Protected (Requires `manage_online_bookings` permission)
- **Headers**: `Authorization: Bearer <token>`
- **Query Parameters**:
  - `status` (optional): Filter by status (`pending`, `confirmed`, `cancelled`, `rejected`)
  - `date` (optional): Filter by specific date (YYYY-MM-DD)
- **Example**: `GET /api/bookings/online?status=pending&date=2023-12-25`
- **Response (200 OK)**:
  ```json
  [
    {
      "id": 1,
      "customerName": "John Doe",
      "customerPhone": "01012345678",
      "appointmentDate": "2023-12-25T14:30:00.000Z",
      "bookingType": "online",
      "amountPaid": "0.00",
      "status": "pending",
      "createdAt": "2023-12-20T10:00:00.000Z",
      "updatedAt": "2023-12-20T10:00:00.000Z"
    }
  ]
  ```

### 4. Get All Bookings (Unified View)
Retrieve all bookings (confirmed online bookings + all clinic bookings) sorted by date.

- **Endpoint**: `GET /api/bookings/all`
- **Access**: Protected (Requires `manage_online_bookings` OR `manage_daily_bookings` permission)
- **Headers**: `Authorization: Bearer <token>`
- **Query Parameters**:
  - `type` (optional): Filter by booking type (`online` or `clinic`)
  - `status` (optional): Filter by status (`pending`, `confirmed`, `cancelled`, `rejected`)
  - `date` (optional): Filter by specific date (YYYY-MM-DD)
- **Examples**:
  - Get all bookings: `GET /api/bookings/all`
  - Get only clinic bookings: `GET /api/bookings/all?type=clinic`
  - Get confirmed online bookings: `GET /api/bookings/all?type=online&status=confirmed`
  - Get bookings for specific date: `GET /api/bookings/all?date=2023-12-25`
- **Response (200 OK)**:
  ```json
  [
    {
      "id": 1,
      "customerName": "John Doe",
      "customerPhone": "01012345678",
      "appointmentDate": "2023-12-25T09:00:00.000Z",
      "bookingType": "online",
      "amountPaid": "0.00",
      "status": "confirmed",
      "createdAt": "2023-12-20T10:00:00.000Z",
      "updatedAt": "2023-12-20T10:00:00.000Z"
    },
    {
      "id": 2,
      "customerName": "Ahmed Ali",
      "customerPhone": "01098765432",
      "appointmentDate": "2023-12-25T14:30:00.000Z",
      "bookingType": "clinic",
      "amountPaid": "250.50",
      "status": "confirmed",
      "createdAt": "2023-12-20T11:00:00.000Z",
      "updatedAt": "2023-12-20T11:00:00.000Z"
    }
  ]
  ```

### 5. Update Booking Status
Confirm, cancel, or reject a booking.

- **Endpoint**: `PATCH /api/bookings/online/:id/status`
- **Access**: Protected (Requires `manage_online_bookings` permission)
- **Headers**: `Authorization: Bearer <token>`
- **Body**:
  - For **`confirmed`**: you **must** send `date` (`YYYY-MM-DD`) and `time` or `timeSlot` (`HH:mm`) chosen from `GET /api/bookings/available-slots?date=...` → `available_slots`. If the day has no working hours or no free slots, the API returns **400** with an Arabic error message.
  - For `cancelled`, `rejected`, `pending`: only `status` is required.
  ```json
  {
    "status": "confirmed",
    "date": "2026-03-12",
    "time": "13:10"
  }
  ```
  Options: `confirmed`, `cancelled`, `rejected`, `pending`
- **Response (200 OK)**:
  ```json
  {
    "message": "Booking confirmed successfully.",
    "booking": {
      "id": 1,
      "customerName": "John Doe",
      "customerPhone": "01012345678",
      "appointmentDate": "2023-12-25T14:30:00.000Z",
      "bookingType": "online",
      "amountPaid": "0.00",
      "status": "confirmed",
      "createdAt": "2023-12-20T10:00:00.000Z",
      "updatedAt": "2023-12-20T12:00:00.000Z"
    }
  }
  ```

### 6. Update Booking Details
Update booking information (name, phone, date, amount paid).

- **Endpoint**: `PUT /api/bookings/:id`
- **Access**: Protected (Requires `manage_daily_bookings` permission)
- **Headers**: `Authorization: Bearer <token>`
- **Body** (all fields optional):
  ```json
  {
    "name": "Ahmed Ali Updated",
    "phone": "01098765432",
    "date": "2023-12-26T10:00:00.000Z",
    "amountPaid": 300.00
  }
  ```
- **Response (200 OK)**:
  ```json
  {
    "message": "Booking updated successfully.",
    "booking": {
      "id": 2,
      "customerName": "Ahmed Ali Updated",
      "customerPhone": "01098765432",
      "appointmentDate": "2023-12-26T10:00:00.000Z",
      "bookingType": "clinic",
      "amountPaid": "300.00",
      "status": "confirmed",
      "createdAt": "2023-12-20T11:00:00.000Z",
      "updatedAt": "2023-12-20T13:00:00.000Z"
    }
  }
  ```

### 7. Update Examination Status (Admin Only)
تحديد حالة الكشف: **في الانتظار** (`waiting`) أو **تم الكشف** (`done`). الافتراضي: في الانتظار. **الأدمن فقط** يمكنه تغيير هذه الحالة.

- **Endpoint**: `PATCH /api/bookings/:id/examination-status`
- **Access**: **Admin only**
- **Headers**: `Authorization: Bearer <token>`
- **Body**:
  ```json
  {
    "examinationStatus": "done"
  }
  ```
  القيم المسموحة: `"waiting"` (في الانتظار) أو `"done"` (تم الكشف).
- **Response (200 OK)**:
  ```json
  {
    "message": "Examination marked as done (تم الكشف).",
    "booking": {
      "id": 2,
      "customerName": "Ahmed Ali",
      "examinationStatus": "done",
      ...
    }
  }
  ```

### 8. Cancel Booking
Cancel a booking (sets status to cancelled).

- **Endpoint**: `DELETE /api/bookings/:id`
- **Access**: Protected (Requires `manage_daily_bookings` permission)
- **Headers**: `Authorization: Bearer <token>`
- **Response (200 OK)**:
  ```json
  {
    "message": "Booking cancelled successfully.",
    "booking": {
      "id": 2,
      "customerName": "Ahmed Ali",
      "customerPhone": "01098765432",
      "appointmentDate": "2023-12-25T14:30:00.000Z",
      "bookingType": "clinic",
      "amountPaid": "250.50",
      "status": "cancelled",
      "createdAt": "2023-12-20T11:00:00.000Z",
      "updatedAt": "2023-12-20T14:00:00.000Z"
    }
  }
  ```

---

## 📋 Patient Report (تقرير المريض) — Admin Only

الأدمن فقط يمكنه إضافة/تعديل/قراءة تقرير المريض لكل زيارة: الحالة المرضية، ملاحظات، والأدوية مع الجرعات. التقرير يظهر مع تفاصيل الزيارة عند طلب `GET /api/bookings/:id/history`.

### 1. Create Report
إضافة تقرير لزيارة (حجز).

- **Endpoint**: `POST /api/bookings/:id/report`
- **Access**: Admin only
- **Headers**: `Authorization: Bearer <token>`
- **Body**:
  ```json
  {
    "medicalCondition": "وصف الحالة المرضية والتشخيص",
    "notes": "ملاحظات إضافية",
    "medications": [
      { "medicationName": "اسم الدواء", "dosage": "الجرعة", "frequency": "مرتين يومياً", "notes": "ملاحظة" }
    ]
  }
  ```
- **Response (201 Created)**: `{ "message": "Report created successfully.", "report": { ... } }`

### 2. Get Report
جلب تقرير زيارة مع الأدوية.

- **Endpoint**: `GET /api/bookings/:id/report`
- **Access**: Admin only
- **Response (200 OK)**: `{ "report": { "id", "bookingId", "medicalCondition", "notes", "medications": [...] } }`

### 3. Update Report
تعديل تقرير زيارة (إرسال `medications` جديد يستبدل القائمة بالكامل).

- **Endpoint**: `PUT /api/bookings/:id/report`
- **Access**: Admin only
- **Body**: نفس حقول Create (كلها اختيارية للتعديل الجزئي؛ `medications` يستبدل القائمة إن وُجد).

التقرير والأدوية تظهر تلقائياً داخل كل زيارة عند استدعاء **Get booking with history**: `GET /api/bookings/:id/history` (الحقل `PatientReport` مع `medications` داخل `currentBooking` و `pastBookings`).

---

## 💰 Accounts (إدارة الحسابات) — Admin أو صلاحية manage_accounts

الأدمن والموظف الذي لديه صلاحية **manage_accounts** يمكنهما الوصول لجميع واجهات الحسابات: دخل الحجوزات، الدخل اليدوي، المصروفات، والملخص.

**Headers**: `Authorization: Bearer <token>`

### 1. دخل الحجوزات لشهر (تجميع باسم العميل + التوتال)
- **Endpoint**: `GET /api/accounts/income/bookings?month=YYYY-MM`
- **Query**: `month` اختياري (مثال: `2026-01`). إن لم يُمرَّر يُستخدم الشهر الحالي.
- **Response (200 OK)**:
  ```json
  {
    "month": "2026-01",
    "byCustomer": [
      { "customerName": "أحمد علي", "amount": 500 },
      { "customerName": "سارة محمد", "amount": 300 }
    ],
    "total": 800
  }
  ```

### 2. إضافة دخل يدوي (اسم العملية + المبلغ)
- **Endpoint**: `POST /api/accounts/income`
- **Body**:
  ```json
  {
    "description": "اسم العملية أو وصف الدخل",
    "amount": 1000,
    "entryDate": "2026-01-31"
  }
  ```
  `entryDate` اختياري (افتراضي: اليوم).
- **Response (201 Created)**: `{ "message": "Income entry added successfully.", "entry": { ... } }`

### 3. قائمة الدخل اليدوي لشهر
- **Endpoint**: `GET /api/accounts/income/manual?month=YYYY-MM`
- **Response (200 OK)**: `{ "month": "2026-01", "entries": [ ... ], "total": 1500 }`

### 4. إضافة مصروف (اسم العملية + المبلغ)
- **Endpoint**: `POST /api/accounts/expenses`
- **Body**:
  ```json
  {
    "description": "اسم العملية أو وصف المصروف",
    "amount": 200,
    "date": "2026-01-31",
    "category_id": 1,
    "subcategory_id": 10,
    "notes": "ملاحظة اختيارية"
  }
  ```
  `date` و `notes` اختياريان، و`category_id` و`subcategory_id` مطلوبان في النظام الجديد.
- **Response (201 Created)**: `{ "message": "Expense added successfully.", "expense": { ... } }`

### تصنيفات المصروفات (Categories & Subcategories)
- **GET** ` /api/accounts/expense-categories` (list)
- **POST** `/api/accounts/expense-categories` (create)
- **PUT** `/api/accounts/expense-categories/:id` (update)
- **DELETE** `/api/accounts/expense-categories/:id` (delete)

- **GET** `/api/accounts/expense-subcategories?category_id=...` (list)
- **POST** `/api/accounts/expense-subcategories` (create)
- **PUT** `/api/accounts/expense-subcategories/:id` (update)
- **DELETE** `/api/accounts/expense-subcategories/:id` (delete)

### 5. قائمة المصروفات لشهر
- **Endpoint**: `GET /api/accounts/expenses?month=YYYY-MM`
- **Response (200 OK)**: `{ "month": "2026-01", "expenses": [ ... ], "total": 500 }`

### 6. ملخص الحسابات لشهر
- **Endpoint**: `GET /api/accounts/summary?month=YYYY-MM`
- **Response (200 OK)**:
  ```json
  {
    "month": "2026-01",
    "incomeFromBookings": 3000,
    "manualIncome": 500,
    "totalIncome": 3500,
    "totalExpenses": 800,
    "balance": 2700
  }
  ```

---

## 📊 Booking Model Schema

| Field | Type | Description |
| :--- | :--- | :--- |
| `id` | INTEGER | Primary key, auto-increment |
| `customerName` | STRING | Customer's full name |
| `customerPhone` | STRING | Customer's phone number |
| `appointmentDate` | DATE | Appointment date and time |
| `bookingType` | ENUM | Type of booking: `online` or `clinic` |
| `amountPaid` | DECIMAL(10,2) | Amount paid (for clinic bookings) |
| `status` | ENUM | Booking status: `pending`, `confirmed`, `cancelled`, `rejected` |
| `examinationStatus` | ENUM | حالة الكشف: `waiting` (في الانتظار) أو `done` (تم الكشف). يحدّثها الأدمن فقط. |
| `createdAt` | DATE | Timestamp when booking was created |
| `updatedAt` | DATE | Timestamp when booking was last updated |

---
