"use strict";

const mongoose = require("mongoose");

const schema = new mongoose.Schema(
  {
    customer: { type: String, index: true },
    isRead: { type: Boolean, default: false },
    readAt: { type: Date },
    openedAt: { type: Date },
    worker: { type: String },
    title: { type: String },
    message: { type: String },
    imageUrl: { type: String },
    type: { type: String, default: "general", index: true },
    route: { type: String },
    data: { type: Object },
    sentAt: { type: Date, default: Date.now, index: true },
    createdBy: { type: String },
    updatedBy: { type: String },
  },
  {
    versionKey: false,
    strict: false,
    timestamps: true,
  },
);

schema.index({ customer: 1, isRead: 1, createdAt: -1 });
schema.index({ customer: 1, type: 1, createdAt: -1 });
schema.index({ worker: 1, isRead: 1, createdAt: -1 });

module.exports = mongoose.model("in-app-notifications", schema);
