# توثيق نظام الحجز الحالي
# Booking System Documentation

**Base URL:** `http://localhost:8000`  
**المسار الأساسي:** `/api/bookings`

---

## المحتويات

1. [نظرة عامة](#نظرة-عامة)
2. [نموذج البيانات](#نموذج-البيانات)
3. [نظام السلاطات (المواعيد داخل اليوم)](#نظام-السلاطات)
4. [منطق حساب المواعيد المتاحة](#منطق-حساب-المواعيد-المتاحة)
5. [واجهات API الخاصة بالحجز](#واجهات-api-الخاصة-بالحجز)
6. [ملخص المسارات](#ملخص-المسارات)

---

## نظرة عامة

نظام الحجز يدعم:

- **حجز أونلاين (عام):** بدون تسجيل دخول، مع إمكانية تحديد تاريخ/وقت لاحقاً.
- **حجز العيادة (يومي):** مع صلاحية `manage_daily_bookings`، مع تحديد `appointmentDate`.
- **حجز بالسلاطات (Slot-based):** مواعيد ثابتة كل **10 دقائق** داخل أوقات العمل، مع API لإرجاع **المواعيد المتاحة فقط** مرتبة زمنياً.

---

## نموذج البيانات

### جدول الحجوزات (Booking)

| الحقل | النوع | الوصف |
|-------|------|--------|
| `id` | INTEGER | المفتاح الأساسي |
| `customerName` | STRING | اسم العميل |
| `customerPhone` | STRING | رقم الهاتف |
| `age` | INTEGER | عمر العميل (اختياري) |
| `appointmentDate` | DATE | موعد الحجز (اختياري في الحجز الأونلاين) |
| `bookingType` | ENUM | `online` أو `clinic` |
| `amountPaid` | DECIMAL | المبلغ المدفوع |
| `visitType` | ENUM | `checkup`, `followup`, `consultation` |
| `status` | ENUM | `pending`, `confirmed`, `cancelled`, `rejected` |
| `examinationStatus` | ENUM | `waiting` أو `done` |
| **سلاطات** | | |
| `patientId` | INTEGER | معرف المريض (لحجز السلاطات) |
| `slotDate` | DATEONLY | تاريخ الموعد `YYYY-MM-DD` |
| `timeSlot` | STRING(5) | وقت السلات مثل `10:00` |
| `preferredDate` | DATEONLY | التاريخ المفضل (حجز أونلاين) |
| `preferredTime` | STRING(5) | الوقت المفضل (حجز أونلاين) |

### جدول يوم العمل (WorkingDay)

| الحقل | النوع | الوصف |
|-------|------|--------|
| `id` | INTEGER | المفتاح الأساسي |
| `date` | DATEONLY | تاريخ العمل `YYYY-MM-DD` |
| `startTime` | STRING(5) | وقت البداية مثل `10:00` |
| `endTime` | STRING(5) | وقت النهاية مثل `18:00` |
| `isActive` | BOOLEAN | هل اليوم مفعّل للحجز |

---

## نظام السلاطات

### مدة السلات

- **المدة:** 10 دقائق (`SLOT_DURATION_MINUTES = 10`).
- **النتيجة:** **6 مواعيد حجز في كل ساعة**:
  - مثال من 10:00 إلى 11:00:
    - `10:00` → `10:10`
    - `10:10` → `10:20`
    - `10:20` → `10:30`
    - `10:30` → `10:40`
    - `10:40` → `10:50`
    - `10:50` → `11:00`

### سعة كل سلات

- **الحد الأقصى:** حجز واحد فقط لكل موعد (`MAX_BOOKINGS_PER_SLOT = 1`).
- يتم عدّ الحجوزات غير الملغاة لكل (`slotDate`, `timeSlot`). إذا كان العدد ≥ 1 فإن السلات تعتبر محجوزة ولا تظهر في المواعيد المتاحة.

### توليد السلات

- الدالة `generateSlots(startTime, endTime)` تولّد أوقات كل 10 دقائق بين البداية والنهاية (النهاية غير شاملة).
- مثال: `startTime = 10:00`, `endTime = 12:00`  
  → `["10:00","10:10","10:20","10:30","10:40","10:50","11:00","11:10","11:20","11:30","11:40","11:50"]`.

### استبعاد المواعيد الماضية

- إذا كان اليوم المطلوب **قبل** اليوم الحالي → لا توجد سلات متاحة.
- إذا كان **بعد** اليوم الحالي → كل السلات تعتبر مستقبلية.
- إذا كان **نفس** اليوم الحالي → تُستبعد السلات التي وقتها ≤ الوقت الحالي.

---

## منطق حساب المواعيد المتاحة

يُنفَّذ داخل `bookingSlotService.getAvailableSlots(dateStr)`:

1. **التحقق من يوم العمل:** البحث عن `WorkingDay` حيث `date = dateStr` و `isActive = true`. إن لم يوجد → `{ "available": false, "message": "الحجز غير متاح اليوم" }`.
2. **توليد كل السلات:** `generateSlots(wd.startTime, wd.endTime)`.
3. **استبعاد السلات الماضية:** `filterOutPastSlots(dateStr, allSlots, now)`. إن لم يتبق أي سلات → `{ "available": false, "message": "انتهت مواعيد الحجز لليوم" }`.
4. **حساب عدد الحجوزات:** استعلام `GROUP BY timeSlot` مع `status != 'cancelled'`.
5. **تحديد المتاحة:** سلات يكون فيها `count < MAX_BOOKINGS_PER_SLOT`. إن لم يوجد أي متاحة → `{ "available": false, "message": "مواعيد اليوم اكتملت" }`.
6. **النتيجة:** قائمة `availableSlots` تحتوي فقط المواعيد غير المحجوزة، **مرتبة تصاعدياً حسب الوقت** (لأن التوليد أصلاً بالترتيب).

---

## واجهات API الخاصة بالحجز

### 1. المواعيد المتاحة (Slot-based)

إرجاع **المواعيد غير المحجوزة فقط** ليوم معيّن، مرتبة تصاعدياً حسب الوقت.

- **المسار:** `GET /api/bookings/available-slots?date=YYYY-MM-DD`
- **الصلاحية:** عام (لا يتطلب توكن).
- **Query:** `date` مطلوب بصيغة `YYYY-MM-DD`.

**مثال طلب:**

```http
GET /api/bookings/available-slots?date=2026-03-12
```

**استجابة ناجحة (200):**

```json
{
  "date": "2026-03-12",
  "available_slots": [
    "10:00",
    "10:10",
    "10:20",
    "10:30",
    "10:40",
    "10:50",
    "11:00"
  ]
}
```

- `available_slots`: فقط المواعيد **غير المحجوزة**.
- الترتيب: **تصاعدي حسب الوقت** (كل 10 دقائق: الساعة ثم اللي بعدها 10، 20، 30…).

**مثال على السلوك (موعد محجوز يُستبعد):**

- الأوقات في الـ API بصيغة **24 ساعة** (مثلاً 1 ظهراً = `13:00`).
- لو فيه حجز في الساعة **1** (13:00)، الـ API **لا** يرجع `13:00`، ويرجع أول موعد متاح بعده:
  - `13:10` ← أول متاح بعد 1
  - `13:20`
  - `13:30`
  - `13:40`
  - `13:50`
  - `14:00`
  - … وهكذا كل 10 دقائق.

يعني: **المواعيد المتاحة في اليوم** = كل سلاطات الـ 10 دقائق **ما عدا** اللي عليها حجز، مرتبة من الأقرب للأبعد.

**أمثلة أخطاء (400):**

| الحالة | الاستجابة |
|--------|-----------|
| تاريخ غير صالح أو مفقود | `{ "message": "التاريخ مطلوب بصيغة YYYY-MM-DD" }` |
| لا يوجد يوم عمل مفعّل | `{ "available": false, "message": "الحجز غير متاح اليوم" }` |
| انتهت المواعيد الزمنية لليوم | `{ "available": false, "message": "انتهت مواعيد الحجز لليوم" }` |
| كل السلات محجوزة | `{ "available": false, "message": "مواعيد اليوم اكتملت" }` |

---

### 2. إنشاء حجز على سلات (Slot Booking)

- **المسار:** `POST /api/bookings/slots`
- **Headers:** حسب إعدادك (حالياً بدون توكن في الراوتر).
- **Body (JSON):**

| الحقل | النوع | مطلوب | الوصف |
|-------|------|--------|--------|
| `patientId` | number | نعم | معرف المريض |
| `date` | string | نعم | التاريخ `YYYY-MM-DD` |
| `timeSlot` | string | نعم | الوقت `HH:mm` (مثل `10:00`) |
| `bookingType` | string | لا | `online` أو `clinic` (افتراضي: `online`) |

**مثال طلب:**

```http
POST /api/bookings/slots
Content-Type: application/json

{
  "patientId": 1,
  "date": "2026-03-12",
  "timeSlot": "10:00",
  "bookingType": "online"
}
```

**استجابة ناجحة (201):**

```json
{
  "message": "تم الحجز بنجاح",
  "booking": {
    "id": 10,
    "patientId": 1,
    "customerName": "اسم المريض",
    "customerPhone": "رقم المريض",
    "slotDate": "2026-03-12",
    "timeSlot": "10:00",
    "bookingType": "online",
    "status": "confirmed",
    "appointmentDate": "2026-03-12T12:00:00.000Z",
    "createdAt": "...",
    "updatedAt": "..."
  }
}
```

**التحققات:** وجود يوم عمل مفعّل، السلات ضمن أوقات العمل، السلات ليست في الماضي، السلات غير ممتلئة، عدم وجود حجز مكرر لنفس المريض في نفس التاريخ والوقت.

---

### 3. إلغاء حجز سلات

- **المسار:** `PATCH /api/bookings/slots/:id/cancel`
- **الوصف:** إلغاء حجز حسب `id` (يُحدَّث `status` إلى `cancelled`).

**استجابة ناجحة (200):**

```json
{
  "message": "تم إلغاء الحجز",
  "booking": { ... }
}
```

---

### 4. حجز أونلاين (عام، بدون سلات)

- **إنشاء طلب حجز:** `POST /api/bookings/online`  
  - Body: `name`, `phone`, `age` (اختياري), `visitType` (اختياري).
- **عرض طلبات الأونلاين:** `GET /api/bookings/online` (صلاحية: `manage_online_bookings`).

#### تأكيد حجز أونلاين (`status: "confirmed"`)

- **المسار:** `PATCH /api/bookings/online/:id/status` (صلاحية: `manage_online_bookings`).
- **إلزامي عند التأكيد:** تحديد **تاريخ** و**وقت** من المواعيد المتاحة فقط (نفس منطق السلاطات).
  1. جلب المواعيد: `GET /api/bookings/available-slots?date=YYYY-MM-DD`
  2. إرسال التأكيد مع `date` و `time` (أو `timeSlot`) بصيغة `HH:mm` من القائمة `available_slots`.

**Body مثال (تأكيد):**

```json
{
  "status": "confirmed",
  "date": "2026-03-12",
  "time": "13:10"
}
```

- إذا **لا يوجد يوم عمل** أو **لا توجد مواعيد متاحة** لهذا اليوم → **400** برسالة مثل:  
  `لا يوجد مواعيد عمل متاحة لهذا اليوم — لا يمكن تأكيد الحجز الأونلاين.`
- إذا الوقت **ليس** ضمن `available_slots` → **400** مع `available_slots` في الاستجابة.
- إذا لم تُرسل `date` أو `time` → **400** (مطلوبان عند التأكيد).

---

### 5. حجز العيادة (Clinic)

- **إنشاء حجز عيادة:** `POST /api/bookings/clinic` (صلاحية: `manage_daily_bookings`)  
  - Body يتضمن `appointmentDate` (تاريخ/وقت كامل).
- **عرض كل الحجوزات:** `GET /api/bookings/all` مع فلاتر `type`, `status`, `date` (صلاحية: `manage_online_bookings` أو `manage_daily_bookings`).

---

### 6. تحديث وإلغاء وتقارير

- **تحديث حجز:** `PUT /api/bookings/:id` (صلاحية: `manage_daily_bookings`).
- **إلغاء حجز:** `DELETE /api/bookings/:id` (صلاحية: `manage_daily_bookings`).
- **حالة الكشف:** `PATCH /api/bookings/:id/examination-status` (Admin فقط).
- **تقرير المريض:** `POST/GET/PUT/DELETE /api/bookings/:id/reports/...` (Admin فقط).
- **تفاصيل الحجز مع السجل:** `GET /api/bookings/:id/history` (صلاحية: `manage_daily_bookings`).

---

## ملخص المسارات

| Method | المسار | الوصف | الصلاحية |
|--------|--------|--------|-----------|
| GET | `/api/bookings/available-slots?date=YYYY-MM-DD` | المواعيد المتاحة فقط (مرتبة زمنياً) | عام |
| POST | `/api/bookings/slots` | إنشاء حجز على سلات | عام |
| PATCH | `/api/bookings/slots/:id/cancel` | إلغاء حجز سلات | عام |
| POST | `/api/bookings/online` | طلب حجز أونلاين | عام |
| GET | `/api/bookings/online` | قائمة الحجوزات الأونلاين | manage_online_bookings |
| PATCH | `/api/bookings/online/:id/status` | تأكيد/رفض/إلغاء حجز أونلاين | manage_online_bookings |
| POST | `/api/bookings/clinic` | إنشاء حجز عيادة | manage_daily_bookings |
| GET | `/api/bookings/all` | كل الحجوزات (موحدة) | manage_online_bookings أو manage_daily_bookings |
| PUT | `/api/bookings/:id` | تحديث حجز | manage_daily_bookings |
| DELETE | `/api/bookings/:id` | إلغاء حجز | manage_daily_bookings |
| GET | `/api/bookings/:id/history` | تفاصيل الحجز مع السجل | manage_daily_bookings |
| PATCH | `/api/bookings/:id/examination-status` | حالة الكشف (انتظار/تم) | Admin فقط |
| POST/GET/PUT/DELETE | `/api/bookings/:id/reports/...` | تقارير المريض | Admin فقط |

---

*آخر تحديث: نظام السلاطات 10 دقائق، API المواعيد المتاحة يرجع `date` و `available_slots` فقط، مرتبة تصاعدياً.*
