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

const runMultiDoctorMigration = async () => {
  try {
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS "DoctorProfiles" (
        id SERIAL PRIMARY KEY,
        "userId" INTEGER NOT NULL UNIQUE REFERENCES "Users"(id) ON DELETE CASCADE,
        specialty VARCHAR(191) NOT NULL,
        phone VARCHAR(30) NOT NULL,
        "imageUrl" VARCHAR(512),
        "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
        "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);

    const userRoleValues = ['doctor', 'secretary'];
    for (const roleValue of userRoleValues) {
      await sequelize.query(`
        DO $$ BEGIN
          ALTER TYPE "enum_Users_role" ADD VALUE '${roleValue}';
        EXCEPTION
          WHEN duplicate_object THEN null;
          WHEN undefined_object THEN null;
        END $$;
      `);
    }

    await sequelize.query(`ALTER TABLE "WorkingDays" ADD COLUMN IF NOT EXISTS "doctorId" INTEGER;`);
    await sequelize.query(`ALTER TABLE "WorkingDays" DROP CONSTRAINT IF EXISTS "WorkingDays_date_key";`).catch(() => {});
    await sequelize.query(`DROP INDEX IF EXISTS "WorkingDays_date";`).catch(() => {});
    await sequelize.query(`CREATE INDEX IF NOT EXISTS "working_days_doctor_date_idx" ON "WorkingDays" ("doctorId", "date");`);
    await sequelize.query(`CREATE UNIQUE INDEX IF NOT EXISTS "working_days_doctor_date_unique_idx" ON "WorkingDays" ("doctorId", "date");`);

    await sequelize.query(`ALTER TABLE "Bookings" ADD COLUMN IF NOT EXISTS "doctorId" INTEGER REFERENCES "DoctorProfiles"(id) ON DELETE SET NULL;`);
    await sequelize.query(`ALTER TABLE "Bookings" ADD COLUMN IF NOT EXISTS "assignedBy" INTEGER REFERENCES "Users"(id) ON DELETE SET NULL;`);
    await sequelize.query(`CREATE INDEX IF NOT EXISTS "bookings_doctor_date_idx" ON "Bookings" ("doctorId", "slotDate");`);
    await sequelize.query(`CREATE INDEX IF NOT EXISTS "bookings_doctor_appointment_idx" ON "Bookings" ("doctorId", "appointmentDate");`);

    console.log('✅ Multi-doctor migration applied.');
  } catch (err) {
    console.warn('⚠️ Multi-doctor migration skip:', err.message);
  }
};

// Migration: Expenses classification (categories + subcategories) tables + columns
const runExpensesClassificationMigration = async () => {
  try {
    // Create category/subcategory tables (idempotent)
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS expense_categories (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);

    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS expense_subcategories (
        id SERIAL PRIMARY KEY,
        "categoryId" INTEGER NOT NULL REFERENCES expense_categories(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW(),
        UNIQUE ("categoryId", name)
      );
    `);

    // Add columns to existing Expenses table (keep them nullable for backward compatibility)
    await sequelize.query(`
      ALTER TABLE "Expenses" ADD COLUMN IF NOT EXISTS "categoryId" INTEGER;
    `);
    await sequelize.query(`
      ALTER TABLE "Expenses" ADD COLUMN IF NOT EXISTS "subcategoryId" INTEGER;
    `);

    // Seed default categories + subcategories (only if missing)
    const seedSql = `
      -- Categories
      INSERT INTO expense_categories (name)
      SELECT * FROM (VALUES
        ('مصروفات ثابتة (Fixed Costs)'),
        ('مصروفات متغيرة (Variable Costs)'),
        ('التسويق (Marketing Costs)'),
        ('مصروفات مالية وقانونية'),
        ('مصروفات أخرى (Other Expenses)')
      ) AS t(name)
      WHERE NOT EXISTS (SELECT 1 FROM expense_categories c WHERE c.name = t.name);

      -- Subcategories
      INSERT INTO expense_subcategories ("categoryId", name)
      SELECT c.id, s.name
      FROM expense_categories c
      JOIN (VALUES
        -- Fixed Costs
        ('الإيجار', 'مصروفات ثابتة (Fixed Costs)'),
        ('المرتبات (ريسبشن – تمريض – مساعد دكتور)', 'مصروفات ثابتة (Fixed Costs)'),
        ('الفواتير (كهرباء – مياه – إنترنت)', 'مصروفات ثابتة (Fixed Costs)'),

        -- Variable Costs
        ('مستهلكات (جوانتي – سرنجات – شاش – كحول)', 'مصروفات متغيرة (Variable Costs)'),
        ('مواد تجميل (فيلر – بوتوكس – ميزوثيرابي)', 'مصروفات متغيرة (Variable Costs)'),
        ('كريمات أو منتجات تُستخدم أثناء الجلسات', 'مصروفات متغيرة (Variable Costs)'),

        -- Marketing Costs
        ('إعلانات ممولة', 'التسويق (Marketing Costs)'),
        ('إدارة صفحات (Social Media Manager)', 'التسويق (Marketing Costs)'),
        ('تعاون مع إنفلونسرز', 'التسويق (Marketing Costs)'),

        -- Financial & Legal
        ('ضرائب (مثل VAT 14%)', 'مصروفات مالية وقانونية'),
        ('عمولات الدفع الإلكتروني (InstaPay – POS – فوري)', 'مصروفات مالية وقانونية'),
        ('محاسب أو مستشار قانوني', 'مصروفات مالية وقانونية'),

        -- Other Expenses
        ('مصروفات أخرى (Other Expenses)', 'مصروفات أخرى (Other Expenses)')
      ) AS s(name, categoryName)
      ON c.name = s.categoryName
      WHERE NOT EXISTS (
        SELECT 1 FROM expense_subcategories es
        WHERE es."categoryId" = c.id AND es.name = s.name
      );

      -- Backfill existing expenses with Other Expenses if missing
      UPDATE "Expenses" e
      SET "categoryId" = c.id,
          "subcategoryId" = s.id
      FROM expense_categories c
      JOIN expense_subcategories s
        ON s."categoryId" = c.id
       AND s.name = 'مصروفات أخرى (Other Expenses)'
      WHERE e."categoryId" IS NULL OR e."subcategoryId" IS NULL
        AND c.name = 'مصروفات أخرى (Other Expenses)';
    `;

    await sequelize.query(seedSql);
    console.log('✅ Expenses classification migration applied.');
  } catch (err) {
    console.warn('⚠️ Expenses classification migration skip:', err.message);
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
    await runMultiDoctorMigration();
    await runExpensesClassificationMigration();
  } catch (error) {
    console.error('❌ Unable to connect to the database:', error);
    process.exit(1);
  }
};

module.exports = { sequelize, connectDB };
