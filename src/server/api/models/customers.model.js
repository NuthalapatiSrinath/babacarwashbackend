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
    status: { type: Number, default: 1 },
    deactivateReason: { type: String },
    deactivateDate: { type: Date },
    reactivateDate: { type: Date },
    vehicle_type: { type: String },
    brandId: { type: mongoose.Schema.Types.ObjectId, ref: "vehicle_brands" },
    brandName: { type: String },
    modelId: { type: mongoose.Schema.Types.ObjectId, ref: "vehicle_models" },
    modelName: { type: String },
    modelImage: { type: String },
    category: { type: String },
    vehicleName: { type: String },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

const schema = new mongoose.Schema(
  {
    id: { type: Number },
    mobile: { type: String },
    firstName: { type: String },
    lastName: { type: String },
    location: { type: String, ref: "locations" },
    building: { type: String, ref: "buildings" },
    flat_no: { type: String },
    vehicles: { type: [vehicleSchema] },
    notes: { type: String }, // Customer notes - can be edited from Residence Payments
    status: { type: Number, default: 1 },
    deactivateReason: { type: String },
    deactivateDate: { type: Date },
    reactivateDate: { type: Date },
    createdBy: { type: String, ref: "users" },
    updatedBy: { type: String },
    deletedBy: { type: String },
    isDeleted: { type: Boolean, default: false },
    password: { type: String },
    hPassword: { type: String },
  },
  {
    versionKey: false,
    strict: false,
    timestamps: true,
  },
);

// ⚡ PERFORMANCE: Add indexes for fast queries
schema.index({ isDeleted: 1, status: 1 }); // Most common filter
schema.index({ building: 1, isDeleted: 1, status: 1 }); // Building filter
schema.index({ mobile: 1 }); // Search by mobile
schema.index({ firstName: 1, lastName: 1 }); // Search by name
schema.index({ "vehicles.registration_no": 1 }); // Search by vehicle
schema.index({ "vehicles.parking_no": 1 }); // Search by parking
schema.index({ "vehicles.worker": 1 }); // Worker filter

module.exports = mongoose.model("customers", schema);
