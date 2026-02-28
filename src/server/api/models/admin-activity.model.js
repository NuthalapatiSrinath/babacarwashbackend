"use strict";

const mongoose = require("mongoose");

const adminActivitySchema = new mongoose.Schema(
  {
    admin: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
      required: true,
      index: true,
    },
    sessionId: { type: String, index: true },
    activityType: {
      type: String,
      enum: [
        "login",
        "logout",
        "page_view",
        "scroll",
        "button_click",
        "navigation",
        "form_submit",
        "search",
        "filter",
        "modal_open",
        "modal_close",
        "data_export",
        "data_import",
        "create",
        "update",
        "delete",
        "settings_change",
        "tab_focus",
        "tab_blur",
        "idle_start",
        "idle_end",
        "session_timeout",
        "session_resume",
        "screen_time",
        "other",
      ],
      required: true,
      index: true,
    },
    page: {
      path: { type: String },
      title: { type: String },
      referrer: { type: String },
    },
    action: {
      element: { type: String },
      value: { type: String },
    },
    scroll: {
      depth: { type: Number },
      maxDepth: { type: Number },
    },
    device: {
      deviceId: { type: String, index: true },
      userAgent: { type: String },
      platform: { type: String },
      os: { type: String },
      browser: { type: String },
      deviceType: { type: String },
      isMobile: { type: Boolean },
      screenWidth: { type: Number },
      screenHeight: { type: Number },
      screenResolution: { type: String },
      language: { type: String },
      deviceLabel: { type: String },
    },
    location: {
      ip: { type: String },
      lat: { type: Number },
      lng: { type: Number },
      accuracy: { type: Number },
      fullAddress: { type: String },
      road: { type: String },
      neighbourhood: { type: String },
      city: { type: String },
      state: { type: String },
      postcode: { type: String },
      region: { type: String },
      country: { type: String },
      isp: { type: String },
      timezone: { type: String },
    },
    duration: { type: Number }, // milliseconds
    timestamp: { type: Date, default: Date.now, index: true },
    metadata: { type: mongoose.Schema.Types.Mixed },
  },
  {
    versionKey: false,
    strict: false,
    timestamps: true,
  },
);

// Compound indexes
adminActivitySchema.index({ admin: 1, timestamp: -1 });
adminActivitySchema.index({ admin: 1, activityType: 1 });
adminActivitySchema.index({ admin: 1, sessionId: 1 });
adminActivitySchema.index({ activityType: 1, timestamp: -1 });

module.exports = mongoose.model("admin_activities", adminActivitySchema);
