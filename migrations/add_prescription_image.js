/**
 * Migration: Add prescriptionImageUrl + prescriptionPublicId to PatientReports table
 * Run once: node migrations/add_prescription_image.js
 */
require('dotenv').config();
const { sequelize } = require('../src/config/database');

(async () => {
    try {
        await sequelize.authenticate();
        console.log('✅ Connected to database.');

        const qi = sequelize.getQueryInterface();
        const { DataTypes } = require('sequelize');

        // Check if columns already exist before adding
        const tableDescription = await qi.describeTable('PatientReports');

        if (!tableDescription.prescriptionImageUrl) {
            await qi.addColumn('PatientReports', 'prescriptionImageUrl', {
                type: DataTypes.TEXT,
                allowNull: true,
                comment: 'رابط صورة الروشتة على Cloudinary'
            });
            console.log('✅ Added column: prescriptionImageUrl');
        } else {
            console.log('⏭️  Column prescriptionImageUrl already exists, skipping.');
        }

        if (!tableDescription.prescriptionPublicId) {
            await qi.addColumn('PatientReports', 'prescriptionPublicId', {
                type: DataTypes.STRING(512),
                allowNull: true,
                comment: 'Cloudinary public_id لحذف/تحديث الصورة'
            });
            console.log('✅ Added column: prescriptionPublicId');
        } else {
            console.log('⏭️  Column prescriptionPublicId already exists, skipping.');
        }

        console.log('\n🎉 Migration completed successfully.');
        process.exit(0);
    } catch (err) {
        console.error('❌ Migration failed:', err.message);
        process.exit(1);
    }
})();
