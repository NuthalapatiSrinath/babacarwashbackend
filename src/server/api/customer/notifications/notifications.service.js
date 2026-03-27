const CustomerDeviceTokenModel = require("../../models/customer-device-tokens.model");

const service = module.exports;

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
