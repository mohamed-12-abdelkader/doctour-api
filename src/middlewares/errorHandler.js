const multer = require('multer');

const maxPrescriptionMb = Math.min(
    100,
    Math.max(1, parseInt(process.env.MAX_PRESCRIPTION_FILE_MB || '25', 10) || 25)
);

const errorHandler = (err, req, res, next) => {
    // ─── Multer Errors ───────────────────────────────────────────────
    if (err instanceof multer.MulterError) {
        const multerMessages = {
            LIMIT_FILE_SIZE: `حجم الملف كبير جداً — الحد الأقصى ${maxPrescriptionMb}MB. / File too large. Max size is ${maxPrescriptionMb}MB.`,
            LIMIT_UNEXPECTED_FILE: `اسم الـ field غير صحيح — استخدم اسم الـ field: "prescription". / Unexpected field name. Use field name: "prescription".`,
            LIMIT_FILE_COUNT: 'تم تجاوز عدد الملفات المسموح. / Too many files.',
            LIMIT_FIELD_KEY: 'اسم الـ field طويل جداً. / Field name too long.',
        };
        return res.status(400).json({
            status: 'error',
            statusCode: 400,
            message: multerMessages[err.code] || `Multer error: ${err.message}`,
            hint: err.code === 'LIMIT_UNEXPECTED_FILE'
                ? 'في Postman: Body → form-data → غير نوع الـ field لـ File واسمه لازم يكون "prescription" بالظبط'
                : undefined
        });
    }

    // ─── fileFilter Rejection (نوع ملف غير مسموح) ───────────────────
    if (err.message && err.message.includes('File type not allowed')) {
        return res.status(400).json({
            status: 'error',
            statusCode: 400,
            message: err.message
        });
    }

    // ─── Generic Error ────────────────────────────────────────────────
    console.error(err.stack);
    const statusCode = err.statusCode || 500;
    const message = err.message || 'Internal Server Error';
    res.status(statusCode).json({ status: 'error', statusCode, message });
};

module.exports = errorHandler;

