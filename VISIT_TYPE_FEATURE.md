# 🆕 Visit Type Feature - نوع الزيارة

## Overview
تم إضافة ميزة جديدة لتحديد نوع الزيارة عند إنشاء حجز من العيادة (Clinic Booking).

## Visit Types - أنواع الزيارات

| Value | Arabic | Description |
|-------|--------|-------------|
| `checkup` | كشف | زيارة كشف جديدة |
| `followup` | إعادة | زيارة متابعة/إعادة |

## Usage Examples

### 1. Create Clinic Booking with Visit Type

**Request:**
```http
POST /api/bookings/clinic
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "أحمد علي",
  "phone": "01012345678",
  "date": "2026-02-01T10:00:00.000Z",
  "amountPaid": 300,
  "visitType": "checkup"
}
```

**Response:**
```json
{
  "message": "Clinic booking created successfully.",
  "booking": {
    "id": 1,
    "customerName": "أحمد علي",
    "customerPhone": "01012345678",
    "appointmentDate": "2026-02-01T10:00:00.000Z",
    "bookingType": "clinic",
    "amountPaid": "300.00",
    "visitType": "checkup",
    "status": "confirmed",
    "createdAt": "2026-01-31T12:00:00.000Z",
    "updatedAt": "2026-01-31T12:00:00.000Z"
  }
}
```

### 2. Filter Bookings by Visit Type

**Get all checkup visits (كشف):**
```http
GET /api/bookings/all?visitType=checkup
Authorization: Bearer <token>
```

**Get all followup visits (إعادة):**
```http
GET /api/bookings/all?visitType=followup
Authorization: Bearer <token>
```

**Get followup visits for specific date:**
```http
GET /api/bookings/all?visitType=followup&date=2026-02-01
Authorization: Bearer <token>
```

### 3. Update Visit Type

**Request:**
```http
PUT /api/bookings/1
Authorization: Bearer <token>
Content-Type: application/json

{
  "visitType": "followup"
}
```

## Default Behavior

- إذا لم يتم تحديد `visitType` عند إنشاء حجز جديد، سيتم تعيينه تلقائياً إلى `checkup` (كشف)
- الحجوزات القديمة (قبل هذا التحديث) ستكون `visitType` لها `checkup` افتراضياً

## Database Migration

لتطبيق التغييرات على قاعدة البيانات، قم بتشغيل:

```sql
ALTER TABLE Bookings 
ADD COLUMN visitType ENUM('checkup', 'followup') 
NOT NULL DEFAULT 'checkup' 
COMMENT 'checkup = كشف, followup = إعادة'
AFTER amountPaid;
```

أو استخدم ملف الـ migration:
```bash
# إذا كنت تستخدم MySQL
mysql -u username -p database_name < migrations/add_visitType_to_bookings.sql
```

## Notes

- ✅ هذه الميزة متاحة فقط للحجوزات من العيادة (Clinic Bookings)
- ✅ الحجوزات الأونلاين (Online Bookings) ستكون دائماً `checkup` افتراضياً
- ✅ يمكن تحديث `visitType` في أي وقت باستخدام `PUT /api/bookings/:id`
- ✅ يمكن الفلترة حسب `visitType` في `GET /api/bookings/all`
