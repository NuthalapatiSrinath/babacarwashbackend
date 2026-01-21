"use strict";

const mongoose = require("mongoose");

const schema = new mongoose.Schema(
  {
    // --- 🟢 EXISTING WORKER FIELDS (Unchanged) ---
    id: { type: Number }, // Auto-increment ID
    name: { type: String, required: true },
    mobile: { type: String, required: true },
    password: { type: String }, // For app login
    hPassword: { type: String }, // Security hash

    // ✅ EXISTING ASSIGNMENT LOGIC
    // We keep these exactly as they are in Workers (but defined as ObjectIds for safety)
    buildings: [{ type: mongoose.Schema.Types.ObjectId, ref: "buildings" }],
    malls: [{ type: mongoose.Schema.Types.ObjectId, ref: "malls" }],

    // This field helps filter logic in your service (e.g., for supervisors)
    service_type: {
      type: String,
      enum: ["mall", "residence"],
      default: "residence",
    },

    role: {
      type: String,
      enum: ["worker", "supervisor"],
      default: "worker",
    },

    status: { type: Number, default: 1 }, // 1: Active, 0: Inactive, 2: Deactivated
    supervisor: { type: String },

    // --- 🔵 NEW HR FIELDS (Merged from Staff) ---
    employeeCode: { type: String, unique: true, sparse: true },
    companyName: { type: String },
    joiningDate: { type: Date },
    email: { type: String },

    // ✅ Profile Image
    profileImage: {
      url: { type: String },
      publicId: { type: String },
      filename: { type: String },
    },

    // ✅ Passport Details
    passportNumber: { type: String },
    passportExpiry: { type: Date },
    passportDocument: {
      url: String,
      publicId: String,
      filename: String,
      uploadedAt: { type: Date },
    },

    // ✅ Visa Details
    visaNumber: { type: String },
    visaExpiry: { type: Date },
    visaDocument: {
      url: String,
      publicId: String,
      filename: String,
      uploadedAt: { type: Date },
    },

    // ✅ Emirates ID Details
    emiratesId: { type: String },
    emiratesIdExpiry: { type: Date },
    emiratesIdDocument: {
      url: String,
      publicId: String,
      filename: String,
      uploadedAt: { type: Date },
    },

    // --- 🔴 SYSTEM FIELDS ---
    isDeleted: { type: Boolean, default: false },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "users" },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "users" },
    deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: "users" },

    // Deactivation History
    deactivateReason: { type: String },
    otherReason: { type: String },
    transferredTo: { type: mongoose.Schema.Types.ObjectId, ref: "workers" },
  },
  {
    versionKey: false,
    strict: false,
    timestamps: true,
  },
);

// Indexes for faster search
schema.index({
  name: "text",
  mobile: "text",
  employeeCode: "text",
  email: "text",
});

module.exports = mongoose.model("workers", schema);
