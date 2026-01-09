const moment = require("moment");
const exceljs = require("exceljs");
const mongoose = require("mongoose");

const PaymentsModel = require("../../models/payments.model");
const PaymentSettlementsModel = require("../../models/payment-settlements.model");
const TransactionsModel = require("../../models/transactions.model");
const WorkersModel = require("../../models/workers.model");
const CounterService = require("../../../utils/counters");
const CommonHelper = require("../../../helpers/common.helper");

const service = module.exports;

service.list = async (userInfo, query) => {
  try {
    console.log("🔵 [SERVICE] Payments list started with query:", query);
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
          "⚠️ [SERVICE] Invalid startDate format, skipping date filter"
        );
      }
    }

    const findQuery = {
      isDeleted: false,
      ...dateFilter,
      onewash: query.onewash == "true",
      ...(query.status ? { status: query.status } : null),
      ...(query.worker && query.worker.trim() !== ""
        ? { worker: query.worker }
        : null),
      ...(query.building && query.building.trim() !== ""
        ? { building: query.building }
        : null),
      ...(query.mall && query.mall.trim() !== "" ? { mall: query.mall } : null),
      ...(query.search
        ? {
            $or: [
              {
                "vehicle.registration_no": {
                  $regex: query.search,
                  $options: "i",
                },
              },
              { "vehicle.parking_no": { $regex: query.search, $options: "i" } },
            ],
          }
        : null),
    };
    console.log("🔍 [SERVICE] Find query:", JSON.stringify(findQuery, null, 2));

    const total = await PaymentsModel.countDocuments(findQuery);
    console.log("📊 [SERVICE] Total count:", total);

    // Fetch data without populate first
    let data = await PaymentsModel.find(findQuery)
      .sort({ _id: -1 })
      .skip(paginationData.skip)
      .limit(paginationData.limit)
      .lean();

    console.log(
      "📦 [SERVICE] Data fetched (unpopulated):",
      data.length,
      "records"
    );

    // Try to populate each reference separately and catch errors
    try {
      // Populate worker (usually reliable)
      data = await PaymentsModel.populate(data, {
        path: "worker",
        model: "workers",
      });
      console.log("✅ [SERVICE] Workers populated");
    } catch (e) {
      console.warn("⚠️ [SERVICE] Worker populate failed:", e.message);
    }

    try {
      // Populate mall (usually reliable)
      data = await PaymentsModel.populate(data, {
        path: "mall",
        model: "malls",
      });
      console.log("✅ [SERVICE] Malls populated");
    } catch (e) {
      console.warn("⚠️ [SERVICE] Mall populate failed:", e.message);
    }

    try {
      // Populate job (usually reliable)
      data = await PaymentsModel.populate(data, { path: "job", model: "jobs" });
      console.log("✅ [SERVICE] Jobs populated");
    } catch (e) {
      console.warn("⚠️ [SERVICE] Job populate failed:", e.message);
    }

    try {
      // Populate customer (may have issues with nested location/building)
      data = await PaymentsModel.populate(data, {
        path: "customer",
        model: "customers",
      });
      console.log("✅ [SERVICE] Customers populated");

      // Try nested populates
      try {
        data = await PaymentsModel.populate(data, {
          path: "customer.building",
          model: "buildings",
        });
        console.log("✅ [SERVICE] Buildings populated");
      } catch (e) {
        console.warn("⚠️ [SERVICE] Building populate failed:", e.message);
      }

      try {
        data = await PaymentsModel.populate(data, {
          path: "customer.location",
          model: "locations",
        });
        console.log("✅ [SERVICE] Locations populated");
      } catch (e) {
        console.warn(
          "⚠️ [SERVICE] Location populate failed (expected for empty strings):",
          e.message
        );
      }
    } catch (e) {
      console.warn("⚠️ [SERVICE] Customer populate failed:", e.message);
    }

    console.log("📦 [SERVICE] Final data count:", data.length, "records");

    const totalPayments = await PaymentsModel.aggregate([
      { $match: findQuery },
      { $group: { _id: "$payment_mode", amount: { $sum: "$amount_paid" } } },
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

    console.log("✅ [SERVICE] Returning data with counts:", counts);
    return { total, data, counts };
  } catch (error) {
    console.error("❌ [SERVICE] Error in payments list:", error);
    throw error;
  }
};

