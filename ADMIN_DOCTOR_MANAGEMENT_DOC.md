# توثيق: تحكم الأدمن في الأطباء والسكرتارية

هذا الملف يشرح **كيف يدير الأدمن (`admin`) حسابات الأطباء والسكرتارية** عبر الـ API الحالي.

---

## 1) الأساسيات

| البند | القيمة |
|--------|--------|
| **المسار الأساسي** | `/api/admin/staff` |
| **من يستطيع الوصول؟** | مستخدم بدور **`admin` فقط** |
| **المصادقة** | Header: `Authorization: Bearer <token>` |
| **Content-Type** | `application/json` (ما عدا إن وُجدت ملاحظة أخرى) |

جميع الطرق أدناه محمية بـ `protect` ثم `admin` في `src/routes/staffRoutes.js`.

---

## 2) إضافة طبيب جديد

**الطريقة:** `POST /api/admin/staff`

عند إنشاء طبيب يجب إرسال `role: "doctor"` مع بيانات الملف الطبي في `DoctorProfile`.

### Body (مثال)

```json
{
  "name": "د. أحمد محمد",
  "email": "dr.ahmed@clinic.com",
  "password": "SecurePass123!",
  "role": "doctor",
  "specialty": "جلدية وتجميل",
  "phone": "01012345678",
  "imageUrl": "https://example.com/photos/dr-ahmed.jpg",
  "permissions": []
}
```

### الحقول

| الحقل | مطلوب؟ | ملاحظة |
|--------|--------|--------|
| `name` | نعم | اسم العرض |
| `email` | نعم | فريد في النظام |
| `password` | نعم | يُخزَّن مشفّرًا |
| `role` | اختياري | الافتراضي `secretary`؛ للطبيب أرسل `"doctor"` |
| `specialty` | نعم للطبيب | مطلوب عندما `role === "doctor"` |
| `phone` | نعم للطبيب | رقم هاتف الطبيب (في الملف الطبي) |
| `imageUrl` | لا | رابط صورة اختياري |
| `permissions` | لا | مصفوفة أسماء صلاحيات (اختياري) |

### استجابة نجاح (مختصر)

- كود `201`
- كائن مستخدم **بدون** `password`، مع:
  - `permissions`
  - `doctorProfile` (إن كان الطبيب)

### أخطاء شائعة

- `400` — البريد مستخدم مسبقًا، أو نقص `specialty` / `phone` للطبيب، أو `role` غير مسموح.

---

## 3) إضافة سكرتير (اختياري لنفس المسار)

**الطريقة:** `POST /api/admin/staff`

```json
{
  "name": "السكرتيرة سارة",
  "email": "secretary@clinic.com",
  "password": "SecurePass123!",
  "role": "secretary",
  "permissions": ["manage_online_bookings", "manage_daily_bookings"]
}
```

- إذا لم ترسل `role` يُعتبر الحساب **`secretary`** افتراضيًا في الكود الحالي.

---

## 4) عرض كل الأطباء والسكرتارية

**الطريقة:** `GET /api/admin/staff`

- يعيد مستخدمين بدور واحد من: `secretary`, `doctor`, `staff`
- يتضمن `doctorProfile` للأطباء
- بدون كلمات مرور

> **ملاحظة:** لعرض **قائمة أطباء فقط** (بدون سكرتارية) يمكن استخدام أيضًا `GET /api/doctors` إذا كان المستخدم `admin` أو `secretary` — راجع `MULTI_DOCTOR_SYSTEM_DOC.md`.

---

## 5) عرض مستخدم واحد (طبيب أو سكرتير)

**الطريقة:** `GET /api/admin/staff/:id`

- يعيد نفس الشكل مع `permissions` و`doctorProfile` عند وجودهما.

---

## 6) تعديل طبيب (اسم، بريد، كلمة مرور، ملف طبي)

**الطريقة:** `PUT /api/admin/staff/:id`

### Body (مثال — تعديل طبيب)

```json
{
  "name": "د. أحمد محمد (محدّث)",
  "email": "dr.ahmed.new@clinic.com",
  "password": "NewPassword456!",
  "specialty": "جلدية",
  "phone": "01098765432",
  "imageUrl": "https://example.com/new-photo.jpg",
  "permissions": []
}
```

- يمكن إرسال الحقول **جزئيًا**؛ ما لم يُرسل يُبقى القديم (ما عدا كلمة المرور: تُحدَّث فقط إذا أرسلت `password`).
- للطبيب (`role === "doctor"`): تحديث `specialty`, `phone`, `imageUrl` يُطبَّق على سجل `DoctorProfile` (يُنشأ تلقائيًا إن لم يكن موجودًا).

### قيود

- لا يمكن استخدام هذا المسار لتحديث حساب **`admin`** (يُرفض بـ `403`).

---

## 7) تفعيل / تعطيل حساب (بدون حذف)

**الطريقة:** `PATCH /api/admin/staff/:id/status`

### Body

```json
{
  "isActive": false
}
```

- `true` = تفعيل الدخول
- `false` = منع تسجيل الدخول (الحساب يبقى في قاعدة البيانات)

ينطبق على أدوار: `staff`, `secretary`, `doctor` فقط.

---

## 8) حذف حساب طبيب / سكرتير

**الطريقة:** `DELETE /api/admin/staff/:id`

- يحذف سجل المستخدم من جدول `Users`.
- إذا كان الطبيب مرتبطًا بـ `DoctorProfile`، يعتمد السلوك على إعدادات الـ FK في قاعدة البيانات (غالبًا حذف المستخدم قد يتطلب حذف الملف أولاً أو CASCADE حسب الإعداد).

### قيود

- لا يُستخدم لحذف **`admin`**.

---

## 9) ملخص سريع للأدمن

| الإجراء | الطريقة | المسار |
|---------|---------|--------|
| إضافة طبيب | `POST` | `/api/admin/staff` + `role: "doctor"` + specialty + phone |
| إضافة سكرتير | `POST` | `/api/admin/staff` + `role: "secretary"` (أو الافتراضي) |
| قائمة الجميع | `GET` | `/api/admin/staff` |
| تفاصيل واحد | `GET` | `/api/admin/staff/:id` |
| تعديل | `PUT` | `/api/admin/staff/:id` |
| تفعيل/تعطيل | `PATCH` | `/api/admin/staff/:id/status` |
| حذف | `DELETE` | `/api/admin/staff/:id` |

---

## 10) ملفات الكود المرجعية

- `src/routes/staffRoutes.js` — تعريف المسارات والحماية (Admin فقط).
- `src/controllers/staffController.js` — منطق الإنشاء، التحديث، الحذف، وربط `DoctorProfile`.

---

## 11) اختبار سريع (curl)

استبدل `TOKEN` و`BASE`:

```bash
curl -X POST "http://localhost:8000/api/admin/staff" ^
  -H "Authorization: Bearer TOKEN" ^
  -H "Content-Type: application/json" ^
  -d "{\"name\":\"د. تجربة\",\"email\":\"test.dr@clinic.com\",\"password\":\"Pass123!\",\"role\":\"doctor\",\"specialty\":\"باطنة\",\"phone\":\"01000000000\"}"
```

(على Linux/mac استخدم `-H` و `-d` بنفس الشكل بدون `^`.)
