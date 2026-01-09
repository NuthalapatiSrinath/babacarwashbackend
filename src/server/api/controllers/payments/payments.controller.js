const service = require("./payments.service");
const controller = module.exports;

controller.list = async (req, res) => {
  try {
    const { user, query } = req;
    console.log("🔵 [BACKEND] Payments list called with query:", query);
    const data = await service.list(user, query);
    console.log(
      "✅ [BACKEND] Payments list success, returning",
      data.total,
      "records"
    );
    return res
      .status(200)
      .json({ statusCode: 200, message: "success", ...data });
  } catch (error) {
    console.error("❌ [BACKEND] Payments list error:", error);
    return res
      .status(500)
      .json({ message: "Internal server error", error: error.message });
  }
};

controller.info = async (req, res) => {
  try {
    const { user, params } = req;
    const data = await service.info(user, params.id);
    return res.status(200).json({ statusCode: 200, message: "success", data });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal server error", error });
  }
};

controller.create = async (req, res) => {
  try {
    const { user, body } = req;
    const data = await service.create(user, body);
    return res.status(200).json({ statusCode: 200, message: "success", data });
  } catch (error) {
    if (error.code == 11000) {
      return res.status(409).json({
        statusCode: 409,
        message: "Oops! Location already exists",
        error,
      });
    }
    console.error(error);
    return res.status(500).json({ message: "Internal server error", error });
  }
};

controller.update = async (req, res) => {
  try {
    const { user, params, body } = req;
    const data = await service.update(user, params.id, body);
    return res.status(200).json({ statusCode: 200, message: "success", data });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal server error", error });
  }
};

controller.delete = async (req, res) => {
  try {
    const { user, params, body } = req;
    const data = await service.delete(user, params.id);
    return res.status(200).json({ statusCode: 200, message: "success", data });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal server error", error });
  }
};

controller.undoDelete = async (req, res) => {
  try {
    const { user, params } = req;
    const data = await service.undoDelete(user, params.id);
    return res.status(200).json({ statusCode: 200, message: "success", data });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal server error", error });
  }
};

controller.updatePayment = async (req, res) => {
  try {
    const { user, params, body } = req;
    const data = await service.updatePayment(user, params.id, body);
    return res.status(200).json({ statusCode: 200, message: "success", data });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal server error", error });
  }
};

controller.collectPayment = async (req, res) => {
  try {
    const { user, params, body } = req;
    const data = await service.collectPayment(user, params.id, body);
    return res.status(200).json({ statusCode: 200, message: "success", data });
  } catch (error) {
    if (typeof error == "string") {
      return res.status(400).json({ statusCode: 400, message: error });
    }
    console.error(error);
    return res
      .status(400)
      .json({ status: false, message: "Internal server error", error });
  }
};

controller.settlements = async (req, res) => {
  try {
    const { user, query } = req;
    console.log("Settlements request from user:", user.role, user._id);
    console.log("Query params:", query);
    const data = await service.settlements(user, query);
    return res
      .status(200)
      .json({ statusCode: 200, message: "success", ...data });
  } catch (error) {
    console.error("Settlements Controller Error:", error);
    console.error("Error stack:", error.stack);
    return res.status(400).json({
      status: false,
      message: error.message || "Internal server error",
      error: error.toString(),
    });
  }
};

controller.updateSettlements = async (req, res) => {
  try {
    const { params, user, query } = req;
    const data = await service.updateSettlements(params.id, user, query);
    return res
      .status(200)
      .json({ statusCode: 200, message: "success", ...data });
  } catch (error) {
    console.error(error);
    return res
      .status(400)
      .json({ status: false, message: "Internal server error", error });
  }
};

controller.settlePayment = async (req, res) => {
  try {
    const { user, params, body } = req;
    const data = await service.settlePayment(user, params.id, body);
    return res.status(200).json({ statusCode: 200, message: "success", data });
  } catch (error) {
    console.error(error);
    return res
      .status(400)
      .json({ status: false, message: "Internal server error", error });
  }
};

controller.exportData = async (req, res) => {
  try {
    const { user, query } = req;
    const workbook = await service.exportData(user, query);
    workbook.xlsx
      .write(res)
      .then(() => {
        res.end();
      })
      .catch((err) => {
        console.error(err);
        res.status(500).send("Internal Server Error");
      });
  } catch (error) {
    console.error(error);
    return res
      .status(200)
      .json({ status: false, message: "Internal server error", error });
  }
};

controller.monthlyStatement = async (req, res) => {
  try {
    const { user, query } = req;
    const workbook = await service.monthlyStatement(user, query);
    workbook.xlsx
      .write(res)
      .then(() => {
        res.end();
      })
      .catch((err) => {
        console.error(err);
        res.status(500).send("Internal Server Error");
      });
  } catch (error) {
    console.error(error);
    return res
      .status(200)
      .json({ status: false, message: "Internal server error", error });
  }
};
