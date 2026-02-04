"use strict";

const mongoose = require("mongoose");

const vehicleSchema = new mongoose.Schema(
  {
    registration_no: { type: String },
    parking_no: { type: String },
    worker: { type: String },
    amount: { type: Number },
    schedule_type: { type: String, lowercase: true },
    schedule_days: { type: Array },
    start_date: { type: Date },
    onboard_date: { type: Date },
    advance_amount: { type: Number },
    vehicle_type: { type: String },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

const schema = new mongoose.Schema(
  {
    id: { type: Number },
    status: { type: String, default: "pending" },
    firstName: { type: String },
    lastName: { type: String },
    mobile: { type: String },
    email: { type: String },
    location: { type: mongoose.Schema.Types.ObjectId, ref: "locations" },
    building: { type: mongoose.Schema.Types.ObjectId, ref: "buildings" },
    flat_no: { type: String },
    vehicles: { type: [vehicleSchema] },
    deletedBy: { type: String },
    updatedBy: { type: String, required: true },
    isDeleted: { type: Boolean, default: false },
  },
  { versionKey: false, strict: false, timestamps: true },
);

module.exports = mongoose.model("enquiry", schema);
