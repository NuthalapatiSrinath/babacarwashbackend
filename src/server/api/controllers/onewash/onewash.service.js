const OneWashModel = require("../../models/onewash.model");
const PaymentsModel = require("../../models/payments.model");
const WorkersModel = require("../../models/workers.model");
const MallsModel = require("../../models/malls.model");
const CounterService = require("../../../utils/counters");
const CommonHelper = require("../../../helpers/common.helper");
const moment = require("moment");
const exceljs = require("exceljs");
const service = module.exports;

service.list = async (userInfo, query) => {
  const findWorkerQuery = {
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

  const workers = await WorkersModel.find(findWorkerQuery);
  const workerIds = workers.map((e) => e._id.toString());

  const paginationData = CommonHelper.paginationData(query);

  // Validate and parse dates
  let dateFilter = null;
  if (query.startDate && query.startDate.trim() !== "") {
    const startDate = new Date(query.startDate);

    // Check if startDate is valid
    if (!isNaN(startDate.getTime())) {
      dateFilter = {
        createdAt: {
          $gte: startDate,
        },
      };

      // Add endDate if provided and valid
      if (query.endDate && query.endDate.trim() !== "") {
        const endDate = new Date(query.endDate);
        if (!isNaN(endDate.getTime())) {
          dateFilter.createdAt.$lte = endDate;
        }
      }
    } else {
      console.warn(
        "⚠️ [ONEWASH] Invalid startDate format, skipping date filter"
      );
    }
  }

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
    ...dateFilter,
    ...(userInfo.role == "supervisor" && userInfo.service_type
      ? { service_type: userInfo.service_type }
      : null),
    ...(userInfo.role == "admin" &&
    query.service_type &&
    query.service_type.trim() !== ""
      ? { service_type: query.service_type }
      : null),
    ...(userInfo.role == "admin" && query.mall && query.mall.trim() !== ""
      ? { mall: query.mall }
      : null),
    ...(userInfo.role == "admin" &&
    query.building &&
    query.building.trim() !== ""
      ? { building: query.building }
      : null),
    ...(query.worker && query.worker.trim() !== ""
      ? { worker: query.worker }
      : { worker: { $in: workerIds } }),
  };

  if (query.search) {
    const workers = await WorkersModel.find(
      { isDeleted: false, name: { $regex: query.search, $options: "i" } },
      { _id: 1 }
    ).lean();
    if (workers.length) {
      findQuery.$or.push({
        worker: { $in: workers.map((e) => e._id.toString()) },
      });
    }
  }

  const total = await OneWashModel.countDocuments(findQuery);

  // Fetch data without populate first
  let data = await OneWashModel.find(findQuery)
    .sort({ _id: -1 })
    .skip(paginationData.skip)
    .limit(paginationData.limit)
    .lean();

  // Try to populate each reference separately and catch errors
  try {
    data = await OneWashModel.populate(data, {
      path: "worker",
      model: "workers",
    });
  } catch (e) {
    console.warn("⚠️ [ONEWASH] Worker populate failed:", e.message);
  }

  try {
    data = await OneWashModel.populate(data, {
      path: "mall",
      model: "malls",
    });
  } catch (e) {
    console.warn("⚠️ [ONEWASH] Mall populate failed:", e.message);
  }

  try {
    data = await OneWashModel.populate(data, {
      path: "building",
      model: "buildings",
    });
  } catch (e) {
    console.warn("⚠️ [ONEWASH] Building populate failed:", e.message);
  }

  const totalPayments = await OneWashModel.aggregate([
    { $match: findQuery },
    { $group: { _id: "$payment_mode", amount: { $sum: "$amount" } } },
  ]);
  const totalAmount = totalPayments.length
    ? totalPayments.reduce((p, c) => p + c.amount, 0)
    : 0;
  const cash = totalPayments.length
    ? totalPayments.filter((e) => e._id == "cash")
    : 0;
  const card = totalPayments.length
    ? totalPayments.filter((e) => e._id == "card")
    : 0;
  const bank = totalPayments.length
    ? totalPayments.filter((e) => e._id == "bank transfer")
    : 0;
  const counts = {
    totalJobs: total,
    totalAmount,
    cash: cash.length ? cash[0].amount : 0,
    card: card.length ? card[0].amount : 0,
    bank: bank.length ? bank[0].amount : 0,
  };

  return { total, data, counts };
};

