# 🧪 اختبار APIs إدارة الحجوزات

## المتطلبات
1. تسجيل دخول كـ Admin أو Staff للحصول على Token
2. التأكد من وجود الصلاحيات المناسبة

---

## 1️⃣ تسجيل الدخول والحصول على Token

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
  "permissions": ["manage_online_bookings", "manage_daily_bookings", "manage_accounts"],
  "token": "eyJhbGciOiJIUzI1..."
}
```

احفظ الـ `token` لاستخدامه في الطلبات التالية.

---

## 2️⃣ إنشاء حجز من العيادة

```bash
POST http://localhost:8000/api/bookings/clinic
Authorization: Bearer YOUR_TOKEN_HERE
Content-Type: application/json

{
  "name": "أحمد محمد",
  "phone": "01012345678",
  "date": "2026-02-01T10:00:00.000Z",
  "amountPaid": 350.00
}
```

**Expected Response (201 Created):**
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
    "createdAt": "2026-01-31T09:26:13.000Z",
    "updatedAt": "2026-01-31T09:26:13.000Z"
  }
}
```

---

## 3️⃣ إنشاء حجز أونلاين (عام - بدون Token)

```bash
POST http://localhost:8000/api/bookings/online
Content-Type: application/json

{
  "name": "سارة علي",
  "phone": "01098765432",
  "date": "2026-02-02T14:00:00.000Z"
}
```

**Expected Response (201 Created):**
```json
{
  "message": "Booking request submitted successfully.",
  "booking": {
    "id": 2,
    "customerName": "سارة علي",
    "customerPhone": "01098765432",
    "appointmentDate": "2026-02-02T14:00:00.000Z",
    "bookingType": "online",
    "amountPaid": "0.00",
    "status": "pending",
    "createdAt": "2026-01-31T09:27:00.000Z",
    "updatedAt": "2026-01-31T09:27:00.000Z"
  }
}
```

---

## 4️⃣ تأكيد حجز أونلاين

```bash
PATCH http://localhost:8000/api/bookings/online/2/status
Authorization: Bearer YOUR_TOKEN_HERE
Content-Type: application/json

{
  "status": "confirmed"
}
```

**Expected Response (200 OK):**
```json
{
  "message": "Booking confirmed successfully.",
  "booking": {
    "id": 2,
    "customerName": "سارة علي",
    "customerPhone": "01098765432",
    "appointmentDate": "2026-02-02T14:00:00.000Z",
    "bookingType": "online",
    "amountPaid": "0.00",
    "status": "confirmed",
    "createdAt": "2026-01-31T09:27:00.000Z",
    "updatedAt": "2026-01-31T09:28:00.000Z"
  }
}
```

---

## 5️⃣ عرض جميع الحجوزات (موحد)

### أ) جميع الحجوزات
```bash
GET http://localhost:8000/api/bookings/all
Authorization: Bearer YOUR_TOKEN_HERE
```

**Expected Response (200 OK):**
```json
[
  {
    "id": 1,
    "customerName": "أحمد محمد",
    "customerPhone": "01012345678",
    "appointmentDate": "2026-02-01T10:00:00.000Z",
    "bookingType": "clinic",
    "amountPaid": "350.00",
    "status": "confirmed",
    "createdAt": "2026-01-31T09:26:13.000Z",
    "updatedAt": "2026-01-31T09:26:13.000Z"
  },
  {
    "id": 2,
    "customerName": "سارة علي",
    "customerPhone": "01098765432",
    "appointmentDate": "2026-02-02T14:00:00.000Z",
    "bookingType": "online",
    "amountPaid": "0.00",
    "status": "confirmed",
    "createdAt": "2026-01-31T09:27:00.000Z",
    "updatedAt": "2026-01-31T09:28:00.000Z"
  }
]
```

### ب) حجوزات العيادة فقط
```bash
GET http://localhost:8000/api/bookings/all?type=clinic
Authorization: Bearer YOUR_TOKEN_HERE
```

