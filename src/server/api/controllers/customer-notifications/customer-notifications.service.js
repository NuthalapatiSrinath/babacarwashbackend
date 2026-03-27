const CustomersModel = require("../../models/customers.model");
const CustomerDeviceTokenModel = require("../../models/customer-device-tokens.model");
const pushNotifications = require("../../../notifications/push.notifications");

const service = module.exports;

service.getHealthStatus = () => {
  return pushNotifications.getHealthStatus();
};

service.sendToCustomers = async (userInfo, payload = {}) => {
  const title = String(payload.title || "").trim();
  const message = String(payload.message || payload.body || "").trim();
  const imageUrl = String(payload.imageUrl || "").trim();
  const sendToAll = !!payload.sendToAll;
  const customerIds = Array.isArray(payload.customerIds)
    ? payload.customerIds.map((id) => String(id).trim()).filter(Boolean)
    : [];

  if (!title) throw new Error("title is required");
  if (!message) throw new Error("message is required");
  if (!sendToAll && customerIds.length === 0) {
    throw new Error("Provide customerIds or set sendToAll=true");
  }

  let targetCustomerIds = customerIds;

  if (sendToAll) {
    const customers = await CustomersModel.find(
      { isDeleted: false, status: { $nin: [0, 2] } },
      { _id: 1 },
    ).lean();
    targetCustomerIds = customers.map((c) => String(c._id));
  }

  if (targetCustomerIds.length === 0) {
    return {
      successCount: 0,
      failureCount: 0,
      totalTokens: 0,
      targetCustomers: 0,
      invalidTokensDeactivated: 0,
    };
  }

  const tokenRows = await CustomerDeviceTokenModel.find(
    {
      customer: { $in: targetCustomerIds },
      isActive: true,
    },
    { token: 1 },
  ).lean();

  const tokens = tokenRows.map((row) => row.token).filter(Boolean);

  const sendResult = await pushNotifications.sendToTokens({
    tokens,
    title,
    body: message,
    imageUrl,
    data: {
      type: payload.type || "campaign",
      route: payload.route || "/notifications",
      ...(payload.data || {}),
    },
  });

  if (sendResult.invalidTokens.length > 0) {
    await CustomerDeviceTokenModel.updateMany(
      { token: { $in: sendResult.invalidTokens } },
      { $set: { isActive: false, invalidatedAt: new Date() } },
    );
  }

  return {
    ...sendResult,
    totalTokens: tokens.length,
    targetCustomers: targetCustomerIds.length,
    invalidTokensDeactivated: sendResult.invalidTokens.length,
    sentBy: String(userInfo._id),
  };
};
