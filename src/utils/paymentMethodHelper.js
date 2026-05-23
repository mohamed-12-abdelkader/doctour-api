const { PAYMENT_METHODS, PAYMENT_METHOD_LABELS } = require('../constants/paymentMethods');

const ALIASES = {
    visa: 'visa',
    فيزا: 'visa',
    'visa card': 'visa',
    card: 'visa',
    cash: 'cash',
    نقدي: 'cash',
    نقد: 'cash',
    'نقدى': 'cash',
    vodafone_cash: 'vodafone_cash',
    'vodafone cash': 'vodafone_cash',
    vodafone: 'vodafone_cash',
    'فودافون كاش': 'vodafone_cash',
    'فودافون': 'vodafone_cash',
    instapay: 'instapay',
    'insta pay': 'instapay',
    insta_pay: 'instapay',
    'انستا باي': 'instapay',
    'انستاباي': 'instapay',
    'إنستا باي': 'instapay'
};

function normalizePaymentMethod(raw) {
    if (raw === undefined || raw === null || raw === '') return null;
    const trimmed = String(raw).trim();
    if (ALIASES[trimmed]) return ALIASES[trimmed];
    const key = trimmed.toLowerCase().replace(/-/g, '_').replace(/\s+/g, '_');
    if (ALIASES[key]) return ALIASES[key];
    if (PAYMENT_METHODS.includes(key)) return key;
    return null;
}

function validatePaymentMethod(raw, { required = false } = {}) {
    if (raw === undefined || raw === null || raw === '') {
        if (required) {
            return {
                valid: false,
                message: 'paymentMethod is required. Use visa, cash, vodafone_cash, or instapay.',
                allowedPaymentMethods: PAYMENT_METHODS
            };
        }
        return { valid: true, value: null };
    }
    const value = normalizePaymentMethod(raw);
    if (!value) {
        return {
            valid: false,
            message: 'Invalid paymentMethod.',
            allowedPaymentMethods: PAYMENT_METHODS,
            labels: PAYMENT_METHOD_LABELS
        };
    }
    return { valid: true, value };
}

function enrichPaymentMethod(plain) {
    if (!plain || !plain.paymentMethod) return plain;
    return {
        ...plain,
        paymentMethodLabel: PAYMENT_METHOD_LABELS[plain.paymentMethod] || plain.paymentMethod
    };
}

module.exports = {
    normalizePaymentMethod,
    validatePaymentMethod,
    enrichPaymentMethod,
    PAYMENT_METHODS,
    PAYMENT_METHOD_LABELS
};
