const { Sequelize } = require('sequelize');
require('dotenv').config();

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error('DATABASE_URL is not defined in .env file');
  process.exit(1);
}

const sequelize = new Sequelize(databaseUrl, {
  dialect: 'postgres',
  logging: false,
  dialectOptions: {
    ssl: {
      require: true,
      rejectUnauthorized: false
    }
  }
});

// Migration: add examinationStatus column to Bookings if missing
const runExaminationStatusMigration = async () => {
  try {
    await sequelize.query(`
      DO $$ BEGIN
        CREATE TYPE enum_Bookings_examinationStatus AS ENUM('waiting', 'done');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);
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
        END IF;
      END $$;
    `);
    console.log('✅ examinationStatus migration applied.');
  } catch (err) {
    console.warn('⚠️ examinationStatus migration skip:', err.message);
  }
};

// Migration: add age column and 'consultation' to visitType enum
const runBookingAgeAndConsultationMigration = async () => {
  try {
    await sequelize.query(`
      DO $$ BEGIN
        ALTER TYPE "enum_Bookings_visitType" ADD VALUE 'consultation';
      EXCEPTION
        WHEN duplicate_object THEN null;
        WHEN undefined_object THEN null;
      END $$;
    `);
    await sequelize.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'Bookings' AND column_name = 'age'
        ) THEN
          ALTER TABLE "Bookings" ADD COLUMN "age" INTEGER NULL;
        END IF;
      END $$;
    `);
    console.log('✅ age + consultation migration applied.');
  } catch (err) {
    console.warn('⚠️ age/consultation migration skip:', err.message);
  }
};

// Migration: allow NULL for appointmentDate (حجز أونلاين بدون تاريخ)
const runAppointmentDateNullableMigration = async () => {
  try {
    await sequelize.query(`
      ALTER TABLE "Bookings" ALTER COLUMN "appointmentDate" DROP NOT NULL;
    `);
    console.log('✅ appointmentDate nullable migration applied.');
  } catch (err) {
    if (err.message && !err.message.includes('cannot drop not null')) {
      console.warn('⚠️ appointmentDate nullable migration skip:', err.message);
    }
  }
};

// Migration: slot-based booking — patientId, slotDate, timeSlot on Bookings
const runSlotBookingMigration = async () => {
  try {
    const cols = [
      { name: 'patientId', sql: 'ADD COLUMN "patientId" INTEGER NULL REFERENCES "Patients"(id) ON DELETE SET NULL' },
      { name: 'slotDate', sql: 'ADD COLUMN "slotDate" DATE NULL' },
      { name: 'timeSlot', sql: 'ADD COLUMN "timeSlot" VARCHAR(5) NULL' }
    ];
    for (const { name, sql } of cols) {
      const [rows] = await sequelize.query(`
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'Bookings' AND column_name = '${name}'
      `);
      if (!rows || rows.length === 0) {
        await sequelize.query(`ALTER TABLE "Bookings" ${sql};`);
        console.log(`✅ Bookings.${name} added.`);
      }
    }
    await sequelize.query(`
      CREATE INDEX IF NOT EXISTS "bookings_slot_date_time"
      ON "Bookings" ("slotDate", "timeSlot")
      WHERE "slotDate" IS NOT NULL AND "timeSlot" IS NOT NULL;
    `).catch(() => {});
    await sequelize.query(`
      CREATE INDEX IF NOT EXISTS "bookings_patient_slot"
      ON "Bookings" ("patientId", "slotDate", "timeSlot")
      WHERE "patientId" IS NOT NULL AND "slotDate" IS NOT NULL AND "timeSlot" IS NOT NULL;
    `).catch(() => {});
    console.log('✅ Slot booking migration applied.');
  } catch (err) {
    console.warn('⚠️ Slot booking migration skip:', err.message);
  }
};

const connectDB = async () => {
  try {
    await sequelize.authenticate();
    console.log('✅ Database connected successfully.');

    // Sync models - create tables if they don't exist (WorkingDay, Patient, etc.)
    await sequelize.sync({ alter: false });
    console.log('✅ Models synchronized.');

    await runExaminationStatusMigration();
    await runBookingAgeAndConsultationMigration();
    await runAppointmentDateNullableMigration();
    await runSlotBookingMigration();
  } catch (error) {
    console.error('❌ Unable to connect to the database:', error);
    process.exit(1);
  }
};

module.exports = { sequelize, connectDB };
