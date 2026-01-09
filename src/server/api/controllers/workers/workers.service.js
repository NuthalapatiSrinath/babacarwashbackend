const WorkersModel = require("../../models/workers.model");
const CustomersModel = require("../../models/customers.model");
const JobsModel = require("../../models/jobs.model");
const OnewashModel = require("../../models/onewash.model");
const CounterService = require("../../../utils/counters");
const CommonHelper = require("../../../helpers/common.helper");
const AuthHelper = require("../auth/auth.helper");
const service = module.exports;

service.list = async (userInfo, query) => {
  const paginationData = CommonHelper.paginationData(query);
  const findQuery = {
    isDeleted: false,
    status: query.status !== undefined ? Number(query.status) : 1,
    ...(query.search
      ? {
          $or: [{ name: { $regex: query.search, $options: "i" } }],
        }
      : null),
    ...(userInfo.role == "supervisor" && userInfo.service_type == "mall"
      ? { malls: { $in: [userInfo.mall] } }
      : null),
    ...(userInfo.role == "supervisor" && userInfo.service_type == "residence"
      ? {
          buildings: {
            $in: (userInfo.buildings || []).filter((b) => b && b.trim()),
          },
        }
      : null),
    ...(query.mall ? { malls: { $in: [query.mall] } } : null),
    ...(query.service_type ? { service_type: query.service_type } : null),
  };

  if (Number(query.search)) {
    findQuery.$or.push({ mobile: { $regex: Number(query.search) } });
  }

  const total = await WorkersModel.countDocuments(findQuery);
  const data = await WorkersModel.find(findQuery)
    .sort({ _id: -1 })
    .skip(paginationData.skip)
    .limit(paginationData.limit)
    .populate([
      {
        path: "buildings",
        model: "buildings",
        populate: [{ path: "location_id", model: "locations" }],
      },
      {
        path: "malls",
        model: "malls",
      },
    ])
    .lean();

  return { total, data };
};

service.info = async (userInfo, id) => {
  return WorkersModel.findOne({ _id: id, isDeleted: false })
    .populate([
      { path: "buildings", model: "buildings" },
      { path: "malls", model: "malls" },
    ])
    .lean();
};

service.create = async (userInfo, payload) => {
  const userExists = await WorkersModel.countDocuments({
    isDeleted: false,
    mobile: payload.mobile,
  });
  if (userExists) {
    throw "USER-EXISTS";
  }
  const id = await CounterService.id("workers");
  const data = {
    createdBy: userInfo._id,
    updatedBy: userInfo._id,
    id,
    ...payload,
    hPassword: AuthHelper.getPasswordHash(payload.password),
  };
  await new WorkersModel(data).save();
};

service.update = async (userInfo, id, payload) => {
  // Remove password from payload to avoid saving plain text
  const { password, ...updateData } = payload;

  const data = {
    updatedBy: userInfo._id,
    ...updateData,
    ...(password ? { hPassword: AuthHelper.getPasswordHash(password) } : {}),
  };
  await WorkersModel.updateOne({ _id: id }, { $set: data });
};

service.delete = async (userInfo, id, payload) => {
  const isExists = await CustomersModel.countDocuments({
    isDeleted: false,
    "vehicles.worker": id,
  });
  if (isExists) {
    throw "This worker is currently assigned to customers and cannot be deleted";
  }
  return await WorkersModel.updateOne(
    { _id: id },
    { isDeleted: true, deletedBy: userInfo._id }
  );
};

service.undoDelete = async (userInfo, id) => {
  return await WorkersModel.updateOne(
    { _id: id },
    { isDeleted: false, updatedBy: userInfo._id }
  );
};

service.deactivate = async (userInfo, id, payload) => {
  await CustomersModel.updateMany(
    { "vehicles.worker": id },
    { $set: { "vehicles.$.worker": payload.worker } }
  );
  await JobsModel.updateMany(
    { worker: id },
    { $set: { worker: payload.worker } }
  );
  const updateData = {
    status: 2,
    deactivateReason: payload.deactivateReason,
    ...(payload.otherReason ? { otherReason: payload.otherReason } : null),
    transferredTo: payload.worker,
    transferredTo: payload.worker,
  };
  await WorkersModel.updateOne({ _id: id }, { $set: updateData });
};

service.customersList = async (userInfo, query, workerId) => {
  return await CustomersModel.find({ "vehicles.worker": workerId })
    .populate([
      { path: "building", model: "buildings" },
      { path: "location", model: "locations" },
    ])
    .lean();
};

