const CustomersModel = require("../../models/customers.model");
const CustomerDeviceTokenModel = require("../../models/customer-device-tokens.model");
const InAppNotificationsModel = require("../../models/in-app-notifications.model");
const pushNotifications = require("../../../notifications/push.notifications");

const service = module.exports;

const toInt = (value, fallback) => {
  const parsed = Number.parseInt(String(value), 10);
  return Number.isNaN(parsed) ? fallback : parsed;
};

const buildDateRangeFilter = (query = {}) => {
  const startDate = String(query.startDate || "").trim();
  const endDate = String(query.endDate || "").trim();

  const range = {};
  if (startDate) {
    const parsed = new Date(startDate);
    if (!Number.isNaN(parsed.getTime())) {
      range.$gte = parsed;
    }
  }

  if (endDate) {
    const parsed = new Date(endDate);
    if (!Number.isNaN(parsed.getTime())) {
      parsed.setHours(23, 59, 59, 999);
      range.$lte = parsed;
    }
  }

  return Object.keys(range).length ? range : null;
};

const buildHistoryFilter = (query = {}) => {
  const filter = {
    customer: { $exists: true, $nin: [null, ""] },
  };

  const type = String(query.type || "campaign")
    .trim()
    .toLowerCase();
  if (type !== "all") {
    filter.type = type;
  }

  const customerId = String(query.customerId || "").trim();
  if (customerId) {
    filter.customer = customerId;
  }

  const status = String(query.status || "all")
    .trim()
    .toLowerCase();
  if (status === "opened") {
    filter.isRead = true;
  } else if (status === "unopened") {
    filter.isRead = false;
  }

  const range = buildDateRangeFilter(query);
  if (range) {
    filter.createdAt = range;
  }

  const search = String(query.search || "").trim();
  if (search) {
    filter.$or = [
      { title: { $regex: search, $options: "i" } },
      { message: { $regex: search, $options: "i" } },
      { route: { $regex: search, $options: "i" } },
    ];
  }

  return filter;
};

const normalizeRoute = (value) => {
  const route = String(value || "/notifications").trim();
  if (!route) return "/notifications";
  return route.startsWith("/") ? route : `/${route}`;
};

service.persistCampaignInAppNotifications = async ({
  targetCustomerIds = [],
  title,
  message,
  imageUrl,
  type,
  route,
  userInfo,
  data,
}) => {
  if (!Array.isArray(targetCustomerIds) || targetCustomerIds.length === 0) {
    return;
  }

  const createdBy = userInfo && userInfo._id ? String(userInfo._id) : "";
  const payloadData = data && typeof data === "object" ? data : {};

  const documents = targetCustomerIds.map((customerId) => ({
    customer: String(customerId),
    title,
    message,
    imageUrl,
    type,
    route,
    data: payloadData,
    isRead: false,
    createdBy,
    updatedBy: createdBy,
    sentAt: new Date(),
  }));

  try {
    await InAppNotificationsModel.insertMany(documents, { ordered: false });
  } catch (error) {
    console.error("Failed to persist in-app campaign notifications:", error);
  }
};

service.getHealthStatus = () => {
  return pushNotifications.getHealthStatus();
};

