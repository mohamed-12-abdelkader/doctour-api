const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cloudinary = require('../config/cloudinary');

/**
 * Multer storage → رفع مباشر على Cloudinary في مجلد prescriptions/
 * يقبل: JPEG, PNG, WEBP, PDF
 * الحجم الأقصى: 5MB
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
    limits: { fileSize: 5 * 1024 * 1024 }  // 5MB
});

module.exports = upload;
