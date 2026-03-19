const service = require("./configurations.service");
const controller = (module.exports = {});

controller.fetch = async (req, res) => {
  try {
    const data = await service.fetch();
    return res.status(200).json({ statusCode: 200, message: "success", data });
  } catch (error) {
    console.error("Customer configurations fetch error:", error);
    return res
      .status(500)
      .json({ message: "Internal server errorjkhjjkjkjkjkkhkhkh", error });
  }
};
