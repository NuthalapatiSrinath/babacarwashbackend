const router = require("express").Router();
const controller = require("./onewash.controller");
const AuthHelper = require("../auth/auth.helper");

// ✅ Static/Specific Routes FIRST
router.get("/", AuthHelper.authenticate, controller.list);
router.post("/", AuthHelper.authenticate, controller.create);

router.get("/export/list", AuthHelper.authenticate, controller.exportData);
router.get(
  "/export/statement/monthly",
  AuthHelper.authenticate,
  controller.monthlyStatement,
);

// ✅ Dynamic Parameter Routes LAST
router.delete("/:id/undo", AuthHelper.authenticate, controller.undoDelete);
router.get("/:id", AuthHelper.authenticate, controller.info);
router.put("/:id", AuthHelper.authenticate, controller.update);
router.delete("/:id", AuthHelper.authenticate, controller.delete);

module.exports = router;
