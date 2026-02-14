-- Migration to add visitType column to Bookings table (PostgreSQL)
-- Run this SQL command in your PostgreSQL database

-- Step 1: Create the ENUM type if it doesn't exist
DO $$ BEGIN
    CREATE TYPE enum_Bookings_visitType AS ENUM('checkup', 'followup');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Step 2: Add the column if it doesn't exist
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

-- Step 3: Add comment (optional)
COMMENT ON COLUMN "Bookings"."visitType" IS 'Visit type: checkup (كشف) or followup (إعادة)';
