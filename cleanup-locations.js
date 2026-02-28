/**
 * One-time script to trim whitespace from location addresses in the database.
 * Run: node cleanup-locations.js
 */
require("dotenv").config();
const mongoose = require("mongoose");

const MONGO_URI = (process.env.MONGO_URI || "").trim();

async function run() {
  console.log("Connecting to MongoDB...");
  await mongoose.connect(MONGO_URI, {
    authSource: "admin",
    useNewUrlParser: true,
    useUnifiedTopology: true,
    useCreateIndex: true,
    useFindAndModify: false,
  });
  const db = mongoose.connection.db;

  // 1. Fix locations - trim address field
  const locations = await db.collection("locations").find({}).toArray();
  let fixedLocations = 0;
  for (const loc of locations) {
    if (loc.address && loc.address !== loc.address.trim()) {
      console.log(`  Location: "${loc.address}" → "${loc.address.trim()}"`);
      await db
        .collection("locations")
        .updateOne({ _id: loc._id }, { $set: { address: loc.address.trim() } });
      fixedLocations++;
    }
  }
  console.log(`✅ Fixed ${fixedLocations} location(s) with whitespace issues.`);

  // 2. Fix buildings - trim name field
  const buildings = await db.collection("buildings").find({}).toArray();
  let fixedBuildings = 0;
  for (const bld of buildings) {
    if (bld.name && bld.name !== bld.name.trim()) {
      console.log(`  Building: "${bld.name}" → "${bld.name.trim()}"`);
      await db
        .collection("buildings")
        .updateOne({ _id: bld._id }, { $set: { name: bld.name.trim() } });
      fixedBuildings++;
    }
  }
  console.log(`✅ Fixed ${fixedBuildings} building(s) with whitespace issues.`);

  // 3. Show all current locations for verification
  const allLocations = await db
    .collection("locations")
    .find({ isDeleted: false })
    .project({ address: 1 })
    .toArray();
  console.log("\n📍 Current locations in DB:");
  allLocations.forEach((l, i) =>
    console.log(`  ${i + 1}. "${l.address}" (len: ${l.address?.length})`),
  );

  await mongoose.disconnect();
  console.log("\nDone!");
}

run().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
