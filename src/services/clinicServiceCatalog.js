const { Op } = require('sequelize');
const ClinicService = require('../models/clinicService');
const { CLINIC_PROCEDURE_TYPES } = require('../constants/clinicProcedureTypes');

const DEFAULT_FOLLOWUP_NAMES = new Set(['إعادة', 'متابعة']);

async function seedDefaultClinicServices() {
    const count = await ClinicService.count();
    if (count > 0) return;

    const rows = CLINIC_PROCEDURE_TYPES.map((name, index) => ({
        name,
        sortOrder: index,
        treatAsFollowup: DEFAULT_FOLLOWUP_NAMES.has(name),
        isActive: true
    }));

    await ClinicService.bulkCreate(rows, { ignoreDuplicates: true });
    console.log('✅ Default clinic services seeded.');
}

async function getActiveServiceNames() {
    const rows = await ClinicService.findAll({
        where: { isActive: true },
        attributes: ['name'],
        order: [
            ['sortOrder', 'ASC'],
            ['name', 'ASC']
        ]
    });
    return rows.map((r) => r.name);
}

async function getFollowupServiceNames() {
    const rows = await ClinicService.findAll({
        where: { isActive: true, treatAsFollowup: true },
        attributes: ['name']
    });
    return rows.map((r) => r.name);
}

async function listServices({ includeInactive = false } = {}) {
    const where = includeInactive ? {} : { isActive: true };
    return ClinicService.findAll({
        where,
        order: [
            ['sortOrder', 'ASC'],
            ['name', 'ASC']
        ]
    });
}

async function createService({ name, treatAsFollowup = false, sortOrder }) {
    const trimmed = String(name || '').trim();
    if (!trimmed) {
        const err = new Error('Service name is required.');
        err.code = 'VALIDATION';
        throw err;
    }

    const existing = await ClinicService.findOne({ where: { name: trimmed } });
    if (existing) {
        const err = new Error('A service with this name already exists.');
        err.code = 'DUPLICATE';
        throw err;
    }

    let order = sortOrder;
    if (order === undefined || order === null) {
        const max = await ClinicService.max('sortOrder');
        order = (max ?? -1) + 1;
    }

    return ClinicService.create({
        name: trimmed,
        treatAsFollowup: !!treatAsFollowup,
        sortOrder: Number(order) || 0,
        isActive: true
    });
}

async function updateService(id, { name, treatAsFollowup, sortOrder, isActive }) {
    const service = await ClinicService.findByPk(id);
    if (!service) {
        const err = new Error('Service not found.');
        err.code = 'NOT_FOUND';
        throw err;
    }

    if (name !== undefined) {
        const trimmed = String(name).trim();
        if (!trimmed) {
            const err = new Error('Service name cannot be empty.');
            err.code = 'VALIDATION';
            throw err;
        }
        const duplicate = await ClinicService.findOne({
            where: { name: trimmed, id: { [Op.ne]: id } }
        });
        if (duplicate) {
            const err = new Error('A service with this name already exists.');
            err.code = 'DUPLICATE';
            throw err;
        }
        service.name = trimmed;
    }

    if (treatAsFollowup !== undefined) service.treatAsFollowup = !!treatAsFollowup;
    if (sortOrder !== undefined) service.sortOrder = Number(sortOrder) || 0;
    if (isActive !== undefined) service.isActive = !!isActive;

    await service.save();
    return service;
}

async function deactivateService(id) {
    return updateService(id, { isActive: false });
}

module.exports = {
    seedDefaultClinicServices,
    getActiveServiceNames,
    getFollowupServiceNames,
    listServices,
    createService,
    updateService,
    deactivateService
};