service.info = async (userInfo, id) => {
  return PaymentsModel.findOne({ _id: id, isDeleted: false }).lean();
};

service.create = async (userInfo, payload) => {
  const id = await CounterService.id("payments");
  const data = {
    createdBy: userInfo._id,
    updatedBy: userInfo._id,
    id,
    ...payload,
  };
  await new PaymentsModel(data).save();
};

service.update = async (userInfo, id, payload) => {
  await PaymentsModel.updateOne({ _id: id }, { $set: payload });
};

service.delete = async (userInfo, id, payload) => {
  return await PaymentsModel.updateOne(
    { _id: id },
    { isDeleted: true, deletedBy: userInfo._id }
  );
};

service.undoDelete = async (userInfo, id) => {
  return await PaymentsModel.updateOne(
    { _id: id },
    { isDeleted: false, updatedBy: userInfo._id }
  );
};

service.updatePayment = async (userInfo, id, payload) => {
  const updatePayload = {
    $set: {
      total_amount: payload.total_amount,
      notes: payload.notes,
    },
  };
  await PaymentsModel.updateOne({ _id: id }, updatePayload);
};

service.collectPayment = async (userInfo, id, payload) => {
  const paymentData = await PaymentsModel.findOne({ _id: id }).lean();

  let status =
    Number(payload.amount) <
    paymentData.amount_charged - paymentData.amount_paid
      ? "pending"
      : "completed";
  let balance =
    paymentData.amount_charged +
    paymentData.old_balance -
    (paymentData.amount_paid + payload.amount);

  await PaymentsModel.updateOne(
    { _id: id },
    {
      $set: {
        amount_paid: Number(paymentData.amount_paid + payload.amount),
        payment_mode: payload.payment_mode,
        balance,
        status,
        collectedDate: payload.payment_date,
      },
    }
  );

  await new TransactionsModel({
    payment: id,
    amount: Number(payload.amount),
    payment_date: payload.payment_date,
    createdBy: userInfo._id,
    updatedBy: userInfo._id,
  }).save();
};

