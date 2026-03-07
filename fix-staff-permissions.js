/**
 * One-time migration: Fix existing staff (role: manager) with empty permissions.
 * Sets all module permissions to true (full access).
 */
const mongoose = require("mongoose");
const dotenv = require("dotenv");
dotenv.config();

const MONGO_URI = process.env.MONGO_URI;

const fullAccessPermissions = {
  dashboard: { view: true },
  customers: { view: true, create: true, edit: true, delete: true },
  workers: { view: true, create: true, edit: true, delete: true },
  staff: { view: true, create: true, edit: true, delete: true },
  attendance: { view: true, create: true, edit: true, delete: true },
  supervisors: { view: true, create: true, edit: true, delete: true },
  washes: { view: true, create: true, edit: true, delete: true },
  payments: { view: true, create: true, edit: true, delete: true },
  workRecords: { view: true },
  collectionSheet: { view: true },
  settlements: { view: true, create: true, edit: true, delete: true },
  pendingPayments: { view: true },
  yearlyRecords: { view: true },
  pricing: { view: true, edit: true },
  locations: { view: true, create: true, edit: true, delete: true },
  buildings: { view: true, create: true, edit: true, delete: true },
  malls: { view: true, create: true, edit: true, delete: true },
  sites: { view: true, create: true, edit: true, delete: true },
  vehicles: { view: true, create: true, edit: true, delete: true },
  enquiry: { view: true, edit: true, delete: true },
  bookings: { view: true, edit: true, delete: true },
  importLogs: { view: true },
  settings: { view: true, edit: true },
};

async function run() {
  await mongoose.connect(MONGO_URI, {
    authSource: "admin",
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });
  console.log("Connected to DB");

  const result = await mongoose.connection.db.collection("users").updateMany(
    {
      role: "manager",
      $or: [
        { permissions: {} },
        { permissions: { $exists: false } },
        { "permissions.dashboard": { $exists: false } },
      ],
    },
    { $set: { permissions: fullAccessPermissions } },
  );

  console.log(
    `Updated ${result.modifiedCount} staff members with full access permissions`,
  );
  await mongoose.disconnect();
  process.exit(0);
}

run().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
