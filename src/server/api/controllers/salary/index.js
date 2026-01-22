const router = require("express").Router();
const controller = require("./salary.controller");
const AuthHelper = require("../auth/auth.helper");

// Get a slip (fetches existing or calculates preview)
// GET /api/salary/slip?workerId=...&month=10&year=2025
router.get("/slip", AuthHelper.authenticate, controller.getSalarySlip);

// Save or update a slip with manual inputs
// POST /api/salary/slip
router.post("/slip", AuthHelper.authenticate, controller.saveSalarySlip);

module.exports = router;
