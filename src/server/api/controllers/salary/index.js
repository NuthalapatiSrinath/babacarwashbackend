const router = require("express").Router();
const controller = require("./salary.controller");
const settingsController = require("./salary-settings.controller");

// FIXED PATH: Go up one level (..) to 'controllers', then into 'auth'
const AuthHelper = require("../auth/auth.helper");

// ============== SALARY SLIP ROUTES ==============

/**
 * GET /api/salary/slip
 * Fetch a salary slip.
 * Query Params: ?workerId=...&month=0&year=2025
 */
router.get("/slip", AuthHelper.authenticate, controller.getSalarySlip);

/**
 * POST /api/salary/slip
 * Save or finalize a salary slip with manual inputs.
 * Body: { workerId, month, year, manualInputs: {...} }
 */
router.post("/slip", AuthHelper.authenticate, controller.saveSalarySlip);

// ============== SALARY SETTINGS ROUTES ==============

/**
 * GET /api/salary/settings
 * Get the current active configuration.
 */
router.get(
  "/settings",
  AuthHelper.authenticate,
  settingsController.getSettings,
);

/**
 * POST /api/salary/settings
 * Update all settings at once.
 */
router.post(
  "/settings",
  AuthHelper.authenticate,
  settingsController.saveSettings,
);

/**
 * GET /api/salary/settings/:category
 * Get a specific section (e.g., 'carWash', 'mall').
 */
router.get(
  "/settings/:category",
  AuthHelper.authenticate,
  settingsController.getCategorySettings,
);

/**
 * PATCH /api/salary/settings/:category
 * Update a specific section.
 */
router.patch(
  "/settings/:category",
  AuthHelper.authenticate,
  settingsController.updateCategory,
);

/**
 * POST /api/salary/settings/reset
 * Restore default values from the system.
 */
router.post(
  "/settings/reset",
  AuthHelper.authenticate,
  settingsController.resetToDefaults,
);

/**
 * POST /api/salary/calculate
 * Utility route for the frontend calculator to preview earnings without saving.
 */
router.post(
  "/calculate",
  AuthHelper.authenticate,
  settingsController.calculateSalary,
);

module.exports = router;
