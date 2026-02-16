const router = require("express").Router();
const controller = require("./notifications.controller");
const AuthHelper = require("../auth/auth.helper");

router.get("/in-app/count", AuthHelper.authenticate, controller.inAppCount);
router.get("/in-app", AuthHelper.authenticate, controller.inApp);
router.get(
  "/in-app/all",
  AuthHelper.authenticate,
  controller.getAllNotifications,
);
router.put(
  "/in-app/mark-all-read",
  AuthHelper.authenticate,
  controller.markAllAsRead,
);

module.exports = router;
