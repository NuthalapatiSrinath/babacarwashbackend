const SalaryService = require("./salary.service");

exports.getSalarySlip = async (req, res) => {
  try {
    const { workerId, month, year } = req.query;
    if (!workerId || month === undefined || !year) {
      return res.status(400).json({ message: "Missing required parameters" });
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

exports.saveSalarySlip = async (req, res) => {
  try {
    const adminName = `${req.user.firstName} ${req.user.lastName}`;
    // req.body should contain: workerId, month, year, and manualInputs object
    const data = await SalaryService.saveSlip(req.body, adminName);
    return res
      .status(200)
      .json({ message: "Salary slip saved successfully", data });
  } catch (error) {
    console.error("Save Salary Slip Error:", error);
    return res.status(500).json({ message: error.message });
  }
};
