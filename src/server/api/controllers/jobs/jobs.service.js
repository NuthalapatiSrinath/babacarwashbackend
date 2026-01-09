const moment = require("moment-timezone");
const exceljs = require("exceljs");

const JobsModel = require("../../models/jobs.model");
const PaymentsModel = require("../../models/payments.model");
const CustomersModel = require("../../models/customers.model");
const CounterService = require("../../../utils/counters");
const CommonHelper = require("../../../helpers/common.helper");
const AuthHelper = require("../auth/auth.helper");
const WorkersModel = require("../../models/workers.model");

const service = module.exports;

service.list = async (userInfo, query) => {
  const paginationData = CommonHelper.paginationData(query);
  const workers = [];

  if (userInfo.role == "supervisor" && !query.worker) {
    const workersFindQuery = {
      isDeleted: false,
      ...(userInfo.service_type == "mall"
        ? { malls: { $in: [userInfo.mall] } }
        : null),
      ...(userInfo.service_type == "residence"
        ? { buildings: { $in: userInfo.buildings } }
        : null),
    };

    const workersData = await WorkersModel.find(workersFindQuery);

    for (const iterator of JSON.parse(JSON.stringify(workersData))) {
      workers.push(iterator._id);
    }
  }

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
    ...(query.worker
      ? { worker: query.worker }
      : userInfo.role == "supervisor"
      ? { worker: { $in: workers } }
      : null),
    ...(query.customer ? { customer: query.customer } : null),
    ...(query.building ? { building: query.building } : null),
    ...(query.mall ? { mall: query.mall } : null),
    ...(query.status ? { status: query.status } : null),
  };

  if (query.search) {
    const customers = await CustomersModel.find({
      isDeleted: false,
      $or: [
        { "vehicles.registration_no": { $regex: query.search, $options: "i" } },
        { "vehicles.parking_no": { $regex: query.search, $options: "i" } },
      ],
    }).lean();

    if (customers.length) {
      let vehicles = [];
      for (const customer of customers) {
        for (const vehicle of customer.vehicles) {
          vehicles.push(vehicle._id);
        }
      }
      findQuery.$or = [{ vehicle: { $in: vehicles } }];
    }
  }

  const total = await JobsModel.countDocuments(findQuery);
  const data = await JobsModel.find(findQuery)
    .sort({ completedDate: -1 })
    .skip(paginationData.skip)
    .limit(paginationData.limit)
    .populate([
      { path: "customer", model: "customers" },
      { path: "location", model: "locations" },
      { path: "building", model: "buildings" },
      { path: "worker", model: "workers" },
    ])
    .lean();

  for (const iterator of data) {
    iterator.vehicle = iterator.customer.vehicles.find(
      (e) => e._id == iterator.vehicle
    );
  }

  return { total, data };
};

service.info = async (userInfo, id) => {
  return JobsModel.findOne({ _id: id, isDeleted: false }).lean();
};

service.create = async (userInfo, payload) => {
  const id = await CounterService.id("workers");
  const data = {
    createdBy: userInfo._id,
    updatedBy: userInfo._id,
    id,
    ...payload,
    hPassword: AuthHelper.getPasswordHash(payload.password),
  };
  await new JobsModel(data).save();
};

service.update = async (userInfo, id, payload) => {
  await JobsModel.updateOne({ _id: id }, { $set: payload });
};

service.delete = async (userInfo, id, payload) => {
  return await JobsModel.updateOne(
    { _id: id },
    { isDeleted: true, deletedBy: userInfo._id }
  );
};

service.undoDelete = async (userInfo, id) => {
  return await JobsModel.updateOne(
    { _id: id },
    { isDeleted: false, updatedBy: userInfo._id }
  );
};

