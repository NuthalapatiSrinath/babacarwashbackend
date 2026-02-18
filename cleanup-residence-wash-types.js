/**
 * Cleanup Script: Remove wash_type from residence jobs
 *
 * This script removes the wash_type field from all residence service jobs
 * as wash_type should only exist for mall jobs.
 *
 * Run with: node cleanup-residence-wash-types.js
 */

require("dotenv").config();
const mongoose = require("mongoose");

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/bcw";

async function cleanupResidenceWashTypes() {
  try {
    console.log("🔌 Connecting to MongoDB...");
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log("✅ Connected to MongoDB");

    const OneWashModel = mongoose.model(
      "onewash",
      new mongoose.Schema({}, { strict: false }),
      "onewash",
    );

    // Find all residence jobs that have wash_type set
    const residenceJobsWithWashType = await OneWashModel.find({
      service_type: "residence",
      wash_type: { $exists: true },
      isDeleted: { $ne: true },
    });

    console.log(
      `\n📊 Found ${residenceJobsWithWashType.length} residence jobs with wash_type set`,
    );

    if (residenceJobsWithWashType.length === 0) {
      console.log("✅ No cleanup needed - all residence jobs are clean!");
      await mongoose.disconnect();
      return;
    }

    // Show some examples
    console.log("\n🔍 Examples of jobs to clean:");
    residenceJobsWithWashType.slice(0, 5).forEach((job, idx) => {
      console.log(
        `  ${idx + 1}. ID: ${job.id || job._id} | Registration: ${job.registration_no} | wash_type: ${job.wash_type}`,
      );
    });

    // Ask for confirmation
    const readline = require("readline").createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const answer = await new Promise((resolve) => {
      readline.question(
        `\n⚠️  Do you want to remove wash_type from ${residenceJobsWithWashType.length} residence jobs? (yes/no): `,
        resolve,
      );
    });
    readline.close();

    if (answer.toLowerCase() !== "yes") {
      console.log("❌ Cleanup cancelled");
      await mongoose.disconnect();
      return;
    }

    // Perform cleanup
    console.log("\n🧹 Cleaning up residence jobs...");
    const result = await OneWashModel.updateMany(
      {
        service_type: "residence",
        wash_type: { $exists: true },
        isDeleted: { $ne: true },
      },
      {
        $unset: { wash_type: "" },
      },
    );

    console.log(`\n✅ Cleanup complete!`);
    console.log(`   Modified: ${result.modifiedCount} jobs`);
    console.log(`   Matched: ${result.matchedCount} jobs`);

    // Verify cleanup
    const remainingIssues = await OneWashModel.countDocuments({
      service_type: "residence",
      wash_type: { $exists: true },
      isDeleted: { $ne: true },
    });

    if (remainingIssues === 0) {
      console.log("\n✨ Perfect! All residence jobs are now clean.");
    } else {
      console.log(
        `\n⚠️  Warning: ${remainingIssues} residence jobs still have wash_type`,
      );
    }

    await mongoose.disconnect();
    console.log("\n🔌 Disconnected from MongoDB");
  } catch (error) {
    console.error("\n❌ Error during cleanup:", error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

// Run the cleanup
cleanupResidenceWashTypes();
