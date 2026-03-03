/**
 * Migration: Add preferredDate + preferredTime to Bookings table
 *            + Create Notifications table
 * Run once: node migrations/add_online_booking_fields.js
 */
require('dotenv').config();
const { sequelize } = require('../src/config/database');
const { DataTypes } = require('sequelize');

(async () => {
    try {
        await sequelize.authenticate();
        console.log('✅ Connected to database.');
        const qi = sequelize.getQueryInterface();

        // ── 1. preferredDate ───────────────────────────────────────────
        const bookingDesc = await qi.describeTable('Bookings');

        if (!bookingDesc.preferredDate) {
            await qi.addColumn('Bookings', 'preferredDate', {
                type: DataTypes.DATEONLY,
                allowNull: true,
                comment: 'التاريخ المفضل للحجز الأونلاين YYYY-MM-DD'
            });
            console.log('✅ Added column: Bookings.preferredDate');
        } else {
            console.log('⏭️  Bookings.preferredDate already exists, skipping.');
        }

        // ── 2. preferredTime ───────────────────────────────────────────
        if (!bookingDesc.preferredTime) {
            await qi.addColumn('Bookings', 'preferredTime', {
                type: DataTypes.STRING(5),
                allowNull: true,
                comment: 'الوقت المفضل للحجز الأونلاين مثل 10:00'
            });
            console.log('✅ Added column: Bookings.preferredTime');
        } else {
            console.log('⏭️  Bookings.preferredTime already exists, skipping.');
        }

        // ── 3. Notifications table ─────────────────────────────────────
        const tables = await qi.showAllTables();
        if (!tables.includes('Notifications')) {
            await qi.createTable('Notifications', {
                id: {
                    type: DataTypes.INTEGER,
                    autoIncrement: true,
                    primaryKey: true
                },
                type: {
                    type: DataTypes.ENUM('new_online_booking', 'booking_confirmed', 'booking_rejected', 'booking_cancelled'),
                    allowNull: false
                },
                title: {
                    type: DataTypes.STRING(255),
                    allowNull: false
                },
                message: {
                    type: DataTypes.TEXT,
                    allowNull: false
                },
                data: {
                    type: DataTypes.JSONB,
                    allowNull: true
                },
                isRead: {
                    type: DataTypes.BOOLEAN,
                    defaultValue: false,
                    allowNull: false
                },
                targetRole: {
                    type: DataTypes.ENUM('admin', 'staff', 'all'),
                    allowNull: true
                },
                targetUserId: {
                    type: DataTypes.INTEGER,
                    allowNull: true
                },
                createdAt: {
                    type: DataTypes.DATE,
                    allowNull: false
                },
                updatedAt: {
                    type: DataTypes.DATE,
                    allowNull: false
                }
            });
            console.log('✅ Created table: Notifications');

            // Indexes
            await qi.addIndex('Notifications', ['isRead', 'createdAt']);
            await qi.addIndex('Notifications', ['targetRole']);
            await qi.addIndex('Notifications', ['targetUserId']);
            console.log('✅ Added indexes on Notifications');
        } else {
            console.log('⏭️  Notifications table already exists, skipping.');
        }

        console.log('\n🎉 Migration completed successfully.');
        process.exit(0);
    } catch (err) {
        console.error('❌ Migration failed:', err.message);
        process.exit(1);
    }
})();
