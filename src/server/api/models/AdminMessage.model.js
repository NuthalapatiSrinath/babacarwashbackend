const mongoose = require("mongoose");

const adminMessageSchema = new mongoose.Schema(
  {
    staffId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
      required: true,
      index: true,
    },
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
      required: true,
    },
    senderModel: {
      type: String,
      enum: ["User"],
      required: true,
      default: "User",
    },
    message: {
      type: String,
      required: true,
      trim: true,
    },
    isRead: {
      type: Boolean,
      default: false,
      index: true,
    },
    readAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  },
);

// Index for efficient querying
adminMessageSchema.index({ staffId: 1, createdAt: -1 });
adminMessageSchema.index({ staffId: 1, isRead: 1 });

const AdminMessage = mongoose.model("AdminMessage", adminMessageSchema);

module.exports = AdminMessage;
