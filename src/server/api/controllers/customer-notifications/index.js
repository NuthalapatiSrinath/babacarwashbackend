const router = require("express").Router();
const controller = require("./customer-notifications.controller");
const AuthHelper = require("../auth/auth.helper");
const upload = require("../../../helpers/multer");

router.get("/health", AuthHelper.authenticate, controller.health);
router.post("/send", AuthHelper.authenticate, controller.sendToCustomers);
router.get("/history", AuthHelper.authenticate, controller.history);
router.get("/stats", AuthHelper.authenticate, controller.stats);
router.post(
  "/upload-image",
  AuthHelper.authenticate,
  upload.single("file"),
  controller.uploadImage,
);

module.exports = router;