service.info = async (userInfo, id) => {
  return OneWashModel.findOne({ _id: id, isDeleted: false }).lean();
};

service.create = async (userInfo, payload) => {
  // Validate required fields
  if (!payload.service_type) {
    throw new Error("Service type is required");
  }
  if (!payload.worker) {
    throw new Error("Worker is required");
  }
  if (!payload.amount || payload.amount <= 0) {
    throw new Error("Amount must be greater than 0");
  }
  if (!payload.registration_no) {
    throw new Error("Registration number is required");
  }

  // Validate service_type specific fields
  if (payload.service_type === "mall" && !payload.mall) {
    throw new Error("Mall is required for mall service");
  }
  if (payload.service_type === "residence" && !payload.building) {
    throw new Error("Building is required for residence service");
  }

  const id = await CounterService.id("onewash");
  const data = {
    createdBy: userInfo._id,
    updatedBy: userInfo._id,
    id,
    ...payload,
  };
  const saved = await new OneWashModel(data).save();

  // Return the created document with populated fields
  let created = await OneWashModel.findById(saved._id).lean();

  // Populate worker
  try {
    created = await OneWashModel.populate(created, {
      path: "worker",
      model: "workers",
    });
  } catch (e) {
    console.warn("⚠️ [ONEWASH CREATE] Worker populate failed:", e.message);
  }

  // Populate mall if exists
  if (created.mall) {
    try {
      created = await OneWashModel.populate(created, {
        path: "mall",
        model: "malls",
      });
    } catch (e) {
      console.warn("⚠️ [ONEWASH CREATE] Mall populate failed:", e.message);
    }
  }

  // Populate building if exists
  if (created.building) {
    try {
      created = await OneWashModel.populate(created, {
        path: "building",
        model: "buildings",
      });
    } catch (e) {
      console.warn("⚠️ [ONEWASH CREATE] Building populate failed:", e.message);
    }
  }

  return created;
};

service.update = async (userInfo, id, payload) => {
  // If only updating settled status, do simple update
  if (payload.settled && !payload.amount && !payload.payment_mode) {
    await OneWashModel.updateOne(
      { _id: id },
      {
        $set: {
          settled: payload.settled,
          settledDate: payload.settledDate,
        },
      }
    );
    return;
  }

  // Otherwise, do full payment update logic
  const onewashData = await OneWashModel.findOne({ _id: id }).lean();

  let amount_paid = 0;
  let tip_amount = 0;

  if (onewashData.mall) {
    mallData = await MallsModel.findOne({ _id: onewashData.mall });
    amount_paid = payload.amount;
    if (payload.payment_mode != "cash") {
      let finalAmount = mallData.amount + mallData.card_charges;
      if (payload.amount < finalAmount) {
        throw "The amount entered is less than the required amount";
      }
      tip_amount =
        payload.amount > finalAmount ? payload.amount - finalAmount : 0;
    }
  }

  if (onewashData.building) {
    buildingData = await BuildingsModel.findOne({ _id: onewashData.building });
    amount_paid = payload.amount;
    if (payload.payment_mode != "cash") {
      let finalAmount = buildingData.amount + buildingData.card_charges;
      if (payload.amount < finalAmount) {
        throw "The amount entered is less than the required amount";
      }
      tip_amount =
        payload.amount > finalAmount ? payload.amount - finalAmount : 0;
    }
  }

  await PaymentsModel.updateOne(
    { job: id },
    {
      $set: {
        amount_paid,
        status: payload.status,
        payment_mode: payload.payment_mode,
        vehicle: {
          parking_no: payload.parking_no,
          registration_no: payload.registration_no,
        },
      },
    }
  );

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
    }
  );
};

service.delete = async (userInfo, id, payload) => {
  await PaymentsModel.updateOne(
    { job: id },
    { $set: { isDeleted: true, deletedBy: userInfo._id } }
  );
  return await OneWashModel.updateOne(
    { _id: id },
    { $set: { isDeleted: true, deletedBy: userInfo._id } }
  );
};

