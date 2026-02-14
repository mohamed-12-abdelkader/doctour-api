const app = require('./app');
const { connectDB } = require('./config/database');
const { User, Permission } = require('./models/index');
require('dotenv').config();

const PORT = 8000;

const seedPermissions = async () => {
    const defaultPermissions = [
        'manage_online_bookings',
        'manage_daily_bookings',
        'manage_accounts'
    ];

    for (const name of defaultPermissions) {
        await Permission.findOrCreate({ where: { name } });
    }
    console.log('✅ Default permissions seeded.');
};

const seedAdmin = async () => {
    try {
        const adminEmail = 'admin@example.com';
        const adminPassword = 'admin123';

        const existingAdmin = await User.findOne({ where: { email: adminEmail } });
        if (!existingAdmin) {
            await User.create({
                name: 'Super Admin',
                email: adminEmail,
                password: adminPassword,
                role: 'admin',
                isActive: true
            });
            console.log('✅ Admin account seeded');
            console.log(`📧 Email: ${adminEmail} (password: ${adminPassword})`);
        } else {
            // Update role/isActive just in case
            if (existingAdmin.role !== 'admin' || !existingAdmin.isActive) {
                existingAdmin.role = 'admin';
                existingAdmin.isActive = true;
                await existingAdmin.save();
                console.log('ℹ️  Admin role/status refreshed.');
            }
        }
    } catch (error) {
        console.error('❌ Failed to seed admin:', error);
    }
};

const startServer = async () => {
    await connectDB();
    await seedPermissions();
    await seedAdmin();

    app.listen(PORT, () => {
        console.log(`Server is running on port ${PORT}`);
    });
};

startServer();
