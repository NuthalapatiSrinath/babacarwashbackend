"use strict";

const mongoose = require("mongoose");

const schema = new mongoose.Schema(
  {
    isDeleted: { type: Boolean, default: false },
    name: { type: String, required: true },
    number: { type: String, required: true, unique: true },
    password: { type: String, select: false },
    hPassword: { type: String, select: false },

    role: {
      type: String,
      enum: ["admin", "manager", "supervisor", "user"],
      default: "user",
    },

    // GRANULAR PERMISSIONS (Controlled by Admin Panel)
    // Structure: { moduleName: { action: boolean } }
    permissions: {
      type: Object,
      default: {
        staff: { view: false, create: false, edit: false, delete: false },
        attendance: { view: false, create: false, edit: false, delete: false },
        sites: { view: false, create: false, edit: false, delete: false },
        malls: { view: false, create: false, edit: false, delete: false },
        buildings: { view: false, create: false, edit: false, delete: false },
        customers: { view: false, create: false, edit: false, delete: false },
        // Add more modules as needed
      },
    },

    buildings: [{ type: mongoose.Schema.Types.ObjectId, ref: "buildings" }],
    mall: { type: mongoose.Schema.Types.ObjectId, ref: "malls" },

    isBlocked: { type: Boolean, default: false },
  },
  {
    strict: false,
    versionKey: false,
    timestamps: true,
  },
);

module.exports = mongoose.model("users", schema);
