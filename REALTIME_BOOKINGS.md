# تحديث قائمة الحجوزات بدون ريفرش (Socket.io)

عند أي تغيير يؤثر على قائمة **`GET /api/bookings/all`** (إنشاء، تعديل، إلغاء، تغيير حالة، كشف، إلخ)، السيرفر يبث حدثًا على **Socket.io** حتى يعيد الفرونت جلب القائمة أو يدمج التحديث.

---

## 1) عنوان الاتصال

- نفس خادم الـ API: مثال `http://localhost:8000`
- بروتوكول WebSocket (مكتبة `socket.io-client` على الفرونت)

```bash
npm install socket.io-client
```

---

## 2) الاشتراك في يوم واحد

بعد الاتصال، أرسل:

```js
socket.emit('bookings:subscribe', '2026-04-02');
```

للغاء الاشتراك:

```js
socket.emit('bookings:unsubscribe', '2026-04-02');
```

---

## 3) الاشتراك في نطاق تواريخ (مثل `startDate` / `endDate` / `date`)

```js
socket.emit('bookings:subscribeRange', {
  startDate: '2026-04-02',
  endDate: '2026-04-02'
});
```

لنفس اليوم يُمرَّر `startDate` و`endDate` متساويين. الحد الأقصى **62 يومًا** لكل نطاق.

إلغاء:

```js
socket.emit('bookings:unsubscribeRange', {
  startDate: '2026-04-02',
  endDate: '2026-04-02'
});
```

---

## 4) استقبال التحديثات

استمع للحدث:

```js
socket.on('bookings:updated', (payload) => {
  // payload.action === 'bookingChanged'
  // payload.change: 'created' | 'updated' | 'statusChanged' | 'cancelled' | 'examinationStatus' | ...
  // payload.booking: كائن الحجز
  // عند حدوث أي حدث: أعد طلب GET /api/bookings/all بنفس الفلاتر الحالية
});
```

**مثال React (مختصر):**

```js
import { io } from 'socket.io-client';

const socket = io(API_BASE_URL, { transports: ['websocket'] });

socket.emit('bookings:subscribeRange', {
  startDate: '2026-04-02',
  endDate: '2026-04-02'
});

socket.on('bookings:updated', (payload) => {
  if (payload.action === 'bookingChanged') {
    refetchBookings(); // نفس استدعاء GET /api/bookings/all
  }
});
```

---

## 5) متى يُرسل السيرفر الحدث؟

بعد نجاح العمليات على الحجز (مثل):

- إنشاء حجز عيادة | تأكيد/تعديل حالة أونلاين | تعديل حجز | إلغاء
- تغيير حالة الكشف (`examinationStatus`)
- حجز/إلغاء حجز بالسلوت (`/api/bookings/slots`)

**ملاحظة:** طلب حجز أونلاين جديد **بدون موعد** (`pending`) لا يملك `appointmentDate` في الغالب؛ لن يُبث حدث لغرفة يوم حتى يُحدَّد موعد أو يُؤكَّد الحجز.

---

## 6) المصادقة

اتصال Socket.io الحالي **لا يمرّر JWT**؛ أي عميل متصل يشترك في الغرف. إذا احتجت لاحقًا حماية أقوى (مثلاً فقط للمستخدمين المسجلين)، يمكن توسيع `server.js` بـ `socket.handshake.auth`.
