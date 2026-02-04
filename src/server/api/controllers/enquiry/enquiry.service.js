const EnquiryModel = require("../../models/enquiry.model");
const CounterService = require("../../../utils/counters");
const CommonHelper = require("../../../helpers/common.helper");
const service = module.exports;

service.list = async (userInfo, query) => {
  const paginationData = CommonHelper.paginationData(query);
  const findQuery = {
    isDeleted: false,
    ...(query.startDate
      ? {
          createdAt: {
            $gte: new Date(query.startDate),
            $lte: new Date(query.endDate),
          },
        }
      : null),
    ...(query.status ? { status: query.status } : null),
    ...(query.worker ? { worker: query.worker } : null),
  };
  const total = await EnquiryModel.countDocuments(findQuery);
  let data = await EnquiryModel.find(findQuery)
    .sort({ _id: -1 })
    .skip(paginationData.skip)
    .limit(paginationData.limit)
    .populate([
      { path: "location", model: "locations" },
      { path: "building", model: "buildings" },
    ])
    .lean();

  // Manually populate vehicles.worker only for valid ObjectIds
  const WorkerModel = require("../../models/workers.model");
  for (let enquiry of data) {
    console.log(
      "🔍 Processing enquiry:",
      enquiry.id,
      "Vehicles:",
      enquiry.vehicles,
    );

    if (enquiry.vehicles && Array.isArray(enquiry.vehicles)) {
      for (let vehicle of enquiry.vehicles) {
        console.log(
          "  📦 Vehicle:",
          vehicle.registration_no,
          vehicle.parking_no,
        );
        if (
          vehicle.worker &&
          vehicle.worker !== "" &&
          vehicle.worker !== null
        ) {
          try {
            vehicle.worker = await WorkerModel.findById(vehicle.worker).lean();
          } catch (err) {
            vehicle.worker = null;
          }
        } else {
          vehicle.worker = null;
        }
      }

      // Add backward compatibility - set first vehicle's data at root level for old frontend code
      if (enquiry.vehicles.length > 0) {
        const firstVehicle = enquiry.vehicles[0];
        enquiry.registration_no = firstVehicle.registration_no;
        enquiry.parking_no = firstVehicle.parking_no;
        console.log(
          "  ✅ Set root fields:",
          enquiry.registration_no,
          enquiry.parking_no,
        );
      }
    } else {
      console.log("  ⚠️ No vehicles array found!");
    }
  }

  console.log("📤 Returning data count:", data.length);
  return { total, data };
};

service.info = async (userInfo, id) => {
  return EnquiryModel.findOne({ _id: id, isDeleted: false }).lean();
};

service.create = async (userInfo, payload) => {
  const id = await CounterService.id("enquiry");
  // Sanitize payload - convert empty strings to undefined for ObjectId fields
  const sanitizedPayload = { ...payload };
  if (sanitizedPayload.location === "") sanitizedPayload.location = undefined;
  if (sanitizedPayload.building === "") sanitizedPayload.building = undefined;

  // Sanitize vehicles array - convert empty worker strings to undefined
  if (sanitizedPayload.vehicles && Array.isArray(sanitizedPayload.vehicles)) {
    sanitizedPayload.vehicles = sanitizedPayload.vehicles.map((vehicle) => ({
      ...vehicle,
      worker: vehicle.worker === "" ? undefined : vehicle.worker,
    }));
  }

  const data = {
    createdBy: userInfo._id,
    updatedBy: userInfo._id,
    id,
    ...sanitizedPayload,
  };
  await new EnquiryModel(data).save();
};

service.update = async (userInfo, id, payload) => {
  // Sanitize payload - convert empty strings to undefined for ObjectId fields
  const sanitizedPayload = { ...payload };
  if (sanitizedPayload.location === "") sanitizedPayload.location = undefined;
  if (sanitizedPayload.building === "") sanitizedPayload.building = undefined;

  // Sanitize vehicles array - convert empty worker strings to undefined
  if (sanitizedPayload.vehicles && Array.isArray(sanitizedPayload.vehicles)) {
    sanitizedPayload.vehicles = sanitizedPayload.vehicles.map((vehicle) => ({
      ...vehicle,
      worker: vehicle.worker === "" ? undefined : vehicle.worker,
    }));
  }

  await EnquiryModel.updateOne({ _id: id }, { $set: sanitizedPayload });
};

service.delete = async (userInfo, id, payload) => {
  return await EnquiryModel.updateOne(
    { _id: id },
    { isDeleted: true, deletedBy: userInfo._id },
  );
};

service.undoDelete = async (userInfo, id) => {
  return await EnquiryModel.updateOne(
    { _id: id },
    { isDeleted: false, updatedBy: userInfo._id },
  );
};
