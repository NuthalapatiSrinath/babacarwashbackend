"use strict";

const mongoose = require("mongoose");
const schema = new mongoose.Schema(
  {
    id: { type: Number },
    scheduleId: { type: Number },
    assignedDate: { type: Date },
    completedDate: { type: Date },
    customer: { type: String, ref: "customers" },
    worker: { type: String, ref: "workers" },
    vehicle: { type: String },
    registration_no: { type: String }, // Vehicle registration from customer.vehicles
    parking_no: { type: String }, // Parking number from customer.vehicles
    location: { type: String, ref: "locations" },
    building: { type: String, ref: "buildings" },
    locationMap: { type: Object },
    status: { type: String, default: "pending" },
    rejectionReason: { type: String }, // Reason for rejection when status is rejected

    // ✅ ADD THESE FIELDS
    tips: { type: Number, default: 0 }, // Required for One Wash Tips report
    price: { type: Number, default: 0 }, // Required for One Wash amount

    createdBy: { type: String },
    deletedBy: { type: String },
    immediate: { type: Boolean, default: false },
    isDeleted: { type: Boolean, default: false },
  },
  {
    versionKey: false,
    strict: false,
    timestamps: true,
  },
);

module.exports = mongoose.model("jobs", schema);
