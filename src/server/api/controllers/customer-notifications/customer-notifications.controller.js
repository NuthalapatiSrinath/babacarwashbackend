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

controller.history = async (req, res) => {
  try {
    const { query } = req;
    const data = await service.getNotificationHistory(query);
    return res.status(200).json({ statusCode: 200, message: "success", data });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      statusCode: 500,
      message: error.message || "Failed to fetch campaign history",
    });
  }
};

controller.stats = async (req, res) => {
  try {
    const { query } = req;
    const data = await service.getNotificationStats(query);
    return res.status(200).json({ statusCode: 200, message: "success", data });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      statusCode: 500,
      message: error.message || "Failed to fetch campaign stats",
    });
  }
};

controller.uploadImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        statusCode: 400,
        message: "No image file provided",
      });
    }

    const relativePath = `/uploads/${req.file.filename}`;
    const forwardedProto = String(req.headers["x-forwarded-proto"] || "")
      .split(",")[0]
      .trim();
    const protocol = forwardedProto || req.protocol || "http";
    const host = req.get("host");
    const imageUrl = host
      ? `${protocol}://${host}${relativePath}`
      : relativePath;

    return res.status(200).json({
      statusCode: 200,
      message: "success",
      data: {
        imageUrl,
        relativePath,
        filename: req.file.filename,
        size: req.file.size,
        mimetype: req.file.mimetype,
      },
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      statusCode: 500,
      message: error.message || "Failed to upload image",
    });
  }
};
