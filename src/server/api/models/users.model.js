"use strict";

const mongoose = require("mongoose");

const schema = new mongoose.Schema(
  {
    isDeleted: { type: Boolean, default: false },
    name: { type: String },
    number: { type: String },
    password: { type: String },
    hPassword: { type: String },
    role: {
      type: String,
      enum: ["admin", "manager", "supervisor", "user"],
      default: "admin",
    },
    permissions: { type: Object, default: {} }, // Dynamic permissions controlled by admin
    buildings: { type: Array, ref: "buildings" },
    mall: { type: String, ref: "malls" },
  },
  {
    strict: false,
    versionKey: false,
    timestamps: true,
  }
);

module.exports = mongoose.model("users", schema);
