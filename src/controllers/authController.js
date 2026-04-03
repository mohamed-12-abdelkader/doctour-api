const { User, Permission, DoctorProfile } = require('../models/index');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_key_123';

const generateToken = (id) => {
    return jwt.sign({ id }, JWT_SECRET, {
        expiresIn: '30d',
    });
};

exports.login = async (req, res, next) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ message: 'Please provide email and password' });
        }

        const user = await User.findOne({
            where: { email },
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

        if (!user || !(await user.comparePassword(password))) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        if (!user.isActive) {
            return res.status(403).json({ message: 'Account is deactivated. Please contact admin.' });
        }

        res.status(200).json({
            _id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            doctorProfile: user.doctorProfile || null,
            permissions: user.permissions ? user.permissions.map(p => p.name) : [],
            token: generateToken(user.id),
        });
    } catch (error) {
        next(error);
    }
};