service.settlements = async (userInfo, query) => {
  try {
    console.log("=== SETTLEMENTS SERVICE START ===");
    console.log("UserInfo:", JSON.stringify(userInfo, null, 2));
    console.log("Query:", JSON.stringify(query, null, 2));

    const paginationData = CommonHelper.paginationData(query);
    console.log("Pagination data:", paginationData);

    const findQuery = {
      isDeleted: false,
      ...(userInfo.role == "supervisor" ? { supervisor: userInfo._id } : {}),
    };
    console.log("Find query:", JSON.stringify(findQuery, null, 2));

    const total = await PaymentSettlementsModel.countDocuments(findQuery);
    console.log("Total settlements found:", total);

    // First, get raw data without any population
    const rawData = await PaymentSettlementsModel.find(findQuery)
      .sort({ _id: -1 })
      .skip(paginationData.skip)
      .limit(paginationData.limit)
      .lean();

    console.log("Raw data fetched:", rawData.length, "records");
    if (rawData.length > 0) {
      console.log("Sample raw record:", JSON.stringify(rawData[0], null, 2));
    }

    const data = [];

    // Manually process each settlement
    for (let i = 0; i < rawData.length; i++) {
      const iterator = rawData[i];
      console.log(
        `Processing settlement ${i + 1}/${rawData.length}`,
        iterator._id
      );

      // Handle supervisor - check if it's an ObjectId or a string name
      if (iterator.supervisor) {
        if (
          mongoose.Types.ObjectId.isValid(iterator.supervisor) &&
          iterator.supervisor.length === 24
        ) {
          // It's a valid ObjectId, try to populate
          try {
            const supervisor = await mongoose
              .model("users")
              .findById(iterator.supervisor)
              .lean();
            iterator.supervisor = supervisor || { name: "Unknown" };
            console.log(
              "Supervisor populated from ObjectId:",
              iterator.supervisor.name
            );
          } catch (err) {
            console.error("Error populating supervisor:", err.message);
            iterator.supervisor = { name: "Unknown" };
          }
        } else {
          // It's a string name, use it directly
          console.log("Supervisor is a name string:", iterator.supervisor);
          iterator.supervisor = { name: iterator.supervisor };
        }
      } else {
        iterator.supervisor = { name: "Unknown" };
      }

      // Handle payments array
      if (!Array.isArray(iterator.payments)) {
        console.log("Payments is not an array, converting...");
        iterator.payments = [];
      }

      console.log("Payments array length:", iterator.payments.length);

      // Populate payments if they are ObjectIds
      const populatedPayments = [];
      for (let j = 0; j < iterator.payments.length; j++) {
        const paymentId = iterator.payments[j];
        try {
          if (
            mongoose.Types.ObjectId.isValid(paymentId) &&
            typeof paymentId === "string" &&
            paymentId.length === 24
          ) {
            const payment = await mongoose
              .model("payments")
              .findById(paymentId)
              .lean();
            if (payment) {
              populatedPayments.push(payment);
            }
          } else {
            console.log("Invalid or non-ObjectId payment:", paymentId);
          }
        } catch (err) {
          console.error("Error populating payment:", err.message);
        }
      }
      iterator.payments = populatedPayments;
      console.log("Populated payments count:", iterator.payments.length);

      // Calculate amounts
      iterator.amount = iterator.payments.reduce(
        (p, c) => p + (c?.amount_paid || 0),
        0
      );
      iterator.cash = iterator.payments
        .filter((e) => e?.payment_mode == "cash")
        .reduce((p, c) => p + (c?.amount_paid || 0), 0);
      iterator.card = iterator.payments
        .filter((e) => e?.payment_mode == "card")
        .reduce((p, c) => p + (c?.amount_paid || 0), 0);
      iterator.bank = iterator.payments
        .filter((e) => e?.payment_mode == "bank transfer")
        .reduce((p, c) => p + (c?.amount_paid || 0), 0);

      console.log(
        "Calculated amounts - Total:",
        iterator.amount,
        "Cash:",
        iterator.cash,
        "Card:",
        iterator.card,
        "Bank:",
        iterator.bank
      );

      data.push(iterator);
    }

    console.log(
      "Processed data successfully, returning",
      data.length,
      "records"
    );
    console.log("=== SETTLEMENTS SERVICE END ===");
    return { total, data };
  } catch (error) {
    console.error("!!! SERVICE SETTLEMENTS ERROR !!!");
    console.error("Error message:", error.message);
    console.error("Error stack:", error.stack);
    throw error;
  }
};

service.updateSettlements = async (id, userInfo, payload) => {
  return PaymentSettlementsModel.updateOne(
    { _id: id },
    { $set: { status: "completed", updatedBy: userInfo._id } }
  );
};

service.settlePayment = async (userInfo, id, payload) => {
  await PaymentsModel.updateMany(
    { _id: { $in: payload.paymentIds } },
    {
      $set: {
        settled: "completed",
        settledDate: new Date(),
        payment_settled_date: new Date(),
      },
    }
  );
};

service.exportData = async (userInfo, query) => {
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
    onewash: query.onewash == "true",
    ...(query.status ? { status: query.status } : null),
    ...(query.worker ? { worker: query.worker } : null),
    ...(query.building ? { building: query.building } : null),
    ...(query.mall ? { mall: query.mall } : null),
    ...(query.search
      ? {
          $or: [
            { "vehicle.registration_no": query.search },
            { "vehicle.parking_no": query.search },
          ],
        }
      : null),
  };

  const data = await PaymentsModel.find(findQuery, {
    _id: 0,
    isDeleted: 0,
    createdBy: 0,
    updatedBy: 0,
    id: 0,
    updatedAt: 0,
    onewash: 0,
    amount_paid: 0,
    job: 0,
    location: 0,
  })
    .sort({ _id: -1 })
    .populate([
      { path: "customer", model: "customers" },
      { path: "job", model: "jobs" },
      { path: "worker", model: "workers" },
      { path: "mall", model: "malls" },
      { path: "building", model: "buildings" },
    ])
    .lean();

  const workbook = new exceljs.Workbook();
  const worksheet = workbook.addWorksheet("Report");
  const keys = Object.keys(data[0]);

  worksheet.addRow(keys);

  for (const iterator of data) {
    iterator.createdAt = moment(iterator.createdAt).format("YYYY-MM-DD");
    iterator.vehicle = iterator?.vehicle?.registration_no || "";
    iterator.parking_no = iterator?.vehicle?.parking_no || "";
    iterator.worker = iterator?.worker?.name;
    iterator.customer = iterator?.customer?.mobile;
    iterator.mall = iterator?.mall?.name || "";
    iterator.building = iterator?.building?.name || "";

    const values = [];

    for (const key of keys) {
      values.push(iterator[key] !== undefined ? iterator[key] : "");
    }

    worksheet.addRow(values);
  }

  return workbook;
};

