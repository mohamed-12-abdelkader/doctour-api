const { sequelize } = require('./src/config/database');

async function runMigration() {
    try {
        console.log('🔄 Running migration: Add visitType column...');

        // Step 1: Create ENUM type
        await sequelize.query(`
            DO $$ BEGIN
                CREATE TYPE enum_Bookings_visitType AS ENUM('checkup', 'followup');
            EXCEPTION
                WHEN duplicate_object THEN null;
            END $$;
        `);
        console.log('✅ ENUM type created/verified');

        // Step 2: Add column
        await sequelize.query(`
            DO $$ 
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns 
                    WHERE table_name = 'Bookings' AND column_name = 'visitType'
                ) THEN
                    ALTER TABLE "Bookings" 
                    ADD COLUMN "visitType" enum_Bookings_visitType 
                    NOT NULL DEFAULT 'checkup';
                    
                    RAISE NOTICE 'Column visitType added successfully';
                ELSE
                    RAISE NOTICE 'Column visitType already exists';
                END IF;
            END $$;
        `);
        console.log('✅ Column visitType added/verified');

        // Step 3: Add comment
        await sequelize.query(`
            COMMENT ON COLUMN "Bookings"."visitType" IS 'Visit type: checkup (كشف) or followup (إعادة)';
        `);
        console.log('✅ Comment added');

        console.log('✅ Migration completed successfully!');
        process.exit(0);
    } catch (error) {
        console.error('❌ Migration failed:', error.message);
        process.exit(1);
    }
}

runMigration();
