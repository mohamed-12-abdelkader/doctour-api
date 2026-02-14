const { Booking, PatientReport, ReportMedication } = require('../models/index');

const reportInclude = [
    { model: ReportMedication, as: 'medications', attributes: ['id', 'medicationName', 'dosage', 'frequency', 'notes'] }
];

// Admin only: Create report for a booking (visit)
exports.createReport = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { medicalCondition, notes, medications } = req.body;

        const booking = await Booking.findByPk(id);
        if (!booking) {
            return res.status(404).json({ message: 'Booking not found.' });
        }

        const existing = await PatientReport.findOne({ where: { bookingId: id } });
        if (existing) {
            return res.status(409).json({
                message: 'Report already exists for this visit. Use PUT to update.',
                report: existing
            });
        }

        const report = await PatientReport.create({
            bookingId: id,
            medicalCondition: medicalCondition || null,
            notes: notes || null
        });

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
        res.status(201).json({
            message: 'Report created successfully.',
            report
        });
    } catch (error) {
        next(error);
    }
};

// Admin only: Get report for a booking (with medications)
exports.getReport = async (req, res, next) => {
    try {
        const { id } = req.params;

        const booking = await Booking.findByPk(id);
        if (!booking) {
            return res.status(404).json({ message: 'Booking not found.' });
        }

        const report = await PatientReport.findOne({
            where: { bookingId: id },
            include: reportInclude
        });

        if (!report) {
            return res.status(404).json({ message: 'No report found for this visit.' });
        }

        res.status(200).json({ report });
    } catch (error) {
        next(error);
    }
};

// Admin only: Update report for a booking
exports.updateReport = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { medicalCondition, notes, medications } = req.body;

        const booking = await Booking.findByPk(id);
        if (!booking) {
            return res.status(404).json({ message: 'Booking not found.' });
        }

        let report = await PatientReport.findOne({ where: { bookingId: id }, include: reportInclude });
        if (!report) {
            return res.status(404).json({ message: 'No report found for this visit. Use POST to create.' });
        }

        if (medicalCondition !== undefined) report.medicalCondition = medicalCondition;
        if (notes !== undefined) report.notes = notes;
        await report.save();

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
        res.status(200).json({
            message: 'Report updated successfully.',
            report
        });
    } catch (error) {
        next(error);
    }
};
