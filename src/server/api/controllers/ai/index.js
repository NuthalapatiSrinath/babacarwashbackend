const router = require("express").Router();
const controller = require("./ai.controller");
const AuthHelper = require("../auth/auth.helper");
const { hasAccess } = require("../../middleware/permissions.middleware");

const MODULE = "aiAssistant";

router.get(
  "/domains",
  AuthHelper.authenticate,
  hasAccess(MODULE, "view"),
  controller.domains,
);

router.post(
  "/search",
  AuthHelper.authenticate,
  hasAccess(MODULE, "view"),
  controller.search,
);

module.exports = router;
