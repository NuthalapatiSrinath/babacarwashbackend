const service = require("./customer-notifications.service");

const controller = module.exports;

controller.health = async (req, res) => {
  try {
    const data = service.getHealthStatus();
    return res.status(200).json({ statusCode: 200, message: "success", data });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      statusCode: 500,
      message: error.message || "Failed to read notification health",
    });
  }
};

controller.sendToCustomers = async (req, res) => {
  try {
    const { user, body } = req;
    const data = await service.sendToCustomers(user, body);
    return res.status(200).json({ statusCode: 200, message: "success", data });
  } catch (error) {
    console.error(error);
    return res.status(400).json({
      statusCode: 400,
      message: error.message || "Failed to send push notification",
    });
  }
};
