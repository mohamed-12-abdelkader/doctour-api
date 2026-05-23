const {
    listServices,
    createService,
    updateService,
    deactivateService
} = require('../services/clinicServiceCatalog');
const { LEGACY_VISIT_TYPES } = require('../utils/clinicProcedureHelper');

exports.listActiveServices = async (req, res, next) => {
    try {
        const services = await listServices({ includeInactive: false });
        res.status(200).json({
            services,
            legacyVisitTypes: LEGACY_VISIT_TYPES
        });
    } catch (error) {
        next(error);
    }
};

exports.listAllServicesAdmin = async (req, res, next) => {
    try {
        const services = await listServices({ includeInactive: true });
        res.status(200).json({ services });
    } catch (error) {
        next(error);
    }
};

exports.createClinicService = async (req, res, next) => {
    try {
        const { name, treatAsFollowup, sortOrder } = req.body;
        const service = await createService({ name, treatAsFollowup, sortOrder });
        res.status(201).json({
            message: 'Clinic service created successfully.',
            service
        });
    } catch (error) {
        if (error.code === 'VALIDATION') {
            return res.status(400).json({ message: error.message });
        }
        if (error.code === 'DUPLICATE') {
            return res.status(409).json({ message: error.message });
        }
        next(error);
    }
};

exports.updateClinicService = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { name, treatAsFollowup, sortOrder, isActive } = req.body;
        const service = await updateService(id, { name, treatAsFollowup, sortOrder, isActive });
        res.status(200).json({
            message: 'Clinic service updated successfully.',
            service
        });
    } catch (error) {
        if (error.code === 'NOT_FOUND') {
            return res.status(404).json({ message: error.message });
        }
        if (error.code === 'VALIDATION') {
            return res.status(400).json({ message: error.message });
        }
        if (error.code === 'DUPLICATE') {
            return res.status(409).json({ message: error.message });
        }
        next(error);
    }
};

exports.deleteClinicService = async (req, res, next) => {
    try {
        const { id } = req.params;
        const service = await deactivateService(id);
        res.status(200).json({
            message: 'Clinic service deactivated.',
            service
        });
    } catch (error) {
        if (error.code === 'NOT_FOUND') {
            return res.status(404).json({ message: error.message });
        }
        next(error);
    }
};
