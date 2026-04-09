const router = require("express").Router();
const controller = require("./notifications.controller");
const AuthHelper = require("../auth/auth.helper");

router.post(
  "/device-token",
  AuthHelper.authenticate,
  controller.registerDeviceToken,
);
router.delete(
  "/device-token",
  AuthHelper.authenticate,
  controller.removeDeviceToken,
);
router.get(
  "/device-token",
  AuthHelper.authenticate,
  controller.listMyDeviceTokens,
);
router.get(
  "/in-app",
  AuthHelper.authenticate,
  controller.listInAppNotifications,
);
router.get(
  "/in-app/count",
  AuthHelper.authenticate,
  controller.getInAppUnreadCount,
);
router.post(
  "/in-app/:id/read",
  AuthHelper.authenticate,
  controller.markInAppRead,
);
router.post(
  "/in-app/read-all",
  AuthHelper.authenticate,
  controller.markAllInAppRead,
);

module.exports = router;
