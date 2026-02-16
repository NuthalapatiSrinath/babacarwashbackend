const SalarySettingsService = require("./salary-settings.service");

/**
 * GET /api/salary/settings
 * Get all salary settings
 */
exports.getSettings = async (req, res) => {
  try {
    const settings = await SalarySettingsService.getSettings();
    return res.status(200).json(settings);
  } catch (error) {
    console.error("Get Settings Error:", error);
    return res.status(500).json({ message: error.message });
  }
};

/**
 * POST /api/salary/settings
 * Save/Update salary settings
 */
exports.saveSettings = async (req, res) => {
  try {
    // Safely get admin name, fallback to 'Admin' if auth middleware didn't populate user
    const adminName = req.user
      ? `${req.user.firstName} ${req.user.lastName}`
      : "Admin";

    const settings = await SalarySettingsService.updateSettings(
      req.body,
      adminName,
    );

    return res.status(200).json({
      message: "Settings saved successfully",
      data: settings,
    });
  } catch (error) {
    console.error("Save Settings Error:", error);
    return res.status(500).json({ message: error.message });
  }
};

/**
 * GET /api/salary/settings/:category
 * Get specific category settings
 */
exports.getCategorySettings = async (req, res) => {
  try {
    const { category } = req.params;
    const settings = await SalarySettingsService.getCategorySettings(category);
    return res.status(200).json(settings);
  } catch (error) {
    console.error("Get Category Settings Error:", error);
    return res.status(500).json({ message: error.message });
  }
};

/**
 * PATCH /api/salary/settings/:category
 * Update specific category
 */
exports.updateCategory = async (req, res) => {
  try {
    const { category } = req.params;
    const adminName = req.user
      ? `${req.user.firstName} ${req.user.lastName}`
      : "Admin";

    const settings = await SalarySettingsService.updateCategory(
      category,
      req.body,
      adminName,
    );

    return res.status(200).json({
      message: `${category} updated successfully`,
      data: settings,
    });
  } catch (error) {
    console.error("Update Category Error:", error);
    return res.status(500).json({ message: error.message });
  }
};

/**
 * POST /api/salary/settings/reset
 * Reset to default values
 */
exports.resetToDefaults = async (req, res) => {
  try {
    const adminName = req.user
      ? `${req.user.firstName} ${req.user.lastName}`
      : "Admin";

    const settings = await SalarySettingsService.resetToDefaults(adminName);

    return res.status(200).json({
      message: "Settings reset to defaults successfully",
      data: settings,
    });
  } catch (error) {
    console.error("Reset to Defaults Error:", error);
    return res.status(500).json({ message: error.message });
  }
};

/**
 * POST /api/salary/calculate
 * Calculate salary based on employee type and data
 * Used for live previews/calculators
 */
exports.calculateSalary = async (req, res) => {
  try {
    const { employeeType, employeeData } = req.body;

    if (!employeeType || !employeeData) {
      return res.status(400).json({
        message: "Missing required parameters: employeeType and employeeData",
      });
    }

    const calculation = await SalarySettingsService.calculateSalary(
      employeeType,
      employeeData,
    );

    return res.status(200).json(calculation);
  } catch (error) {
    console.error("Calculate Salary Error:", error);
    return res.status(500).json({ message: error.message });
  }
};
