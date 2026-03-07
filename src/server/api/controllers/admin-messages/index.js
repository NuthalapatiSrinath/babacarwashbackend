const express = require("express");
const router = express.Router();
const adminMessagesController = require("./admin-messages.controller");
const AuthHelper = require("../auth/auth.helper");

// Send a message
router.post(
  "/send",
  AuthHelper.authenticate,
  adminMessagesController.sendMessage,
);

// Get conversation messages
router.get(
  "/conversation/:staffId",
  AuthHelper.authenticate,
  adminMessagesController.getConversation,
);

// Get unread count for a specific conversation
router.get(
  "/unread/:staffId",
  AuthHelper.authenticate,
  adminMessagesController.getUnreadCount,
);

// Get all unread counts (admin only)
router.get(
  "/unread-all",
  AuthHelper.authenticate,
  adminMessagesController.getAllUnreadCounts,
);

// Get total unread for admin
router.get(
  "/total-unread",
  AuthHelper.authenticate,
  adminMessagesController.getTotalUnread,
);

// Mark messages as read
router.put(
  "/mark-read/:staffId",
  AuthHelper.authenticate,
  adminMessagesController.markAsRead,
);

// Delete a message
router.delete(
  "/:messageId",
  AuthHelper.authenticate,
  adminMessagesController.deleteMessage,
);

module.exports = router;
