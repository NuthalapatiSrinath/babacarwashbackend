const csv = require("fast-csv");
const service = require("./jobs.service");
const controller = module.exports;

controller.list = async (req, res) => {
  try {
    const { user, query } = req;
    const data = await service.list(user, query);
    return res
      .status(200)
      .json({ statusCode: 200, message: "success", ...data });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal server error", error });
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

// ✅ UPDATED: Handles both Excel stream and JSON response
controller.monthlyStatement = async (req, res) => {
  try {
    const { user, query } = req;
    const result = await service.monthlyStatement(user, query);

    // If result is not a workbook (it's JSON data), send JSON
    if (query.format === "json") {
      return res.status(200).json(result);
    }

    // Default: Send Excel File
    result.xlsx
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

controller.runScheduler = async (req, res) => {
  try {
    const { targetDate } = req.body;
    console.log("🚀 [Run Scheduler] Request received");
    console.log("📅 Target Date:", targetDate || "default (tomorrow)");

    const jobsCron = require("../../../../scripts/crons/jobs");

    // Check if jobs already exist for the target date
    const moment = require("moment-timezone");
    const JobsModel = require("../../models/jobs.model");

    console.log("✅ Modules loaded successfully");

    const checkDate = targetDate
      ? moment.tz(targetDate, "Asia/Dubai").startOf("day")
      : moment().tz("Asia/Dubai").startOf("day").add(1, "day");

    console.log(
      "🔍 Checking for existing jobs on:",
      checkDate.format("YYYY-MM-DD"),
    );

    const existingJobs = await JobsModel.countDocuments({
      assignedDate: {
        $gte: checkDate.toDate(),
        $lt: checkDate.clone().add(1, "day").toDate(),
      },
      isDeleted: { $ne: true }, // Only count non-deleted jobs
    });

    console.log("📊 Existing jobs count:", existingJobs);

    if (existingJobs > 0) {
      console.log("⚠️ Jobs already exist, blocking duplicate creation");
      return res.status(400).json({
        statusCode: 400,
        message: `Jobs already exist for ${checkDate.format("YYYY-MM-DD")} (${existingJobs} jobs found). Cannot create duplicates.`,
        jobsGenerated: 0,
        existingJobs,
      });
    }

    console.log("✨ Running scheduler...");
    // Run the scheduler
    const result = await jobsCron.run(targetDate);

    console.log("✅ Scheduler completed successfully");
    console.log("📈 Jobs generated:", result.jobsGenerated);

    return res.status(200).json({
      statusCode: 200,
      message: "Scheduler executed successfully",
      ...result,
    });
  } catch (error) {
    console.error("❌ [Scheduler Error]:", error);
    console.error("Stack:", error.stack);
    return res.status(500).json({
      statusCode: 500,
      message: "Internal server error",
      error: error.message,
    });
  }
};
