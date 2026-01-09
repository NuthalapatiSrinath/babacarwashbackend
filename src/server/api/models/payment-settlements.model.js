"use strict";

const mongoose = require("mongoose");

const schema = new mongoose.Schema(
  {
    isDeleted: { type: Boolean, default: false },
    supervisor: { type: String, ref: "users" },
    payments: [{ type: mongoose.Schema.Types.ObjectId, ref: "payments" }],
    createdBy: { type: String },
    status: { type: String, default: "pending" },
  },
  { versionKey: false, strict: false, timestamps: true }
);

module.exports = mongoose.model("payment-settlements", schema);
