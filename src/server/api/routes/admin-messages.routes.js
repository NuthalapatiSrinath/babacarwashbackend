const express = require("express");
const router = express.Router();
const adminMessagesController = require("./controllers/admin-messages/admin-messages.controller");
const { authenticate } = require("./middleware/auth");

// All routes require authentication
router.use(authenticate);

// Send a message
router.post("/send", adminMessagesController.sendMessage);

// Get conversation messages
router.get("/conversation/:staffId", adminMessagesController.getConversation);

// Get unread count for a specific conversation
router.get("/unread/:staffId", adminMessagesController.getUnreadCount);

// Get all unread counts (admin only)
router.get("/unread-all", adminMessagesController.getAllUnreadCounts);

// Get total unread for admin
router.get("/total-unread", adminMessagesController.getTotalUnread);

// Mark messages as read
router.put("/mark-read/:staffId", adminMessagesController.markAsRead);

// Delete a message
router.delete("/:messageId", adminMessagesController.deleteMessage);

module.exports = router;
