const router = require("express").Router();
const controller = require("./bookings.controller");
const realtime = require("./bookings.realtime");
const AuthHelper = require("../auth/auth.helper");

const authenticateStream = (req, res, next) => {
  const queryToken = (req.query?.token || "").toString().trim();
  if (queryToken && !req.headers.authorization) {
    req.headers.authorization = queryToken;
  }
  return AuthHelper.authenticate(req, res, next);
};

router.get("/", AuthHelper.authenticate, controller.list);
router.post("/", AuthHelper.authenticate, controller.create);
router.get("/stream", authenticateStream, realtime.subscribe);
router.get("/:id", AuthHelper.authenticate, controller.info);
router.put("/:id", AuthHelper.authenticate, controller.update);
router.delete("/:id", AuthHelper.authenticate, controller.delete);
router.delete("/:id/undo", AuthHelper.authenticate, controller.undoDelete);

module.exports = router;
