const OneWashModel = require("../../models/onewash.model");
const PaymentsModel = require("../../models/payments.model");
const WorkersModel = require("../../models/workers.model");
const MallsModel = require("../../models/malls.model");
const BuildingsModel = require("../../models/buildings.model");
const CounterService = require("../../../utils/counters");
const CommonHelper = require("../../../helpers/common.helper");
const moment = require("moment");
const exceljs = require("exceljs");
const service = module.exports;

// --- UTILS ---
const isValidId = (id) =>
  id && typeof id === "string" && id.match(/^[0-9a-fA-F]{24}$/);

// --- LIST ---
service.list = async (userInfo, query) => {
  const findQuery = { isDeleted: false };
  if (!query.worker) findQuery.worker = { $ne: "" };

  const findWorkerQuery = { isDeleted: false };
  let limitToWorkerIds = null;

  if (userInfo.service_type === "mall" && isValidId(userInfo.mall)) {
    findWorkerQuery.malls = { $in: [userInfo.mall] };
    const workers = await WorkersModel.find(findWorkerQuery).select("_id");
    limitToWorkerIds = workers.map((w) => w._id);
  } else if (
    userInfo.service_type === "residence" &&
    Array.isArray(userInfo.buildings)
  ) {
    const validBuildings = userInfo.buildings.filter(isValidId);
    if (validBuildings.length > 0) {
      findWorkerQuery.buildings = { $in: validBuildings };
      const workers = await WorkersModel.find(findWorkerQuery).select("_id");
      limitToWorkerIds = workers.map((w) => w._id);
    }
  }

  if (query.startDate && query.startDate !== "null") {
    const start = new Date(query.startDate);
    if (!isNaN(start.getTime())) {
      let end = query.endDate
        ? new Date(query.endDate)
        : new Date(query.startDate);
      if (!query.endDate || query.endDate.length <= 10)
        end.setHours(23, 59, 59, 999);
      if (!isNaN(end.getTime())) {
        findQuery.createdAt = { $gte: start, $lte: end };
      }
    }
  }

  if (userInfo.role === "supervisor" && userInfo.service_type) {
    findQuery.service_type = userInfo.service_type;
  } else if (userInfo.role === "admin") {
    if (query.service_type) findQuery.service_type = query.service_type;
    if (isValidId(query.mall)) findQuery.mall = query.mall;
    if (isValidId(query.building)) findQuery.building = query.building;
  }

  if (isValidId(query.worker)) {
    findQuery.worker = query.worker;
  } else if (limitToWorkerIds) {
    findQuery.worker = { $in: limitToWorkerIds };
  }

  if (query.search) {
    const searchRegex = { $regex: query.search, $options: "i" };
    const matchingWorkers = await WorkersModel.find(
      { isDeleted: false, name: searchRegex },
      { _id: 1 },
    ).lean();

    const orConditions = [
      { parking_no: searchRegex },
      { registration_no: searchRegex },
    ];

    if (matchingWorkers.length > 0) {
      orConditions.push({
        worker: { $in: matchingWorkers.map((e) => e._id) },
      });
    }
    findQuery.$or = orConditions;
  }

  const paginationData = CommonHelper.paginationData(query);
  const total = await OneWashModel.countDocuments(findQuery);

  let data = await OneWashModel.find(findQuery)
    .sort({ _id: -1 })
    .skip(paginationData.skip)
    .limit(paginationData.limit)
    .lean();

  try {
    data = await OneWashModel.populate(data, [
      { path: "worker", model: "workers", select: "name" },
      { path: "mall", model: "malls", select: "name" },
      { path: "building", model: "buildings", select: "name" },
    ]);
  } catch (e) {
    console.error("List Populate Warning:", e.message);
  }

  const totalPayments = await OneWashModel.aggregate([
    { $match: findQuery },
    { $group: { _id: "$payment_mode", amount: { $sum: "$amount" } } },
  ]);

  const getAmount = (mode) =>
    totalPayments.find((p) => p._id?.toLowerCase() === mode)?.amount || 0;

  const counts = {
    totalJobs: total,
    totalAmount: totalPayments.reduce((acc, curr) => acc + curr.amount, 0),
    cash: getAmount("cash"),
    card: getAmount("card"),
    bank: getAmount("bank transfer"),
  };

  return { total, data, counts };
};

// --- INFO ---
service.info = async (userInfo, id) => {
  return OneWashModel.findOne({ _id: id, isDeleted: false }).lean();
};

