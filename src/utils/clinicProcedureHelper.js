const { CLINIC_PROCEDURE_TYPES } = require('../constants/clinicProcedureTypes');

const LEGACY_VISIT_TYPES = ['checkup', 'followup', 'consultation'];

/** أنواع تُعامل كإعادة/متابعة في visitType = followup */
const FOLLOWUP_ALIASES = new Set(['إعادة', 'متابعة', 'followup']);

function normalizeProcedureLabel(item) {
    const s = String(item).trim();
    if (!s) return s;
    const lower = s.toLowerCase();
    if (lower === 'followup' || lower === 'follow-up') return 'إعادة';
    if (s === 'متابعة') return 'متابعة';
    return s;
}

function isFollowupType(label, extraFollowupNames = []) {
    const s = String(label).trim();
    if (FOLLOWUP_ALIASES.has(s)) return true;
    if (extraFollowupNames.includes(s)) return true;
    return s.toLowerCase() === 'followup' || s.toLowerCase() === 'follow-up';
}

function normalizePhone(phone) {
    return String(phone || '').replace(/\D/g, '');
}

/**
 * استخراج قائمة الخدمات من الجسم: visitTypes | procedureTypes | services | visitType (مفرد أو مصفوفة).
 */
function parseProcedureTypesFromBody(body) {
    const raw =
        body.visitTypes ??
        body.procedureTypes ??
        body.services ??
        (body.visitType !== undefined && body.visitType !== null && body.visitType !== ''
            ? body.visitType
            : undefined);

    if (raw === undefined || raw === null || raw === '') return [];

    const list = Array.isArray(raw) ? raw : [raw];
    const normalized = [];
    for (const item of list) {
        const s = normalizeProcedureLabel(item);
        if (!s) continue;
        if (!normalized.includes(s)) normalized.push(s);
    }
    return normalized;
}

function validateProcedureTypes(types, allowedClinicServices = null) {
    const allowed = allowedClinicServices && allowedClinicServices.length > 0
        ? allowedClinicServices
        : CLINIC_PROCEDURE_TYPES;
    const invalid = types.filter((t) => !allowed.includes(t) && !LEGACY_VISIT_TYPES.includes(t));
    if (invalid.length > 0) {
        return {
            valid: false,
            message: 'Invalid visitType/procedure. Choose from active clinic services.',
            invalid,
            allowedVisitTypes: [...LEGACY_VISIT_TYPES, ...allowed]
        };
    }
    return { valid: true };
}

function resolveLegacyVisitEnum(procedureTypes, extraFollowupNames = []) {
    if (procedureTypes.some((t) => isFollowupType(t, extraFollowupNames))) return 'followup';
    if (procedureTypes.includes('consultation') || procedureTypes.includes('استشارة')) return 'consultation';
    return 'checkup';
}

/** procedureType نصي للتوافق مع العملاء القدامى */
function procedureTypesToLegacyString(procedureTypes) {
    if (!procedureTypes || procedureTypes.length === 0) return null;
    return procedureTypes.join('، ');
}

function enrichBookingProcedures(plain) {
    const types = Array.isArray(plain.procedureTypes) && plain.procedureTypes.length > 0
        ? plain.procedureTypes
        : (plain.procedureType ? [plain.procedureType] : []);
    return {
        ...plain,
        procedureTypes: types,
        procedureType: plain.procedureType || procedureTypesToLegacyString(types)
    };
}

module.exports = {
    CLINIC_PROCEDURE_TYPES,
    LEGACY_VISIT_TYPES,
    FOLLOWUP_ALIASES,
    isFollowupType,
    normalizePhone,
    parseProcedureTypesFromBody,
    validateProcedureTypes,
    resolveLegacyVisitEnum,
    procedureTypesToLegacyString,
    enrichBookingProcedures
};