### ج) حجوزات الأونلاين المؤكدة فقط
```bash
GET http://localhost:8000/api/bookings/all?type=online&status=confirmed
Authorization: Bearer YOUR_TOKEN_HERE
```

### د) حجوزات يوم معين
```bash
GET http://localhost:8000/api/bookings/all?date=2026-02-01
Authorization: Bearer YOUR_TOKEN_HERE
```

---

## 6️⃣ عرض الحجوزات الأونلاين فقط

```bash
GET http://localhost:8000/api/bookings/online
Authorization: Bearer YOUR_TOKEN_HERE
```

### مع فلترة حسب الحالة
```bash
GET http://localhost:8000/api/bookings/online?status=pending
Authorization: Bearer YOUR_TOKEN_HERE
```

---

## 7️⃣ تعديل حجز

```bash
PUT http://localhost:8000/api/bookings/1
Authorization: Bearer YOUR_TOKEN_HERE
Content-Type: application/json

{
  "name": "أحمد محمد علي",
  "phone": "01012345678",
  "amountPaid": 400.00
}
```

**Expected Response (200 OK):**
```json
{
  "message": "Booking updated successfully.",
  "booking": {
    "id": 1,
    "customerName": "أحمد محمد علي",
    "customerPhone": "01012345678",
    "appointmentDate": "2026-02-01T10:00:00.000Z",
    "bookingType": "clinic",
    "amountPaid": "400.00",
    "status": "confirmed",
    "createdAt": "2026-01-31T09:26:13.000Z",
    "updatedAt": "2026-01-31T09:30:00.000Z"
  }
}
```

---

## 8️⃣ إلغاء حجز

```bash
DELETE http://localhost:8000/api/bookings/1
Authorization: Bearer YOUR_TOKEN_HERE
```

**Expected Response (200 OK):**
```json
{
  "message": "Booking cancelled successfully.",
  "booking": {
    "id": 1,
    "customerName": "أحمد محمد علي",
    "customerPhone": "01012345678",
    "appointmentDate": "2026-02-01T10:00:00.000Z",
    "bookingType": "clinic",
    "amountPaid": "400.00",
    "status": "cancelled",
    "createdAt": "2026-01-31T09:26:13.000Z",
    "updatedAt": "2026-01-31T09:31:00.000Z"
  }
}
```

---

## 📝 ملاحظات مهمة

1. **استبدل `YOUR_TOKEN_HERE`** بالـ Token الذي حصلت عليه من تسجيل الدخول
2. **التواريخ** يجب أن تكون بصيغة ISO 8601: `YYYY-MM-DDTHH:mm:ss.sssZ`
3. **الصلاحيات المطلوبة**:
   - `manage_daily_bookings`: لإنشاء/تعديل/إلغاء حجوزات العيادة
   - `manage_online_bookings`: لإدارة الحجوزات الأونلاين
   - أي من الصلاحيتين: لعرض جميع الحجوزات

---

## 🔍 اختبار باستخدام Postman أو Thunder Client

1. قم بإنشاء Collection جديدة
2. أضف متغير `baseUrl` = `http://localhost:8000`
3. أضف متغير `token` واحفظ فيه الـ Token بعد تسجيل الدخول
4. استخدم `{{baseUrl}}` و `{{token}}` في الطلبات

---

## ✅ سيناريو اختبار كامل

1. ✅ تسجيل دخول كـ Admin
2. ✅ إنشاء حجز من العيادة
3. ✅ إنشاء حجز أونلاين (بدون تسجيل دخول)
4. ✅ تأكيد الحجز الأونلاين
5. ✅ عرض جميع الحجوزات (يجب أن ترى الحجزين)
6. ✅ فلترة الحجوزات حسب النوع
7. ✅ تعديل حجز
8. ✅ إلغاء حجز
9. ✅ التحقق من أن الحجز الملغي لا يظهر في القائمة الموحدة (إلا إذا فلترت بـ status=cancelled)
