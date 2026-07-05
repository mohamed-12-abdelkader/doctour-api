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

function toServicePrice(raw) {
    if (raw === undefined || raw === null || raw === '') return null;
    const value = Number(raw);
    return Number.isFinite(value) && value >= 0 ? Math.round(value * 100) / 100 : NaN;
}

function parseServiceItem(entry, priceMap = {}) {
    if (typeof entry === 'string' || typeof entry === 'number') {
        const name = normalizeProcedureLabel(entry);
        if (!name) return null;
        const mappedPrice = toServicePrice(priceMap[name]);
        return { name, price: mappedPrice };
    }

    if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
        const name = normalizeProcedureLabel(
            entry.name ?? entry.service ?? entry.procedureType ?? entry.label ?? entry.title
        );
        if (!name) return null;

        const rawPrice = entry.price ?? entry.amount ?? entry.value ?? priceMap[name];
        const price = toServicePrice(rawPrice);
        if (Number.isNaN(price)) {
            return { valid: false, message: `Invalid price for service "${name}".` };
        }
        return { name, price };
    }

    return null;
}

function dedupeServiceItems(items) {
    const seen = new Set();
    const result = [];
    for (const item of items) {
        if (!item || seen.has(item.name)) continue;
        seen.add(item.name);
        result.push(item);
    }
    return result;
}

/**
 * استخراج الخدمات مع الأسعار من الجسم.
 * يدعم: serviceItems | services[{name,price}] | procedureTypes[{name,price}] | procedureTypes[] + servicePrices{}
 */
function parseServiceItemsFromBody(body) {
    const priceMap = body.servicePrices ?? body.prices ?? {};
    const raw =
        body.serviceItems ??
        body.services ??
        body.procedureTypes ??
        body.visitTypes ??
        (body.visitType !== undefined && body.visitType !== null && body.visitType !== ''
            ? body.visitType
            : undefined);

    if (raw === undefined || raw === null || raw === '') return [];

    const list = Array.isArray(raw) ? raw : [raw];
    const items = [];

    for (const entry of list) {
        const parsed = parseServiceItem(entry, priceMap);
        if (!parsed) continue;
        if (parsed.valid === false) return parsed;
        items.push(parsed);
    }

    return dedupeServiceItems(items);
}

/**
 * استخراج قائمة أسماء الخدمات فقط (للتوافق مع الكود القديم).
 */
function parseProcedureTypesFromBody(body) {
    const parsed = parseServiceItemsFromBody(body);
    if (parsed.valid === false) return [];
    return parsed.map((item) => item.name);
}

function sumServicePrices(items) {
    if (!Array.isArray(items) || items.length === 0) return 0;
    return Math.round(items.reduce((sum, item) => sum + (item.price ?? 0), 0) * 100) / 100;
}

function serviceItemsToStorage(items) {
    if (!Array.isArray(items) || items.length === 0) return null;
    const hasPrice = items.some((item) => item.price !== null && item.price !== undefined);
    if (!hasPrice) return items.map((item) => item.name);
    return items.map((item) => ({
        name: item.name,
        price: item.price ?? 0
    }));
}

function normalizeStoredProcedureTypes(rawProcedureTypes, legacyProcedureType = null) {
    if (Array.isArray(rawProcedureTypes) && rawProcedureTypes.length > 0) {
        const items = [];
        for (const entry of rawProcedureTypes) {
            const parsed = parseServiceItem(entry);
            if (parsed && parsed.valid !== false) items.push(parsed);
        }
        if (items.length > 0) return dedupeServiceItems(items);
    }

    if (legacyProcedureType) {
        return legacyProcedureType
            .split('،')
            .map((part) => normalizeProcedureLabel(part))
            .filter(Boolean)
            .map((name) => ({ name, price: null }));
    }

    return [];
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
    const serviceItems = normalizeStoredProcedureTypes(plain.procedureTypes, plain.procedureType);
    const names = serviceItems.map((item) => item.name);
    const servicesTotal = sumServicePrices(serviceItems);
    return {
        ...plain,
        serviceItems,
        servicesTotal: servicesTotal > 0 ? servicesTotal : null,
        procedureTypes: names,
        procedureType: plain.procedureType || procedureTypesToLegacyString(names)
    };
}

module.exports = {
    CLINIC_PROCEDURE_TYPES,
    LEGACY_VISIT_TYPES,
    FOLLOWUP_ALIASES,
    isFollowupType,
    normalizePhone,
    parseProcedureTypesFromBody,
    parseServiceItemsFromBody,
    sumServicePrices,
    serviceItemsToStorage,
    normalizeStoredProcedureTypes,
    validateProcedureTypes,
    resolveLegacyVisitEnum,
    procedureTypesToLegacyString,
    enrichBookingProcedures
};