service.sendToCustomers = async (userInfo, payload = {}) => {
  const title = String(payload.title || "").trim();
  const message = String(payload.message || payload.body || "").trim();
  const imageUrl = String(payload.imageUrl || "").trim();
  const type = String(payload.type || "campaign").trim() || "campaign";
  const route = normalizeRoute(payload.route);
  const metadata =
    payload.data && typeof payload.data === "object" ? payload.data : {};
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

  await service.persistCampaignInAppNotifications({
    targetCustomerIds,
    title,
    message,
    imageUrl,
    type,
    route,
    userInfo,
    data: metadata,
  });

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
      type,
      route,
      ...(imageUrl ? { imageUrl } : null),
      ...metadata,
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

service.getNotificationHistory = async (query = {}) => {
  const pageNo = Math.max(toInt(query.pageNo ?? query.page, 0), 0);
  const pageSize = Math.min(
    Math.max(toInt(query.pageSize ?? query.limit, 20), 1),
    100,
  );

  const filter = buildHistoryFilter(query);

  const [total, rows] = await Promise.all([
    InAppNotificationsModel.countDocuments(filter),
    InAppNotificationsModel.aggregate([
      { $match: filter },
      { $sort: { createdAt: -1 } },
      { $skip: pageNo * pageSize },
      { $limit: pageSize },
      {
        $lookup: {
          from: "customers",
          let: { customerId: "$customer" },
          pipeline: [
            { $addFields: { idString: { $toString: "$_id" } } },
            { $match: { $expr: { $eq: ["$idString", "$$customerId"] } } },
            {
              $project: {
                _id: 1,
                idString: 1,
                firstName: 1,
                lastName: 1,
                mobile: 1,
              },
            },
          ],
          as: "customerInfo",
        },
      },
      {
        $addFields: {
          customerInfo: { $arrayElemAt: ["$customerInfo", 0] },
        },
      },
      {
        $project: {
          _id: 1,
          customer: 1,
          title: 1,
          message: 1,
          imageUrl: 1,
          type: 1,
          route: 1,
          data: 1,
          isRead: 1,
          readAt: 1,
          openedAt: 1,
          sentAt: { $ifNull: ["$sentAt", "$createdAt"] },
          createdAt: 1,
          customerName: {
            $trim: {
              input: {
                $concat: [
                  { $ifNull: ["$customerInfo.firstName", ""] },
                  " ",
                  { $ifNull: ["$customerInfo.lastName", ""] },
                ],
              },
            },
          },
          customerMobile: { $ifNull: ["$customerInfo.mobile", ""] },
        },
      },
    ]),
  ]);

  return {
    data: rows,
    total,
    pageNo,
    pageSize,
  };
};

service.getNotificationStats = async (query = {}) => {
  const filter = buildHistoryFilter(query);

  const [totalSent, totalOpened, totalUnread, grouped] = await Promise.all([
    InAppNotificationsModel.countDocuments(filter),
    InAppNotificationsModel.countDocuments({ ...filter, isRead: true }),
    InAppNotificationsModel.countDocuments({ ...filter, isRead: false }),
    InAppNotificationsModel.aggregate([
      { $match: filter },
      {
        $group: {
          _id: "$customer",
          sentCount: { $sum: 1 },
          openedCount: {
            $sum: { $cond: [{ $eq: ["$isRead", true] }, 1, 0] },
          },
          unopenedCount: {
            $sum: { $cond: [{ $eq: ["$isRead", false] }, 1, 0] },
          },
          lastSentAt: { $max: "$createdAt" },
          lastOpenedAt: { $max: "$openedAt" },
        },
      },
      { $sort: { sentCount: -1, lastSentAt: -1 } },
    ]),
  ]);

  const customerIds = grouped
    .map((item) => String(item._id || "").trim())
    .filter(Boolean);

  let customersMap = {};
  if (customerIds.length > 0) {
    const customers = await CustomersModel.aggregate([
      { $addFields: { idString: { $toString: "$_id" } } },
      { $match: { idString: { $in: customerIds } } },
      {
        $project: {
          _id: 1,
          idString: 1,
          firstName: 1,
          lastName: 1,
          mobile: 1,
        },
      },
    ]);

    customersMap = customers.reduce((acc, item) => {
      acc[item.idString] = item;
      return acc;
    }, {});
  }

  const perCustomer = grouped.map((item) => {
    const customerKey = String(item._id || "").trim();
    const customer = customersMap[customerKey] || {};
    const customerName =
      `${customer.firstName || ""} ${customer.lastName || ""}`.trim();
    const sentCount = Number(item.sentCount || 0);
    const openedCount = Number(item.openedCount || 0);
    const unopenedCount = Number(item.unopenedCount || 0);
    const openRate =
      sentCount > 0 ? Number(((openedCount / sentCount) * 100).toFixed(2)) : 0;

    return {
      customerId: customerKey,
      customerName: customerName || "Unknown Customer",
      mobile: customer.mobile || "",
      sentCount,
      openedCount,
      unopenedCount,
      openRate,
      lastSentAt: item.lastSentAt || null,
      lastOpenedAt: item.lastOpenedAt || null,
    };
  });

  const uniqueCustomersNotified = perCustomer.filter(
    (item) => item.sentCount > 0,
  ).length;
  const uniqueCustomersOpened = perCustomer.filter(
    (item) => item.openedCount > 0,
  ).length;
  const openRate =
    totalSent > 0 ? Number(((totalOpened / totalSent) * 100).toFixed(2)) : 0;

  return {
    totalSent,
    totalOpened,
    totalUnread,
    openRate,
    uniqueCustomersNotified,
    uniqueCustomersOpened,
    perCustomer,
  };
};
