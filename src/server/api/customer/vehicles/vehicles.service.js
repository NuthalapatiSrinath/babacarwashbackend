const VehiclesModel = require("../../models/vehicles.model");
const CustomersModel = require("../../models/customers.model");
const CounterService = require("../../../utils/counters");
const CommonHelper = require("../../../helpers/common.helper");
const service = module.exports;

service.list = async (userInfo, query) => {
  const data = await CustomersModel.findOne({
    isDeleted: false,
    _id: userInfo._id,
  }).lean();
  return { total: data?.vehicles?.length, data: data?.vehicles || [] };
};

service.info = async (userInfo, id) => {
  const data = await CustomersModel.findOne({ _id: userInfo._id });
  return data.vehicles.find((e) => e._id == id);
};

service.create = async (userInfo, payload) => {
  const registration_no = (payload.registration_no || "").toString().trim();
  const parking_no = (payload.parking_no || "").toString().trim();

  if (!registration_no) {
    throw "Registration number is required";
  }

  if (!parking_no) {
    throw "Parking number is required";
  }

  const customerData = await CustomersModel.findOne({
    _id: userInfo._id,
  }).lean();
  const duplicate = (customerData?.vehicles || []).find(
    (v) =>
      (v.registration_no || "").toString().trim().toLowerCase() ===
        registration_no.toLowerCase() &&
      (v.parking_no || "").toString().trim().toLowerCase() ===
        parking_no.toLowerCase(),
  );

  if (duplicate) {
    throw "Vehicle with same registration and parking already exists";
  }

  const vehicleData = {
    registration_no,
    parking_no,
    vehicle_type: payload.vehicle_type,
    brandId: payload.brandId,
    brandName: payload.brandName,
    modelId: payload.modelId,
    modelName: payload.modelName,
    modelImage: payload.modelImage,
    category: payload.category,
    vehicleName: payload.vehicleName,
    status: 1,
    onboard_date: new Date(),
  };
  // Remove undefined fields
  Object.keys(vehicleData).forEach(
    (key) => vehicleData[key] === undefined && delete vehicleData[key],
  );
  await CustomersModel.updateOne(
    { _id: userInfo._id },
    { $push: { vehicles: vehicleData } },
  );
};

service.update = async (userInfo, id, payload) => {
  const updateFields = {};

  if (payload.registration_no !== undefined) {
    const registration_no = payload.registration_no.toString().trim();
    if (!registration_no) {
      throw "Registration number is required";
    }
    updateFields["vehicles.$.registration_no"] = registration_no;
  }

  if (payload.parking_no !== undefined) {
    const parking_no = payload.parking_no.toString().trim();
    if (!parking_no) {
      throw "Parking number is required";
    }
    updateFields["vehicles.$.parking_no"] = parking_no;
  }

  if (payload.vehicle_type !== undefined) {
    updateFields["vehicles.$.vehicle_type"] = payload.vehicle_type;
  }

  if (payload.brandId) updateFields["vehicles.$.brandId"] = payload.brandId;
  if (payload.brandName)
    updateFields["vehicles.$.brandName"] = payload.brandName;
  if (payload.modelId) updateFields["vehicles.$.modelId"] = payload.modelId;
  if (payload.modelName)
    updateFields["vehicles.$.modelName"] = payload.modelName;
  if (payload.modelImage)
    updateFields["vehicles.$.modelImage"] = payload.modelImage;
  if (payload.category) updateFields["vehicles.$.category"] = payload.category;
  if (payload.vehicleName)
    updateFields["vehicles.$.vehicleName"] = payload.vehicleName;

  if (!Object.keys(updateFields).length) {
    throw "No valid fields to update";
  }

  // Remove undefined fields
  Object.keys(updateFields).forEach(
    (key) => updateFields[key] === undefined && delete updateFields[key],
  );

  await CustomersModel.updateOne(
    { "vehicles._id": id },
    { $set: updateFields },
  );
};

service.delete = async (userInfo, id) => {
  await CustomersModel.updateOne(
    { "vehicles._id": id },
    { $pull: { vehicles: { _id: id } } },
  );
  const data = await CustomersModel.findOne({
    isDeleted: false,
    _id: userInfo._id,
  }).lean();
  return data.vehicles;
};

service.undoDelete = async (userInfo, id) => {
  return await VehiclesModel.updateOne(
    { _id: id },
    { isDeleted: false, updatedBy: userInfo._id },
  );
};
