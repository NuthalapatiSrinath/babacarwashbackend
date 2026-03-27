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

module.exports = router;
