"use strict";

const AccessRequestsModel = require("../../models/access-requests.model");
const UsersModel = require("../../models/users.model");
const service = (module.exports = {});

// Staff creates a new access request
service.create = async (userInfo, payload) => {
  // Check for duplicate pending request
  const existing = await AccessRequestsModel.findOne({
    staffId: userInfo._id,
    page: payload.page,
    elementType: payload.elementType,
    elementKey: payload.elementKey,
    status: "pending",
    isDeleted: false,
  });

  if (existing) throw "DUPLICATE_REQUEST";

  const data = {
    staffId: userInfo._id,
    staffName: userInfo.name || "Unknown",
    page: payload.page,
    pageLabel: payload.pageLabel || payload.page,
    elementType: payload.elementType,
    elementKey: payload.elementKey,
    elementLabel: payload.elementLabel || payload.elementKey,
    message: payload.message || "",
  };

  return new AccessRequestsModel(data).save();
};

// Admin lists all access requests
service.list = async (queryParams) => {
  const findQuery = { isDeleted: false };

  if (queryParams.status) findQuery.status = queryParams.status;
  if (queryParams.staffId) findQuery.staffId = queryParams.staffId;

  const total = await AccessRequestsModel.countDocuments(findQuery);
  const data = await AccessRequestsModel.find(findQuery)
    .sort({ createdAt: -1 })
    .lean();

  return { total, data };
};

// Get pending count (for notification badge)
service.pendingCount = async () => {
  return AccessRequestsModel.countDocuments({
    status: "pending",
    isDeleted: false,
  });
};

// Admin approves a request (and auto-grants the permission)
service.approve = async (adminInfo, requestId, adminResponse) => {
  const request = await AccessRequestsModel.findOne({
    _id: requestId,
    isDeleted: false,
  });
  if (!request) throw "NOT_FOUND";
  if (request.status !== "pending") throw "ALREADY_PROCESSED";

  // Auto-grant the permission to the staff member
  const staff = await UsersModel.findById(request.staffId);
  if (!staff) throw "STAFF_NOT_FOUND";

  const pagePerms = staff.pagePermissions || {};
  if (!pagePerms[request.page]) {
    pagePerms[request.page] = { columns: [], actions: [], toolbar: [] };
  }

  const section = request.elementType + "s"; // "columns", "actions", "toolbar" → "toolbars"? No.
  const sectionKey =
    request.elementType === "toolbar" ? "toolbar" : request.elementType + "s";

  if (!pagePerms[request.page][sectionKey]) {
    pagePerms[request.page][sectionKey] = [];
  }

  if (!pagePerms[request.page][sectionKey].includes(request.elementKey)) {
    pagePerms[request.page][sectionKey].push(request.elementKey);
  }

  await UsersModel.findByIdAndUpdate(request.staffId, {
    $set: { pagePermissions: pagePerms },
  });

  // Update the request
  request.status = "approved";
  request.adminResponse = adminResponse || "Approved";
  request.respondedBy = adminInfo._id;
  request.respondedAt = new Date();
  await request.save();

  return request;
};

// Admin rejects a request
service.reject = async (adminInfo, requestId, adminResponse) => {
  const request = await AccessRequestsModel.findOne({
    _id: requestId,
    isDeleted: false,
  });
  if (!request) throw "NOT_FOUND";
  if (request.status !== "pending") throw "ALREADY_PROCESSED";

  request.status = "rejected";
  request.adminResponse = adminResponse || "Rejected";
  request.respondedBy = adminInfo._id;
  request.respondedAt = new Date();
  await request.save();

  return request;
};

// Delete a request
service.delete = async (requestId) => {
  return AccessRequestsModel.findByIdAndUpdate(requestId, {
    $set: { isDeleted: true },
  });
};
