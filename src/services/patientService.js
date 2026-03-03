const { Patient } = require('../models/index');

async function findOrCreateByPhone(name, phone, email = null) {
    const trimmedPhone = String(phone).trim();
    let patient = await Patient.findOne({ where: { phone: trimmedPhone } });
    if (patient) {
        if (name && patient.name !== name) {
            patient.name = name;
            await patient.save();
        }
        if (email != null) {
            patient.email = email;
            await patient.save();
        }
        return patient;
    }
    patient = await Patient.create({
        name: String(name || '').trim() || 'مريض',
        phone: trimmedPhone,
        email: email ? String(email).trim() : null
    });
    return patient;
}

async function getById(id) {
    return Patient.findByPk(id);
}

module.exports = {
    findOrCreateByPhone,
    getById
};
