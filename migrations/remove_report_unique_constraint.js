/**
 * Migration: Remove unique constraint on bookingId in PatientReports
 * Allows multiple reports per booking (زيارة واحدة → أكثر من تقرير)
 * Run once: node migrations/remove_report_unique_constraint.js
 */
require('dotenv').config();
const { sequelize } = require('../src/config/database');

(async () => {
    try {
        await sequelize.authenticate();
        console.log('✅ Connected to database.');

        // PostgreSQL: نلاقي اسم الـ constraint الأول
        const [constraints] = await sequelize.query(`
            SELECT constraint_name
            FROM information_schema.table_constraints
            WHERE table_name = 'PatientReports'
              AND constraint_type = 'UNIQUE'
              AND constraint_name LIKE '%bookingId%'
            LIMIT 5;
        `);

        if (constraints.length === 0) {
            console.log('⏭️  No unique constraint on bookingId found — already removed or never existed.');
        } else {
            for (const row of constraints) {
                await sequelize.query(`ALTER TABLE "PatientReports" DROP CONSTRAINT IF EXISTS "${row.constraint_name}";`);
                console.log(`✅ Dropped constraint: ${row.constraint_name}`);
            }
        }

        console.log('\n🎉 Migration completed successfully.');
        process.exit(0);
    } catch (err) {
        console.error('❌ Migration failed:', err.message);
        process.exit(1);
    }
})();
