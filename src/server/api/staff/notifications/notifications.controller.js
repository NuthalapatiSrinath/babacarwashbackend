const service = require("./notifications.service");
const controller = module.exports;

controller.inAppCount = async (req, res) => {
  try {
    const { user, query } = req;
    const data = await service.inAppCount(user, query);
    return res.status(200).json({ statusCode: 200, message: "success", data });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal server error", error });
  }
};

controller.inApp = async (req, res) => {
  try {
    const { user, query } = req;
    const data = await service.inApp(user, query);
    return res.status(200).json({ statusCode: 200, message: "success", data });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal server error", error });
  }
};

controller.getAllNotifications = async (req, res) => {
  try {
    const { user } = req;
    const data = await service.getAllNotifications(user);
    return res.status(200).json({ statusCode: 200, message: "success", data });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal server error", error });
  }
};

controller.markAllAsRead = async (req, res) => {
  try {
    const { user } = req;
    const data = await service.markAllAsRead(user);
    return res.status(200).json({ statusCode: 200, message: "success", data });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal server error", error });
  }
};
