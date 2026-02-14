const { sequelize } = require('./src/config/database');

async function runMigration() {
    try {
        console.log('🔄 Running migration: Add examinationStatus column...');

        await sequelize.query(`
            DO $$ BEGIN
                CREATE TYPE enum_Bookings_examinationStatus AS ENUM('waiting', 'done');
            EXCEPTION
                WHEN duplicate_object THEN null;
            END $$;
        `);
        console.log('✅ ENUM type created/verified');

        await sequelize.query(`
            DO $$ 
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns 
                    WHERE table_name = 'Bookings' AND column_name = 'examinationStatus'
                ) THEN
                    ALTER TABLE "Bookings" 
                    ADD COLUMN "examinationStatus" enum_Bookings_examinationStatus 
                    NOT NULL DEFAULT 'waiting';
                    
                    RAISE NOTICE 'Column examinationStatus added successfully';
                ELSE
                    RAISE NOTICE 'Column examinationStatus already exists';
                END IF;
            END $$;
        `);
        console.log('✅ Column examinationStatus added/verified');

        await sequelize.query(`
            COMMENT ON COLUMN "Bookings"."examinationStatus" IS 'Examination status: waiting (في الانتظار) or done (تم الكشف). Admin only.';
        `);
        console.log('✅ Migration completed successfully!');
        process.exit(0);
    } catch (error) {
        console.error('❌ Migration failed:', error.message);
        process.exit(1);
    }
}

runMigration();
