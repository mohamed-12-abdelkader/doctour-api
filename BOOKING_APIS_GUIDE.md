# 📋 Clinic Booking Management APIs - Quick Reference

## ✅ تم التنفيذ بنجاح

تم إضافة نظام شامل لإدارة حجوزات العيادة مع الميزات التالية:

### 🔧 التحديثات على قاعدة البيانات

تم إضافة حقلين جديدين لجدول Bookings:
- `bookingType`: نوع الحجز (online أو clinic)
- `amountPaid`: المبلغ المدفوع (للحجوزات من العيادة)

### 🚀 APIs الجديدة

#### 1. إنشاء حجز من العيادة
```
POST /api/bookings/clinic
Authorization: Bearer <token>
Permission Required: manage_daily_bookings

Body:
{
  "name": "اسم العميل",
  "phone": "01012345678",
  "date": "2023-12-25T14:30:00.000Z",
  "amountPaid": 250.50
}
```

#### 2. عرض جميع الحجوزات (موحد)
```
GET /api/bookings/all
Authorization: Bearer <token>
Permission Required: manage_online_bookings OR manage_daily_bookings

Query Parameters (اختياري):
- type: online أو clinic
- status: pending, confirmed, cancelled, rejected
- date: 2023-12-25

أمثلة:
- GET /api/bookings/all (كل الحجوزات)
- GET /api/bookings/all?type=clinic (حجوزات العيادة فقط)
- GET /api/bookings/all?type=online&status=confirmed (الحجوزات الأونلاين المؤكدة)
- GET /api/bookings/all?date=2023-12-25 (حجوزات يوم معين)
```

**ملاحظة مهمة**: هذا الـ API يرجع:
- جميع حجوزات العيادة (clinic)
- الحجوزات الأونلاين المؤكدة فقط (online + confirmed)
- مرتبة حسب التاريخ (من الأقدم للأحدث)

#### 3. تعديل حجز
```
PUT /api/bookings/:id
Authorization: Bearer <token>
Permission Required: manage_daily_bookings

Body (كل الحقول اختيارية):
{
  "name": "اسم جديد",
  "phone": "01098765432",
  "date": "2023-12-26T10:00:00.000Z",
  "amountPaid": 300.00
}
```

#### 4. إلغاء حجز
```
DELETE /api/bookings/:id
Authorization: Bearer <token>
Permission Required: manage_daily_bookings
```

### 📊 APIs الموجودة مسبقاً (تم تحديثها)

#### 1. إنشاء حجز أونلاين (عام)
```
POST /api/bookings/online
No Authorization Required

Body:
{
  "name": "John Doe",
  "phone": "01012345678",
  "date": "2023-12-25T14:30:00.000Z"
}
```

#### 2. عرض الحجوزات الأونلاين
```
GET /api/bookings/online
Authorization: Bearer <token>
Permission Required: manage_online_bookings

Query Parameters:
- status: pending, confirmed, cancelled, rejected
- date: 2023-12-25
```

#### 3. تحديث حالة حجز أونلاين
```
PATCH /api/bookings/online/:id/status
Authorization: Bearer <token>
Permission Required: manage_online_bookings

Body:
{
  "status": "confirmed" // أو cancelled, rejected, pending
}
```

### 🎯 الفلترة والترتيب

جميع الـ APIs التي ترجع قوائم الحجوزات تدعم:
1. **الفلترة حسب النوع**: `?type=online` أو `?type=clinic`
2. **الفلترة حسب الحالة**: `?status=confirmed`
3. **الفلترة حسب التاريخ**: `?date=2023-12-25`
4. **الترتيب**: جميع النتائج مرتبة حسب `appointmentDate` تصاعدياً

### 🔐 الصلاحيات المطلوبة

| API | الصلاحية المطلوبة |
|-----|-------------------|
| POST /api/bookings/clinic | manage_daily_bookings |
| GET /api/bookings/all | manage_online_bookings OR manage_daily_bookings |
| PUT /api/bookings/:id | manage_daily_bookings |
| DELETE /api/bookings/:id | manage_daily_bookings |
| GET /api/bookings/online | manage_online_bookings |
| PATCH /api/bookings/online/:id/status | manage_online_bookings |

### 📝 ملاحظات مهمة

1. **حجوزات العيادة** يتم تأكيدها تلقائياً (status = 'confirmed')
2. **حجوزات الأونلاين** تبدأ بحالة pending وتحتاج تأكيد
3. **API الموحد** (/api/bookings/all) يرجع فقط الحجوزات المؤكدة من الأونلاين + كل حجوزات العيادة
4. **المبلغ المدفوع** (amountPaid) اختياري ويمكن تركه 0 أو عدم إرساله

### 🧪 للاختبار

يمكنك الآن:
1. ✅ إنشاء حجوزات من العيادة مع تتبع المبلغ المدفوع
2. ✅ عرض جميع الحجوزات (أونلاين + عيادة) مرتبة حسب التاريخ
3. ✅ فلترة الحجوزات حسب النوع (أونلاين/عيادة)
4. ✅ فلترة الحجوزات حسب الحالة
5. ✅ فلترة الحجوزات حسب التاريخ
6. ✅ تعديل بيانات أي حجز
7. ✅ إلغاء أي حجز

### 📚 التوثيق الكامل

راجع ملف `API_DOCS.md` للحصول على التوثيق الكامل مع أمثلة مفصلة للـ Request/Response.
