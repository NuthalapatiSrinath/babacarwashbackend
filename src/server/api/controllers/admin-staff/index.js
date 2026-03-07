const router = require("express").Router();
const controller = require("./admin-staff.controller");
const AuthHelper = require("../auth/auth.helper");

// All routes require authentication + admin role
const adminOnly = (req, res, next) => {
  if (req.user && req.user.role === "admin") return next();
  return res
    .status(403)
    .json({ statusCode: 403, message: "Access denied. Admin only." });
};

router.get("/", AuthHelper.authenticate, adminOnly, controller.list);
router.get(
  "/check-phone",
  AuthHelper.authenticate,
  adminOnly,
  controller.checkPhoneNumber,
);
router.post("/", AuthHelper.authenticate, adminOnly, controller.create);
router.get("/:id", AuthHelper.authenticate, adminOnly, controller.info);
router.put("/:id", AuthHelper.authenticate, adminOnly, controller.update);
router.put(
  "/:id/permissions",
  AuthHelper.authenticate,
  adminOnly,
  controller.updatePermissions,
);
router.put(
  "/:id/page-permissions",
  AuthHelper.authenticate,
  adminOnly,
  controller.updatePagePermissions,
);
router.delete("/:id", AuthHelper.authenticate, adminOnly, controller.delete);

module.exports = router;
