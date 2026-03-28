/**
 * Migration: Add procedureType (detailed visit type) to Bookings table
 * Run once: node migrations/add_procedureType_to_bookings.js
 */
require('dotenv').config();
const { sequelize } = require('../src/config/database');
const { DataTypes } = require('sequelize');

(async () => {
    try {
        await sequelize.authenticate();
        console.log('✅ Connected to database.');
        const qi = sequelize.getQueryInterface();

        const bookingDesc = await qi.describeTable('Bookings');

        if (!bookingDesc.procedureType) {
            await qi.addColumn('Bookings', 'procedureType', {
                type: DataTypes.STRING(191),
                allowNull: true,
                comment: 'نوع الزيارة التفصيلي (Botox, filler, ...)'
            });
            console.log('✅ Added column: Bookings.procedureType');
        } else {
            console.log('⏭️  Bookings.procedureType already exists, skipping.');
        }

        console.log('\n🎉 Migration completed successfully.');
        process.exit(0);
    } catch (err) {
        console.error('❌ Migration failed:', err.message);
        process.exit(1);
    }
})();

