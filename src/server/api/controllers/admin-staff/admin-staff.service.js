"use strict";

const UsersModel = require("../../models/users.model");
const AuthHelper = require("../auth/auth.helper");
const CommonHelper = require("../../../helpers/common.helper");
const service = (module.exports = {});

// List all admin staff (role: manager)
service.list = async (queryParams) => {
  const paginationData = CommonHelper.paginationData(queryParams);
  const findQuery = {
    role: "manager",
    isDeleted: { $ne: true },
  };

  if (queryParams.search) {
    findQuery.$or = [
      { name: { $regex: queryParams.search, $options: "i" } },
      { number: { $regex: queryParams.search, $options: "i" } },
    ];
  }

  const total = await UsersModel.countDocuments(findQuery);
  const data = await UsersModel.find(findQuery)
    .select("-hPassword -password")
    .sort({ createdAt: -1 })
    .skip(paginationData.skip)
    .limit(paginationData.limit)
    .lean();

  return { total, data };
};

// Get single admin staff by ID
service.info = async (id) => {
  const data = await UsersModel.findOne({
    _id: id,
    role: "manager",
    isDeleted: { $ne: true },
  })
    .select("-hPassword -password")
    .lean();

  if (!data) throw "NOT_FOUND";
  return data;
};

// Create a new admin staff user
service.create = async (payload) => {
  // Check if phone number already exists
  const exists = await UsersModel.countDocuments({
    number: payload.number,
    isDeleted: { $ne: true },
  });
  if (exists) throw "ALREADY_EXISTS";

  const passwordHash = AuthHelper.getPasswordHash(payload.password);

  // Default to full access permissions for new staff
  const fullAccessPermissions = {
    dashboard: { view: true },
    customers: { view: true, create: true, edit: true, delete: true },
    workers: { view: true, create: true, edit: true, delete: true },
    staff: { view: true, create: true, edit: true, delete: true },
    attendance: { view: true, create: true, edit: true, delete: true },
    supervisors: { view: true, create: true, edit: true, delete: true },
    washes: { view: true, create: true, edit: true, delete: true },
    payments: { view: true, create: true, edit: true, delete: true },
    workRecords: { view: true },
    collectionSheet: { view: true },
    settlements: { view: true, create: true, edit: true, delete: true },
    pendingPayments: { view: true },
    yearlyRecords: { view: true },
    pricing: { view: true, edit: true },
    locations: { view: true, create: true, edit: true, delete: true },
    buildings: { view: true, create: true, edit: true, delete: true },
    malls: { view: true, create: true, edit: true, delete: true },
    sites: { view: true, create: true, edit: true, delete: true },
    vehicles: { view: true, create: true, edit: true, delete: true },
    enquiry: { view: true, edit: true, delete: true },
    bookings: { view: true, edit: true, delete: true },
    importLogs: { view: true },
    settings: { view: true, edit: true },
  };

  const staffData = {
    name: payload.name,
    number: payload.number,
    password: passwordHash,
    hPassword: passwordHash,
    role: "manager",
    permissions: payload.permissions || fullAccessPermissions,
    isBlocked: false,
  };

  const created = await new UsersModel(staffData).save();
  const result = created.toObject();
  delete result.hPassword;
  delete result.password;
  return result;
};

// Update admin staff user
service.update = async (id, payload) => {
  const staff = await UsersModel.findOne({
    _id: id,
    role: "manager",
    isDeleted: { $ne: true },
  });

  if (!staff) throw "NOT_FOUND";

  const updateData = {};
  if (payload.name) updateData.name = payload.name;
  if (payload.number) {
    // Check if new number is already taken by another user
    const exists = await UsersModel.countDocuments({
      number: payload.number,
      _id: { $ne: id },
      isDeleted: { $ne: true },
    });
    if (exists) throw "ALREADY_EXISTS";
    updateData.number = payload.number;
  }
  if (payload.password) {
    const hash = AuthHelper.getPasswordHash(payload.password);
    updateData.password = hash;
    updateData.hPassword = hash;
  }
  if (typeof payload.isBlocked === "boolean") {
    updateData.isBlocked = payload.isBlocked;
  }

  return UsersModel.findByIdAndUpdate(id, { $set: updateData }, { new: true })
    .select("-hPassword -password")
    .lean();
};

// Update permissions for admin staff
service.updatePermissions = async (id, permissions) => {
  const staff = await UsersModel.findOne({
    _id: id,
    role: "manager",
    isDeleted: { $ne: true },
  });

  if (!staff) throw "NOT_FOUND";

  return UsersModel.findByIdAndUpdate(
    id,
    { $set: { permissions } },
    { new: true },
  )
    .select("-hPassword -password")
    .lean();
};

// Update page-level granular permissions
service.updatePagePermissions = async (id, pagePermissions) => {
  const staff = await UsersModel.findOne({
    _id: id,
    role: "manager",
    isDeleted: { $ne: true },
  });

  if (!staff) throw "NOT_FOUND";

  return UsersModel.findByIdAndUpdate(
    id,
    { $set: { pagePermissions } },
    { new: true },
  )
    .select("-hPassword -password")
    .lean();
};

// Soft delete admin staff
service.delete = async (id) => {
  const staff = await UsersModel.findOne({
    _id: id,
    role: "manager",
    isDeleted: { $ne: true },
  });

  if (!staff) throw "NOT_FOUND";

  return UsersModel.findByIdAndUpdate(
    id,
    { $set: { isDeleted: true } },
    { new: true },
  )
    .select("-hPassword -password")
    .lean();
};
