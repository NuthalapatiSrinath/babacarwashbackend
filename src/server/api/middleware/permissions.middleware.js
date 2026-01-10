// permissions.middleware.js
// Usage: permissionsMiddleware('customers', 'edit')

module.exports = function permissionsMiddleware(module, action) {
  return (req, res, next) => {
    const user = req.user;
    if (user.role === "admin") return next(); // Admin bypass
    const perms = user.permissions?.[module];
    if (!perms || !perms[action]) {
      return res
        .status(403)
        .json({ message: "Forbidden: insufficient permissions." });
    }
    next();
  };
};
