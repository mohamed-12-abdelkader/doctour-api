# 📋 Patient Reports & History APIs

> **Base URL:** `http://localhost:8000`
> **Auth:** كل الـ endpoints دي تحتاج `Authorization: Bearer <token>` ما عدا اللي مكتوب عليه Public
> **Role:** Admin فقط يقدر يتعامل مع التقارير والهيستوري

---

## 📌 فهرس

1. [تقارير المريض (Reports)](#-تقارير-المريض)
   - [إنشاء تقرير جديد](#1-إنشاء-تقرير-جديد)
   - [جلب كل التقارير لحجز](#2-جلب-كل-التقارير-لحجز)
   - [جلب تقرير محدد](#3-جلب-تقرير-محدد)
   - [تعديل تقرير](#4-تعديل-تقرير)
   - [حذف تقرير كامل](#5-حذف-تقرير-كامل)
   - [حذف صورة الروشتة فقط](#6-حذف-صورة-الروشتة-فقط)
2. [هيستوري المريض (History)](#-هيستوري-المريض)

---

## 📝 تقارير المريض

> **ملاحظة:** حجز واحد يمكن أن يكون له **أكثر من تقرير**.

---

### 1. إنشاء تقرير جديد

```
POST /api/bookings/:id/reports
```

**Auth:** Admin ✅
**Content-Type:** `multipart/form-data`

#### Request Body (form-data)

| Field | Type | Required | Description |
|---|---|---|---|
| `medicalCondition` | Text | ❌ | الحالة المرضية |
| `notes` | Text | ❌ | ملاحظات إضافية |
| `medications` | Text (JSON string) | ❌ | قائمة الأدوية — انظر الشكل أدناه |
| `prescription` | **File** | ❌ | صورة الروشتة (JPEG / PNG / WEBP / PDF — max 5MB) |

**شكل الـ `medications` (JSON string):**
```json
[
  {
    "medicationName": "أموكسيسيلين",
    "dosage": "500mg",
    "frequency": "3 مرات يومياً",
    "notes": "بعد الأكل"
  },
  {
    "medicationName": "باراسيتامول",
    "dosage": "1g",
    "frequency": "عند الحاجة",
    "notes": null
  }
]
```

#### Response `201 Created`
```json
{
  "message": "Report created successfully.",
  "report": {
    "id": 5,
    "bookingId": 15,
    "medicalCondition": "التهاب الحلق الحاد",
    "notes": "يجب الراحة التامة",
    "prescriptionImageUrl": "https://res.cloudinary.com/dkwx24lyh/image/upload/v1/doctor-api/prescriptions/abc123.jpg",
    "createdAt": "2026-02-23T05:30:00.000Z",
    "updatedAt": "2026-02-23T05:30:00.000Z",
    "medications": [
      {
        "id": 8,
        "medicationName": "أموكسيسيلين",
        "dosage": "500mg",
        "frequency": "3 مرات يومياً",
        "notes": "بعد الأكل"
      }
    ]
  }
}
```

**بدون صورة:**
```json
{
  "message": "Report created successfully.",
  "report": {
    "id": 6,
    "bookingId": 15,
    "medicalCondition": "متابعة دورية",
    "notes": null,
    "prescriptionImageUrl": null,
    "createdAt": "2026-02-23T06:00:00.000Z",
    "updatedAt": "2026-02-23T06:00:00.000Z",
    "medications": []
  }
}
```

#### Error Responses

| Status | Condition |
|---|---|
| `404` | الحجز مش موجود |
| `400` | اسم الـ field غير صحيح (لازم يكون `prescription`) |
| `400` | نوع الملف غير مسموح (لازم JPEG/PNG/WEBP/PDF) |
| `400` | حجم الملف أكبر من 5MB |

---

### 2. جلب كل التقارير لحجز

```
GET /api/bookings/:id/reports
```

**Auth:** Admin ✅

#### Response `200 OK`
```json
{
  "total": 2,
  "reports": [
    {
      "id": 5,
      "bookingId": 15,
      "medicalCondition": "التهاب الحلق الحاد",
      "notes": "يجب الراحة التامة",
      "prescriptionImageUrl": "https://res.cloudinary.com/dkwx24lyh/image/upload/v1/doctor-api/prescriptions/abc123.jpg",
      "createdAt": "2026-02-23T05:30:00.000Z",
      "updatedAt": "2026-02-23T05:30:00.000Z",
      "medications": [
        {
          "id": 8,
          "medicationName": "أموكسيسيلين",
          "dosage": "500mg",
          "frequency": "3 مرات يومياً",
          "notes": "بعد الأكل"
        }
      ]
    },
    {
      "id": 2,
      "bookingId": 15,
      "medicalCondition": "test",
      "notes": "test",
      "prescriptionImageUrl": null,
      "createdAt": "2026-02-23T03:32:00.000Z",
      "updatedAt": "2026-02-23T03:32:00.000Z",
      "medications": []
    }
  ]
}
```

> التقارير مرتبة من **الأحدث → الأقدم**

#### Error Responses

| Status | Condition |
|---|---|
| `404` | الحجز مش موجود |

---

### 3. جلب تقرير محدد

```
GET /api/bookings/:id/reports/:reportId
```

**Auth:** Admin ✅

#### URL Params

| Param | Description |
|---|---|
| `id` | ID الحجز |
| `reportId` | ID التقرير |

#### Response `200 OK`
```json
{
  "report": {
    "id": 5,
    "bookingId": 15,
    "medicalCondition": "التهاب الحلق الحاد",
    "notes": "يجب الراحة التامة",
    "prescriptionImageUrl": "https://res.cloudinary.com/dkwx24lyh/image/upload/v1/doctor-api/prescriptions/abc123.jpg",
    "createdAt": "2026-02-23T05:30:00.000Z",
    "updatedAt": "2026-02-23T05:30:00.000Z",
    "medications": [
      {
        "id": 8,
        "medicationName": "أموكسيسيلين",
        "dosage": "500mg",
        "frequency": "3 مرات يومياً",
        "notes": "بعد الأكل"
      }
    ]
  }
}
```

#### Error Responses

| Status | Condition |
|---|---|
| `404` | التقرير أو الحجز مش موجود |

---

### 4. تعديل تقرير

```
PUT /api/bookings/:id/reports/:reportId
```

**Auth:** Admin ✅
**Content-Type:** `multipart/form-data`

#### Request Body (form-data)

> بعت بس الـ fields اللي عايز تغيرها

| Field | Type | Required | Description |
|---|---|---|---|
| `medicalCondition` | Text | ❌ | الحالة المرضية الجديدة |
| `notes` | Text | ❌ | الملاحظات الجديدة |
| `medications` | Text (JSON string) | ❌ | قائمة أدوية جديدة — **تحل محل القديمة كلها** |
| `prescription` | **File** | ❌ | صورة روشتة جديدة — **تحل محل القديمة تلقائياً** |

> **ملاحظة:** لو بعتت `medications` حتى لو فاضية `[]` هتمسح كل الأدوية القديمة. لو مبعتهاش هيفضلوا زي ما هم.

#### Response `200 OK`
```json
{
  "message": "Report updated successfully.",
  "report": {
    "id": 5,
    "bookingId": 15,
    "medicalCondition": "تم التحديث",
    "notes": "ملاحظات محدثة",
    "prescriptionImageUrl": "https://res.cloudinary.com/dkwx24lyh/image/upload/v1/doctor-api/prescriptions/new456.jpg",
    "createdAt": "2026-02-23T05:30:00.000Z",
    "updatedAt": "2026-02-23T06:15:00.000Z",
    "medications": []
  }
}
```

#### Error Responses

| Status | Condition |
|---|---|
| `404` | التقرير أو الحجز مش موجود |
| `400` | اسم الـ field أو نوع الملف غلط |

---

### 5. حذف تقرير كامل

```
DELETE /api/bookings/:id/reports/:reportId
```

**Auth:** Admin ✅

> يحذف التقرير + صورة الروشتة من Cloudinary + كل الأدوية المرتبطة بيه

#### Response `200 OK`
```json
{
  "message": "Report deleted successfully."
}
```

#### Error Responses

| Status | Condition |
|---|---|
| `404` | التقرير أو الحجز مش موجود |

---

### 6. حذف صورة الروشتة فقط

```
DELETE /api/bookings/:id/reports/:reportId/prescription
```

**Auth:** Admin ✅

> يحذف الصورة من Cloudinary ويمسح الـ URL من DB — **التقرير نفسه يفضل موجود**

#### Response `200 OK`
```json
{
  "message": "Prescription image deleted successfully."
}
```

#### Error Responses

| Status | Condition |
|---|---|
| `404` | التقرير مش موجود أو مفيهوش صورة أصلاً |

---

## 🕓 هيستوري المريض

### جلب هيستوري المريض

```
GET /api/bookings/:id/history
```

**Auth:** Staff أو Admin (يحتاج `manage_daily_bookings`) ✅

> يرجع تفاصيل الحجز الحالي مع **كل تقاريره** + كل الحجوزات السابقة لنفس رقم التليفون مع تقاريرها.

#### Response `200 OK`

```json
{
  "currentBooking": {
    "id": 15,
    "customerName": "محمد أحمد",
    "customerPhone": "01012345678",
    "age": null,
    "appointmentDate": "2026-02-23T12:00:00.000Z",
    "bookingType": "clinic",
    "amountPaid": "200.00",
    "visitType": "checkup",
    "status": "confirmed",
    "examinationStatus": "done",
    "createdAt": "2026-02-23T10:00:00.000Z",
    "updatedAt": "2026-02-23T12:30:00.000Z",
    "reports": [
      {
        "id": 5,
        "bookingId": 15,
        "medicalCondition": "التهاب الحلق الحاد",
        "notes": "يجب الراحة التامة",
        "prescriptionImageUrl": "https://res.cloudinary.com/dkwx24lyh/image/upload/v1/doctor-api/prescriptions/abc123.jpg",
        "createdAt": "2026-02-23T12:15:00.000Z",
        "updatedAt": "2026-02-23T12:15:00.000Z",
        "medications": [
          {
            "id": 8,
            "medicationName": "أموكسيسيلين",
            "dosage": "500mg",
            "frequency": "3 مرات يومياً",
            "notes": "بعد الأكل"
          }
        ]
      },
      {
        "id": 2,
        "bookingId": 15,
        "medicalCondition": "فحص أولي",
        "notes": null,
        "prescriptionImageUrl": null,
        "createdAt": "2026-02-23T11:00:00.000Z",
        "updatedAt": "2026-02-23T11:00:00.000Z",
        "medications": []
      }
    ]
  },
  "patientHistory": {
    "totalPastVisits": 3,
    "totalAmountPaid": "550.00",
    "lastVisit": {
      "date": "2026-01-15T12:00:00.000Z",
      "visitType": "followup",
      "amountPaid": "150.00",
      "status": "confirmed"
    },
    "pastBookings": [
      {
        "id": 10,
        "customerName": "محمد أحمد",
        "customerPhone": "01012345678",
        "appointmentDate": "2026-01-15T12:00:00.000Z",
        "bookingType": "clinic",
        "amountPaid": "150.00",
        "visitType": "followup",
        "status": "confirmed",
        "reports": [
          {
            "id": 3,
            "bookingId": 10,
            "medicalCondition": "متابعة دورية",
            "notes": null,
            "prescriptionImageUrl": "https://res.cloudinary.com/dkwx24lyh/image/upload/v1/doctor-api/prescriptions/old456.jpg",
            "createdAt": "2026-01-15T13:00:00.000Z",
            "updatedAt": "2026-01-15T13:00:00.000Z",
            "medications": []
          }
        ]
      }
    ]
  }
}
```

#### حالة مفيش تقارير

```json
"reports": []
```

#### Error Responses

| Status | Condition |
|---|---|
| `404` | الحجز مش موجود |
| `403` | مش عندك صلاحية |

---

## 🔑 ملخص سريع لكل الـ Endpoints

```
POST   /api/bookings/:id/reports                           → إنشاء تقرير جديد
GET    /api/bookings/:id/reports                           → كل التقارير للحجز
GET    /api/bookings/:id/reports/:reportId                 → تقرير محدد
PUT    /api/bookings/:id/reports/:reportId                 → تعديل تقرير
DELETE /api/bookings/:id/reports/:reportId                 → حذف تقرير كامل
DELETE /api/bookings/:id/reports/:reportId/prescription    → حذف الصورة فقط

GET    /api/bookings/:id/history                           → هيستوري المريض
```

---

## 📎 ملاحظات عامة

| الموضوع | التفاصيل |
|---|---|
| **أنواع الملفات المسموحة** | JPEG, PNG, WEBP, PDF |
| **الحجم الأقصى للملف** | 5MB |
| **اسم الـ field للصورة** | `prescription` (بالظبط) |
| **Content-Type عند رفع صورة** | `multipart/form-data` (مش JSON) |
| **medications** | بيتبعت كـ JSON string في الـ form-data |
| **prescriptionImageUrl** | `null` لو مفيش صورة، أو URL من Cloudinary لو في صورة |
| **الـ reports في الهيستوري** | Array — ممكن يكون فاضي `[]` لو الزيارة مفيهاش تقارير |
