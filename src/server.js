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
            /** اشتراك بعدة أيام (مثل فلتر startDate & endDate في /api/bookings/all) — حد أقصى 62 يوم */
            socket.on('bookings:subscribeRange', (payload) => {
                const startStr = payload && String(payload.startDate || '').trim().slice(0, 10);
                const endStr = payload && String(payload.endDate || '').trim().slice(0, 10);
                if (!/^\d{4}-\d{2}-\d{2}$/.test(startStr) || !/^\d{4}-\d{2}-\d{2}$/.test(endStr)) return;
                const [sy, sm, sd] = startStr.split('-').map(Number);
                const [ey, em, ed] = endStr.split('-').map(Number);
                const start = new Date(Date.UTC(sy, sm - 1, sd));
                const end = new Date(Date.UTC(ey, em - 1, ed));
                if (start > end) return;
                let d = new Date(start);
                let n = 0;
                while (d <= end && n < 62) {
                    const y = d.getUTCFullYear();
                    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
                    const day = String(d.getUTCDate()).padStart(2, '0');
                    socket.join(`bookings:${y}-${m}-${day}`);
                    d.setUTCDate(d.getUTCDate() + 1);
                    n++;
                }
            });
            socket.on('bookings:unsubscribeRange', (payload) => {
                const startStr = payload && String(payload.startDate || '').trim().slice(0, 10);
                const endStr = payload && String(payload.endDate || '').trim().slice(0, 10);
                if (!/^\d{4}-\d{2}-\d{2}$/.test(startStr) || !/^\d{4}-\d{2}-\d{2}$/.test(endStr)) return;
                const [sy, sm, sd] = startStr.split('-').map(Number);
                const [ey, em, ed] = endStr.split('-').map(Number);
                const start = new Date(Date.UTC(sy, sm - 1, sd));
                const end = new Date(Date.UTC(ey, em - 1, ed));
                if (start > end) return;
                let d = new Date(start);
                let n = 0;
                while (d <= end && n < 62) {
                    const y = d.getUTCFullYear();
                    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
                    const day = String(d.getUTCDate()).padStart(2, '0');
                    socket.leave(`bookings:${y}-${m}-${day}`);
                    d.setUTCDate(d.getUTCDate() + 1);
                    n++;
                }
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
