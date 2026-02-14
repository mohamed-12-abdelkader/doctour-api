-- Migration: add examinationStatus (حالة الكشف) to Bookings — Admin only updates
-- Values: waiting (في الانتظار) | done (تم الكشف). Default: waiting

DO $$ BEGIN
    CREATE TYPE enum_Bookings_examinationStatus AS ENUM('waiting', 'done');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

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

COMMENT ON COLUMN "Bookings"."examinationStatus" IS 'Examination status: waiting (في الانتظار) or done (تم الكشف). Admin only.';
