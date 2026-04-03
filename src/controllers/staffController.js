const { User, Permission, DoctorProfile } = require('../models/index');

// Create Staff
exports.createStaff = async (req, res, next) => {
    try {
        const { name, email, password, permissions, role, specialty, phone, imageUrl } = req.body;
        const targetRole = (role || 'secretary').toLowerCase();
        if (!['secretary', 'doctor', 'staff'].includes(targetRole)) {
            return res.status(400).json({ message: 'role must be secretary or doctor' });
        }

        // Check if user exists
        const userExists = await User.findOne({ where: { email } });
        if (userExists) {
            return res.status(400).json({ message: 'User already exists' });
        }

        // Create user
        const user = await User.create({
            name,
            email,
            password,
            role: targetRole,
            isActive: true
        });

        if (targetRole === 'doctor') {
            if (!specialty || !phone) {
                return res.status(400).json({ message: 'specialty and phone are required for doctor account' });
            }
            await DoctorProfile.create({
                userId: user.id,
                specialty,
                phone,
                imageUrl: imageUrl || null
            });
        }

        // Assign permissions
        if (permissions && permissions.length > 0) {
            const permissionRecords = await Permission.findAll({
                where: { name: permissions }
            });
            await user.addPermissions(permissionRecords);
        }

        // Return created user with permissions
        const createdUser = await User.findByPk(user.id, {
            include: [
                {
                    model: Permission,
                    as: 'permissions',
                    attributes: ['name'],
                    through: { attributes: [] }
                },
                {
                    model: DoctorProfile,
                    as: 'doctorProfile'
                }
            ],
            attributes: { exclude: ['password'] }
        });

        res.status(201).json(createdUser);
    } catch (error) {
        next(error);
    }
};

// Get All Staff
exports.getAllStaff = async (req, res, next) => {
    try {
        const staff = await User.findAll({
            where: { role: ['secretary', 'doctor', 'staff'] },
            include: [
                {
                    model: Permission,
                    as: 'permissions',
                    attributes: ['name'],
                    through: { attributes: [] }
                },
                {
                    model: DoctorProfile,
                    as: 'doctorProfile'
                }
            ],
            attributes: { exclude: ['password'] }
        });
        res.status(200).json(staff);
    } catch (error) {
        next(error);
    }
};

// Get Single Staff
exports.getStaffById = async (req, res, next) => {
    try {
        const user = await User.findByPk(req.params.id, {
            include: [
                {
                    model: Permission,
                    as: 'permissions',
                    attributes: ['name'],
                    through: { attributes: [] }
                },
                {
                    model: DoctorProfile,
                    as: 'doctorProfile'
                }
            ],
            attributes: { exclude: ['password'] }
        });

        if (!user) {
            return res.status(404).json({ message: 'Staff not found' });
        }

        // Ensure we are viewing a staff member, not accidentally modifying another admin (though admin can view admin)
        // But requirement says "manage staff accounts".
        if (user.role === 'admin' && req.user.id !== user.id) {
            // Optional: Decide if admin can manage other admins. Let's assume yes for viewing details.
        }

        res.status(200).json(user);
    } catch (error) {
        next(error);
    }
};

// Update Staff
exports.updateStaff = async (req, res, next) => {
    try {
        const { name, email, permissions, password, specialty, phone, imageUrl } = req.body;
        const user = await User.findByPk(req.params.id);

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Verify it is a staff member
        if (!['staff', 'secretary', 'doctor'].includes(user.role)) {
            return res.status(403).json({ message: 'Can only update secretary/doctor accounts via this route' });
        }

        user.name = name || user.name;
        user.email = email || user.email;

        if (password) {
            user.password = password; // Hook will hash it
        }

        await user.save();

        if (user.role === 'doctor') {
            const [profile] = await DoctorProfile.findOrCreate({
                where: { userId: user.id },
                defaults: { specialty: specialty || 'General', phone: phone || 'N/A', imageUrl: imageUrl || null }
            });
            if (specialty !== undefined) profile.specialty = specialty;
            if (phone !== undefined) profile.phone = phone;
            if (imageUrl !== undefined) profile.imageUrl = imageUrl;
            await profile.save();
        }

        // Update permissions if provided
        if (permissions) {
            const permissionRecords = await Permission.findAll({
                where: { name: permissions }
            });
            await user.setPermissions(permissionRecords); // Overwrite existing permissions
        }

        const updatedUser = await User.findByPk(user.id, {
            include: [
                {
                    model: Permission,
                    as: 'permissions',
                    attributes: ['name'],
                    through: { attributes: [] }
                },
                {
                    model: DoctorProfile,
                    as: 'doctorProfile'
                }
            ],
            attributes: { exclude: ['password'] }
        });

        res.status(200).json(updatedUser);
    } catch (error) {
        next(error);
    }
};

// Toggle Active Status
exports.toggleStaffStatus = async (req, res, next) => {
    try {
        const { isActive } = req.body;
        const user = await User.findByPk(req.params.id);

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        if (!['staff', 'secretary', 'doctor'].includes(user.role)) {
            return res.status(403).json({ message: 'Can only update secretary/doctor status via this route' });
        }

        user.isActive = isActive;
        await user.save();

        res.status(200).json({ message: `User account ${isActive ? 'activated' : 'deactivated'}.`, user });
    } catch (error) {
        next(error);
    }
};

// Delete Staff
exports.deleteStaff = async (req, res, next) => {
    try {
        const user = await User.findByPk(req.params.id);

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        if (!['staff', 'secretary', 'doctor'].includes(user.role)) {
            return res.status(403).json({ message: 'Can only delete secretary/doctor accounts' });
        }

        await user.destroy();
        res.status(200).json({ message: 'Staff deleted successfully' });
    } catch (error) {
        next(error);
    }
};
