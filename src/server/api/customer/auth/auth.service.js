const CustomersModel = require("../../models/customers.model");
const JobsModel = require("../../models/jobs.model");
const LocationsModel = require("../../controllers/locations/locations.model");
const BuildingsModel = require("../../models/buildings.model");
const AuthHelper = require("./auth.helper");
const service = module.exports;

const isValidObjectId = (value) => {
  if (!value || typeof value !== "string") return false;
  return /^[a-fA-F0-9]{24}$/.test(value);
};

service.signup = async (payload) => {
  const isExists = await CustomersModel.countDocuments({
    mobile: payload.mobile,
  });
  if (isExists) {
    throw "ALREADY-REGISTERED";
  }
  const password = AuthHelper.getPasswordHash(payload.password);
  const userData = await new CustomersModel({
    ...payload,
    hPassword: password,
    password: payload.password,
  }).save();
  const token = AuthHelper.createToken({ _id: userData._id });
  delete userData.hPassword;
  delete userData.password;
  return { token, ...JSON.parse(JSON.stringify(userData)) };
};

service.signin = async (payload) => {
  try {
    const userData = await CustomersModel.findOne({ mobile: payload.mobile });
    if (!userData) {
      throw "UNAUTHORIZED";
    }

    // Check if customer is deleted
    if (userData.isDeleted) {
      throw "ACCOUNT_DEACTIVATED";
    }

    // Check if customer status is inactive (status 0 or 2 = inactive, 1 = active)
    // Some parts use 0=inactive, others use 2=inactive, so check both
    if (userData.status === 0 || userData.status === 2) {
      throw "ACCOUNT_DEACTIVATED";
    }

    if (!AuthHelper.verifyPasswordHash(payload.password, userData.hPassword)) {
      throw "UNAUTHORIZED";
    }
    const token = AuthHelper.createToken({ _id: userData._id });
    delete userData.hPassword;
    delete userData.password;
    return { token, ...JSON.parse(JSON.stringify(userData)) };
  } catch (error) {
    throw error;
  }
};

service.me = async (payload) => {
  const user = await CustomersModel.findOne(
    { _id: payload._id },
    { password: 0, hPassword: 0 },
  ).lean();

  if (!user) {
    throw "UNAUTHORIZED";
  }

  const customerCandidates = [user._id, String(user._id), user._id?.toString?.()].filter(
    Boolean,
  );

  const bookings = await JobsModel.countDocuments({
    isDeleted: false,
    customer: { $in: [...new Set(customerCandidates)] },
  });

  // Populate location address
  let locationData = null;
  if (user.location) {
    if (isValidObjectId(user.location)) {
      locationData = await LocationsModel.findOne(
        { _id: user.location, isDeleted: false },
        { address: 1 },
      ).lean();
    } else {
      // Mobile flow may store a plain-text current location string.
      locationData = { address: user.location };
    }
  }

  // Populate building name
  let buildingData = null;
  if (user.building) {
    if (isValidObjectId(user.building)) {
      buildingData = await BuildingsModel.findOne(
        { _id: user.building, isDeleted: false },
        { name: 1, location_id: 1 },
      ).lean();
    } else {
      buildingData = { name: user.building };
    }
  }

  return {
    ...user,
    bookings,
    locationData,
    buildingData,
  };
};

service.updateProfile = async (payload, body) => {
  const allowedFields = [
    "firstName",
    "lastName",
    "email",
    "building",
    "location",
    "flat_no",
  ];
  const updateData = {};
  for (const field of allowedFields) {
    if (body[field] !== undefined) {
      if ((field === "location" || field === "building") && body[field]) {
        const value = String(body[field]).trim();
        updateData[field] = value;
      } else {
        updateData[field] = body[field];
      }
    }
  }
  if (Object.keys(updateData).length === 0) {
    throw "NO_FIELDS";
  }
  await CustomersModel.updateOne({ _id: payload._id }, { $set: updateData });
  return service.me(payload);
};