service.washesList = async (userInfo, query, workerId) => {
  const paginationData = CommonHelper.paginationData(query);

  // 1. Base Query
  const findQuery = {
    isDeleted: false,
    worker: workerId,
  };

  // 2. Add Date Filters (Only if valid dates are provided)
  if (query.startDate && query.endDate) {
    findQuery.createdAt = {
      $gte: new Date(query.startDate),
      $lte: new Date(query.endDate),
    };
  }

  // 3. Add Optional ID Filters (Only if they represent a valid selection, i.e., not empty string)
  if (query.customer && query.customer.trim())
    findQuery.customer = query.customer;
  if (query.building && query.building.trim())
    findQuery.building = query.building;
  if (query.mall && query.mall.trim()) findQuery.mall = query.mall;

  // 4. Handle Search (Only if search string is provided)
  if (query.search) {
    const customers = await CustomersModel.find({
      isDeleted: false,
      $or: [
        { "vehicles.registration_no": { $regex: query.search, $options: "i" } },
        { "vehicles.parking_no": { $regex: query.search, $options: "i" } },
      ],
    })
      .select("_id vehicles")
      .lean();

    if (customers.length) {
      let vehicleIds = [];
      for (const customer of customers) {
        if (customer.vehicles) {
          for (const vehicle of customer.vehicles) {
            vehicleIds.push(vehicle._id);
          }
        }
      }
      if (vehicleIds.length > 0) {
        findQuery.$or = [{ vehicle: { $in: vehicleIds } }];
      } else {
        // Search returned no vehicles, so force empty result to prevent showing all
        return { total: 0, data: [] };
      }
    } else {
      return { total: 0, data: [] }; // No customers found match search
    }
  }

  let total = 0;
  let data = [];

  // 5. Fetch Residence Jobs (Only if requested)
  // Ensure we check if service_type exists before checking equality
  if (query.service_type && query.service_type == "residence") {
    // First, clean up any records with empty string references in the database
    await JobsModel.updateMany(
      {
        $or: [
          { building: "" },
          { location: "" },
          { mall: "" },
          { customer: "" },
        ],
      },
      {
        $unset: {
          building: "",
          location: "",
          mall: "",
          customer: "",
        },
      }
    );

    total = await JobsModel.countDocuments(findQuery);
    data = await JobsModel.find(findQuery)
      .sort({ completedDate: -1 })
      .skip(paginationData.skip)
      .limit(paginationData.limit)
      .populate([
        { path: "building", model: "buildings" },
        { path: "location", model: "locations" },
        { path: "mall", model: "malls" },
        {
          path: "customer",
          model: "customers",
          select: "firstName lastName mobile vehicles", // Optimization
          populate: [
            { path: "building", model: "buildings" },
            { path: "location", model: "locations" },
          ],
        },
      ])
      .lean();

    // Map vehicle info safely
    data.forEach((iterator) => {
      if (iterator.customer && iterator.customer.vehicles) {
        iterator.vehicle = iterator.customer.vehicles.find(
          (e) => e._id.toString() == iterator.vehicle.toString()
        );
      }
    });
  }

  // 6. Fetch OneWash Jobs (Always fetch unless filtering strictly for residence)
  // If user strictly wants residence, skip this. Otherwise, fetch it.
  let onewashData = [];
  let onewashTotal = 0;

  if (query.service_type !== "residence") {
    // First, clean up any records with empty string references in the database
    await OnewashModel.updateMany(
      {
        $or: [
          { building: "" },
          { location: "" },
          { mall: "" },
          { customer: "" },
        ],
      },
      {
        $unset: {
          building: "",
          location: "",
          mall: "",
          customer: "",
        },
      }
    );

    onewashTotal = await OnewashModel.countDocuments(findQuery);
    onewashData = await OnewashModel.find(findQuery)
      .sort({ completedDate: -1 })
      .skip(paginationData.skip)
      .limit(paginationData.limit)
      .populate([
        { path: "building", model: "buildings" },
        { path: "location", model: "locations" },
        { path: "mall", model: "malls" },
        {
          path: "customer",
          model: "customers",
          select: "firstName lastName mobile",
          populate: [
            { path: "building", model: "buildings" },
            { path: "location", model: "locations" },
          ],
        },
      ])
      .lean();

    // Transform OneWash data structure to match
    onewashData = onewashData.map((e) => {
      return {
        ...e,
        vehicle: {
          registration_no: e.registration_no,
          parking_no: e.parking_no,
        },
      };
    });
  }

  return { total: total + onewashTotal, data: [...data, ...onewashData] };
};
