"use strict";

const mongoose = require("mongoose");

const accessRequestSchema = new mongoose.Schema(
  {
    staffId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
      required: true,
    },
    staffName: { type: String, required: true },
    page: { type: String, required: true },
    pageLabel: { type: String },
    elementType: {
      type: String,
      enum: ["column", "action", "toolbar"],
      required: true,
    },
    elementKey: { type: String, required: true },
    elementLabel: { type: String },
    message: { type: String, default: "" },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
    adminResponse: { type: String, default: "" },
    respondedBy: { type: mongoose.Schema.Types.ObjectId, ref: "users" },
    respondedAt: { type: Date },
    isDeleted: { type: Boolean, default: false },
  },
  { timestamps: true },
);

module.exports = mongoose.model("access_requests", accessRequestSchema);
