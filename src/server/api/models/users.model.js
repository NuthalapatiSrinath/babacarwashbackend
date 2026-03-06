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

    // GRANULAR PERMISSIONS (Controlled by Super Admin for manager role)
    // Structure: { moduleName: { view, create, edit, delete } }
    permissions: {
      type: Object,
      default: {
        dashboard: { view: true },
        customers: { view: false, create: false, edit: false, delete: false },
        workers: { view: false, create: false, edit: false, delete: false },
        staff: { view: false, create: false, edit: false, delete: false },
        attendance: { view: false, create: false, edit: false, delete: false },
        supervisors: { view: false, create: false, edit: false, delete: false },
        washes: { view: false, create: false, edit: false, delete: false },
        payments: { view: false, create: false, edit: false, delete: false },
        workRecords: { view: false },
        collectionSheet: { view: false },
        settlements: { view: false, create: false, edit: false, delete: false },
        pendingPayments: { view: false },
        yearlyRecords: { view: false },
        pricing: { view: false, edit: false },
        locations: { view: false, create: false, edit: false, delete: false },
        buildings: { view: false, create: false, edit: false, delete: false },
        malls: { view: false, create: false, edit: false, delete: false },
        sites: { view: false, create: false, edit: false, delete: false },
        vehicles: { view: false, create: false, edit: false, delete: false },
        enquiry: { view: false, edit: false, delete: false },
        bookings: { view: false, edit: false, delete: false },
        importLogs: { view: false },
        settings: { view: false, edit: false },
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
