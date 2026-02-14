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

const connectDB = async () => {
  try {
    await sequelize.authenticate();
    console.log('✅ Database connected successfully.');

    // Sync models - create tables if they don't exist
    await sequelize.sync({ alter: false });
    console.log('✅ Models synchronized.');

    await runExaminationStatusMigration();
    await runBookingAgeAndConsultationMigration();
    await runAppointmentDateNullableMigration();
  } catch (error) {
    console.error('❌ Unable to connect to the database:', error);
    process.exit(1);
  }
};

module.exports = { sequelize, connectDB };
