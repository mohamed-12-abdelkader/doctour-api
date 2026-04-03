exports.admin = (req, res, next) => {
    if (req.user && req.user.role === 'admin') {
        next();
    } else {
        res.status(403).json({ message: 'Access denied. Admin only.' });
    }
};

exports.adminOrSecretary = (req, res, next) => {
    if (req.user && (req.user.role === 'admin' || req.user.role === 'secretary' || req.user.role === 'staff')) {
        return next();
    }
    return res.status(403).json({ message: 'Access denied. Admin or Secretary only.' });
};

exports.doctorOnly = (req, res, next) => {
    if (req.user && req.user.role === 'doctor') {
        return next();
    }
    return res.status(403).json({ message: 'Access denied. Doctor only.' });
};
