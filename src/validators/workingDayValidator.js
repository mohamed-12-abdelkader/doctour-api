/**
 * Validation for working day payloads.
 * Returns { error: string } or null if valid.
 */

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const TIME_REGEX = /^\d{1,2}:\d{2}$/;

function parseTime(s) {
    if (!s || typeof s !== 'string') return null;
    const m = s.trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return null;
    const h = parseInt(m[1], 10);
    const min = parseInt(m[2], 10);
    if (h < 0 || h > 23 || min < 0 || min > 59) return null;
    return h * 60 + min;
}

function validateSetWorkingHours(body) {
    const { date, startTime, endTime } = body || {};
    if (!date || !DATE_REGEX.test(String(date).trim())) {
        return { error: 'التاريخ مطلوب بصيغة YYYY-MM-DD' };
    }
    if (!startTime || !TIME_REGEX.test(String(startTime).trim())) {
        return { error: 'وقت البداية مطلوب بصيغة HH:mm' };
    }
    if (!endTime || !TIME_REGEX.test(String(endTime).trim())) {
        return { error: 'وقت النهاية مطلوب بصيغة HH:mm' };
    }
    const start = parseTime(startTime);
    const end = parseTime(endTime);
    if (start == null || end == null) {
        return { error: 'وقت البداية أو النهاية غير صحيح' };
    }
    if (start >= end) {
        return { error: 'وقت النهاية يجب أن يكون بعد وقت البداية' };
    }
    return null;
}

function validateUpdateWorkingHours(body) {
    const allowed = ['date', 'startTime', 'endTime', 'isActive'];
    const keys = Object.keys(body || {});
    const invalid = keys.filter(k => !allowed.includes(k));
    if (invalid.length) {
        return { error: 'حقول غير مسموحة: ' + invalid.join(', ') };
    }
    if (body.startTime != null && !TIME_REGEX.test(String(body.startTime).trim())) {
        return { error: 'وقت البداية بصيغة HH:mm' };
    }
    if (body.endTime != null && !TIME_REGEX.test(String(body.endTime).trim())) {
        return { error: 'وقت النهاية بصيغة HH:mm' };
    }
    if (body.date != null && !DATE_REGEX.test(String(body.date).trim())) {
        return { error: 'التاريخ بصيغة YYYY-MM-DD' };
    }
    return null;
}

module.exports = {
    validateSetWorkingHours,
    validateUpdateWorkingHours
};
