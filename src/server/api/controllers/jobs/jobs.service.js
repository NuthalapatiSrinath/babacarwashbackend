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

// --- UTILS ---
const isValidId = (id) =>
  id && typeof id === "string" && id.match(/^[0-9a-fA-F]{24}$/);

const cleanQuery = (q) => {
  const cleaned = {};
  for (const key in q) {
    if (q[key] !== "" && q[key] !== "null" && q[key] !== undefined) {
      cleaned[key] = q[key];
    }
  }
  return cleaned;
};

// --- LIST ---
service.list = async (userInfo, rawQuery) => {
  const query = cleanQuery(rawQuery);
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
    worker: { $ne: "" },
    customer: { $ne: "" },
    building: { $ne: "" },

    ...(query.startDate && !isNaN(new Date(query.startDate).getTime())
      ? {
          createdAt: {
            $gte: new Date(query.startDate),
            $lte: (() => {
              let end = query.endDate
                ? new Date(query.endDate)
                : new Date(query.startDate);
              if (!query.endDate || query.endDate.length <= 10)
                end.setHours(23, 59, 59, 999);
              return end;
            })(),
          },
        }
      : null),

    ...(isValidId(query.worker)
      ? { worker: query.worker }
      : userInfo.role == "supervisor"
        ? { worker: { $in: workers } }
        : null),

    ...(isValidId(query.customer) ? { customer: query.customer } : null),
    ...(isValidId(query.building) ? { building: query.building } : null),
    ...(isValidId(query.mall) ? { mall: query.mall } : null),
    ...(query.status ? { status: query.status } : null),
  };

  if (query.search) {
    const customers = await CustomersModel.find({
      isDeleted: false,
      $or: [
        {
          "vehicles.registration_no": { $regex: query.search, $options: "i" },
        },
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

  let data = await JobsModel.find(findQuery)
    .sort({ completedDate: -1 })
    .skip(paginationData.skip)
    .limit(paginationData.limit)
    .lean();

  try {
    data = await JobsModel.populate(data, [
      { path: "customer", model: "customers" },
      { path: "location", model: "locations" },
      { path: "building", model: "buildings" },
      { path: "worker", model: "workers" },
    ]);
  } catch (e) {
    console.warn("List Populate Warning (Ignored):", e.message);
  }

  for (const iterator of data) {
    if (iterator.customer && iterator.customer.vehicles) {
      iterator.vehicle = iterator.customer.vehicles.find(
        (e) => e._id == iterator.vehicle,
      );
    }
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
    worker: payload.worker || null,
    customer: payload.customer || null,
    vehicle: payload.vehicle || null,
    hPassword: payload.password
      ? AuthHelper.getPasswordHash(payload.password)
      : undefined,
  };
  await new JobsModel(data).save();
};

service.update = async (userInfo, id, payload) => {
  if (payload.worker === "") payload.worker = null;
  if (payload.customer === "") payload.customer = null;
  await JobsModel.updateOne({ _id: id }, { $set: payload });
};

service.delete = async (userInfo, id, payload) => {
  return await JobsModel.updateOne(
    { _id: id },
    { isDeleted: true, deletedBy: userInfo._id },
  );
};

service.undoDelete = async (userInfo, id) => {
  return await JobsModel.updateOne(
    { _id: id },
    { isDeleted: false, updatedBy: userInfo._id },
  );
};

// --- EXPORT DATA ---
service.exportData = async (userInfo, rawQuery) => {
  const query = cleanQuery(rawQuery);
  try {
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
      worker: { $ne: "" },
      customer: { $ne: "" },
      building: { $ne: "" },

      ...(query.startDate && !isNaN(new Date(query.startDate).getTime())
        ? {
            createdAt: {
              $gte: new Date(query.startDate),
              $lte: (() => {
                let end = query.endDate
                  ? new Date(query.endDate)
                  : new Date(query.startDate);
                if (!query.endDate || query.endDate.length <= 10)
                  end.setHours(23, 59, 59, 999);
                return end;
              })(),
            },
          }
        : null),

      ...(isValidId(query.worker)
        ? { worker: query.worker }
        : userInfo.role == "supervisor"
          ? { worker: { $in: workers } }
          : null),

      ...(isValidId(query.customer) ? { customer: query.customer } : null),
      ...(isValidId(query.building) ? { building: query.building } : null),
      ...(isValidId(query.mall) ? { mall: query.mall } : null),
      ...(query.status ? { status: query.status } : null),
    };

    if (query.search) {
      const customers = await CustomersModel.find({
        isDeleted: false,
        $or: [
          {
            "vehicles.registration_no": { $regex: query.search, $options: "i" },
          },
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

    let data = await JobsModel.find(findQuery)
      .sort({ completedDate: -1 })
      .lean();

    try {
      data = await JobsModel.populate(data, [
        { path: "customer", model: "customers" },
        { path: "location", model: "locations" },
        { path: "building", model: "buildings" },
        { path: "worker", model: "workers" },
      ]);
    } catch (e) {
      console.error("⚠️ [EXPORT POPULATE ERROR]:", e.message);
    }

    const workbook = new exceljs.Workbook();
    const worksheet = workbook.addWorksheet("Residence Jobs Report");

    worksheet.columns = [
      { header: "ID", key: "id", width: 10 },
      { header: "Assigned Date", key: "assignedDate", width: 15 },
      { header: "Completed Date", key: "completedDate", width: 15 },
      { header: "Customer Name", key: "customer", width: 25 },
      { header: "Mobile", key: "mobile", width: 15 },
      { header: "Building", key: "building", width: 20 },
      { header: "Vehicle No", key: "vehicle", width: 15 },
      { header: "Parking No", key: "parking", width: 15 },
      { header: "Worker", key: "worker", width: 20 },
      { header: "Status", key: "status", width: 15 },
    ];

    worksheet.getRow(1).font = { bold: true };

    data.forEach((item) => {
      let vehicleInfo = null;
      if (item.customer && item.customer.vehicles) {
        const vId = item.vehicle?._id || item.vehicle;
        vehicleInfo = item.customer.vehicles.find(
          (v) => v._id.toString() === vId?.toString(),
        );
      }

      worksheet.addRow({
        id: item.id || "-",
        assignedDate: item.assignedDate
          ? moment(item.assignedDate).format("YYYY-MM-DD")
          : "-",
        completedDate: item.completedDate
          ? moment(item.completedDate).format("YYYY-MM-DD")
          : "-",
        customer: item.customer
          ? `${item.customer.firstName} ${item.customer.lastName}`
          : "Unknown",
        mobile: item.customer?.mobile || "-",
        building: item.building?.name || "-",
        vehicle: vehicleInfo?.registration_no || "-",
        parking: vehicleInfo?.parking_no || "-",
        worker: item.worker?.name || "Unassigned",
        status: item.status || "pending",
      });
    });

    return workbook;
  } catch (error) {
    console.error("❌ [EXPORT FATAL ERROR]:", error);
    throw error;
  }
};

// --- MONTHLY STATEMENT (UPDATED WITH DAILY BREAKDOWN) ---
service.monthlyStatement = async (userInfo, query) => {
  const findQuery = {
    isDeleted: false,
    status: "completed",
    assignedDate: {
      $gte: moment(new Date(query.year, query.month, 1)).startOf("month"),
      $lte: moment(new Date(query.year, query.month, 1)).endOf("month"),
    },
  };

  const data = await JobsModel.find(findQuery)
    .sort({ _id: -1 })
    .populate([
      { path: "worker", model: "workers" },
      { path: "building", model: "buildings" },
    ])
    .lean();

  const daysInMonth = moment(findQuery.assignedDate.$gte).daysInMonth();

  // ✅ 1. Return JSON with DAILY data if format=json
  if (query.format === "json") {
    const workerMap = {};
    for (const iterator of data) {
      if (iterator.worker) {
        const wid = iterator.worker._id.toString();
        if (!workerMap[wid]) {
          workerMap[wid] = {
            name: iterator.worker.name?.trim() || "Unknown",
            code: iterator.worker.employeeCode || "N/A",
            totalCars: 0,
            amount: 0,
            daily: new Array(daysInMonth).fill(0), // Array of zeros
          };
        }

        // Calculate Day (1-31) -> Index (0-30)
        // Note: For jobs, we use assignedDate or completedDate. Query filters by assignedDate.
        const date = moment(iterator.assignedDate).tz("Asia/Dubai").date();
        if (date >= 1 && date <= daysInMonth) {
          workerMap[wid].daily[date - 1]++;
        }

        workerMap[wid].totalCars++;
      }
    }
    return Object.values(workerMap);
  }

  // ✅ 2. Return Excel Workbook (Default)
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
