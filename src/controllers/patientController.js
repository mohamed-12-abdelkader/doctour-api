const patientService = require('../services/patientService');

/**
 * POST /api/patients
 * Body: { name, phone, email? }
 * Find patient by phone or create. Returns patient (for use as patientId in slot booking).
 */
exports.findOrCreate = async (req, res, next) => {
    try {
        const { name, phone, email } = req.body || {};
        if (!phone || String(phone).trim() === '') {
            return res.status(400).json({ message: 'رقم الهاتف مطلوب' });
        }
        const patient = await patientService.findOrCreateByPhone(name, phone, email);
        res.status(200).json({ patient });
    } catch (err) {
        next(err);
    }
};