// --- CREATE ---
service.create = async (userInfo, payload) => {
  if (!payload.service_type) throw new Error("Service type is required");
  if (!payload.worker) throw new Error("Worker is required");
  if (!payload.amount || payload.amount <= 0)
    throw new Error("Amount must be > 0");
  if (!payload.registration_no) throw new Error("Reg No is required");

  if (payload.service_type === "mall" && !payload.mall)
    throw new Error("Mall required");
  if (payload.service_type === "residence" && !payload.building)
    throw new Error("Building required");

  const id = await CounterService.id("onewash");
  const data = {
    createdBy: userInfo._id,
    updatedBy: userInfo._id,
    id,
    ...payload,
  };
  const saved = await new OneWashModel(data).save();
  let created = await OneWashModel.findById(saved._id).lean();

  try {
    created = await OneWashModel.populate(created, [
      { path: "worker", model: "workers" },
      { path: "mall", model: "malls" },
      { path: "building", model: "buildings" },
    ]);
  } catch (e) {}

  return created;
};

// --- UPDATE ---
service.update = async (userInfo, id, payload) => {
  if (payload.settled && !payload.amount && !payload.payment_mode) {
    await OneWashModel.updateOne(
      { _id: id },
      {
        $set: { settled: payload.settled, settledDate: payload.settledDate },
      },
    );
    return;
  }

  const onewashData = await OneWashModel.findOne({ _id: id }).lean();
  let amount_paid = payload.amount;
  let tip_amount = 0;

  if (onewashData.mall) {
    const mallData = await MallsModel.findOne({ _id: onewashData.mall });
    if (payload.payment_mode != "cash" && mallData) {
      const finalAmount = mallData.amount + mallData.card_charges;
      if (payload.amount < finalAmount)
        throw "Amount entered is less than required";
      tip_amount =
        payload.amount > finalAmount ? payload.amount - finalAmount : 0;
    }
  }

  if (onewashData.building) {
    const buildingData = await BuildingsModel.findOne({
      _id: onewashData.building,
    });
    if (payload.payment_mode != "cash" && buildingData) {
      const finalAmount = buildingData.amount + buildingData.card_charges;
      if (payload.amount < finalAmount)
        throw "Amount entered is less than required";
      tip_amount =
        payload.amount > finalAmount ? payload.amount - finalAmount : 0;
    }
  }

  const updateSet = {
    amount_paid,
    status: payload.status,
    payment_mode: payload.payment_mode,
    vehicle: {
      parking_no: payload.parking_no,
      registration_no: payload.registration_no,
    },
  };

  await PaymentsModel.updateOne({ job: id }, { $set: updateSet });
  await OneWashModel.updateOne(
    { _id: id },
    {
      $set: {
        tip_amount,
        amount: amount_paid,
        status: payload.status,
        payment_mode: payload.payment_mode,
        parking_no: payload.parking_no,
        registration_no: payload.registration_no,
      },
    },
  );
};

// --- DELETE ---
service.delete = async (userInfo, id, payload) => {
  await PaymentsModel.updateOne(
    { job: id },
    { $set: { isDeleted: true, deletedBy: userInfo._id } },
  );
  return await OneWashModel.updateOne(
    { _id: id },
    { $set: { isDeleted: true, deletedBy: userInfo._id } },
  );
};

service.undoDelete = async (userInfo, id) => {
  return await OneWashModel.updateOne(
    { _id: id },
    { isDeleted: false, updatedBy: userInfo._id },
  );
};

