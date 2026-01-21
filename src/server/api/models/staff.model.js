"use strict";

const mongoose = require("mongoose");

/**
 * Staff Schema
 * Updated to support Mixed types for Site/Mall to handle legacy data (strings) + new data (ObjectIds)
 */
const schema = new mongoose.Schema(
  {
    // Auto-incremented ID
    id: { type: Number },

    // Core Personal Details
    name: { type: String, required: true },
    employeeCode: { type: String, unique: true },
    companyName: { type: String },

    // ✅ FIXED: Use 'Mixed' to prevent crash on old data (e.g., "Dubai")
    site: { type: mongoose.Schema.Types.Mixed, ref: "sites" },
    mall: { type: mongoose.Schema.Types.Mixed, ref: "malls" },

    joiningDate: { type: Date },
    mobile: { type: String },
    email: { type: String },

    // Profile Image
    profileImage: {
      url: { type: String },
      publicId: { type: String },
      filename: { type: String },
    },

    // Passport
    passportNumber: { type: String },
    passportExpiry: { type: Date },
    passportDocument: {
      url: String,
      publicId: String,
      filename: String,
      uploadedAt: { type: Date },
    },

    // Visa
    visaNumber: { type: String },
    visaExpiry: { type: Date },
    visaDocument: {
      url: String,
      publicId: String,
      filename: String,
      uploadedAt: { type: Date },
    },

    // Emirates ID
    emiratesId: { type: String },
    emiratesIdExpiry: { type: Date },
    emiratesIdDocument: {
      url: String,
      publicId: String,
      filename: String,
      uploadedAt: { type: Date },
    },

    // System Fields
    isDeleted: { type: Boolean, default: false },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "users" },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "users" },
    deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: "users" },
    deleteReason: { type: String },
  },
  {
    versionKey: false,
    strict: false,
    timestamps: true,
  },
);

schema.index({
  name: "text",
  employeeCode: "text",
  mobile: "text",
  email: "text",
});

module.exports = mongoose.model("staff", schema);
