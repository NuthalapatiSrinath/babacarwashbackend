const router = require("express").Router();
const controller = require("./salary.controller");
const settingsController = require("./salary-settings.controller");
const AuthHelper = require("../auth/auth.helper");

// ============== SALARY SLIP ROUTES ==============
// Get a slip (fetches existing or calculates preview)
// GET /api/salary/slip?workerId=...&month=10&year=2025
router.get("/slip", AuthHelper.authenticate, controller.getSalarySlip);

// Save or update a slip with manual inputs
// POST /api/salary/slip
router.post("/slip", AuthHelper.authenticate, controller.saveSalarySlip);

// ============== SALARY SETTINGS ROUTES ==============
// Get all salary settings
// GET /api/salary/settings
router.get(
  "/settings",
  AuthHelper.authenticate,
  settingsController.getSettings,
);

// Save/Update salary settings
// POST /api/salary/settings
router.post(
  "/settings",
  AuthHelper.authenticate,
  settingsController.saveSettings,
);

// Get specific category settings
// GET /api/salary/settings/:category
router.get(
  "/settings/:category",
  AuthHelper.authenticate,
  settingsController.getCategorySettings,
);

// Update specific category
// PATCH /api/salary/settings/:category
router.patch(
  "/settings/:category",
  AuthHelper.authenticate,
  settingsController.updateCategory,
);

// Reset to default values
// POST /api/salary/settings/reset
router.post(
  "/settings/reset",
  AuthHelper.authenticate,
  settingsController.resetToDefaults,
);

// Calculate salary based on employee type
// POST /api/salary/calculate
router.post(
  "/calculate",
  AuthHelper.authenticate,
  settingsController.calculateSalary,
);

module.exports = router;
