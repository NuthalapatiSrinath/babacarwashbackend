const router = require("express").Router();
const controller = require("./payments.controller");
const realtime = require("./payments.realtime");
const AuthHelper = require("../auth/auth.helper");

const authenticateStream = (req, res, next) => {
  const queryToken = (req.query?.token || "").toString().trim();
  if (queryToken && !req.headers.authorization) {
    req.headers.authorization = queryToken;
  }
  return AuthHelper.authenticate(req, res, next);
};

router.get("/", AuthHelper.authenticate, controller.list);
router.get("/stream", authenticateStream, realtime.subscribe);

module.exports = router;
