const router = require("express").Router();
const controller = require("./customer-notifications.controller");
const AuthHelper = require("../auth/auth.helper");

router.get("/health", AuthHelper.authenticate, controller.health);
router.post("/send", AuthHelper.authenticate, controller.sendToCustomers);

module.exports = router;
