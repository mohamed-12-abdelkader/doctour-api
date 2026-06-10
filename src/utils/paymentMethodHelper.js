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

const TRANSFER_PHONE_REQUIRED_METHODS = ['vodafone_cash', 'instapay'];

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

function toAmount(raw) {
    if (raw === undefined || raw === null || raw === '') return null;
    const value = Number(raw);
    return Number.isFinite(value) ? Math.round(value * 100) / 100 : NaN;
}

function extractTransferFromPhone(source) {
    if (!source || typeof source !== 'object') return null;
    return (
        source.transferFromPhone ??
        source.transferredFromPhone ??
        source.fromPhone ??
        source.senderPhone ??
        source.sourcePhone ??
        source.paymentPhone ??
        source.walletPhone ??
        source.accountPhone ??
        source.vodafonePhone ??
        source.instapayPhone ??
        source.phone ??
        null
    );
}

function normalizeTransferFromPhone(raw) {
    if (raw === undefined || raw === null || raw === '') return null;
    const phone = String(raw).trim().replace(/\s+/g, '').replace(/-/g, '');
    const egyptianPhoneRegex = /^(\+20|0020|0)?1[0125][0-9]{8}$/;
    if (!egyptianPhoneRegex.test(phone)) return null;
    return phone.replace(/^(\+20|0020)/, '0');
}

function requiresTransferFromPhone(method) {
    return TRANSFER_PHONE_REQUIRED_METHODS.includes(method);
}

function paymentDetailsPayload(body) {
    return body.paymentDetails ?? body.payments ?? body.paymentMethods;
}

function hasPaymentDetailsPayload(body) {
    const raw = paymentDetailsPayload(body);
    return raw !== undefined && raw !== null && raw !== '';
}

function parsePaymentDetails(raw) {
    if (Array.isArray(raw)) {
        return raw.map((entry) => {
            if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
                return {
                    method: entry.method ?? entry.paymentMethod ?? entry.type,
                    amount: entry.amount ?? entry.amountPaid ?? entry.value,
                    transferFromPhone: extractTransferFromPhone(entry)
                };
            }
            return { method: null, amount: null };
        });
    }

    if (raw && typeof raw === 'object') {
        return Object.entries(raw).map(([method, value]) => {
            if (value && typeof value === 'object' && !Array.isArray(value)) {
                return {
                    method,
                    amount: value.amount ?? value.amountPaid ?? value.value,
                    transferFromPhone: extractTransferFromPhone(value)
                };
            }
            return { method, amount: value, transferFromPhone: null };
        });
    }

    return [];
}

function validatePaymentPayload(body, { required = false } = {}) {
    if (hasPaymentDetailsPayload(body)) {
        const entries = parsePaymentDetails(paymentDetailsPayload(body));
        if (entries.length === 0) {
            return {
                valid: false,
                message: 'payments must be a non-empty array or object.',
                allowedPaymentMethods: PAYMENT_METHODS,
                labels: PAYMENT_METHOD_LABELS
            };
        }

        const paymentDetails = [];
        for (const entry of entries) {
            const method = normalizePaymentMethod(entry.method);
            const amount = toAmount(entry.amount);
            if (!method || !Number.isFinite(amount) || amount <= 0) {
                return {
                    valid: false,
                    message: 'Each payment must include a valid method and amount greater than 0.',
                    allowedPaymentMethods: PAYMENT_METHODS,
                    labels: PAYMENT_METHOD_LABELS
                };
            }

            const transferFromPhone = normalizeTransferFromPhone(entry.transferFromPhone);
            if (requiresTransferFromPhone(method) && !transferFromPhone) {
                return {
                    valid: false,
                    message: 'transferFromPhone is required and must be a valid Egyptian mobile number for vodafone_cash or instapay payments.',
                    allowedPaymentMethods: PAYMENT_METHODS,
                    labels: PAYMENT_METHOD_LABELS
                };
            }

            paymentDetails.push({
                method,
                amount,
                ...(transferFromPhone ? { transferFromPhone } : {})
            });
        }

        const total = Math.round(paymentDetails.reduce((sum, p) => sum + p.amount, 0) * 100) / 100;
        const providedTotal = toAmount(body.amountPaid);

        if (providedTotal !== null && (!Number.isFinite(providedTotal) || providedTotal < 0)) {
            return { valid: false, message: 'amountPaid must be a valid number.' };
        }

        if (providedTotal !== null && Math.abs(providedTotal - total) > 0.009) {
            return {
                valid: false,
                message: 'amountPaid must equal the sum of all payment amounts.',
                calculatedAmountPaid: total
            };
        }

        return {
            valid: true,
            paymentMethod: paymentDetails[0].method,
            paymentDetails,
            amountPaid: total
        };
    }

    const methodValidation = validatePaymentMethod(body.paymentMethod, { required });
    if (!methodValidation.valid) return methodValidation;

    const amount = toAmount(body.amountPaid);
    if (amount !== null && (!Number.isFinite(amount) || amount < 0)) {
        return { valid: false, message: 'amountPaid must be a valid number.' };
    }

    const transferFromPhone = normalizeTransferFromPhone(extractTransferFromPhone(body));
    if (requiresTransferFromPhone(methodValidation.value) && !transferFromPhone) {
        return {
            valid: false,
            message: 'transferFromPhone is required and must be a valid Egyptian mobile number for vodafone_cash or instapay payments.',
            allowedPaymentMethods: PAYMENT_METHODS,
            labels: PAYMENT_METHOD_LABELS
        };
    }

    return {
        valid: true,
        paymentMethod: methodValidation.value,
        paymentDetails: methodValidation.value
            ? [{
                method: methodValidation.value,
                amount: amount ?? 0,
                ...(transferFromPhone ? { transferFromPhone } : {})
            }]
            : null,
        amountPaid: amount ?? 0
    };
}

function enrichPaymentMethod(plain) {
    if (!plain) return plain;
    const enrichedDetails = Array.isArray(plain.paymentDetails)
        ? plain.paymentDetails.map((payment) => ({
            ...payment,
            methodLabel: PAYMENT_METHOD_LABELS[payment.method] || payment.method
        }))
        : plain.paymentDetails;

    return {
        ...plain,
        paymentDetails: enrichedDetails,
        paymentMethodLabel: plain.paymentMethod
            ? PAYMENT_METHOD_LABELS[plain.paymentMethod] || plain.paymentMethod
            : undefined
    };
}

module.exports = {
    normalizePaymentMethod,
    validatePaymentMethod,
    validatePaymentPayload,
    hasPaymentDetailsPayload,
    enrichPaymentMethod,
    PAYMENT_METHODS,
    PAYMENT_METHOD_LABELS
};
