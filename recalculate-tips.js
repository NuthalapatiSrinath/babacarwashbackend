/**
 * Script to recalculate tip_amount for existing OneWash and Payment records
 * Run this once to update historical data with correct tip amounts
 */

const mongoose = require("mongoose");
const OneWashModel = require("./src/server/api/models/onewash.model");
const PaymentsModel = require("./src/server/api/models/payments.model");

mongoose.connect(process.env.MONGO_URL || "mongodb://127.0.0.1:27017/bcw", {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

async function recalculateTips() {
  console.log("🔄 Starting tip recalculation...\n");

  // Find all OneWash records with card payments
  const onewashRecords = await OneWashModel.find({
    payment_mode: { $ne: "cash", $exists: true },
    amount: { $gt: 0 },
  }).lean();

  console.log(
    `📊 Found ${onewashRecords.length} OneWash card payment records\n`,
  );

  let updatedOneWash = 0;
  let updatedPayments = 0;

  for (const record of onewashRecords) {
    let baseAmount;

    // Determine base amount based on wash_type
    if (record.wash_type === "total") {
      baseAmount = 31.5;
    } else if (record.wash_type === "outside") {
      baseAmount = 21.5;
    } else {
      // For "inside" or undefined, use the original amount (no overpayment)
      baseAmount = record.amount;
    }

    // Calculate tip
    const tip_amount =
      record.amount > baseAmount ? record.amount - baseAmount : 0;

    // Update OneWashModel
    if (tip_amount !== record.tip_amount) {
      await OneWashModel.updateOne(
        { _id: record._id },
        { $set: { tip_amount } },
      );
      updatedOneWash++;
      console.log(
        `✅ OneWash ${record.id}: ${record.registration_no} - ` +
          `Wash Type: ${record.wash_type || "N/A"}, ` +
          `Amount: ${record.amount}, Base: ${baseAmount}, Tip: ${tip_amount}`,
      );
    }

    // Update corresponding PaymentsModel
    const paymentUpdate = await PaymentsModel.updateOne(
      { job: record._id, onewash: true },
      { $set: { tip_amount } },
    );

    if (paymentUpdate.modifiedCount > 0) {
      updatedPayments++;
    }
  }

  console.log(`\n✅ Recalculation Complete!`);
  console.log(`   - Updated ${updatedOneWash} OneWash records`);
  console.log(`   - Updated ${updatedPayments} Payment records`);

  mongoose.disconnect();
}

recalculateTips().catch((error) => {
  console.error("❌ Error:", error);
  mongoose.disconnect();
  process.exit(1);
});
