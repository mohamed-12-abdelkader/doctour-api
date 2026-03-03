const { Notification, User, Permission } = require('../models/index');

/**
 * إنشاء إشعار جديد لجميع الأدمن والستاف المخولين
 * يُستدعى بعد إنشاء حجز أونلاين جديد
 */
async function notifyNewOnlineBooking(booking) {
    const { id, customerName, customerPhone, preferredDate, preferredTime } = booking;

    const dateLabel = preferredDate || 'غير محدد';
    const timeLabel = preferredTime || 'غير محدد';

    const title = '📅 حجز أونلاين جديد';
    const message = `طلب حجز جديد من ${customerName} — رقم الهاتف: ${customerPhone} — التاريخ المطلوب: ${dateLabel} — الوقت: ${timeLabel}`;
    const data = {
        bookingId: id,
        patientName: customerName,
        patientPhone: customerPhone,
        preferredDate: dateLabel,
        preferredTime: timeLabel
    };

    // 1️⃣ إشعار عام للأدمن
    await Notification.create({
        type: 'new_online_booking',
        title,
        message,
        data,
        targetRole: 'admin',
        isRead: false
    });

    // 2️⃣ إشعار لكل ستاف عنده صلاحية manage_online_bookings أو manage_daily_bookings
    const staffWithPermission = await User.findAll({
        where: { role: 'staff', isActive: true },
        include: [{
            model: Permission,
            as: 'permissions',
            where: { name: ['manage_online_bookings', 'manage_daily_bookings'] },
            required: true
        }]
    });

    if (staffWithPermission.length > 0) {
        const staffNotifications = staffWithPermission.map(user => ({
            type: 'new_online_booking',
            title,
            message,
            data,
            targetUserId: user.id,
            targetRole: null,
            isRead: false
        }));
        await Notification.bulkCreate(staffNotifications);
    }
}

/**
 * إنشاء إشعار عند تأكيد أو رفض حجز
 */
async function notifyBookingStatusChange(booking, newStatus) {
    const typeMap = {
        confirmed: 'booking_confirmed',
        rejected: 'booking_rejected',
        cancelled: 'booking_cancelled'
    };
    const type = typeMap[newStatus];
    if (!type) return;

    await Notification.create({
        type,
        title: newStatus === 'confirmed' ? '✅ تم تأكيد الحجز' : newStatus === 'rejected' ? '❌ تم رفض الحجز' : '🚫 تم إلغاء الحجز',
        message: `حجز ${booking.customerName} (${booking.customerPhone}) — الحالة الجديدة: ${newStatus}`,
        data: { bookingId: booking.id, patientName: booking.customerName, status: newStatus },
        targetRole: 'admin',
        isRead: false
    });
}

module.exports = { notifyNewOnlineBooking, notifyBookingStatusChange };
