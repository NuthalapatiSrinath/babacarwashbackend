const router = require("express").Router();

router.use("/auth", require("./auth"));
router.use("/users", require("./users"));
router.use("/locations", require("./locations"));
router.use("/buildings", require("./buildings"));
router.use("/malls", require("./malls"));
router.use("/workers", require("./workers"));
router.use("/customers", require("./customers"));
router.use("/jobs", require("./jobs"));
router.use("/onewash", require("./onewash"));
router.use("/payments", require("./payments"));
router.use("/analytics", require("./analytics"));
router.use("/import-logs", require("./import-logs"));
router.use("/supervisors", require("./supervisors"));
router.use("/enquiry", require("./enquiry"));
router.use("/bookings", require("./bookings"));
router.use("/pricing", require("./pricing"));
router.use("/attendance", require("./attendance"));
router.use("/sites", require("./sites"));
router.use("/configurations", require("./configurations"));
router.use("/admin/staff", require("./staff"));

// ✅ FIXED: Added require()
router.use("/salary", require("./salary"));

module.exports = router;
