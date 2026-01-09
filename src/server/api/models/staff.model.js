"use strict";

const mongoose = require("mongoose");
const schema = new mongoose.Schema(
  {
    id: { type: Number },
    name: { type: String },
    employeeCode: { type: String },
    companyName: { type: String },
    joiningDate: { type: Date },
    site: { type: String, ref: "sites" },
    passportNumber: { type: String },
    passportExpiry: { type: Date },
    passportDocument: {
      url: String, // Cloudinary URL
      publicId: String, // Cloudinary public ID for deletion
      filename: String,
      uploadedAt: Date,
    },
    visaExpiry: { type: Date },
    visaDocument: {
      url: String, // Cloudinary URL
      publicId: String, // Cloudinary public ID for deletion
      filename: String,
      uploadedAt: Date,
    },
    emiratesId: { type: String },
    emiratesIdExpiry: { type: Date },
    emiratesIdDocument: {
      url: String, // Cloudinary URL
      publicId: String, // Cloudinary public ID for deletion
      filename: String,
      uploadedAt: Date,
    },
    isDeleted: { type: Boolean, default: false },
  },
  {
    versionKey: false,
    strict: false,
    timestamps: true,
  }
);

module.exports = mongoose.model("staff", schema);
