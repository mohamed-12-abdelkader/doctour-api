# 📘 نظام الحجز — دليل شامل

> **Base URL:** `http://localhost:8000`
> **Last Updated:** 2026-02-24

---

## 📌 فهرس

1. [نظرة عامة على النظام](#-نظرة-عامة-على-النظام)
2. [دورة حياة الحجز (Workflow)](#-دورة-حياة-الحجز)
3. [الحجز الأونلاين](#-الحجز-الأونلاين)
4. [الحجز من العيادة](#-الحجز-من-العيادة)
5. [إدارة الحجوزات](#-إدارة-الحجوزات)
6. [نظام الإشعارات](#-نظام-الإشعارات)
7. [ملخص جميع الـ APIs](#-ملخص-جميع-الـ-apis)
8. [قواعد الطاقة الاستيعابية](#-قواعد-الطاقة-الاستيعابية)
9. [حالات الحجز](#-حالات-الحجز)

---

## 🌐 نظرة عامة على النظام

يتكون النظام من **نوعين** من الحجوزات:

| النوع | من يُنشئه | الحالة الأولية | يحتاج تسجيل دخول؟ | يخضع للطاقة اليومية؟ |
|---|---|---|---|---|
| **أونلاين** (`online`) | المريض مباشرة | `pending` | ❌ لا | ❌ لا |
| **عيادة** (`clinic`) | الأدمن / الستاف | `confirmed` | ✅ نعم | ✅ نعم |

---

## 🔄 دورة حياة الحجز

### الحجز الأونلاين

```
المريض يحجز أونلاين
        │
        ▼
   status = "pending"
   appointmentDate = null
   preferredDate = "2026-02-25"
   preferredTime = "10:00"
        │
        ├──► 🔔 إشعار تلقائي → الأدمن + الستاف المخول
        │
        ▼
   الأدمن يراجع الحجوزات المعلقة
   GET /api/bookings/online?status=pending
        │
        ├──► تأكيد ✅
        │    PATCH /api/bookings/online/:id/status { "status": "confirmed" }
        │    └─► appointmentDate = preferredDate (تلقائياً)
        │        يظهر في قائمة حجوزات اليوم
        │
        └──► رفض ❌
             PATCH /api/bookings/online/:id/status { "status": "rejected" }
             └─► لا يظهر في قائمة اليوم
```

### الحجز من العيادة

```
الأدمن / الستاف يضيف الحجز مباشرة
        │
        ▼
   POST /api/bookings/clinic
   status = "confirmed" (مباشرة)
   appointmentDate = التاريخ المحدد
        │
        ├──► ✅ التحقق من يوم عمل نشط
        └──► ✅ التحقق من الطاقة الاستيعابية
```

---

## 📱 الحجز الأونلاين

> **لا يحتاج تسجيل دخول — Public API**

---

### 1. إنشاء حجز أونلاين جديد

```
POST /api/bookings/online
Content-Type: application/json
```

#### Request Body

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | string | ✅ | الاسم بالكامل |
| `phone` | string | ✅ | رقم هاتف مصري صحيح (01xxxxxxxxx) |
| `preferredDate` | string | ❌ | التاريخ المفضل — `YYYY-MM-DD` |
| `preferredTime` | string | ❌ | الوقت المفضل — `HH:MM` مثل `10:00` |
| `visitType` | string | ❌ | `checkup` (افتراضي) أو `consultation` |

```json
{
  "name": "محمد أحمد",
  "phone": "01012345678",
  "preferredDate": "2026-02-25",
  "preferredTime": "10:00",
  "visitType": "checkup"
}
```

#### Response `201 Created`

```json
{
  "message": "تم تقديم طلب الحجز بنجاح. سيتواصل معك الفريق لتأكيد الموعد.",
  "booking": {
    "id": 20,
    "customerName": "محمد أحمد",
    "customerPhone": "01012345678",
    "bookingType": "online",
    "status": "pending",
    "visitType": "checkup",
    "preferredDate": "2026-02-25",
    "preferredTime": "10:00",
    "appointmentDate": null,
    "amountPaid": "0.00",
    "createdAt": "2026-02-24T03:00:00.000Z",
    "updatedAt": "2026-02-24T03:00:00.000Z"
  }
}
```

#### قواعد التحقق

| القاعدة | التفاصيل |
|---|---|
| رقم الهاتف | رقم مصري صحيح: يبدأ بـ `010`, `011`, `012`, `015` |
| منع التكرار | نفس رقم الهاتف + نفس التاريخ + نفس الوقت → `409 Conflict` |
| صيغة التاريخ | `YYYY-MM-DD` فقط |
| صيغة الوقت | `HH:MM` فقط (00:00 → 23:59) |

#### Error Responses

| Status | Condition |
|---|---|
| `400` | الاسم أو الهاتف مش موجود |
| `400` | رقم الهاتف غير صحيح |
| `400` | صيغة التاريخ أو الوقت غلط |
| `409` | حجز مكرر بنفس الهاتف والتاريخ والوقت |

---

### 2. جلب الحجوزات الأونلاين

```
GET /api/bookings/online
Authorization: Bearer <token>
Permission: manage_online_bookings
```

#### Query Params

| Param | Values | Description |
|---|---|---|
| `status` | `pending` / `confirmed` / `rejected` / `cancelled` | فلتر بالحالة |
| `date` | `YYYY-MM-DD` | فلتر بالتاريخ |

```
# الحجوزات المعلقة (تحتاج مراجعة)
GET /api/bookings/online?status=pending

# الحجوزات المؤكدة ليوم معين
GET /api/bookings/online?status=confirmed&date=2026-02-25
```

#### Response `200 OK`

```json
[
  {
    "id": 20,
    "customerName": "محمد أحمد",
    "customerPhone": "01012345678",
    "bookingType": "online",
    "status": "pending",
    "visitType": "checkup",
    "preferredDate": "2026-02-25",
    "preferredTime": "10:00",
    "appointmentDate": null,
    "createdAt": "2026-02-24T03:00:00.000Z"
  }
]
```

---

### 3. تأكيد أو رفض حجز أونلاين

```
PATCH /api/bookings/online/:id/status
Authorization: Bearer <token>
Permission: manage_online_bookings
Content-Type: application/json
```

#### Request Body

```json
{ "status": "confirmed" }
```

| القيمة | التأثير |
|---|---|
| `confirmed` | ✅ يُحدَّد `appointmentDate` من `preferredDate` تلقائياً — يظهر في قائمة اليوم |
| `rejected` | ❌ لا يظهر في قائمة اليوم |
| `pending` | ⏳ إرجاعه للانتظار |
| `cancelled` | 🚫 إلغاء |

#### Response `200 OK` — بعد التأكيد

```json
{
  "message": "Booking confirmed successfully.",
  "booking": {
    "id": 20,
    "customerName": "محمد أحمد",
    "status": "confirmed",
    "preferredDate": "2026-02-25",
    "preferredTime": "10:00",
    "appointmentDate": "2026-02-25T12:00:00.000Z"
  }
}
```

---

## 🏥 الحجز من العيادة

```
POST /api/bookings/clinic
Authorization: Bearer <token>
Permission: manage_daily_bookings
Content-Type: application/json
```

#### Request Body

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | string | ✅ | اسم المريض |
| `phone` | string | ✅ | رقم الهاتف |
| `date` | string | ✅ | تاريخ الموعد `YYYY-MM-DD` |
| `amountPaid` | number | ❌ | المبلغ المدفوع (افتراضي: 0) |
| `visitType` | string | ❌ | `checkup` / `followup` / `consultation` |

```json
{
  "name": "أحمد محمود",
  "phone": "01198765432",
  "date": "2026-02-25",
  "amountPaid": 200,
  "visitType": "checkup"
}
```

#### شروط الإنشاء

| الشرط | التفاصيل |
|---|---|
| يوم عمل نشط | لازم يكون الأدمن حدد يوم عمل لهذا التاريخ |
| الطاقة الاستيعابية | عدد الحجوزات < الطاقة (= عدد ساعات العمل) |

#### Response `201 Created`

```json
{
  "message": "Clinic booking created successfully.",
  "booking": {
    "id": 21,
    "customerName": "أحمد محمود",
    "customerPhone": "01198765432",
    "bookingType": "clinic",
    "status": "confirmed",
    "appointmentDate": "2026-02-25T12:00:00.000Z",
    "amountPaid": "200.00",
    "visitType": "checkup"
  }
}
```

#### Error Responses

| Status | Condition |
|---|---|
| `400` | مفيش يوم عمل محدد لهذا التاريخ |
| `409` | الطاقة الاستيعابية امتلأت |

---

## 📋 إدارة الحجوزات

### جلب كل الحجوزات (موحَّد)

```
GET /api/bookings/all
Authorization: Bearer <token>
Permission: manage_online_bookings OR manage_daily_bookings
```

#### Query Params

| Param | Values | Default | Description |
|---|---|---|---|
| `date` | `YYYY-MM-DD` | — | فلتر بتاريخ الموعد |
| `status` | `pending` / `confirmed` / `rejected` / `cancelled` | `confirmed` (لو date محدد) | فلتر بالحالة |
| `type` | `online` / `clinic` | كلاهما | فلتر بنوع الحجز |
| `visitType` | `checkup` / `followup` / `consultation` | — | فلتر بنوع الزيارة |

```
# حجوزات اليوم المؤكدة فقط (الافتراضي)
GET /api/bookings/all?date=2026-02-25

# كل الحجوزات المعلقة (أونلاين بانتظار المراجعة)
GET /api/bookings/all?status=pending&type=online

# حجوزات العيادة فقط ليوم معين
GET /api/bookings/all?date=2026-02-25&type=clinic
```

> **ملاحظة مهمة:** لما بتضيف `?date=` بدون `?status=`، النظام يرجع الـ `confirmed` فقط تلقائياً. الحجوزات `pending` لا تظهر في قائمة اليوم.

---

### تعديل حجز

```
PUT /api/bookings/:id
Authorization: Bearer <token>
Permission: manage_daily_bookings
Content-Type: application/json
```

#### Request Body (كلها اختيارية)

```json
{
  "name": "اسم جديد",
  "phone": "01012345678",
  "date": "2026-02-26",
  "amountPaid": 250,
  "visitType": "followup"
}
```

> **ملاحظة:** تغيير التاريخ يخضع لنفس شروط يوم العمل والطاقة الاستيعابية.

---

### إلغاء حجز

```
DELETE /api/bookings/:id
Authorization: Bearer <token>
Permission: manage_daily_bookings
```

#### Response `200 OK`

```json
{ "message": "Booking cancelled successfully.", "booking": { "status": "cancelled", ... } }
```

---

### تحديث حالة الكشف

```
PATCH /api/bookings/:id/examination-status
Authorization: Bearer <token>
Role: admin
Content-Type: application/json
```

```json
{ "examinationStatus": "done" }
```

| القيمة | المعنى |
|---|---|
| `waiting` | في الانتظار (افتراضي) |
| `done` | تم الكشف |

---

### هيستوري المريض

```
GET /api/bookings/:id/history
Authorization: Bearer <token>
Permission: manage_daily_bookings
```

يرجع:
- **الحجز الحالي** مع كل تقاريره وأدويته وصور الروشتة
- **كل الحجوزات السابقة** لنفس رقم الهاتف (مع تقاريرها)
- **إحصائيات:** عدد الزيارات، إجمالي المبالغ، آخر زيارة

---

## 🔔 نظام الإشعارات

الإشعارات تُنشأ تلقائياً عند:
- **حجز أونلاين جديد** → إشعار للأدمن + الستاف المخول
- **تأكيد / رفض / إلغاء حجز** → إشعار للأدمن

يعمل النظام بـ **Polling** (Frontend يستعلم كل فترة) — يمكن ترقيته لـ WebSocket لاحقاً.

---

### جلب الإشعارات

```
GET /api/notifications
Authorization: Bearer <token>
```

#### Query Params

| Param | Default | Description |
|---|---|---|
| `unreadOnly` | `false` | `true` لعرض غير المقروءة فقط |
| `limit` | `20` | عدد الإشعارات (max 100) |
| `page` | `1` | رقم الصفحة |

```
GET /api/notifications?unreadOnly=true&limit=10
```

#### Response `200 OK`

```json
{
  "total": 15,
  "unreadCount": 3,
  "page": 1,
  "notifications": [
    {
      "id": 5,
      "type": "new_online_booking",
      "title": "📅 حجز أونلاين جديد",
      "message": "طلب حجز جديد من محمد أحمد — رقم الهاتف: 01012345678 — التاريخ المطلوب: 2026-02-25 — الوقت: 10:00",
      "data": {
        "bookingId": 20,
        "patientName": "محمد أحمد",
        "patientPhone": "01012345678",
        "preferredDate": "2026-02-25",
        "preferredTime": "10:00"
      },
      "isRead": false,
      "targetRole": "admin",
      "createdAt": "2026-02-24T03:00:00.000Z"
    }
  ]
}
```

---

### تحديد إشعار كمقروء

```
PATCH /api/notifications/:id/read
Authorization: Bearer <token>
```

---

### تحديد الكل كمقروء

```
PATCH /api/notifications/read-all
Authorization: Bearer <token>
```

#### Response

```json
{ "message": "3 notifications marked as read." }
```

---

### حذف إشعار

```
DELETE /api/notifications/:id
Authorization: Bearer <token>
Role: admin
```

---

## ⚡ قواعد الطاقة الاستيعابية

> تنطبق فقط على **حجوزات العيادة** — الأونلاين لا يتأثر بها إطلاقاً

### حساب الطاقة

```
يوم العمل: startTime = "09:00" | endTime = "13:00"
الفارق = 4 ساعات → الطاقة = 4 حجوزات

يوم العمل: startTime = "10:00" | endTime = "11:00"
الفارق = 1 ساعة → الطاقة = 1 حجز
```

### Response لما الطاقة تمتلئ

```json
{
  "message": "الوقت انتهى — لا يمكن إضافة حجوزات جديدة في 2026-02-25.",
  "details": {
    "date": "2026-02-25",
    "workingHours": "09:00 → 13:00",
    "maxBookings": 4,
    "currentBookings": 4
  }
}
```

---

## 🏷️ حالات الحجز

```
pending    →  confirmed  (عند تأكيد الأدمن)
pending    →  rejected   (عند رفض الأدمن)
confirmed  →  cancelled  (إلغاء أي وقت)
pending    →  cancelled  (إلغاء المريض)
```

| الحالة | المعنى | يظهر في قائمة اليوم؟ |
|---|---|---|
| `pending` | بانتظار المراجعة | ❌ لا |
| `confirmed` | مؤكد | ✅ نعم |
| `rejected` | مرفوض | ❌ لا |
| `cancelled` | ملغي | ❌ لا |

---

## 📊 ملخص جميع الـ APIs

### الحجوزات

```
# ─── Public (بدون تسجيل دخول) ──────────────────────────────────
POST   /api/bookings/online                        إنشاء حجز أونلاين

# ─── manage_online_bookings ─────────────────────────────────────
GET    /api/bookings/online                        عرض الحجوزات الأونلاين
PATCH  /api/bookings/online/:id/status             تأكيد / رفض حجز أونلاين

# ─── manage_daily_bookings ──────────────────────────────────────
POST   /api/bookings/clinic                        إنشاء حجز عيادة
PUT    /api/bookings/:id                           تعديل حجز
DELETE /api/bookings/:id                           إلغاء حجز
GET    /api/bookings/:id/history                   هيستوري المريض

# ─── manage_online_bookings OR manage_daily_bookings ─────────────
GET    /api/bookings/all                           كل الحجوزات (موحَّد)

# ─── Admin only ──────────────────────────────────────────────────
PATCH  /api/bookings/:id/examination-status        حالة الكشف (waiting/done)
POST   /api/bookings/:id/reports                   إضافة تقرير
GET    /api/bookings/:id/reports                   عرض كل التقارير
GET    /api/bookings/:id/reports/:reportId         تقرير محدد
PUT    /api/bookings/:id/reports/:reportId         تعديل تقرير
DELETE /api/bookings/:id/reports/:reportId         حذف تقرير
DELETE /api/bookings/:id/reports/:reportId/prescription  حذف صورة الروشتة فقط
```

### الإشعارات

```
# ─── Protected (admin + staff) ──────────────────────────────────
GET    /api/notifications                          جلب الإشعارات
PATCH  /api/notifications/read-all                تحديد الكل كمقروء
PATCH  /api/notifications/:id/read               تحديد إشعار كمقروء

# ─── Admin only ──────────────────────────────────────────────────
DELETE /api/notifications/:id                     حذف إشعار
```

---

## 🔑 ملخص الصلاحيات

| الصلاحية | ما تتيحه |
|---|---|
| بدون login | إنشاء حجز أونلاين |
| `manage_online_bookings` | عرض + تأكيد/رفض الحجوزات الأونلاين |
| `manage_daily_bookings` | إنشاء/تعديل/إلغاء حجوزات العيادة + هيستوري |
| `admin` | كل شيء: تقارير، حالة الكشف، إشعارات، أيام العمل |

---

## 📎 ملاحظات تقنية

| الموضوع | التفاصيل |
|---|---|
| التوقيت | كل التواريخ مخزنة بـ UTC في الـ DB |
| `preferredDate` vs `appointmentDate` | `preferredDate`: ما اختاره المريض — `appointmentDate`: المؤكد من الأدمن |
| الإشعارات | DB-based polling — يمكن ترقيته لـ Socket.IO |
| صور الروشتة | مرفوعة على Cloudinary — `multipart/form-data` — max 5MB |
| الطاقة الاستيعابية | كل ساعة عمل = حجز واحد من العيادة فقط |
