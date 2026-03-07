const exceljs = require("exceljs");
const moment = require("moment");
const UsersModel = require("../../models/users.model");
const WorkersModel = require("../../models/workers.model");
const OneWashModel = require("../../models/onewash.model");
const JobsModel = require("../../models/jobs.model");
const CustomersModel = require("../../models/customers.model");
const CounterService = require("../../../utils/counters");
const CommonHelper = require("../../../helpers/common.helper");
const AuthHelper = require("../auth/auth.helper");
const InAppNotifications = require("../../../notifications/in-app.notifications");
const service = module.exports;

service.list = async (userInfo, query) => {
  const paginationData = CommonHelper.paginationData(query);
  const findQuery = { isDeleted: false, role: "supervisor" };
  const total = await UsersModel.countDocuments(findQuery);
  const data = await UsersModel.find(findQuery)
    .select("+password")
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
        path: "mall",
        model: "malls",
      },
    ])
    .lean();
  return { total, data };
};

service.info = async (userInfo, id) => {
  return UsersModel.findOne({ _id: id, isDeleted: false })
    .select("+password")
    .lean();
};

service.create = async (userInfo, payload) => {
  const id = await CounterService.id("users");
  const isExists = await UsersModel.countDocuments({
    role: "supervisor",
    isDeleted: false,
    number: payload.number,
  });
  if (isExists) {
    throw "Oops! The supervisor already created";
  }

  // Determine service_type based on assignment
  const service_type = payload.mall ? "mall" : "residence";

  const data = {
    id,
    ...payload,
    service_type,
    createdBy: userInfo._id,
    updatedBy: userInfo._id,
    role: "supervisor",
    hPassword: AuthHelper.getPasswordHash(payload.password),
  };
  await new UsersModel(data).save();

  // Send notification about new supervisor creation
  try {
    await InAppNotifications.send({
      worker: userInfo._id,
      message: `New supervisor "${payload.name}" has been created`,
      createdBy: userInfo._id,
    });
  } catch (error) {
    console.error("Failed to send notification:", error);
  }
};

service.update = async (userInfo, id, payload) => {
  const { password, ...updateData } = payload;

  // Determine service_type based on assignment
  if (updateData.mall) {
    updateData.service_type = "mall";
  } else if (updateData.buildings && updateData.buildings.length > 0) {
    updateData.service_type = "residence";
  }

  const data = {
    updatedBy: userInfo._id,
    ...updateData,
    ...(password && password.trim() !== ""
      ? {
          password: password,
          hPassword: AuthHelper.getPasswordHash(password),
        }
      : {}),
  };

  await UsersModel.updateOne({ _id: id }, { $set: data });

  // Send notification about supervisor update
  try {
    const supervisor = await UsersModel.findOne({ _id: id });
    await InAppNotifications.send({
      worker: userInfo._id,
      message: `Supervisor "${supervisor?.name || "Unknown"}" details have been updated`,
      createdBy: userInfo._id,
    });
  } catch (error) {
    console.error("Failed to send notification:", error);
  }
};

service.delete = async (userInfo, id, payload) => {
  const supervisor = await UsersModel.findOne({ _id: id });

  // Modify phone number to free it up for reuse (avoid unique index conflict)
  const deletedNumber = supervisor.number
    ? `deleted_${supervisor.number}_${Date.now()}`
    : supervisor.number;

  const result = await UsersModel.updateOne(
    { _id: id },
    { isDeleted: true, deletedBy: userInfo._id, number: deletedNumber },
  );

  // Send notification about supervisor deletion
  try {
    await InAppNotifications.send({
      worker: userInfo._id,
      message: `Supervisor "${supervisor?.name || "Unknown"}" has been deleted`,
      createdBy: userInfo._id,
    });
  } catch (error) {
    console.error("Failed to send notification:", error);
  }

  return result;
};

service.undoDelete = async (userInfo, id) => {
  return await UsersModel.updateOne(
    { _id: id },
    { isDeleted: false, updatedBy: userInfo._id },
  );
};

service.teamList = async (userInfo, query) => {
  const paginationData = CommonHelper.paginationData(query);
  const findQuery = {
    isDeleted: false,
    ...(userInfo.service_type == "mall"
      ? { malls: { $in: [userInfo.mall] } }
      : null),
    ...(userInfo.service_type == "residence"
      ? {
          buildings: {
            $in: (userInfo.buildings || []).filter((b) => b),
          },
        }
      : null),
    ...(query.search
      ? {
          $or: [
            { name: { $regex: query.search, $options: "i" } },
            { mobile: { $regex: query.search, $options: "i" } },
          ],
        }
      : null),
  };
  const total = await WorkersModel.countDocuments(findQuery);
  const data = await WorkersModel.find(findQuery)
    .sort({ _id: -1 })
    .skip(paginationData.skip)
    .limit(paginationData.limit)
    .lean();

  // Compute stats across ALL matching workers (not just current page)
  const allWorkers = await WorkersModel.find(findQuery)
    .select("status service_type")
    .lean();
  const stats = {
    total,
    active: allWorkers.filter((w) => w.status === 1).length,
    inactive: allWorkers.filter((w) => w.status !== 1).length,
    residence: allWorkers.filter((w) => w.service_type === "residence").length,
    mall: allWorkers.filter((w) => w.service_type === "mall").length,
  };

  return { total, data, stats };
};

