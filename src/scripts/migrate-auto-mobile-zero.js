const mongoose = require("mongoose");
const CustomersModel = require("../server/api/models/customers.model");
const config = require("../server/utils/config");

const isApplyMode = process.argv.includes("--apply");

const normalizeAutoMobile = (mobile) => {
  const raw = String(mobile || "").trim();

  // Repair previously shortened locals: 200000xx / 200000x -> 2000000xx / 20000000x
  if (/^200000\d{1,2}$/.test(raw)) {
    const suffix = raw.slice(6);
    return `200000${suffix.padStart(3, "0")}`;
  }

  // Repair previously shortened internationals: 971200000xx / 971200000x -> 9712000000xx / 97120000000x
  if (/^971200000\d{1,2}$/.test(raw)) {
    const suffix = raw.slice(9);
    return `971200000${suffix.padStart(3, "0")}`;
  }

  // Canonical with legacy extra zero: 9712000000xxx -> 971200000xxx
  if (/^9712000000\d{3}$/.test(raw)) {
    return `971200000${raw.slice(10)}`;
  }

  // Local legacy extra zero: 2000000xxx -> 200000xxx
  if (/^2000000\d{3}$/.test(raw)) {
    return `200000${raw.slice(7)}`;
  }

  return null;
};

const main = async () => {
  let scanned = 0;
  let candidates = 0;
  let updated = 0;
  let skippedConflict = 0;

  try {
    await mongoose.connect(config.database.mongo.uri, config.database.mongo.options);

    const cursor = CustomersModel.find({
      mobile: { $regex: /^(9712000000\d{3}|2000000\d{3}|971200000\d{1,2}|200000\d{1,2})$/ },
      isDeleted: false,
    })
      .select("_id mobile")
      .lean()
      .cursor();

    for await (const customer of cursor) {
      scanned += 1;
      const nextMobile = normalizeAutoMobile(customer.mobile);

      if (!nextMobile || nextMobile === customer.mobile) {
        continue;
      }

      candidates += 1;

      const conflict = await CustomersModel.findOne({
        _id: { $ne: customer._id },
        mobile: nextMobile,
        isDeleted: false,
      })
        .select("_id")
        .lean();

      if (conflict) {
        skippedConflict += 1;
        console.log(
          `[SKIP-CONFLICT] ${customer._id} ${customer.mobile} -> ${nextMobile} conflicts with ${conflict._id}`,
        );
        continue;
      }

      if (isApplyMode) {
        await CustomersModel.updateOne(
          { _id: customer._id },
          { $set: { mobile: nextMobile } },
        );
      }

      updated += 1;
      console.log(
        `${isApplyMode ? "[UPDATED]" : "[DRY-RUN]"} ${customer._id} ${customer.mobile} -> ${nextMobile}`,
      );
    }

    console.log("\n=== Auto Mobile Zero Migration Summary ===");
    console.log(`Mode            : ${isApplyMode ? "APPLY" : "DRY-RUN"}`);
    console.log(`Scanned         : ${scanned}`);
    console.log(`Candidates      : ${candidates}`);
    console.log(`Updated/Planned : ${updated}`);
    console.log(`Conflicts Skipped: ${skippedConflict}`);

    if (!isApplyMode) {
      console.log("\nDry-run only. Re-run with --apply to persist changes.");
    }
  } catch (error) {
    console.error("Migration failed:", error);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
};

main();
