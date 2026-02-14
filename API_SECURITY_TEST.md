# 🧪 اختبار حماية API الحجوزات من العيادة

## السيناريوهات المختلفة:

### ❌ السيناريو 1: محاولة الوصول بدون Token
```bash
POST http://localhost:8000/api/bookings/clinic
Content-Type: application/json

{
  "name": "أحمد محمد",
  "phone": "01012345678",
  "date": "2026-02-01T10:00:00.000Z",
  "amountPaid": 350.00
}
```

**النتيجة المتوقعة: 401 Unauthorized**
```json
{
  "message": "Not authorized, no token"
}
```

---

### ❌ السيناريو 2: محاولة الوصول بـ Token لكن بدون صلاحية
```bash
POST http://localhost:8000/api/bookings/clinic
Authorization: Bearer <token_without_permission>
Content-Type: application/json

{
  "name": "أحمد محمد",
  "phone": "01012345678",
  "date": "2026-02-01T10:00:00.000Z",
  "amountPaid": 350.00
}
```

**النتيجة المتوقعة: 403 Forbidden**
```json
{
  "message": "Access denied. You need manage_daily_bookings permission."
}
```

---

### ✅ السيناريو 3: الوصول الصحيح (Admin أو Staff بصلاحية)
```bash
POST http://localhost:8000/api/bookings/clinic
Authorization: Bearer <valid_token_with_permission>
Content-Type: application/json

{
  "name": "أحمد محمد",
  "phone": "01012345678",
  "date": "2026-02-01T10:00:00.000Z",
  "amountPaid": 350.00
}
```

**النتيجة المتوقعة: 201 Created**
```json
{
  "message": "Clinic booking created successfully.",
  "booking": {
    "id": 1,
    "customerName": "أحمد محمد",
    "customerPhone": "01012345678",
    "appointmentDate": "2026-02-01T10:00:00.000Z",
    "bookingType": "clinic",
    "amountPaid": "350.00",
    "status": "confirmed",
    "createdAt": "2026-01-31T12:09:00.000Z",
    "updatedAt": "2026-01-31T12:09:00.000Z"
  }
}
```

---

## 🔍 كيفية التحقق من الصلاحيات

### 1. تسجيل دخول كـ Admin
```bash
POST http://localhost:8000/api/auth/login
Content-Type: application/json

{
  "email": "admin@example.com",
  "password": "your_password"
}
```

**Response:**
```json
{
  "_id": 1,
  "name": "Super Admin",
  "email": "admin@example.com",
  "role": "admin",
  "permissions": [
    {"name": "manage_online_bookings"},
    {"name": "manage_daily_bookings"},
    {"name": "manage_accounts"}
  ],
  "token": "eyJhbGciOiJIUzI1..."
}
```

✅ Admin لديه صلاحية `manage_daily_bookings` - يمكنه إنشاء حجوزات العيادة

---

### 2. تسجيل دخول كـ Staff بصلاحية
```bash
POST http://localhost:8000/api/auth/login
Content-Type: application/json

{
  "email": "staff@example.com",
  "password": "password123"
}
```

**Response:**
```json
{
  "_id": 2,
  "name": "Dr. Ahmed",
  "email": "staff@example.com",
  "role": "staff",
  "permissions": [
    {"name": "manage_daily_bookings"}
  ],
  "token": "eyJhbGciOiJIUzI1..."
}
```

✅ Staff لديه صلاحية `manage_daily_bookings` - يمكنه إنشاء حجوزات العيادة

---

### 3. تسجيل دخول كـ Staff بدون صلاحية
```bash
POST http://localhost:8000/api/auth/login
Content-Type: application/json

{
  "email": "staff2@example.com",
  "password": "password123"
}
```

**Response:**
```json
{
  "_id": 3,
  "name": "Staff Member",
  "email": "staff2@example.com",
  "role": "staff",
  "permissions": [
    {"name": "manage_online_bookings"}
  ],
  "token": "eyJhbGciOiJIUzI1..."
}
```

❌ Staff ليس لديه صلاحية `manage_daily_bookings` - **لا يمكنه** إنشاء حجوزات العيادة

---

## 📊 ملخص الصلاحيات لكل API

| API Endpoint | الصلاحية المطلوبة | من يستطيع الوصول |
|--------------|-------------------|------------------|
| `POST /api/bookings/clinic` | `manage_daily_bookings` | Admin + Staff بالصلاحية |
| `GET /api/bookings/all` | `manage_online_bookings` OR `manage_daily_bookings` | Admin + Staff بأي من الصلاحيتين |
| `PUT /api/bookings/:id` | `manage_daily_bookings` | Admin + Staff بالصلاحية |
| `DELETE /api/bookings/:id` | `manage_daily_bookings` | Admin + Staff بالصلاحية |
| `GET /api/bookings/online` | `manage_online_bookings` | Admin + Staff بالصلاحية |
| `PATCH /api/bookings/online/:id/status` | `manage_online_bookings` | Admin + Staff بالصلاحية |
| `POST /api/bookings/online` | **لا يتطلب صلاحية** | الجميع (Public) |

---

## ✅ الخلاصة

الـ API `/api/bookings/clinic` **محمي بالكامل** ويعمل فقط مع:
1. ✅ Admin (لديه كل الصلاحيات)
2. ✅ Staff الذي لديه صلاحية `manage_daily_bookings`

أي محاولة للوصول بدون Token أو بدون الصلاحية المناسبة سيتم رفضها تلقائياً.
