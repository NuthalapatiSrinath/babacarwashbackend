const router = require("express").Router();

router.use("/auth", require("./auth"));
router.use("/vehicles", require("./vehicles"));
router.use("/bookings", require("./bookings"));
router.use("/addresses", require("./addresses"));
router.use("/places", require("./places"));
router.use("/pricing", require("./pricing"));
router.use("/malls", require("./malls"));
router.use("/buildings", require("./buildings"));
router.use("/locations", require("./locations"));
router.use("/payments", require("./payments"));
router.use("/jobs", require("./jobs"));
router.use("/history", require("./history"));
router.use("/vehicle-catalog", require("./vehicle-catalog"));
router.use("/activity", require("./activity"));
router.use("/configurations", require("./configurations"));

module.exports = router;
