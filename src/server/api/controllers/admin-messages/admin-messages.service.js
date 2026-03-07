const AdminMessage = require("../../models/AdminMessage.model");
const UsersModel = require("../../models/users.model");

class AdminMessagesService {
  /**
   * Send a message in the conversation
   * @param {Object} data - { staffId, senderId, senderModel, message }
   */
  async sendMessage(data) {
    const { staffId, senderId, senderModel, message } = data;

    if (!message || !message.trim()) {
      throw new Error("Message cannot be empty");
    }

    // Verify staff exists (staff are users with role "manager")
    const staff = await UsersModel.findById(staffId);
    if (!staff) {
      throw new Error("Staff member not found");
    }

    // Verify sender exists
    const sender = await UsersModel.findById(senderId);
    if (!sender) {
      throw new Error("Sender not found");
    }

    const newMessage = await AdminMessage.create({
      staffId,
      senderId,
      senderModel,
      message: message.trim(),
    });

    return await newMessage.populate([
      { path: "senderId", select: "name firstName lastName" },
      { path: "staffId", select: "name number" },
    ]);
  }

  /**
   * Get conversation messages between admin and staff
   * @param {String} staffId - Staff member ID
   * @param {Number} limit - Number of messages to retrieve
   */
  async getConversation(staffId, limit = 100) {
    const messages = await AdminMessage.find({ staffId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate("senderId", "name firstName lastName")
      .populate("staffId", "name number")
      .lean();

    return messages.reverse(); // Return oldest first for chat display
  }

  /**
   * Get unread message count for a specific staff member
   * @param {String} staffId
   * @param {String} userId - Current user's ID (to determine which messages to count)
   */
  async getUnreadCount(staffId, userId) {
    // Count messages sent TO the user (where sender is NOT the current user)
    const count = await AdminMessage.countDocuments({
      staffId,
      senderId: { $ne: userId },
      isRead: false,
    });

    return count;
  }

  /**
   * Get unread counts for all staff members (admin view)
   * @returns {Object} - { staffId: unreadCount }
   */
  async getAllUnreadCounts() {
    const counts = await AdminMessage.aggregate([
      {
        $match: {
          isRead: false,
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "senderId",
          foreignField: "_id",
          as: "sender",
        },
      },
      {
        $unwind: "$sender",
      },
      {
        $match: {
          "sender.role": "manager", // Messages from staff (role: manager) to admin
        },
      },
      {
        $group: {
          _id: "$staffId",
          unreadCount: { $sum: 1 },
        },
      },
    ]);

    const result = {};
    counts.forEach((item) => {
      result[item._id.toString()] = item.unreadCount;
    });

    return result;
  }

  /**
   * Mark messages as read
   * @param {String} staffId
   * @param {String} userId - Current user's ID (messages sent TO this user will be marked as read)
   */
  async markAsRead(staffId, userId) {
    // Only mark messages that were sent TO the current user (not BY them)
    await AdminMessage.updateMany(
      {
        staffId,
        senderId: { $ne: userId },
        isRead: false,
      },
      {
        $set: {
          isRead: true,
          readAt: new Date(),
        },
      },
    );

    return { success: true };
  }

  /**
   * Delete a message (only sender can delete)
   * @param {String} messageId
   * @param {String} senderId
   */
  async deleteMessage(messageId, senderId) {
    const message = await AdminMessage.findById(messageId);

    if (!message) {
      throw new Error("Message not found");
    }

    if (message.senderId.toString() !== senderId.toString()) {
      throw new Error("Unauthorized: You can only delete your own messages");
    }

    await AdminMessage.findByIdAndDelete(messageId);
    return { success: true };
  }

  /**
   * Get total unread count for admin (across all staff)
   */
  async getTotalUnreadForAdmin() {
    // Count messages from staff (role: manager) to admin
    const result = await AdminMessage.aggregate([
      {
        $match: {
          isRead: false,
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "senderId",
          foreignField: "_id",
          as: "sender",
        },
      },
      {
        $unwind: "$sender",
      },
      {
        $match: {
          "sender.role": "manager", // Messages from staff (role: manager)
        },
      },
      {
        $count: "total",
      },
    ]);

    return result.length > 0 ? result[0].total : 0;
  }
}

module.exports = new AdminMessagesService();