service.exportData = async (userInfo, query) => {
  const workers = [];

  if (userInfo.role == "supervisor" && !query.worker) {
    const workersFindQuery = {
      isDeleted: false,
      ...(userInfo.service_type == "mall"
        ? { malls: { $in: [userInfo.mall] } }
        : null),
      ...(userInfo.service_type == "residence"
        ? {
            buildings: {
              $in: (userInfo.buildings || []).filter((b) => b && b.trim()),
            },
          }
        : null),
    };

    const workersData = await WorkersModel.find(workersFindQuery);

    for (const iterator of JSON.parse(JSON.stringify(workersData))) {
      workers.push(iterator._id);
    }
  }

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
    ...(query.worker
      ? { worker: query.worker }
      : userInfo.role == "supervisor"
      ? { worker: { $in: workers } }
      : null),
    ...(query.customer ? { customer: query.customer } : null),
    ...(query.building ? { building: query.building } : null),
    ...(query.mall ? { mall: query.mall } : null),
    ...(query.status ? { status: query.status } : null),
  };

  if (query.search) {
    const customers = await CustomersModel.find({
      isDeleted: false,
      $or: [
        { "vehicles.registration_no": { $regex: query.search, $options: "i" } },
        { "vehicles.parking_no": { $regex: query.search, $options: "i" } },
      ],
    }).lean();

    if (customers.length) {
      let vehicles = [];
      for (const customer of customers) {
        for (const vehicle of customer.vehicles) {
          vehicles.push(vehicle._id);
        }
      }
      findQuery.$or = [{ vehicle: { $in: vehicles } }];
    }
  }

  const data = await JobsModel.find(findQuery, {
    _id: 0,
    isDeleted: 0,
    createdBy: 0,
    updatedBy: 0,
    id: 0,
    createdAt: 0,
    updatedAt: 0,
  })
    .sort({ _id: -1 })
    .populate([
      { path: "customer", model: "customers" },
      { path: "location", model: "locations" },
      { path: "building", model: "buildings" },
      { path: "worker", model: "workers" },
    ])
    .lean();

  const workbook = new exceljs.Workbook();

  const reportSheet = workbook.addWorksheet("Report");
  const worksheet = workbook.addWorksheet("Detailed Report");

  const keys = Object.keys(data[0]);

  if (data[0].service_type == "mall") {
    let index = keys.indexOf("mall");
    keys.splice(index, 0, "building");
  }

  worksheet.addRow(keys);

  let mallWiseMap = {};
  let buildingWiseMap = {};

  for (const iterator of data) {
    let vehicle = iterator.customer.vehicles.find(
      (e) => e._id == iterator.vehicle
    );

    iterator.assignedDate = moment(iterator.assignedDate).format("YYYY-MM-DD");
    iterator.completedDate = moment(iterator.completedDate).format(
      "YYYY-MM-DD"
    );
    iterator.vehicle = vehicle?.registration_no || "";
    iterator.worker = iterator?.worker?.name;
    iterator.customer = iterator?.customer?.mobile;
    iterator.mall = iterator?.mall?.name || "";
    iterator.building = iterator?.building?.name || "";
    iterator.location = iterator?.location?.address || "";

    const values = [];

    for (const key of keys) {
      values.push(iterator[key] !== undefined ? iterator[key] : "");
    }

    worksheet.addRow(values);

    const key = `${iterator.assignedDate}-${iterator.service_type}-${
      iterator.service_type == "mall" ? iterator.mall : iterator.building
    }`;

    if (iterator.service_type == "mall") {
      if (mallWiseMap[key]) {
        mallWiseMap[key].count++;
      } else {
        mallWiseMap[key] = {
          mall: iterator.mall,
          assignedDate: iterator.assignedDate,
          count: 1,
        };
      }
    } else {
      if (buildingWiseMap[key]) {
        buildingWiseMap[key].count++;
      } else {
        buildingWiseMap[key] = {
          building: iterator.building,
          assignedDate: iterator.assignedDate,
          count: 1,
        };
      }
    }
  }

  reportSheet.addRow(["Day", "Mall", "Count"]);

  for (const key in mallWiseMap) {
    let values = [
      mallWiseMap[key].assignedDate,
      mallWiseMap[key].mall,
      mallWiseMap[key].count,
    ];
    reportSheet.addRow(values);
  }

  reportSheet.addRow([]);
  reportSheet.addRow([]);

  reportSheet.addRow(["Day", "Building", "Count"]);

  for (const key in buildingWiseMap) {
    let values = [
      buildingWiseMap[key].assignedDate,
      buildingWiseMap[key].building,
      buildingWiseMap[key].count,
    ];
    reportSheet.addRow(values);
  }

  return workbook;
};

service.monthlyStatement = async (userInfo, query) => {
  const findQuery = {
    isDeleted: false,
    status: "completed",
    assignedDate: {
      $gte: moment(new Date(query.year, query.month, 1)).startOf("month"),
      $lte: moment(new Date(query.year, query.month, 1)).endOf("month"),
    },
  };

  const data = await JobsModel.find(findQuery, {
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
      { path: "building", model: "buildings" },
    ])
    .lean();

  const workbook = new exceljs.Workbook();

  const reportSheet = workbook.addWorksheet("Report");

  const days = [
    1,
    ...new Array(moment(findQuery.assignedDate.$gte).daysInMonth() - 1)
      .fill(0)
      .map((_, i) => i + 2),
  ];
  const keys = ["Sl. No", "Name", ...days, "Total Cars"];

  reportSheet.addRow(keys);

  const workerMap = {};

  for (const iterator of JSON.parse(JSON.stringify(data))) {
    if (iterator.worker) {
      if (workerMap[iterator.worker._id]) {
        workerMap[iterator.worker._id].push(iterator);
      } else {
        workerMap[iterator.worker._id] = [iterator];
      }
    }
  }

  let count = 1;

  for (const worker in workerMap) {
    let workerData = workerMap[worker];
    let daywiseMap = {};
    let daywiseCounts = {};
    let totalCars = 0;

    for (const iterator of workerData) {
      let date = moment(iterator.assignedDate).tz("Asia/Dubai").date();
      if (daywiseMap[date]) {
        daywiseMap[date].push(iterator);
      } else {
        daywiseMap[date] = [iterator];
      }
    }

    for (const day of days) {
      let data = daywiseMap[day] || [];
      daywiseCounts[day] = data.length;
      totalCars += data.length;
    }

    reportSheet.addRow([
      count++,
      workerData[0].worker.name.trim(),
      ...Object.values(daywiseCounts),
      totalCars,
    ]);
  }

  return workbook;
};
