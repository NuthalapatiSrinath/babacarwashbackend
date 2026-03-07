const adminMessagesService = require("./admin-messages.service");

class AdminMessagesController {
  /**
   * POST /api/admin-messages/send
   * Send a message from admin or staff
   */
  async sendMessage(req, res) {
    try {
      const { staffId, message } = req.body;
      const senderId = req.user._id;

      const newMessage = await adminMessagesService.sendMessage({
        staffId,
        senderId,
        senderModel: "User", // All users are in User model
        message,
      });

      res.status(201).json({
        success: true,
        data: newMessage,
      });
    } catch (error) {
      console.error("sendMessage error:", error);
      res.status(400).json({
        success: false,
        message: error.message || "Failed to send message",
      });
    }
  }

  /**
   * GET /api/admin-messages/conversation/:staffId
   * Get all messages in a conversation
   */
  async getConversation(req, res) {
    try {
      const { staffId } = req.params;
      const limit = parseInt(req.query.limit) || 100;

      const messages = await adminMessagesService.getConversation(
        staffId,
        limit,
      );

      res.json({
        success: true,
        data: messages,
        total: messages.length,
      });
    } catch (error) {
      console.error("getConversation error:", error);
      res.status(400).json({
        success: false,
        message: error.message || "Failed to fetch conversation",
      });
    }
  }

  /**
   * GET /api/admin-messages/unread/:staffId
   * Get unread count for a specific staff conversation
   */
  async getUnreadCount(req, res) {
    try {
      const { staffId } = req.params;
      const userId = req.user._id;

      const count = await adminMessagesService.getUnreadCount(staffId, userId);

      res.json({
        success: true,
        count,
      });
    } catch (error) {
      console.error("getUnreadCount error:", error);
      res.status(400).json({
        success: false,
        message: error.message || "Failed to get unread count",
      });
    }
  }

  /**
   * GET /api/admin-messages/unread-all
   * Get unread counts for all staff (admin only)
   */
  async getAllUnreadCounts(req, res) {
    try {
      const counts = await adminMessagesService.getAllUnreadCounts();

      res.json({
        success: true,
        data: counts,
      });
    } catch (error) {
      console.error("getAllUnreadCounts error:", error);
      res.status(400).json({
        success: false,
        message: error.message || "Failed to get unread counts",
      });
    }
  }

  /**
   * PUT /api/admin-messages/mark-read/:staffId
   * Mark messages as read
   */
  async markAsRead(req, res) {
    try {
      const { staffId } = req.params;
      const userId = req.user._id;

      await adminMessagesService.markAsRead(staffId, userId);

      res.json({
        success: true,
        message: "Messages marked as read",
      });
    } catch (error) {
      console.error("markAsRead error:", error);
      res.status(400).json({
        success: false,
        message: error.message || "Failed to mark as read",
      });
    }
  }

  /**
   * DELETE /api/admin-messages/:messageId
   * Delete a message (own messages only)
   */
  async deleteMessage(req, res) {
    try {
      const { messageId } = req.params;
      const senderId = req.user._id;

      await adminMessagesService.deleteMessage(messageId, senderId);

      res.json({
        success: true,
        message: "Message deleted",
      });
    } catch (error) {
      console.error("deleteMessage error:", error);
      res.status(400).json({
        success: false,
        message: error.message || "Failed to delete message",
      });
    }
  }

  /**
   * GET /api/admin-messages/total-unread
   * Get total unread message count for admin
   */
  async getTotalUnread(req, res) {
    try {
      const count = await adminMessagesService.getTotalUnreadForAdmin();

      res.json({
        success: true,
        count,
      });
    } catch (error) {
      console.error("getTotalUnread error:", error);
      res.status(400).json({
        success: false,
        message: error.message || "Failed to get total unread",
      });
    }
  }
}

module.exports = new AdminMessagesController();