service.undoDelete = async (userInfo, id) => {
  return await OneWashModel.updateOne(
    { _id: id },
    { isDeleted: false, updatedBy: userInfo._id }
  );
};

service.exportData = async (userInfo, query) => {
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
    ...(userInfo.role == "supervisor" && userInfo.service_type
      ? { service_type: userInfo.service_type }
      : null),
    ...(userInfo.role == "admin" && query.service_type
      ? { service_type: query.service_type }
      : null),
    ...(userInfo.role == "admin" && query.mall ? { mall: query.mall } : null),
    ...(userInfo.role == "admin" && query.building
      ? { building: query.building }
      : null),
    ...(query.worker ? { worker: query.worker } : null),
  };

  if (query.search) {
    const workers = await WorkersModel.find(
      { isDeleted: false, name: { $regex: query.search, $options: "i" } },
      { _id: 1 }
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
    .populate([
      { path: "worker", model: "workers" },
      { path: "mall", model: "malls" },
      { path: "building", model: "buildings" },
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
    iterator.createdAt = moment(iterator.createdAt).format("YYYY-MM-DD");
    iterator.worker = iterator.worker.name;
    iterator.mall = iterator?.mall?.name || "";
    iterator.building = iterator?.building?.name || "";

    const values = [];

    for (const key of keys) {
      values.push(iterator[key] !== undefined ? iterator[key] : "");
    }

    worksheet.addRow(values);

    const key = `${iterator.createdAt}-${iterator.service_type}-${
      iterator.service_type == "mall" ? iterator.mall : iterator.building
    }`;

    if (iterator.service_type == "mall") {
      if (mallWiseMap[key]) {
        mallWiseMap[key].count++;
      } else {
        mallWiseMap[key] = {
          mall: iterator.mall,
          createdAt: iterator.createdAt,
          count: 1,
        };
      }
    } else {
      if (buildingWiseMap[key]) {
        buildingWiseMap[key].count++;
      } else {
        buildingWiseMap[key] = {
          building: iterator.building,
          createdAt: iterator.createdAt,
          count: 1,
        };
      }
    }
  }

  reportSheet.addRow(["Day", "Mall", "Count"]);

  for (const key in mallWiseMap) {
    let values = [
      mallWiseMap[key].createdAt,
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
      buildingWiseMap[key].createdAt,
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
    createdAt: {
      $gte: moment(new Date(query.year, query.month, 1)).startOf("month"),
      $lte: moment(new Date(query.year, query.month, 1)).endOf("month"),
    },
  };

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
      { path: "building", model: "buildings" },
    ])
    .lean();

  const workbook = new exceljs.Workbook();

  const reportSheet = workbook.addWorksheet("Report");

  const days = [
    1,
    ...new Array(moment(findQuery.createdAt.$gte).daysInMonth() - 1)
      .fill(0)
      .map((_, i) => i + 2),
  ];
  const keys = ["Sl. No", "Name", ...days, "Total Cars", "Tips Amount"];

  reportSheet.addRow(keys);

  const workerMap = {};

  for (const iterator of JSON.parse(JSON.stringify(data))) {
    if (workerMap[iterator.worker._id]) {
      workerMap[iterator.worker._id].push(iterator);
    } else {
      workerMap[iterator.worker._id] = [iterator];
    }
  }

  let count = 1;

  for (const worker in workerMap) {
    let workerData = workerMap[worker];
    let daywiseMap = {};
    let daywiseCounts = {};
    let tipAmount = 0;
    let totalCars = 0;

    for (const iterator of workerData) {
      let date = moment(iterator.createdAt).date();
      if (daywiseMap[date]) {
        daywiseMap[date].push(iterator);
      } else {
        daywiseMap[date] = [iterator];
      }
    }

    for (const day of days) {
      let data = daywiseMap[day] || [];
      daywiseCounts[day] = data.length;
      for (const wash of data) {
        tipAmount += Number(wash.tip_amount) || 0;
      }
      totalCars += data.length;
    }

    reportSheet.addRow([
      count++,
      workerData[0].worker.name.trim(),
      ...Object.values(daywiseCounts),
      totalCars,
      tipAmount,
    ]);
  }

  return workbook;
};
