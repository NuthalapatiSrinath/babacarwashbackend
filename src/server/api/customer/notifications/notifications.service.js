const CustomerDeviceTokenModel = require("../../models/customer-device-tokens.model");
const InAppNotificationsModel = require("../../models/in-app-notifications.model");

const service = module.exports;

const toInt = (value, fallback) => {
  const parsed = Number.parseInt(String(value), 10);
  return Number.isNaN(parsed) ? fallback : parsed;
};

service.registerDeviceToken = async (userInfo, payload = {}) => {
  const token = String(payload.token || "").trim();
  const platform = String(payload.platform || "android")
    .trim()
    .toLowerCase();
  const appVersion = String(payload.appVersion || "").trim();
  const deviceInfo = String(payload.deviceInfo || "").trim();

  if (!token) throw "Device token is required";

  const allowedPlatforms = ["android", "ios", "web"];
  const platformValue = allowedPlatforms.includes(platform)
    ? platform
    : "android";

  const data = await CustomerDeviceTokenModel.findOneAndUpdate(
    { token },
    {
      $set: {
        customer: String(userInfo._id),
        token,
        platform: platformValue,
        appVersion,
        deviceInfo,
        isActive: true,
        lastSeenAt: new Date(),
        invalidatedAt: null,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).lean();

  return data;
};

service.removeDeviceToken = async (userInfo, payload = {}) => {
  const token = String(payload.token || "").trim();
  if (!token) throw "Device token is required";

  await CustomerDeviceTokenModel.updateOne(
    { customer: String(userInfo._id), token },
    {
      $set: {
        isActive: false,
        invalidatedAt: new Date(),
      },
    },
  );

  return { success: true };
};

service.listMyDeviceTokens = async (userInfo) => {
  return CustomerDeviceTokenModel.find(
    { customer: String(userInfo._id) },
    {
      token: 1,
      platform: 1,
      appVersion: 1,
      deviceInfo: 1,
      isActive: 1,
      lastSeenAt: 1,
    },
  )
    .sort({ updatedAt: -1 })
    .lean();
};

service.listInAppNotifications = async (userInfo, query = {}) => {
  const customerId = String(
    userInfo && userInfo._id ? userInfo._id : "",
  ).trim();
  if (!customerId) {
    return { data: [], total: 0, pageNo: 0, pageSize: 20 };
  }

  const pageNo = Math.max(toInt(query.pageNo ?? query.page, 0), 0);
  const pageSize = Math.min(
    Math.max(toInt(query.pageSize ?? query.limit, 20), 1),
    100,
  );
  const onlyUnread = String(query.onlyUnread || "").toLowerCase() === "true";

  const filter = { customer: customerId };
  if (onlyUnread) {
    filter.isRead = false;
  }

  const [data, total] = await Promise.all([
    InAppNotificationsModel.find(filter)
      .sort({ _id: -1 })
      .skip(pageNo * pageSize)
      .limit(pageSize)
      .lean(),
    InAppNotificationsModel.countDocuments(filter),
  ]);

  return { data, total, pageNo, pageSize };
};

service.getInAppUnreadCount = async (userInfo) => {
  const customerId = String(
    userInfo && userInfo._id ? userInfo._id : "",
  ).trim();
  if (!customerId) {
    return { count: 0 };
  }

  const count = await InAppNotificationsModel.countDocuments({
    customer: customerId,
    isRead: false,
  });

  return { count };
};

service.markInAppRead = async (userInfo, notificationId) => {
  const customerId = String(
    userInfo && userInfo._id ? userInfo._id : "",
  ).trim();
  const id = String(notificationId || "").trim();

  if (!customerId || !id) {
    return { modifiedCount: 0 };
  }

  const now = new Date();

  const data = await InAppNotificationsModel.findOneAndUpdate(
    { _id: id, customer: customerId },
    {
      $set: {
        isRead: true,
        readAt: now,
        openedAt: now,
      },
    },
    { new: true },
  ).lean();

  return {
    modifiedCount: data ? 1 : 0,
    data,
  };
};

service.markAllInAppRead = async (userInfo) => {
  const customerId = String(
    userInfo && userInfo._id ? userInfo._id : "",
  ).trim();
  if (!customerId) {
    return { modifiedCount: 0 };
  }

  const now = new Date();

  const result = await InAppNotificationsModel.updateMany(
    { customer: customerId, isRead: false },
    {
      $set: {
        isRead: true,
        readAt: now,
        openedAt: now,
      },
    },
  );

  return {
    modifiedCount: result.modifiedCount || result.nModified || 0,
  };
};
