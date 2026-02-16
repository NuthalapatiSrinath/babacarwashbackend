const SalaryService = require("./salary.service");

/**
 * GET /api/salary/slip
 * Retrieves a salary slip. If it doesn't exist, generates a preview.
 */
exports.getSalarySlip = async (req, res) => {
  try {
    const { workerId, month, year } = req.query;

    if (!workerId || month === undefined || !year) {
      return res.status(400).json({
        message: "Missing required parameters: workerId, month, year",
      });
    }

    const data = await SalaryService.getSlip(
      workerId,
      parseInt(month),
      parseInt(year),
    );

    return res.status(200).json(data);
  } catch (error) {
    console.error("Get Salary Slip Error:", error);
    return res.status(500).json({ message: error.message });
  }
};

/**
 * POST /api/salary/slip
 * Saves or Updates a salary slip with manual inputs (e.g. absent days, sim bill).
 */
exports.saveSalarySlip = async (req, res) => {
  try {
    const adminName = req.user
      ? `${req.user.firstName} ${req.user.lastName}`
      : "Admin";

    // req.body should contain: { workerId, month, year, manualInputs: { ... } }
    const data = await SalaryService.saveSlip(req.body, adminName);

    return res.status(200).json({
      message: "Salary slip saved successfully",
      data,
    });
  } catch (error) {
    console.error("Save Salary Slip Error:", error);
    return res.status(500).json({ message: error.message });
  }
};
