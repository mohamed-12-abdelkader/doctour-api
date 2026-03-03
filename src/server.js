const http = require('http');
const app = require('./app');
const { connectDB } = require('./config/database');
const { User, Permission } = require('./models/index');
const { setIO } = require('./socket');
require('dotenv').config();

let SocketIO;
try {
    SocketIO = require('socket.io').Server;
} catch (e) {
    SocketIO = null;
}

const PORT = process.env.PORT || 8000;

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

    const httpServer = http.createServer(app);

    if (SocketIO) {
        const io = new SocketIO(httpServer, {
            cors: { origin: '*', methods: ['GET', 'POST'] }
        });
        io.on('connection', (socket) => {
            socket.on('bookings:subscribe', (date) => {
                const dateStr = date && String(date).trim().slice(0, 10);
                if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) socket.join(`bookings:${dateStr}`);
            });
            socket.on('bookings:unsubscribe', (date) => {
                const dateStr = date && String(date).trim().slice(0, 10);
                if (dateStr) socket.leave(`bookings:${dateStr}`);
            });
        });
        setIO(io);
        httpServer.listen(PORT, () => {
            console.log(`Server is running on port ${PORT}`);
            console.log('Socket.io enabled for real-time booking updates.');
        });
    } else {
        setIO(null);
        httpServer.listen(PORT, () => {
            console.log(`Server is running on port ${PORT}`);
            console.log('ℹ️  Install socket.io for real-time updates: npm install socket.io');
        });
    }
};

startServer();