// --- EXPORT DATA ---
service.exportData = async (userInfo, query) => {
  const findQuery = { isDeleted: false };
  findQuery.worker = { $ne: "" };
  findQuery.mall = { $ne: "" };
  findQuery.building = { $ne: "" };

  if (userInfo.role === "supervisor" && userInfo.service_type) {
    findQuery.service_type = userInfo.service_type;
  } else if (userInfo.role === "admin") {
    if (query.service_type) findQuery.service_type = query.service_type;
    if (isValidId(query.mall)) findQuery.mall = query.mall;
    if (isValidId(query.building)) findQuery.building = query.building;
  }

  if (isValidId(query.worker)) {
    findQuery.worker = query.worker;
  }

  if (query.startDate && query.startDate !== "null") {
    const start = new Date(query.startDate);
    if (!isNaN(start.getTime())) {
      let end = query.endDate
        ? new Date(query.endDate)
        : new Date(query.startDate);
      if (!query.endDate || query.endDate.length <= 10)
        end.setHours(23, 59, 59, 999);

      if (!isNaN(end.getTime())) {
        findQuery.createdAt = { $gte: start, $lte: end };
      }
    }
  }

  if (query.search) {
    const searchRegex = { $regex: query.search, $options: "i" };
    const matchedWorkers = await WorkersModel.find(
      { isDeleted: false, name: searchRegex },
      { _id: 1 },
    ).lean();

    findQuery.$or = [
      { parking_no: searchRegex },
      { registration_no: searchRegex },
      { payment_mode: searchRegex },
      { status: searchRegex },
    ];

    if (matchedWorkers.length > 0) {
      findQuery.$or.push({
        worker: { $in: matchedWorkers.map((e) => e._id) },
      });
    }
  }

  const data = await OneWashModel.find(findQuery)
    .populate([
      { path: "worker", model: "workers", select: "name" },
      { path: "mall", model: "malls", select: "name" },
      { path: "building", model: "buildings", select: "name" },
    ])
    .sort({ createdAt: -1 })
    .lean();

  const workbook = new exceljs.Workbook();
  const worksheet = workbook.addWorksheet("One Wash Report");

  worksheet.columns = [
    { header: "ID", key: "id", width: 10 },
    { header: "Date", key: "date", width: 15 },
    { header: "Time", key: "time", width: 15 },
    { header: "Vehicle No", key: "registration_no", width: 20 },
    { header: "Parking No", key: "parking_no", width: 15 },
    { header: "Amount (AED)", key: "amount", width: 15 },
    { header: "Tip (AED)", key: "tip_amount", width: 10 },
    { header: "Payment Mode", key: "payment_mode", width: 15 },
    { header: "Status", key: "status", width: 15 },
    { header: "Location Type", key: "service_type", width: 15 },
    { header: "Mall/Building Name", key: "location_name", width: 30 },
    { header: "Worker Name", key: "worker_name", width: 25 },
  ];

  worksheet.getRow(1).font = { bold: true };

  data.forEach((item) => {
    const dateObj = new Date(item.createdAt);
    worksheet.addRow({
      id: item.id,
      date: moment(dateObj).format("YYYY-MM-DD"),
      time: moment(dateObj).format("hh:mm A"),
      registration_no: item.registration_no,
      parking_no: item.parking_no || "-",
      amount: item.amount,
      tip_amount: item.tip_amount || 0,
      payment_mode: item.payment_mode || "-",
      status: item.status || "pending",
      service_type: item.service_type || "-",
      location_name:
        item.service_type === "mall"
          ? item.mall?.name
          : item.building?.name || "-",
      worker_name: item.worker?.name || "Unassigned",
    });
  });

  return workbook;
};

// --- MONTHLY (UPDATED WITH DAILY BREAKDOWN) ---
service.monthlyStatement = async (userInfo, query) => {
  const findQuery = {
    isDeleted: false,
    createdAt: {
      $gte: moment(new Date(query.year, query.month, 1)).startOf("month"),
      $lte: moment(new Date(query.year, query.month, 1)).endOf("month"),
    },
  };

  const data = await OneWashModel.find(findQuery)
    .sort({ _id: -1 })
    .populate([
      { path: "worker", model: "workers" },
      { path: "mall", model: "malls" },
      { path: "building", model: "buildings" },
    ])
    .lean();

  const daysInMonth = moment(findQuery.createdAt.$gte).daysInMonth();

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
            daily: new Array(daysInMonth).fill(0), // Array of 31 zeros
          };
        }

        // Calculate Day (1-31) -> Index (0-30)
        const date = moment(iterator.createdAt).date();
        if (date >= 1 && date <= daysInMonth) {
          workerMap[wid].daily[date - 1]++;
        }

        workerMap[wid].totalCars++;
        if (iterator.tip_amount) {
          workerMap[wid].amount += Number(iterator.tip_amount) || 0;
        }
      }
    }
    return Object.values(workerMap);
  }

  // ✅ 2. Return Excel Workbook
  const workbook = new exceljs.Workbook();
  const reportSheet = workbook.addWorksheet("Report");

  const days = [1, ...new Array(daysInMonth - 1).fill(0).map((_, i) => i + 2)];
  const keys = ["Sl. No", "Name", ...days, "Total Cars", "Tips Amount"];

  reportSheet.addRow(keys);

  const workerMap = {};
  for (const iterator of JSON.parse(JSON.stringify(data))) {
    if (iterator.worker) {
      const wid = iterator.worker._id || "unknown";
      if (workerMap[wid]) workerMap[wid].push(iterator);
      else workerMap[wid] = [iterator];
    }
  }

  let count = 1;
  for (const worker in workerMap) {
    let workerData = workerMap[worker];
    let daywiseCounts = {};
    let tipAmount = 0;
    let totalCars = 0;

    for (const iterator of workerData) {
      let date = moment(iterator.createdAt).date();
      daywiseCounts[date] = (daywiseCounts[date] || 0) + 1;
    }

    for (const day of days) {
      let count = daywiseCounts[day] || 0;
      totalCars += count;
    }

    tipAmount = workerData.reduce(
      (acc, curr) => acc + (Number(curr.tip_amount) || 0),
      0,
    );

    const dayValues = days.map((d) => daywiseCounts[d] || "");

    reportSheet.addRow([
      count++,
      workerData[0].worker?.name?.trim() || "Unknown",
      ...dayValues,
      totalCars,
      tipAmount,
    ]);
  }

  return workbook;
};
