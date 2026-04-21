const service = require("./ai.service");
const controller = module.exports;

controller.domains = async (req, res) => {
  try {
    const data = service.listDomains();
    return res.status(200).json({
      statusCode: 200,
      message: "success",
      data,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      statusCode: 500,
      message: "Failed to load AI domains",
    });
  }
};

controller.search = async (req, res) => {
  try {
    const data = await service.search(req.body || {}, req.user || {});
    return res.status(200).json({
      statusCode: 200,
      message: "success",
      ...data,
    });
  } catch (error) {
    console.error(error);

    const message = error && error.message ? error.message : "Invalid request";
    const isValidationError =
      message.startsWith("prompt is required") ||
      message.startsWith("person selection is required") ||
      message.startsWith("person domain is not supported") ||
      message.startsWith("period is not supported") ||
      message.startsWith("A search domain is required") ||
      message.startsWith("Unsupported domain") ||
      message.startsWith("filters must be a plain object") ||
      message.includes("Cast to");

    return res.status(isValidationError ? 400 : 500).json({
      statusCode: isValidationError ? 400 : 500,
      message,
    });
  }
};