// Worker history (washes) for supervisor's team member
service.teamHistory = async (userInfo, query, workerId) => {
  // Verify the worker belongs to this supervisor's team
  const workerQuery = {
    _id: workerId,
    isDeleted: false,
    ...(userInfo.service_type === "mall"
      ? { malls: { $in: [userInfo.mall] } }
      : null),
    ...(userInfo.service_type === "residence"
      ? { buildings: { $in: (userInfo.buildings || []).filter((b) => b) } }
      : null),
  };
  const worker = await WorkersModel.findOne(workerQuery).lean();
  if (!worker) throw "Worker not found or not in your team";

  const paginationData = CommonHelper.paginationData(query);
  const findQuery = { isDeleted: false, worker: workerId };

  if (query.startDate && query.endDate) {
    findQuery.createdAt = {
      $gte: new Date(query.startDate),
      $lte: new Date(query.endDate),
    };
  }

  if (query.customer && query.customer.trim())
    findQuery.customer = query.customer;
  if (query.building && query.building.trim())
    findQuery.building = query.building;
  if (query.mall && query.mall.trim()) findQuery.mall = query.mall;

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
        return { total: 0, data: [] };
      }
    } else {
      return { total: 0, data: [] };
    }
  }

  let total = 0;
  let data = [];

  // Residence jobs
  if (query.service_type && query.service_type === "residence") {
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
          select: "firstName lastName mobile vehicles",
          populate: [
            { path: "building", model: "buildings" },
            { path: "location", model: "locations" },
          ],
        },
      ])
      .lean();
    data.forEach((item) => {
      if (item.customer && item.customer.vehicles) {
        item.vehicle = item.customer.vehicles.find(
          (e) => e._id.toString() === (item.vehicle || "").toString(),
        );
      }
    });
  }

  // Onewash (mall) jobs
  let onewashData = [];
  let onewashTotal = 0;

  if (query.service_type !== "residence") {
    onewashTotal = await OneWashModel.countDocuments(findQuery);
    onewashData = await OneWashModel.find(findQuery)
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
    onewashData = onewashData.map((e) => ({
      ...e,
      vehicle: { registration_no: e.registration_no, parking_no: e.parking_no },
    }));
  }

  return { total: total + onewashTotal, data: [...data, ...onewashData] };
};

service.exportData = async (userInfo, query) => {
  const findWorkerQuery = {
    isDeleted: false,
    ...(userInfo.service_type == "mall"
      ? { malls: { $in: [userInfo.mall] } }
      : null),
    ...(userInfo.service_type == "residence"
      ? {
          buildings: {
            $in: (userInfo.buildings || []).filter((b) => b),
          },
        }
      : null),
  };

  const workers = await WorkersModel.find(findWorkerQuery);
  const workerIds = workers.map((e) => e._id.toString());

  const findQuery = {
    isDeleted: false,
    ...(query.search
      ? {
          $or: [
            { parking_no: { $regex: query.search, $options: "i" } },
            { registration_no: { $regex: query.search, $options: "i" } },
          ],
        }
      : null),
    ...(query.startDate
      ? {
          createdAt: {
            $gte: new Date(query.startDate),
            $lte: new Date(query.endDate),
          },
        }
      : null),
    ...(query.service_type ? { service_type: query.service_type } : null),
    ...(query.worker
      ? { worker: query.worker }
      : { worker: { $in: workerIds } }),
  };

  if (query.search) {
    const workers = await WorkersModel.find(
      { isDeleted: false, name: { $regex: query.search, $options: "i" } },
      { _id: 1 },
    ).lean();
    if (workers.length) {
      findQuery.$or.push({
        worker: { $in: workers.map((e) => e._id.toString()) },
      });
    }
  }

  const data = await OneWashModel.find(findQuery, {
    _id: 0,
    status: 0,
    isDeleted: 0,
    createdBy: 0,
    updatedBy: 0,
    id: 0,
    updatedAt: 0,
  })
    .sort({ _id: -1 })
    .populate([
      { path: "worker", model: "workers" },
      { path: "mall", model: "malls" },
    ])
    .lean();

  const workbook = new exceljs.Workbook();

  const worksheet = workbook.addWorksheet("Report");
  const keys = Object.keys(data[0]);
  worksheet.addRow(keys);

  for (const iterator of data) {
    iterator.createdAt = moment(iterator.createdAt).format("YYYY-MM-DD");
    iterator.worker = iterator.worker.name;
    iterator.mall = iterator.mall.name;
    const values = Object.values(iterator);
    worksheet.addRow(values);
  }

  return workbook;
};
