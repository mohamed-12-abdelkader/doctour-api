/** طرق الدفع المدعومة عند إنشاء/تعديل الحجز */
const PAYMENT_METHODS = ['visa', 'cash', 'vodafone_cash', 'instapay'];

const PAYMENT_METHOD_LABELS = {
    visa: 'فيزا',
    cash: 'نقدي',
    vodafone_cash: 'فودافون كاش',
    instapay: 'انستا باي'
};

module.exports = { PAYMENT_METHODS, PAYMENT_METHOD_LABELS };
