const { Booking, PatientReport, ReportMedication } = require('../models/index');
const cloudinary = require('../config/cloudinary');

const reportInclude = [
    { model: ReportMedication, as: 'medications', attributes: ['id', 'medicationName', 'dosage', 'frequency', 'notes'] }
];

/**
 * مساعد: حذف صورة قديمة من Cloudinary لو موجودة
 */
async function deleteOldImage(publicId) {
    if (!publicId) return;
    try {
        await cloudinary.uploader.destroy(publicId, { resource_type: 'image' });
    } catch {
        // الحذف فشل — مش مشكلة، مش هنوقف العملية
    }
}

/**
 * مساعد: parse medications من JSON string أو array
 */
function parseMedications(raw) {
    if (!raw) return null;
    if (Array.isArray(raw)) return raw;
    try { return JSON.parse(raw); } catch { return null; }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/bookings/:id/report
// إنشاء تقرير جديد لحجز معين (يمكن إضافة أكثر من تقرير لنفس الحجز)
// Content-Type: multipart/form-data
// Fields: medicalCondition?, notes?, medications? (JSON string), prescription? (file)
// ─────────────────────────────────────────────────────────────────────────────
exports.createReport = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { medicalCondition, notes, medications: medicationsRaw } = req.body;

        const booking = await Booking.findByPk(id);
        if (!booking) {
            if (req.file?.filename) await cloudinary.uploader.destroy(req.file.filename);
            return res.status(404).json({ message: 'Booking not found.' });
        }

        const prescriptionImageUrl = req.file?.path || null;
        const prescriptionPublicId = req.file?.filename || null;

        const report = await PatientReport.create({
            bookingId: id,
            medicalCondition: medicalCondition || null,
            notes: notes || null,
            prescriptionImageUrl,
            prescriptionPublicId
        });

        const medications = parseMedications(medicationsRaw);
        if (Array.isArray(medications) && medications.length > 0) {
            const toCreate = medications
                .filter(m => m && (m.medicationName || m.medication_name))
                .map(m => ({
                    reportId: report.id,
                    medicationName: m.medicationName || m.medication_name || '',
                    dosage: m.dosage || null,
                    frequency: m.frequency || null,
                    notes: m.notes || null
                }));
            await ReportMedication.bulkCreate(toCreate);
        }

        await report.reload({ include: reportInclude });
        res.status(201).json({ message: 'Report created successfully.', report });
    } catch (error) {
        next(error);
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/bookings/:id/reports
// جلب كل التقارير الخاصة بحجز معين (مرتبة من الأحدث للأقدم)
// ─────────────────────────────────────────────────────────────────────────────
exports.getReports = async (req, res, next) => {
    try {
        const { id } = req.params;

        const booking = await Booking.findByPk(id);
        if (!booking) return res.status(404).json({ message: 'Booking not found.' });

        const reports = await PatientReport.findAll({
            where: { bookingId: id },
            include: reportInclude,
            order: [['createdAt', 'DESC']]
        });

        res.status(200).json({ total: reports.length, reports });
    } catch (error) {
        next(error);
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/bookings/:id/reports/:reportId
// جلب تقرير محدد بالـ ID
// ─────────────────────────────────────────────────────────────────────────────
exports.getReport = async (req, res, next) => {
    try {
        const { id, reportId } = req.params;

        const report = await PatientReport.findOne({
            where: { id: reportId, bookingId: id },
            include: reportInclude
        });

        if (!report) return res.status(404).json({ message: 'Report not found.' });

        res.status(200).json({ report });
    } catch (error) {
        next(error);
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/bookings/:id/reports/:reportId
// تعديل تقرير محدد (نص + أدوية + صورة)
// Content-Type: multipart/form-data
// ─────────────────────────────────────────────────────────────────────────────
exports.updateReport = async (req, res, next) => {
    try {
        const { id, reportId } = req.params;
        const { medicalCondition, notes, medications: medicationsRaw } = req.body;

        const report = await PatientReport.findOne({
            where: { id: reportId, bookingId: id },
            include: reportInclude
        });

        if (!report) {
            if (req.file?.filename) await cloudinary.uploader.destroy(req.file.filename);
            return res.status(404).json({ message: 'Report not found.' });
        }

        if (medicalCondition !== undefined) report.medicalCondition = medicalCondition;
        if (notes !== undefined) report.notes = notes;

        // لو في صورة جديدة → احذف القديمة وحط الجديدة
        if (req.file) {
            await deleteOldImage(report.prescriptionPublicId);
            report.prescriptionImageUrl = req.file.path;
            report.prescriptionPublicId = req.file.filename;
        }

        await report.save();

        const medications = parseMedications(medicationsRaw);
        if (Array.isArray(medications)) {
            await ReportMedication.destroy({ where: { reportId: report.id } });
            if (medications.length > 0) {
                const toCreate = medications
                    .filter(m => m && (m.medicationName || m.medication_name))
                    .map(m => ({
                        reportId: report.id,
                        medicationName: m.medicationName || m.medication_name || '',
                        dosage: m.dosage || null,
                        frequency: m.frequency || null,
                        notes: m.notes || null
                    }));
                await ReportMedication.bulkCreate(toCreate);
            }
        }

        await report.reload({ include: reportInclude });
        res.status(200).json({ message: 'Report updated successfully.', report });
    } catch (error) {
        next(error);
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/bookings/:id/reports/:reportId
// حذف تقرير كامل (مع صورته من Cloudinary)
// ─────────────────────────────────────────────────────────────────────────────
exports.deleteReport = async (req, res, next) => {
    try {
        const { id, reportId } = req.params;

        const report = await PatientReport.findOne({ where: { id: reportId, bookingId: id } });
        if (!report) return res.status(404).json({ message: 'Report not found.' });

        await deleteOldImage(report.prescriptionPublicId);
        await ReportMedication.destroy({ where: { reportId: report.id } });
        await report.destroy();

        res.status(200).json({ message: 'Report deleted successfully.' });
    } catch (error) {
        next(error);
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/bookings/:id/reports/:reportId/prescription
// حذف صورة الروشتة فقط (التقرير يفضل)
// ─────────────────────────────────────────────────────────────────────────────
exports.deletePrescriptionImage = async (req, res, next) => {
    try {
        const { id, reportId } = req.params;

        const report = await PatientReport.findOne({ where: { id: reportId, bookingId: id } });
        if (!report) return res.status(404).json({ message: 'Report not found.' });

        if (!report.prescriptionImageUrl) {
            return res.status(404).json({ message: 'No prescription image found for this report.' });
        }

        await deleteOldImage(report.prescriptionPublicId);
        report.prescriptionImageUrl = null;
        report.prescriptionPublicId = null;
        await report.save();

        res.status(200).json({ message: 'Prescription image deleted successfully.' });
    } catch (error) {
        next(error);
    }
};
