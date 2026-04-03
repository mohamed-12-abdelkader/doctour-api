exports.hasPermission = (requiredPermission) => {
    return (req, res, next) => {
        // Admin bypasses all checks
        if (req.user && req.user.role === 'admin') {
            return next();
        }

        if (
            req.user &&
            ['secretary', 'staff'].includes(req.user.role) &&
            ['manage_online_bookings', 'manage_daily_bookings'].includes(requiredPermission)
        ) {
            return next();
        }

        // Check if user has the required permission
        const userPermissions = req.user.permissions ? req.user.permissions.map(p => p.name) : [];

        if (userPermissions.includes(requiredPermission)) {
            return next();
        } else {
            res.status(403).json({ message: `Forbidden. Requires permission: ${requiredPermission}` });
        }
    };
};
