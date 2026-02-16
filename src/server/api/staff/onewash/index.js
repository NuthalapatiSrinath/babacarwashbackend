const router = require("express").Router();
const controller = require("./onewash.controller");
const AuthHelper = require("../auth/auth.helper");

router.get("/", AuthHelper.authenticate, controller.list);
router.get("/pricing", AuthHelper.authenticate, controller.getPricing);
router.post("/", AuthHelper.authenticate, controller.create);
router.get("/:id", AuthHelper.authenticate, controller.info);
router.put("/:id", AuthHelper.authenticate, controller.update);
router.delete("/:id", AuthHelper.authenticate, controller.delete);
router.delete("/:id/undo", AuthHelper.authenticate, controller.undoDelete);

module.exports = router;
