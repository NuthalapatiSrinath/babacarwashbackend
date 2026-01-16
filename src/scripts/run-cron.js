const utils = require("../server/utils");
const database = require("../server/database");
const jobs = require("./crons/jobs");
const invoice = require("./crons/invoice");
const attendance = require("./crons/attendance");

const run = async () => {
  // Get the task name from the command line (e.g., 'jobs')
  const type = process.argv[2];

  try {
    // 1. Initialize Database (Crucial step from your original index.js)
    const utilsData = utils.initialize();
    await database.initialize(utilsData);
    console.log(`MongoDB Connected. Running task: ${type}`);

    // 2. Run the requested task
    if (type === "jobs") {
      await jobs.run();
    } else if (type === "attendance") {
      await attendance.run();
    } else if (type === "invoice") {
      await invoice.run();
    } else {
      console.log("⚠️ Unknown task! Use 'jobs', 'attendance', or 'invoice'");
    }

    console.log("✅ Task Completed Successfully");
    process.exit(0);
  } catch (error) {
    console.error("❌ Task Failed:", error);
    process.exit(1);
  }
};

run();
