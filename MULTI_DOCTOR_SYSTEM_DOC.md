# Multi Doctor Clinic System - Current Architecture

هذا الملف يشرح **الوضع الحالي للنظام بعد التعديل** من Single Doctor إلى Multi Doctor.

---

## 1) Roles and Access

النظام يدعم الأدوار التالية:

- `admin`
- `doctor`
- `secretary`
- `staff` (للتوافق مع النسخة القديمة)

### صلاحيات كل دور (فعليًا في الباك إند)

- **Admin**
  - إدارة حسابات الأطباء والسكرتارية عبر مسارات الإدارة.
  - إدارة ساعات العمل.
  - إدارة الحجوزات.

- **Doctor**
  - الدخول للوحة الطبيب.
  - مشاهدة حجوزاته فقط.
  - مشاهدة جدول عمله فقط.

- **Secretary**
  - إنشاء/تعديل/تأكيد الحجوزات.
  - اختيار الطبيب عند الحجز.
  - إدارة ساعات العمل (مع Admin).

---

## 2) Data Model (After Refactor)

## `Users`
- الحقول الأساسية: `name`, `email`, `password`, `role`, `isActive`
- `role` أصبح: `admin | staff | doctor | secretary`

## `DoctorProfiles` (جديد)
- مرتبط بـ `Users` بعلاقة `1:1`
- الحقول:
  - `userId` (unique)
  - `specialty`
  - `phone`
  - `imageUrl` (اختياري)
  - `isActive`

## `WorkingDays` (معدل)
- الحقول:
  - `date`
  - `startTime`
  - `endTime`
  - `doctorId` (يربط يوم العمل بطبيب محدد)
  - `isActive`
  - `createdBy`
- المبدأ: جدول عمل مستقل لكل طبيب.

## `Bookings` (معدل)
- تمت إضافة:
  - `doctorId` (الطبيب المرتبط بالحجز)
  - `assignedBy` (من أكد/عيّن الموعد: Admin/Secretary)
- الحقول القديمة ما زالت مدعومة (online + clinic + slot logic).

---

## 3) Associations

- `User hasOne DoctorProfile`
- `DoctorProfile belongsTo User`
- `DoctorProfile hasMany WorkingDay`
- `WorkingDay belongsTo DoctorProfile`
- `DoctorProfile hasMany Booking`
- `Booking belongsTo DoctorProfile`

---

## 4) Booking Flow (Multi-Doctor)

### A) Clinic Booking (داخلي)
1. Admin/Secretary يختار `doctorId`.
2. يحدد التاريخ.
3. النظام يتحقق من جدول هذا الطبيب (`WorkingDays`).
4. النظام يتحقق من السعة وعدم التعارض لهذا الطبيب فقط.
5. يتم إنشاء الحجز مرتبطًا بـ `doctorId`.

### B) Online Booking Confirmation
1. الطلب الأونلاين يدخل `pending`.
2. عند التأكيد، Admin/Secretary يرسل:
   - `doctorId`
   - `date`
   - `time` أو `timeSlot`
3. النظام يعرض/يتحقق من المواعيد المتاحة للطبيب المحدد فقط.
4. يتم ربط الحجز بالطبيب وتأكيده.

### C) Doctor Visibility
- الطبيب عند طلب قائمة الحجوزات يرى فقط ما يخص `doctorId` الخاص به.
- لا يمكنه الوصول لحجوزات أطباء آخرين من نفس endpoint.

---

## 5) Working Hours Management

إدارة ساعات العمل أصبحت للطبيب المحدد بدل العيادة ككل:

- عند الإنشاء أو الاستعلام يجب تمرير `doctorId`.
- التوفر في `available-slots` أصبح محسوبًا لكل طبيب بشكل مستقل.

---

## 6) Main APIs (Current)

## Auth
- `POST /api/auth/login`
  - يرجع `doctorProfile` داخل استجابة الدخول عند الحسابات الطبية.

## Doctors
- `GET /api/doctors` (Admin)
  - جلب كل الأطباء (Profiles + بيانات المستخدم).
- `GET /api/doctors/me/dashboard` (Doctor only)
  - Dashboard الطبيب (حجوزات اليوم + القادمة + جدول العمل).

## Staff/Admin Accounts
- `POST /api/admin/staff`
  - إنشاء حساب `doctor` أو `secretary` (مع دعم `staff` القديم).
  - عند `role=doctor` يلزم: `specialty`, `phone`.

## Working Days
- `POST /api/admin/working-days`
  - يتطلب: `doctorId`, `date`, `startTime`, `endTime`
- `GET /api/admin/working-days?doctorId=...&date=...`
  - جلب يوم عمل لطبيب محدد.
- `PUT /api/admin/working-days/:id`
  - تحديث يوم عمل.

## Bookings
- `GET /api/bookings/available-slots?date=YYYY-MM-DD&doctorId=ID`
  - المواعيد المتاحة لطبيب محدد.
- `POST /api/bookings/clinic`
  - إنشاء حجز عيادة مع `doctorId`.
- `PATCH /api/bookings/online/:id/status`
  - تأكيد/تعديل حالة الحجز الأونلاين، وعند التأكيد يلزم `doctorId` + موعد متاح.
- `GET /api/bookings/all`
  - الطبيب يرى حجوزاته فقط.
  - Admin/Secretary يمكنهم التصفية بـ `doctorId`.

---

## 7) Backward Compatibility Notes

- تم الإبقاء على `staff` لتجنب كسر البيانات القديمة.
- نظام الصلاحيات القديم المبني على permissions ما زال يعمل.
- إضافة Multi-Doctor تمت بشكل تدريجي مع أقل تعديل ممكن في الهيكل القائم.

---

## 8) Known Note

قد يظهر تحذير قديم متعلق بـ migration المصروفات (`expense_categories createdAt`) وهو غير مرتبط مباشرة بتحويل النظام إلى Multi-Doctor.

---

## 9) Recommended Next Step

للاستقرار الإنتاجي:

1. إضافة validation موحد يمنع أي حجز مؤكد بدون `doctorId`.
2. إضافة اختبارات API للأدوار:
   - Doctor data isolation
   - Secretary booking permissions
   - Conflict prevention per doctor
3. توحيد تسمية `staff` إلى `secretary` مستقبلاً بعد ترحيل كامل.

