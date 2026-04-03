const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cloudinary = require('../config/cloudinary');

/** حجم أقصى للملف (MB) — يُضبط من .env: MAX_PRESCRIPTION_FILE_MB (افتراضي 25) */
const MAX_FILE_MB = Math.min(
    100,
    Math.max(1, parseInt(process.env.MAX_PRESCRIPTION_FILE_MB || '25', 10) || 25)
);
const MAX_FILE_BYTES = MAX_FILE_MB * 1024 * 1024;

/**
 * Multer storage → رفع مباشر على Cloudinary في مجلد prescriptions/
 * يقبل: JPEG, PNG, WEBP, PDF
 * الحجم الأقصى: انظر MAX_FILE_MB / MAX_PRESCRIPTION_FILE_MB
 */
const storage = new CloudinaryStorage({
    cloudinary,
    params: async (req, file) => ({
        folder: 'doctor-api/prescriptions',
        resource_type: 'auto',           // صور + PDF
        allowed_formats: ['jpg', 'jpeg', 'png', 'webp', 'pdf'],
        transformation: [{ quality: 'auto', fetch_format: 'auto' }]
    })
});

const fileFilter = (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    if (allowed.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('نوع الملف غير مسموح. استخدم: JPEG, PNG, WEBP, PDF / File type not allowed. Use: JPEG, PNG, WEBP, or PDF.'), false);
    }
};

const upload = multer({
    storage,
    fileFilter,
    limits: { fileSize: MAX_FILE_BYTES }
});

module.exports = upload;
module.exports.MAX_PRESCRIPTION_FILE_MB = MAX_FILE_MB;
