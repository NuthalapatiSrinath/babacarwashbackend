const router = require("express").Router();
const controller = require("./configurations.controller");
const AuthHelper = require("../auth/auth.helper");

router.get("/", AuthHelper.authenticate, controller.fetch);

module.exports = router;
