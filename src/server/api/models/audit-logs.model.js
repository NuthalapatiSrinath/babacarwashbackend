"use strict";

const mongoose = require("mongoose");

const schema = new mongoose.Schema(
  {
    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
      required: true,
    },
    role: { type: String }, // Store role at time of action
    module: { type: String, required: true }, // e.g., "Staff", "Sites"
    action: { type: String, required: true }, // e.g., "CREATE", "DELETE", "UPDATE"
    targetId: { type: String }, // ID of the item affected
    reason: { type: String, required: true }, // The message provided by the user
    metadata: { type: Object }, // Optional: Snapshots of data before change
  },
  {
    versionKey: false,
    timestamps: { createdAt: true, updatedAt: false }, // Only need creation time
  },
);

module.exports = mongoose.model("audit_logs", schema);