service.monthlyStatement = async (userInfo, query) => {
  const findQuery = {
    isDeleted: false,
    onewash: false,
    createdAt: {
      $gte: moment(new Date(query.year, query.month, 1))
        .startOf("month")
        .subtract(1, "day")
        .utc()
        .format(),
      $lte: moment(new Date(query.year, query.month, 1))
        .endOf("month")
        .utc()
        .format(),
    },
  };

  if (query.worker != "all") {
    findQuery.worker = query.worker;
  } else if (query.building != "all") {
    const workers = await WorkersModel.find(
      { isDeleted: false, buildings: query.building },
      { _id: 1 }
    ).lean();
    findQuery.worker = { $in: workers.map((e) => e._id) };
  }

  const data = await PaymentsModel.find(findQuery, {
    id: 0,
    status: 0,
    isDeleted: 0,
    createdBy: 0,
    updatedBy: 0,
    updatedAt: 0,
  })
    .sort({ _id: -1 })
    .populate([
      { path: "job", model: "jobs" },
      { path: "worker", model: "workers" },
      { path: "building", model: "buildings" },
      { path: "customer", model: "customers" },
    ])
    .lean();

  const workbook = new exceljs.Workbook();

  const buildingsMap = {};
  const buildingWorkerMap = {};

  for (const iterator of JSON.parse(JSON.stringify(data))) {
    if (iterator.building && iterator.worker) {
      if (buildingWorkerMap[iterator.building._id]) {
        if (buildingWorkerMap[iterator.building._id][iterator.worker._id]) {
          buildingWorkerMap[iterator.building._id][iterator.worker._id].push(
            iterator
          );
        } else {
          buildingWorkerMap[iterator.building._id][iterator.worker._id] = [
            iterator,
          ];
        }
      } else {
        buildingsMap[iterator.building._id] = iterator.building;
        buildingWorkerMap[iterator.building._id] = {
          [iterator.worker._id]: [iterator],
        };
      }
    }
  }

  const keys = [
    "Sl. No",
    "Parking No.",
    "Registration No.",
    "Mobile No.",
    "Flat No.",
    "Start Date",
    "Schedule",
    "Advance",
    "Current Month",
    "Last Month",
    "Total",
    "Paid",
    "Notes",
    "Due Date",
  ];

  for (const building in buildingWorkerMap) {
    let count = 1;

    const buildingInfo = buildingsMap[building];
    const workersData = buildingWorkerMap[building];
    const reportSheet = workbook.addWorksheet(buildingInfo.name);

    for (const worker in workersData) {
      const workerData = workersData[worker];

      reportSheet.addRow([workerData[0].worker.name, buildingInfo.name]);
      reportSheet.addRow(keys);

      for (const payment of workerData) {
        let vehicle = payment.customer.vehicles.find(
          (e) => e.registration_no == payment.vehicle.registration_no
        );
        reportSheet.addRow([
          count++,
          payment.vehicle.parking_no,
          payment.vehicle.registration_no,
          payment.customer.mobile,
          payment.customer.flat_no,
          vehicle ? moment(vehicle.start_date).format("DD-MM-YYYY") : "",
          vehicle
            ? vehicle.schedule_type == "daily"
              ? "D"
              : `W${vehicle.schedule_days.length}`
            : "",
          vehicle ? (vehicle.advance_amount ? "A" : "") : "",
          payment.amount_charged,
          payment.old_balance,
          payment.total_amount - payment.amount_paid,
          payment.amount_paid,
          payment.notes,
          moment(payment.createdAt)
            .tz("Asia/Dubai")
            .add(1, "month")
            .format("DD-MM-YYYY"),
        ]);
      }
    }
  }

  return workbook;
};
