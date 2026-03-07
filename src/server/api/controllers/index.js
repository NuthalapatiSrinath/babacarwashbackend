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
router.use("/admin-staff", require("./admin-staff"));
router.use("/admin-messages", require("./admin-messages"));
router.use("/access-requests", require("./access-requests"));

// ✅ FIXED: Added require()
router.use("/salary", require("./salary"));
router.use("/vehicle-catalog", require("./vehicle-catalog"));
router.use("/customer-activities", require("./customer-activities"));
router.use("/staff-activities", require("./staff-activities"));
router.use("/admin-activities", require("./admin-activities"));
router.use("/supervisor-activities", require("./supervisor-activities"));

module.exports = router;
