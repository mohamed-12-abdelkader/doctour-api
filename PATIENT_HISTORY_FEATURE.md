# 📋 Patient History Feature - تاريخ المريض

## Overview
تم إضافة endpoint جديد للحصول على تفاصيل حجز معين مع كامل تاريخ المريض الطبي بناءً على رقم الهاتف.

## Endpoint Details

**URL:** `GET /api/bookings/:id/history`  
**Authentication:** Required  
**Permission:** `manage_daily_bookings`

## Use Cases

### 1. عرض تاريخ المريض أثناء الكشف
عندما يأتي مريض للكشف، يمكن للطبيب أو الموظف رؤية:
- تفاصيل الحجز الحالي
- عدد الزيارات السابقة
- إجمالي المبالغ المدفوعة
- تفاصيل آخر زيارة
- قائمة كاملة بجميع الزيارات السابقة

### 2. تحديد نوع الزيارة (كشف أو إعادة)
بناءً على التاريخ الطبي، يمكن تحديد ما إذا كانت الزيارة:
- **كشف جديد (checkup)**: إذا كان المريض جديد أو لم يزر منذ فترة طويلة
- **إعادة (followup)**: إذا كان المريض زار مؤخراً

## Request Example

```http
GET /api/bookings/5/history
Authorization: Bearer <your_token>
```

## Response Structure

```json
{
  "currentBooking": {
    // تفاصيل الحجز الحالي
    "id": 5,
    "customerName": "أحمد محمد",
    "customerPhone": "01012345678",
    "appointmentDate": "2026-02-05T10:00:00.000Z",
    "bookingType": "clinic",
    "amountPaid": "300.00",
    "visitType": "followup",
    "status": "confirmed"
  },
  "patientHistory": {
    // إحصائيات التاريخ الطبي
    "totalPastVisits": 3,              // عدد الزيارات السابقة
    "totalAmountPaid": "850.00",       // إجمالي المبالغ المدفوعة
    
    // تفاصيل آخر زيارة
    "lastVisit": {
      "date": "2026-01-15T10:00:00.000Z",
      "visitType": "checkup",
      "amountPaid": "300.00",
      "status": "confirmed"
    },
    
    // قائمة كاملة بالزيارات السابقة (مرتبة من الأحدث للأقدم)
    "pastBookings": [
      {
        "id": 3,
        "customerName": "أحمد محمد",
        "customerPhone": "01012345678",
        "appointmentDate": "2026-01-15T10:00:00.000Z",
        "bookingType": "clinic",
        "amountPaid": "300.00",
        "visitType": "checkup",
        "status": "confirmed"
      },
      // ... المزيد من الزيارات
    ]
  }
}
```

## Response Fields Explanation

### currentBooking
- **id**: معرف الحجز
- **customerName**: اسم المريض
- **customerPhone**: رقم الهاتف
- **appointmentDate**: تاريخ ووقت الموعد
- **bookingType**: نوع الحجز (online أو clinic)
- **amountPaid**: المبلغ المدفوع
- **visitType**: نوع الزيارة (checkup أو followup)
- **status**: حالة الحجز

### patientHistory
- **totalPastVisits**: عدد الزيارات السابقة الكلي
- **totalAmountPaid**: إجمالي المبالغ المدفوعة في جميع الزيارات السابقة
- **lastVisit**: تفاصيل آخر زيارة (null إذا لم توجد زيارات سابقة)
- **pastBookings**: مصفوفة تحتوي على جميع الزيارات السابقة مرتبة من الأحدث للأقدم

## Important Notes

### 1. تحديد الزيارات السابقة
- يتم البحث عن الزيارات بناءً على **رقم الهاتف**
- يتم استبعاد الحجز الحالي من القائمة
- يتم عرض فقط الزيارات التي **حدثت في الماضي** (قبل التاريخ الحالي)

### 2. ترتيب النتائج
- الزيارات السابقة مرتبة من **الأحدث للأقدم**
- آخر زيارة (`lastVisit`) هي أول عنصر في `pastBookings`

### 3. الإحصائيات
- `totalPastVisits`: يحسب عدد الزيارات فقط (لا يشمل الحجز الحالي)
- `totalAmountPaid`: مجموع المبالغ المدفوعة في جميع الزيارات السابقة

## Use Case Example

### سيناريو: مريض يأتي للكشف

```javascript
// 1. الموظف يفتح تفاصيل الحجز
GET /api/bookings/5/history

// 2. النظام يعرض:
// - الحجز الحالي: إعادة، 300 جنيه
// - عدد الزيارات السابقة: 3 زيارات
// - إجمالي المدفوع سابقاً: 850 جنيه
// - آخر زيارة: 15 يناير 2026 (كشف، 300 جنيه)

// 3. الطبيب يمكنه:
// - رؤية أن المريض زار 3 مرات من قبل
// - معرفة أن آخر زيارة كانت منذ 20 يوم
// - تحديد أن هذه زيارة متابعة (followup)
// - رؤية تفاصيل كل زيارة سابقة
```

## Error Handling

### Booking Not Found
```json
{
  "message": "Booking not found."
}
```
**Status Code:** 404

### Unauthorized
```json
{
  "message": "Not authorized, no token"
}
```
**Status Code:** 401

### Forbidden (No Permission)
```json
{
  "message": "Forbidden. Requires permission: manage_daily_bookings"
}
```
**Status Code:** 403

## Integration Tips

### Frontend Display Suggestions

1. **عرض ملخص سريع:**
```
📊 ملخص المريض
👤 الاسم: أحمد محمد
📱 الهاتف: 01012345678
🔢 عدد الزيارات: 3 زيارات
💰 إجمالي المدفوع: 850 جنيه
📅 آخر زيارة: 15 يناير 2026
```

2. **عرض تفاصيل الزيارات:**
```
📋 تاريخ الزيارات
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ 15 يناير 2026 - كشف - 300 ج
✅ 20 ديسمبر 2025 - كشف - 350 ج
✅ 10 نوفمبر 2025 - كشف - 200 ج
```

3. **تحديد نوع الزيارة تلقائياً:**
```javascript
// إذا كانت آخر زيارة منذ أقل من شهر
if (daysSinceLastVisit < 30) {
  suggestedVisitType = "followup";
} else {
  suggestedVisitType = "checkup";
}
```

## Performance Considerations

- الـ endpoint يقوم بـ 2 queries فقط:
  1. جلب الحجز الحالي
  2. جلب جميع الحجوزات السابقة لنفس الرقم
- النتائج مرتبة في قاعدة البيانات (ORDER BY)
- الإحصائيات تُحسب في الـ backend

## Security

- ✅ يتطلب Authentication (Bearer Token)
- ✅ يتطلب صلاحية `manage_daily_bookings`
- ✅ Admin لديه وصول كامل
- ✅ لا يمكن للمستخدمين العاديين الوصول

## Future Enhancements

يمكن إضافة في المستقبل:
- 📊 رسوم بيانية لتاريخ الزيارات
- 📝 ملاحظات طبية لكل زيارة
- 💊 سجل الأدوية الموصوفة
- 🔔 تنبيهات للمتابعة
- 📈 تحليل أنماط الزيارات
