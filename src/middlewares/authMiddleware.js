const jwt = require('jsonwebtoken');
const { User, Permission, DoctorProfile } = require('../models/index');

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_key_123';

exports.protect = async (req, res, next) => {
    let token;

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
        return res.status(401).json({ message: 'Not authorized, no token' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);

        // Find user and include permissions
        const user = await User.findByPk(decoded.id, {
            include: [
                {
                    model: Permission,
                    as: 'permissions',
                    attributes: ['name'],
                    through: { attributes: [] }
                },
                {
                    model: DoctorProfile,
                    as: 'doctorProfile',
                    attributes: ['id', 'specialty', 'phone', 'imageUrl', 'isActive']
                }
            ]
        });

        if (!user) {
            return res.status(401).json({ message: 'User not found' });
        }

        if (!user.isActive) {
            return res.status(403).json({ message: 'Your account is deactivated. Please contact admin.' });
        }

        req.user = user;
        next();
    } catch (error) {
        console.error('Auth error:', error.message);
        res.status(401).json({ message: 'Not authorized, token failed' });
    }
};
