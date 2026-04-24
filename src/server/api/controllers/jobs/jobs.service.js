const moment = require("moment-timezone");
const exceljs = require("exceljs");

const JobsModel = require("../../models/jobs.model");
const PaymentsModel = require("../../models/payments.model");
const CustomersModel = require("../../models/customers.model");
const BuildingsModel = require("../../models/buildings.model");
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

const toNumberSafe = (value) => {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalizeRegParkingKey = (registrationNo, parkingNo) => {
  const reg = String(registrationNo || "")
    .trim()
    .toUpperCase();
  const parking = String(parkingNo || "")
    .trim()
    .toUpperCase();
  if (!reg && !parking) return "";
  return `reg:${reg}::park:${parking}`;
};

const resolveDueDateLabel = (payment) => {
  if (!payment) return "-";

  if (payment.billing_month) {
    const dueMoment = moment(payment.billing_month, "YYYY-MM").endOf("month");
    return dueMoment.isValid() ? dueMoment.format("DD-MMM-YYYY") : "-";
  }

  const createdAt = moment(payment.createdAt);
  if (!createdAt.isValid()) return "-";
  return createdAt.subtract(1, "day").endOf("month").format("DD-MMM-YYYY");
};

const sanitizeSheetName = (name) => {
  const base = String(name || "Building")
    .replace(/[:\\/?*\[\]]/g, "_")
    .trim();
  if (!base) return "Building";
  return base.slice(0, 31);
};

const resolveUniqueSheetName = (workbook, desiredName) => {
  const base = sanitizeSheetName(desiredName);
  const existing = new Set(
    workbook.worksheets.map((sheet) => sheet.name.toLowerCase()),
  );

  if (!existing.has(base.toLowerCase())) {
    return base;
  }

  let index = 1;
  while (true) {
    const suffix = `_${index}`;
    const candidate = `${base.slice(0, Math.max(1, 31 - suffix.length))}${suffix}`;
    if (!existing.has(candidate.toLowerCase())) {
      return candidate;
    }
    index += 1;
  }
};

const isTruthyQueryFlag = (value) => {
  if (typeof value === "boolean") return value;
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
};

// --- LIST ---
service.list = async (userInfo, rawQuery) => {
  const query = cleanQuery(rawQuery);
  const paginationData = CommonHelper.paginationData(query);
  const workers = [];

  // If explicit worker IDs are sent (e.g. from supervisor frontend), use those directly
  if (query.workers) {
    const workerIds = Array.isArray(query.workers)
      ? query.workers
      : [query.workers];
    workers.push(...workerIds);
  } else if (userInfo.role == "supervisor" && !query.worker) {
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
    // worker: { $ne: "" }, // Allow jobs without workers (will be assigned later)
    customer: { $ne: "" },
    building: { $ne: "" },

    ...(query.startDate && !isNaN(new Date(query.startDate).getTime())
      ? {
          assignedDate: {
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
      : workers.length > 0
        ? { worker: { $in: workers } }
        : null),

    ...(isValidId(query.customer) ? { customer: query.customer } : null),
    ...(isValidId(query.building) ? { building: query.building } : null),
    ...(isValidId(query.mall) ? { mall: query.mall } : null),
    ...(query.status ? { status: query.status } : null),
  };

  if (query.search) {
    const numericSearch = Number(query.search);
    if (Number.isFinite(numericSearch) && query.search.trim() !== "") {
      findQuery.id = numericSearch;
    }

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

      // Combine id-search and vehicle-search instead of overwriting.
      if (findQuery.id) {
        delete findQuery.id;
        findQuery.$or = [{ id: numericSearch }, { vehicle: { $in: vehicles } }];
      } else {
        findQuery.$or = [{ vehicle: { $in: vehicles } }];
      }
    }
  }

  const total = await JobsModel.countDocuments(findQuery);

  let data = await JobsModel.find(findQuery)
    .sort({ assignedDate: -1, createdAt: -1 })
    .skip(paginationData.skip)
    .limit(paginationData.limit)
    .lean();

  // Populate references individually to avoid one failure breaking all
  try {
    data = await JobsModel.populate(data, {
      path: "customer",
      model: "customers",
    });
  } catch (e) {
    console.warn("Customer Populate Warning:", e.message);
  }

  try {
    data = await JobsModel.populate(data, {
      path: "location",
      model: "locations",
    });
  } catch (e) {
    console.warn("Location Populate Warning:", e.message);
  }

  try {
    data = await JobsModel.populate(data, {
      path: "building",
      model: "buildings",
    });
  } catch (e) {
    console.warn("Building Populate Warning:", e.message);
  }

  try {
    // Only populate worker if it's not empty
    data = await JobsModel.populate(data, {
      path: "worker",
      model: "workers",
      match: { _id: { $ne: null } },
    });
  } catch (e) {
    console.warn("Worker Populate Warning:", e.message);
  }

  // Map vehicle data - use stored fields or populate from customer.vehicles
  for (const iterator of data) {
    // If job already has registration_no and parking_no stored, use those
    if (iterator.registration_no || iterator.parking_no) {
      iterator.vehicle = {
        _id: iterator.vehicle,
        registration_no: iterator.registration_no,
        parking_no: iterator.parking_no,
      };
    }
    // Otherwise, try to populate from customer.vehicles array
    else if (
      iterator.customer &&
      iterator.customer.vehicles &&
      iterator.vehicle
    ) {
      const vehicleData = iterator.customer.vehicles.find(
        (e) => e._id.toString() === iterator.vehicle?.toString(),
      );
      if (vehicleData) {
        iterator.vehicle = {
          _id: vehicleData._id,
          registration_no: vehicleData.registration_no,
          parking_no: vehicleData.parking_no,
          schedule_type: vehicleData.schedule_type,
          schedule_days: vehicleData.schedule_days,
          amount: vehicleData.amount,
          vehicle_type: vehicleData.vehicle_type,
          status: vehicleData.status,
        };

        // If job doesn't have a worker but vehicle does, populate worker from vehicle
        if (!iterator.worker && vehicleData.worker) {
          try {
            const WorkersModel = require("../../models/workers.model");
            const workerData = await WorkersModel.findById(
              vehicleData.worker,
            ).lean();
            if (workerData) {
              iterator.worker = workerData;
            }
          } catch (e) {
            console.warn("Worker populate failed:", e.message);
          }
        }
      }
    }
  }

  return { total, data };
};

service.info = async (userInfo, id) => {
  return JobsModel.findOne({ _id: id, isDeleted: false }).lean();
};

service.create = async (userInfo, payload) => {
  const id = await CounterService.id("workers");

  // Auto-detect service_type if not provided
  let serviceType = payload.service_type;
  if (!serviceType && payload.customer) {
    try {
      const CustomersModel = require("../../models/customers.model");
      const customer = await CustomersModel.findById(payload.customer).lean();
      if (customer) {
        if (customer.building) {
          serviceType = "Residence";
        } else if (customer.location) {
          serviceType = "Mall";
        }
      }
    } catch (error) {
      console.error("Failed to auto-detect service_type:", error);
    }
  }

  const data = {
    createdBy: userInfo._id,
    createdByName: userInfo.name || "Unknown",
    createdSource: "Admin Panel",
    updatedBy: userInfo._id,
    id,
    ...payload,
    service_type: serviceType || payload.service_type,
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

  // CRITICAL: Never allow assignedDate to be modified when updating a job
  // The scheduled date should remain fixed throughout the job lifecycle
  if (payload.assignedDate) {
    delete payload.assignedDate;
  }

  // When marking job as complete, set completedDate to match assignedDate
  // This ensures the date stays consistent (e.g., if scheduled for 20th, completed date is also 20th)
  if (payload.status === "completed" && !payload.completedDate) {
    const job = await JobsModel.findById(id).lean();
    if (job && job.assignedDate) {
      payload.completedDate = job.assignedDate;
    }
  }

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
      { header: "Service Type", key: "service_type", width: 20 },
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
        service_type:
          vehicleInfo?.wash_type === "outside"
            ? "Outside"
            : vehicleInfo?.wash_type === "total"
              ? "Inside + Outside"
              : vehicleInfo?.wash_type === "inside"
                ? "Inside"
                : "-",
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

// --- MONTHLY STATEMENT (UPDATED: TIPS CALCULATION + EXCEL FIXES) ---
service.monthlyStatement = async (userInfo, query) => {
  let selectedBuildingName = String(query.buildingName || "").trim();
  if (!selectedBuildingName && isValidId(query.building)) {
    const selectedBuilding = await BuildingsModel.findOne({
      _id: query.building,
      isDeleted: { $ne: true },
    })
      .select("name")
      .lean();
    selectedBuildingName = selectedBuilding?.name || "";
  }

  const findQuery = {
    isDeleted: false,
    status: "completed",
    assignedDate: {
      $gte: moment(new Date(query.year, query.month, 1)).startOf("month"),
      $lte: moment(new Date(query.year, query.month, 1)).endOf("month"),
    },
  };

  if (isValidId(query.building)) {
    findQuery.building = query.building;
  }

  // Add worker filter if workerId provided (and not empty string)
  if (query.workerId && query.workerId.trim() !== "") {
    findQuery.worker = query.workerId;
  } else if (query.workers) {
    // Support workers[] array param (e.g. from supervisor frontend for team filtering)
    const workerIds = Array.isArray(query.workers)
      ? query.workers
      : [query.workers];
    findQuery.worker = { $in: workerIds };
  }

  // Fetch all jobs for the month
  const data = await JobsModel.find(findQuery)
    .sort({ assignedDate: 1, _id: 1 })
    .populate([
      { path: "worker", model: "workers" },
      { path: "building", model: "buildings" },
      { path: "customer", model: "customers" },
      { path: "location", model: "locations" },
    ])
    .lean();

  const statusFindQuery = { ...findQuery };
  delete statusFindQuery.status;
  const statusJobs = await JobsModel.find(statusFindQuery)
    .select("status assignedDate")
    .lean();

  const statusCounts = {
    total: 0,
    completed: 0,
    pending: 0,
    rejected: 0,
  };
  const todayStatusCounts = {
    total: 0,
    completed: 0,
    pending: 0,
    rejected: 0,
  };
  const nowDubai = moment().tz("Asia/Dubai");
  const todayStart = nowDubai.clone().startOf("day");
  const todayEnd = nowDubai.clone().endOf("day");

  for (const job of statusJobs) {
    statusCounts.total++;
    const status = String(job.status || "").toLowerCase();
    if (status === "completed") statusCounts.completed++;
    else if (status === "pending") statusCounts.pending++;
    else if (status === "rejected") statusCounts.rejected++;

    const assignedMoment = moment(job.assignedDate).tz("Asia/Dubai");
    if (
      assignedMoment.isValid() &&
      assignedMoment.isBetween(todayStart, todayEnd, null, "[]")
    ) {
      todayStatusCounts.total++;
      if (status === "completed") todayStatusCounts.completed++;
      else if (status === "pending") todayStatusCounts.pending++;
      else if (status === "rejected") todayStatusCounts.rejected++;
    }
  }

  const daysInMonth = moment(findQuery.assignedDate.$gte).daysInMonth();
  const monthName = moment(findQuery.assignedDate.$gte).format("MMMM");
  const year = moment(findQuery.assignedDate.$gte).format("YYYY");
  let selectedWorkerCarList = null;

  // =========================================================
  // SCENARIO 1: WORKER SELECTED (Residence only) - SHOW SCHEDULE
  // ✅ FIX: For past days use historical jobs (schedule at that time),
  //         for future days use current schedule from customer document.
  //         This way changing schedule only affects future, not past.
  // =========================================================
  if (query.workerId) {
    // ✅ Fetch ALL jobs (any status) for this worker in this month
    // These represent the historical schedule (jobs cron created them based on schedule at that time)
    const allJobsForMonth = await JobsModel.find({
      isDeleted: false,
      worker: query.workerId,
      ...(isValidId(query.building) ? { building: query.building } : null),
      assignedDate: {
        $gte: moment(new Date(query.year, query.month, 1)).startOf("month"),
        $lte: moment(new Date(query.year, query.month, 1)).endOf("month"),
      },
    })
      .select("vehicle assignedDate registration_no parking_no customer")
      .lean();

    // Build lookup: vehicleId → Set of scheduled days (from historical jobs)
    const historicalScheduleMap = {};
    allJobsForMonth.forEach((job) => {
      const vid = job.vehicle?.toString();
      if (!vid) return;
      if (!historicalScheduleMap[vid]) historicalScheduleMap[vid] = new Set();
      const day = moment(job.assignedDate).tz("Asia/Dubai").date();
      historicalScheduleMap[vid].add(day);
    });

    // Determine today's date boundary for past vs future
    const today = moment().tz("Asia/Dubai").startOf("day");
    const monthStart = moment(new Date(query.year, query.month, 1)).startOf(
      "month",
    );
    const monthEnd = moment(new Date(query.year, query.month, 1)).endOf(
      "month",
    );

    // ✅ Query customers to get current vehicle assignments for this worker
    const customers = await CustomersModel.find({
      isDeleted: false,
      "vehicles.worker": query.workerId,
      "vehicles.status": 1, // Only active vehicles
      ...(isValidId(query.building) ? { building: query.building } : null),
    })
      .populate({ path: "building", model: "buildings", select: "name" })
      .lean();

    const customerIds = customers
      .map((customer) => customer?._id)
      .filter((id) => !!id);

    const customerPayments = customerIds.length
      ? await PaymentsModel.find({
          isDeleted: false,
          onewash: false,
          customer: { $in: customerIds },
        })
          .sort({ createdAt: -1, _id: -1 })
          .select({
            customer: 1,
            vehicle: 1,
            total_amount: 1,
            amount_paid: 1,
            billing_month: 1,
            createdAt: 1,
            status: 1,
            settled: 1,
          })
          .lean()
      : [];

    const latestByVehicleId = new Map();
    const latestByRegParking = new Map();
    const pendingByVehicleId = new Map();
    const pendingByRegParking = new Map();

    customerPayments.forEach((payment) => {
      const customerId = String(payment?.customer || "").trim();
      if (!customerId) return;

      const vehicle = payment?.vehicle;
      const paymentIdKey =
        vehicle && typeof vehicle === "object"
          ? String(vehicle?._id || "").trim()
          : String(vehicle || "").trim();

      if (paymentIdKey) {
        const key = `${customerId}__id:${paymentIdKey}`;
        if (!latestByVehicleId.has(key)) {
          latestByVehicleId.set(key, payment);
        }
      }

      if (vehicle && typeof vehicle === "object") {
        const regParkingKey = normalizeRegParkingKey(
          vehicle.registration_no,
          vehicle.parking_no,
        );
        if (regParkingKey) {
          const key = `${customerId}__${regParkingKey}`;
          if (!latestByRegParking.has(key)) {
            latestByRegParking.set(key, payment);
          }
        }
      }

      const status = String(payment?.status || "").toLowerCase();
      const settled = String(payment?.settled || "").toLowerCase();
      const dueAmount = Math.max(
        0,
        toNumberSafe(payment?.total_amount) -
          toNumberSafe(payment?.amount_paid),
      );

      if (dueAmount <= 0) return;
      if (settled === "completed") return;
      if (status === "completed" || status === "cancelled") return;

      if (paymentIdKey) {
        const key = `${customerId}__id:${paymentIdKey}`;
        if (!pendingByVehicleId.has(key)) {
          pendingByVehicleId.set(key, payment);
        }
      }

      if (vehicle && typeof vehicle === "object") {
        const regParkingKey = normalizeRegParkingKey(
          vehicle.registration_no,
          vehicle.parking_no,
        );
        if (regParkingKey) {
          const key = `${customerId}__${regParkingKey}`;
          if (!pendingByRegParking.has(key)) {
            pendingByRegParking.set(key, payment);
          }
        }
      }
    });

    const carMap = new Map();

    // Process each customer's vehicles assigned to this worker
    customers.forEach((customer) => {
      const customerName =
        `${customer.firstName || ""} ${customer.lastName || ""}`.trim() ||
        customer.mobile ||
        "Unknown";
      const customerId = String(customer._id || customer.id || "").trim();

      const buildingName =
        (typeof customer.building === "object" && customer.building?.name) ||
        customer.buildingName ||
        "Unknown Building";
      const buildingId =
        typeof customer.building === "object"
          ? customer.building?._id
          : customer.building;

      customer.vehicles.forEach((vehicle) => {
        // Only process vehicles assigned to this worker
        if (vehicle.worker !== query.workerId || vehicle.status !== 1) return;

        // Check if vehicle is active during this month
        const vehicleStart = vehicle.start_date || vehicle.onboard_date;
        const vehicleEnd = vehicle.deactivateDate;

        // Skip if vehicle starts after month ends or ended before month starts
        if (vehicleStart && moment(vehicleStart).isAfter(monthEnd)) return;
        if (vehicleEnd && moment(vehicleEnd).isBefore(monthStart)) return;

        // Convert schedule_days to day names (for future days only)
        let scheduleDays = [];
        if (vehicle.schedule_days) {
          const normalizeDayName = (dayStr) => {
            const dayMap = {
              sun: "sunday",
              sunday: "sunday",
              mon: "monday",
              monday: "monday",
              tue: "tuesday",
              tuesday: "tuesday",
              wed: "wednesday",
              wednesday: "wednesday",
              thu: "thursday",
              thursday: "thursday",
              fri: "friday",
              friday: "friday",
              sat: "saturday",
              saturday: "saturday",
            };
            return dayMap[dayStr.toLowerCase()] || "";
          };

          if (typeof vehicle.schedule_days === "string") {
            scheduleDays = vehicle.schedule_days
              .split(",")
              .map((d) => normalizeDayName(d.trim()))
              .filter((d) => d);
          } else if (Array.isArray(vehicle.schedule_days)) {
            scheduleDays = vehicle.schedule_days
              .flatMap((d) => {
                if (typeof d === "object" && d.day)
                  return normalizeDayName(d.day);
                if (typeof d === "string" && d.includes(",")) {
                  return d
                    .split(",")
                    .map((day) => normalizeDayName(day.trim()));
                }
                return typeof d === "string" ? normalizeDayName(d) : "";
              })
              .filter((d) => d);
          }
        }

        const vehicleId = vehicle._id.toString();
        const historicalDays = historicalScheduleMap[vehicleId] || new Set();

        const paymentByVehicleId = customerId
          ? pendingByVehicleId.get(`${customerId}__id:${vehicleId}`)
          : null;

        const regParkingKey = normalizeRegParkingKey(
          vehicle.registration_no,
          vehicle.parking_no,
        );
        const paymentByRegParking =
          customerId && regParkingKey
            ? pendingByRegParking.get(`${customerId}__${regParkingKey}`)
            : null;

        const latestPaymentByVehicleId = customerId
          ? latestByVehicleId.get(`${customerId}__id:${vehicleId}`)
          : null;

        const latestPaymentByRegParking =
          customerId && regParkingKey
            ? latestByRegParking.get(`${customerId}__${regParkingKey}`)
            : null;

        const duePayment = paymentByVehicleId || paymentByRegParking || null;
        const latestPayment =
          latestPaymentByVehicleId || latestPaymentByRegParking || null;
        const dueAmount = duePayment
          ? Math.max(
              0,
              toNumberSafe(duePayment.total_amount) -
                toNumberSafe(duePayment.amount_paid),
            )
          : 0;
        const dueDate = resolveDueDateLabel(duePayment || latestPayment);
        const dueDateDisplay =
          dueDate !== "-" && dueAmount <= 0 ? `${dueDate} (Paid)` : dueDate;

        // Calculate schedule marks for each day in the month
        const dailyMarks = new Array(daysInMonth).fill(0);
        for (let day = 1; day <= daysInMonth; day++) {
          const currentDate = moment(new Date(query.year, query.month, day));

          // Check if date is within vehicle active period
          if (vehicleStart && currentDate.isBefore(moment(vehicleStart), "day"))
            continue;
          if (vehicleEnd && currentDate.isAfter(moment(vehicleEnd), "day"))
            continue;

          // ✅ KEY LOGIC: Past days use historical jobs, future days use current schedule
          if (currentDate.isBefore(today)) {
            // PAST DAY: Check if a job was created for this day (historical schedule)
            if (historicalDays.has(day)) {
              dailyMarks[day - 1] = 1;
            }
          } else {
            // TODAY OR FUTURE: Use current schedule from customer document
            let isScheduled = false;
            if (vehicle.schedule_type === "daily") {
              const dayOfWeek = currentDate.day();
              isScheduled = dayOfWeek !== 0; // Exclude Sundays
            } else if (
              vehicle.schedule_type === "weekly" &&
              scheduleDays.length > 0
            ) {
              const dayNames = [
                "sunday",
                "monday",
                "tuesday",
                "wednesday",
                "thursday",
                "friday",
                "saturday",
              ];
              const dayName = dayNames[currentDate.day()];
              isScheduled = scheduleDays.includes(dayName);
            }
            if (isScheduled) {
              dailyMarks[day - 1] = 1;
            }
          }
        }

        const carKey = vehicleId;

        // Calculate dynamic weekly schedule indicator
        let cleaningDisplay = "W3"; // default
        if (vehicle.schedule_type === "daily") {
          cleaningDisplay = "D";
        } else if (vehicle.schedule_type === "onetime") {
          cleaningDisplay = "OT";
        } else if (
          vehicle.schedule_type === "weekly" &&
          scheduleDays.length > 0
        ) {
          cleaningDisplay = `W${scheduleDays.length}`;
        }

        carMap.set(carKey, {
          customerId: customer.id || customer._id,
          customerMobile: customer.mobile || "",
          parkingNo: vehicle.parking_no || "",
          carNumber: vehicle.registration_no || "",
          customerName: customerName,
          dateOfStart: vehicleStart
            ? moment(vehicleStart).format("DD-MMM")
            : "-",
          cleaning: cleaningDisplay,
          dailyMarks: dailyMarks,
          amount: vehicle.amount || 0,
          duDate: vehicleEnd ? moment(vehicleEnd).format("DD-MMM") : "-",
          dueAmount,
          dueDate,
          dueDateDisplay,
          workerName: "",
          locationName: "",
          buildingId: buildingId ? String(buildingId) : "",
          buildingName,
          tips: 0,
          scheduleType: vehicle.schedule_type || "daily",
          scheduleDays: scheduleDays,
          startDate: vehicleStart,
          endDate: vehicleEnd,
        });
      });
    });

    const carList = Array.from(carMap.values());
    selectedWorkerCarList = carList;

    // If format is JSON (For PDF/Preview), return raw data with totals
    if (query.format === "json") {
      const columnTotals = new Array(daysInMonth).fill(0);
      let grandTotal = 0;
      let totalTips = 0;
      const buildingCountsMap = new Map();
      carList.forEach((car) => {
        if (car.dailyMarks) {
          car.dailyMarks.forEach((mark, i) => {
            columnTotals[i] += mark || 0;
          });
          grandTotal += car.dailyMarks.reduce((s, m) => s + (m || 0), 0);
        }
        totalTips += car.tips || 0;

        const buildingId = String(car.buildingId || "").trim();
        const buildingName = String(car.buildingName || "Unknown Building");
        const key = buildingId || `name:${buildingName}`;
        const current = buildingCountsMap.get(key) || {
          buildingId,
          buildingName,
          count: 0,
        };
        current.count += 1;
        buildingCountsMap.set(key, current);
      });

      const buildingCounts = Array.from(buildingCountsMap.values()).sort(
        (a, b) =>
          String(a.buildingName || "").localeCompare(
            String(b.buildingName || ""),
          ),
      );

      return {
        data: carList,
        total: carList.length,
        columnTotals,
        grandTotal,
        totalTips,
        statusCounts,
        todayStatusCounts,
        buildingCounts,
      };
    }

    // Note: Excel logic uses the same data structure below
  }

  // =========================================================
  // SCENARIO 2: NO WORKER SELECTED (Worker Summary Report)
  // =========================================================
  const workerMap = new Map();

  data.forEach((job) => {
    const workerId = job.worker?._id?.toString() || "unassigned";
    const workerName = job.worker?.name || "Unassigned";
    const dayOfMonth = moment(job.assignedDate).tz("Asia/Dubai").date();

    if (!workerMap.has(workerId)) {
      workerMap.set(workerId, {
        workerId,
        workerName,
        dailyCounts: new Array(daysInMonth).fill(0),
        tips: 0, // ✅ Initialize tips to 0
      });
    }

    const workerData = workerMap.get(workerId);

    // ✅ Accumulate Tips here (Fixing the 0 issue)
    workerData.tips += Number(job.tips) || 0;

    if (dayOfMonth >= 1 && dayOfMonth <= daysInMonth) {
      workerData.dailyCounts[dayOfMonth - 1]++;
    }
  });

  const workerSummaries = Array.from(workerMap.values());

  // ✅ Return JSON if requested
  if (query.format === "json") {
    const summaryData = workerSummaries.map((worker, index) => ({
      slNo: index + 1,
      workerId: worker.workerId,
      name: worker.workerName,
      workerName: worker.workerName,
      dailyCounts: worker.dailyCounts,
      tips: worker.tips,
    }));

    const buildingCountsMap = new Map();
    data.forEach((job) => {
      const buildingId =
        (typeof job.building === "object" && String(job.building?._id || "")) ||
        String(job.building || "");
      const buildingName =
        (typeof job.building === "object" && job.building?.name) ||
        "Unknown Building";
      const key = buildingId || `name:${buildingName}`;
      const current = buildingCountsMap.get(key) || {
        buildingId,
        buildingName,
        count: 0,
      };
      current.count += 1;
      buildingCountsMap.set(key, current);
    });

    const buildingCounts = Array.from(buildingCountsMap.values()).sort((a, b) =>
      String(a.buildingName || "").localeCompare(String(b.buildingName || "")),
    );

    const columnTotals = new Array(daysInMonth).fill(0);
    let grandTotal = 0;
    let totalTips = 0;
    summaryData.forEach((w) => {
      if (w.dailyCounts) {
        w.dailyCounts.forEach((c, i) => {
          columnTotals[i] += c || 0;
        });
        grandTotal += w.dailyCounts.reduce((s, c) => s + (c || 0), 0);
      }
      totalTips += w.tips || 0;
    });
    return {
      data: summaryData,
      total: summaryData.length,
      columnTotals,
      grandTotal,
      totalTips,
      statusCounts,
      todayStatusCounts,
      buildingCounts,
    };
  }

  // =========================================================
  // EXCEL GENERATION (Shared Logic)
  // =========================================================
  const workbook = new exceljs.Workbook();
  const reportSheet = workbook.addWorksheet("Report");

  // Set row heights
  reportSheet.getRow(1).height = 40;
  reportSheet.getRow(2).height = selectedBuildingName ? 28 : 20;

  const isWorkerSelected = !!(
    query.workerId && String(query.workerId).trim() !== ""
  );
  const isResidenceWorkerSelected =
    isWorkerSelected &&
    String(query.service_type || "").toLowerCase() === "residence";
  let selectedWorkerName = "ALL WORKERS";
  if (isWorkerSelected) {
    selectedWorkerName =
      String(query.workerName || "").trim() ||
      String(data[0]?.worker?.name || "").trim();

    if (!selectedWorkerName && isValidId(query.workerId)) {
      const selectedWorker = await WorkersModel.findOne({
        _id: query.workerId,
        isDeleted: { $ne: true },
      })
        .select("name")
        .lean();
      selectedWorkerName = String(selectedWorker?.name || "").trim();
    }

    if (!selectedWorkerName) {
      selectedWorkerName = "Unknown";
    }
  }

  // --- HEADER ROW 1: Company Name with Logo Space ---
  // Adjusted columns to include "Customer ID", "Mobile", and "Tips" columns
  const totalCols = isWorkerSelected
    ? 7 + daysInMonth + (isResidenceWorkerSelected ? 2 : 3)
    : 2 + daysInMonth + 1;

  reportSheet.mergeCells(1, 1, 1, totalCols);
  const titleCell = reportSheet.getCell("A1");
  titleCell.value = "BABA CAR WASHING&CLEANING L.L.C";

  // Add logo image if it exists
  const path = require("path");
  const fs = require("fs");
  const possibleLogoPaths = [
    path.join(__dirname, "../../../../../admin-panel/public/carwash.jpeg"),
    path.join(process.cwd(), "public/carwash.jpeg"),
    path.join(process.cwd(), "../admin-panel/public/carwash.jpeg"),
  ];

  let logoPath = null;
  for (const testPath of possibleLogoPaths) {
    if (fs.existsSync(testPath)) {
      logoPath = testPath;
      break;
    }
  }

  if (logoPath) {
    try {
      const imageId = workbook.addImage({
        filename: logoPath,
        extension: "jpeg",
      });

      reportSheet.addImage(imageId, {
        tl: { col: 0, row: 0 },
        ext: { width: 80, height: 40 },
        editAs: "oneCell",
      });
    } catch (err) {
      console.warn("Could not add logo to Excel:", err.message);
    }
  }

  titleCell.font = { bold: true, size: 14, color: { argb: "FFFFFF" } };
  titleCell.alignment = { horizontal: "center", vertical: "middle" };
  titleCell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "00B050" },
  };
  titleCell.border = {
    top: { style: "thin" },
    left: { style: "thin" },
    bottom: { style: "thin" },
    right: { style: "thin" },
  };

  // --- HEADER ROW 2: Month/Cleaner info ---
  if (isWorkerSelected) {
    reportSheet.mergeCells(2, 1, 2, Math.ceil(totalCols / 2));
    const monthCell = reportSheet.getCell("A2");
    monthCell.value = `Month & Year: ${monthName.toUpperCase()} ${year}${selectedBuildingName ? ` | Building: ${selectedBuildingName}` : ""}`;
    monthCell.font = { bold: true, size: 10 };
    monthCell.alignment = {
      horizontal: "center",
      vertical: "middle",
      wrapText: true,
    };
    monthCell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "D9D9D9" },
    };

    const midCol = Math.ceil(totalCols / 2) + 1;
    reportSheet.mergeCells(2, midCol, 2, totalCols);
    const cleanerCell = reportSheet.getCell(2, midCol);
    cleanerCell.value = `CLEANER'S NAME: ${selectedWorkerName}`;
    cleanerCell.font = { bold: true, size: 10 };
    cleanerCell.alignment = { horizontal: "center", vertical: "middle" };
    cleanerCell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "D9D9D9" },
    };
  } else {
    reportSheet.mergeCells(2, 1, 2, totalCols);
    const subtitleCell = reportSheet.getCell("A2");
    subtitleCell.value = `${monthName.toUpperCase()} ${year} - RESIDENCE LOCATIONS ONLY${selectedBuildingName ? ` | BUILDING: ${String(selectedBuildingName).toUpperCase()}` : ""}`;
    subtitleCell.font = { bold: true, size: 11 };
    subtitleCell.alignment = { horizontal: "center", vertical: "middle" };
    subtitleCell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "D9D9D9" },
    };
  }

  // --- ROW 3: Column Headers (Added CUSTOMER ID and MOBILE) ---
  let headerRow1;
  if (isWorkerSelected) {
    headerRow1 = reportSheet.addRow([
      "S.N O",
      "CUSTOMER ID",
      "MOBILE",
      "PARKING NO",
      "CAR NO.",
      "DATE OF START",
      "CLEANING",
      ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
      ...(isResidenceWorkerSelected
        ? ["Due Payment", "Due Date"]
        : ["Total", "Tips", "DU DATE"]),
    ]);
  } else {
    headerRow1 = reportSheet.addRow([
      "Sl. No",
      "Name",
      ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
      "Total",
      "Tips", // ✅ Added Tips Header
    ]);
  }

  headerRow1.eachCell((cell, colNumber) => {
    cell.font = { bold: true, size: 10, color: { argb: "FFFFFF" } };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "1F4E78" },
    };
    cell.alignment = {
      horizontal: "center",
      vertical: "middle",
      wrapText: true,
    };
    cell.border = {
      top: { style: "thin" },
      left: { style: "thin" },
      bottom: { style: "thin" },
      right: { style: "thin" },
    };

    const dayColumnStart = isWorkerSelected ? 7 : 2;
    if (
      colNumber > dayColumnStart &&
      colNumber <= dayColumnStart + daysInMonth
    ) {
      const dayIndex = colNumber - dayColumnStart - 1;
      const date = moment(findQuery.assignedDate.$gte).add(dayIndex, "days");
      if (date.day() === 0) {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFFF00" },
        };
        cell.font = { bold: true, size: 10, color: { argb: "000000" } };
      }
    }
  });

  // --- ROW 4: Day Names ---
  let dayNamesRow;
  if (isWorkerSelected) {
    dayNamesRow = reportSheet.addRow([
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      ...Array.from({ length: daysInMonth }, (_, i) => {
        const date = moment(findQuery.assignedDate.$gte).add(i, "days");
        return date.format("ddd").substring(0, 2);
      }),
      ...(isResidenceWorkerSelected ? ["", ""] : ["", "", ""]),
    ]);
  } else {
    dayNamesRow = reportSheet.addRow([
      "",
      "",
      ...Array.from({ length: daysInMonth }, (_, i) => {
        const date = moment(findQuery.assignedDate.$gte).add(i, "days");
        return date.format("ddd").substring(0, 2);
      }),
      "",
      "",
    ]);
  }

  dayNamesRow.eachCell((cell, colNumber) => {
    cell.font = { bold: true, size: 8 };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = {
      top: { style: "thin" },
      left: { style: "thin" },
      bottom: { style: "thin" },
      right: { style: "thin" },
    };

    const dayColumnStart = isWorkerSelected ? 7 : 2;
    if (
      colNumber > dayColumnStart &&
      colNumber <= dayColumnStart + daysInMonth
    ) {
      const dayIndex = colNumber - dayColumnStart - 1;
      const date = moment(findQuery.assignedDate.$gte).add(dayIndex, "days");
      if (date.day() === 0) {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFFF00" },
        };
      }
    }
  });

  // --- DATA ROWS ---
  let rowNumber = 1;
  let dataSource;

  if (isWorkerSelected) {
    dataSource = Array.isArray(selectedWorkerCarList)
      ? selectedWorkerCarList
      : [];
  } else {
    dataSource = workerSummaries; // We can reuse this from JSON calculation earlier
  }

  // Sort dataSource for stable output
  if (isWorkerSelected && Array.isArray(dataSource)) {
    dataSource.sort((a, b) => {
      const mobileA = String(a.customerMobile || "");
      const mobileB = String(b.customerMobile || "");
      if (mobileA !== mobileB) return mobileA.localeCompare(mobileB);

      const carA = String(a.carNumber || "");
      const carB = String(b.carNumber || "");
      return carA.localeCompare(carB);
    });
  }

  for (const item of dataSource) {
    let rowData;
    if (isWorkerSelected) {
      // Calculate row total for car
      const rowTotal = item.dailyMarks.reduce((a, b) => a + b, 0);
      const rowDueAmount = Math.max(
        0,
        Number(item.dueAmount || item.duePayment || item.balanceDue || 0),
      );
      const rowDueDate =
        item.dueDateDisplay || item.dueDate || item.duDate || "-";

      rowData = [
        rowNumber,
        item.customerId || "",
        item.customerMobile || "",
        item.parkingNo,
        item.carNumber,
        item.dateOfStart,
        item.cleaning,
        ...item.dailyMarks.map((count) => (count > 0 ? count : "")),
        ...(isResidenceWorkerSelected
          ? [rowDueAmount, rowDueDate]
          : [rowTotal, item.tips, item.duDate]),
      ];

      rowNumber++;
    } else {
      const rowTotal = item.dailyCounts.reduce((a, b) => a + b, 0);
      rowData = [
        rowNumber,
        item.name || item.workerName || "Unassigned",
        ...item.dailyCounts.map((count) => (count > 0 ? count : "")),
        rowTotal,
        item.tips, // ✅ Added Tips
      ];
      rowNumber++;
    }

    const dataRow = reportSheet.addRow(rowData);

    dataRow.eachCell((cell, colNumber) => {
      cell.border = {
        top: { style: "thin" },
        left: { style: "thin" },
        bottom: { style: "thin" },
        right: { style: "thin" },
      };
      cell.alignment = { horizontal: "center", vertical: "middle" };
      cell.font = { size: 9 };

      if (
        (!isWorkerSelected && colNumber === 2) ||
        (isWorkerSelected && (colNumber === 2 || colNumber === 3))
      ) {
        cell.alignment = { horizontal: "left", vertical: "middle" };
      }

      const dayColumnStart = isWorkerSelected ? 7 : 2;
      if (
        colNumber > dayColumnStart &&
        colNumber <= dayColumnStart + daysInMonth
      ) {
        const dayIndex = colNumber - dayColumnStart - 1;
        const date = moment(findQuery.assignedDate.$gte).add(dayIndex, "days");
        if (date.day() === 0) {
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FFFF00" },
          };
        }
      }
    });
  }

  // --- SUMMARY ROW ---
  const dayCounts = new Array(daysInMonth).fill(0);
  let totalAllTips = 0;
  let totalAllCars = 0;
  let totalAllDueAmount = 0;

  if (isWorkerSelected) {
    dataSource.forEach((car) => {
      if (Array.isArray(car.dailyMarks)) {
        car.dailyMarks.forEach((mark, dayIndex) => {
          dayCounts[dayIndex] += Number(mark) || 0;
        });
        totalAllCars += car.dailyMarks.reduce(
          (a, b) => a + (Number(b) || 0),
          0,
        );
      }
      totalAllTips += Number(car.tips) || 0;
      totalAllDueAmount += Math.max(
        0,
        Number(car.dueAmount || car.duePayment || car.balanceDue || 0),
      );
    });
  } else {
    workerSummaries.forEach((worker) => {
      worker.dailyCounts.forEach((count, dayIndex) => {
        dayCounts[dayIndex] += count;
      });
      totalAllTips += worker.tips;
      totalAllCars += worker.dailyCounts.reduce((a, b) => a + b, 0);
    });
  }

  let summaryRow;
  if (isWorkerSelected) {
    summaryRow = reportSheet.addRow(
      isResidenceWorkerSelected
        ? [
            "",
            "Total Cleaned Cars",
            "",
            "",
            "",
            "",
            "",
            ...dayCounts,
            totalAllDueAmount,
            "",
          ]
        : [
            "",
            "Total Cleaned Cars",
            "",
            "",
            "",
            "",
            "",
            ...dayCounts,
            totalAllCars,
            totalAllTips, // ✅ Total Tips
            "",
          ],
    );
  } else {
    summaryRow = reportSheet.addRow([
      "",
      "Total Cleaned Cars",
      ...dayCounts,
      totalAllCars,
      totalAllTips, // ✅ Total Tips
    ]);
  }

  summaryRow.eachCell((cell, colNumber) => {
    cell.border = {
      top: { style: "thin" },
      left: { style: "thin" },
      bottom: { style: "thin" },
      right: { style: "thin" },
    };
    cell.font = { bold: true, size: 10 };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "D3D3D3" },
    };
    if (colNumber === 2)
      cell.alignment = { horizontal: "left", vertical: "middle" };

    const dayColumnStart = isWorkerSelected ? 7 : 2;
    if (
      colNumber > dayColumnStart &&
      colNumber <= dayColumnStart + daysInMonth
    ) {
      cell.alignment = { horizontal: "center", vertical: "middle" };
      const dayIndex = colNumber - dayColumnStart - 1;
      const date = moment(findQuery.assignedDate.$gte).add(dayIndex, "days");
      if (date.day() === 0) {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFFF00" },
        };
      }
    }
  });

  // --- STATUS SUMMARY (Today vs Total) ---
  reportSheet.addRow([]);

  const summaryHeaderRow = reportSheet.addRow([]);
  const summaryHeaderRowNo = summaryHeaderRow.number;
  reportSheet.mergeCells(summaryHeaderRowNo, 2, summaryHeaderRowNo, 5);
  reportSheet.mergeCells(summaryHeaderRowNo, 7, summaryHeaderRowNo, 10);

  const todayHeaderCell = reportSheet.getCell(summaryHeaderRowNo, 2);
  todayHeaderCell.value = "TODAY SUMMARY";
  todayHeaderCell.font = { bold: true, size: 10, color: { argb: "FFFFFF" } };
  todayHeaderCell.alignment = { horizontal: "center", vertical: "middle" };
  todayHeaderCell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "0F766E" },
  };

  const totalHeaderCell = reportSheet.getCell(summaryHeaderRowNo, 7);
  totalHeaderCell.value = "TOTAL SUMMARY";
  totalHeaderCell.font = { bold: true, size: 10, color: { argb: "FFFFFF" } };
  totalHeaderCell.alignment = { horizontal: "center", vertical: "middle" };
  totalHeaderCell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "1E3A8A" },
  };

  for (let col = 2; col <= 5; col++) {
    const cell = reportSheet.getCell(summaryHeaderRowNo, col);
    cell.border = {
      top: { style: "thin" },
      left: { style: "thin" },
      bottom: { style: "thin" },
      right: { style: "thin" },
    };
  }
  for (let col = 7; col <= 10; col++) {
    const cell = reportSheet.getCell(summaryHeaderRowNo, col);
    cell.border = {
      top: { style: "thin" },
      left: { style: "thin" },
      bottom: { style: "thin" },
      right: { style: "thin" },
    };
  }

  const summaryRows = [
    {
      leftLabel: "Today Washes",
      leftValue: todayStatusCounts.total,
      rightLabel: "Total Washes",
      rightValue: statusCounts.total,
    },
    {
      leftLabel: "Today Completed",
      leftValue: todayStatusCounts.completed,
      rightLabel: "Completed",
      rightValue: statusCounts.completed,
    },
    {
      leftLabel: "Today Pending",
      leftValue: todayStatusCounts.pending,
      rightLabel: "Pending",
      rightValue: statusCounts.pending,
    },
    {
      leftLabel: "Today Rejected",
      leftValue: todayStatusCounts.rejected,
      rightLabel: "Rejected",
      rightValue: statusCounts.rejected,
    },
  ];

  summaryRows.forEach((summary) => {
    const row = reportSheet.addRow([]);
    const rowNo = row.number;

    reportSheet.mergeCells(rowNo, 2, rowNo, 4);
    reportSheet.mergeCells(rowNo, 7, rowNo, 9);

    const leftLabelCell = reportSheet.getCell(rowNo, 2);
    leftLabelCell.value = summary.leftLabel;
    leftLabelCell.font = { bold: true, size: 9, color: { argb: "134E4A" } };
    leftLabelCell.alignment = { horizontal: "left", vertical: "middle" };
    leftLabelCell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "CCFBF1" },
    };

    const leftValueCell = reportSheet.getCell(rowNo, 5);
    leftValueCell.value = Number(summary.leftValue) || 0;
    leftValueCell.font = { bold: true, size: 10, color: { argb: "134E4A" } };
    leftValueCell.alignment = { horizontal: "center", vertical: "middle" };
    leftValueCell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "99F6E4" },
    };

    const rightLabelCell = reportSheet.getCell(rowNo, 7);
    rightLabelCell.value = summary.rightLabel;
    rightLabelCell.font = { bold: true, size: 9, color: { argb: "1E3A8A" } };
    rightLabelCell.alignment = { horizontal: "left", vertical: "middle" };
    rightLabelCell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "DBEAFE" },
    };

    const rightValueCell = reportSheet.getCell(rowNo, 10);
    rightValueCell.value = Number(summary.rightValue) || 0;
    rightValueCell.font = { bold: true, size: 10, color: { argb: "1E3A8A" } };
    rightValueCell.alignment = { horizontal: "center", vertical: "middle" };
    rightValueCell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "BFDBFE" },
    };

    for (let col = 2; col <= 5; col++) {
      const cell = reportSheet.getCell(rowNo, col);
      cell.border = {
        top: { style: "thin" },
        left: { style: "thin" },
        bottom: { style: "thin" },
        right: { style: "thin" },
      };
    }

    for (let col = 7; col <= 10; col++) {
      const cell = reportSheet.getCell(rowNo, col);
      cell.border = {
        top: { style: "thin" },
        left: { style: "thin" },
        bottom: { style: "thin" },
        right: { style: "thin" },
      };
    }
  });

  // Set column widths
  if (isWorkerSelected) {
    reportSheet.getColumn(1).width = 6;
    reportSheet.getColumn(2).width = 12;
    reportSheet.getColumn(3).width = 15;
    reportSheet.getColumn(4).width = 12;
    reportSheet.getColumn(5).width = 10;
    reportSheet.getColumn(6).width = 12;
    reportSheet.getColumn(7).width = 10;
    for (let i = 8; i <= 7 + daysInMonth; i++) {
      reportSheet.getColumn(i).width = 3.5;
    }
    reportSheet.getColumn(8 + daysInMonth).width = isResidenceWorkerSelected
      ? 14
      : 10;
    reportSheet.getColumn(9 + daysInMonth).width = isResidenceWorkerSelected
      ? 14
      : 10;
    if (!isResidenceWorkerSelected) {
      reportSheet.getColumn(10 + daysInMonth).width = 10; // DU Date
    }
  } else {
    reportSheet.getColumn(1).width = 8;
    reportSheet.getColumn(2).width = 20;
    for (let i = 3; i <= 2 + daysInMonth; i++) {
      reportSheet.getColumn(i).width = 4;
    }
    reportSheet.getColumn(3 + daysInMonth).width = 10; // Total
    reportSheet.getColumn(4 + daysInMonth).width = 10; // Tips
  }

  const shouldIncludeBuildingWiseSheets =
    isWorkerSelected &&
    String(query.service_type || "").toLowerCase() === "residence" &&
    isTruthyQueryFlag(query.buildingWise);

  if (shouldIncludeBuildingWiseSheets) {
    const groupedByBuilding = new Map();
    (Array.isArray(dataSource) ? dataSource : []).forEach((car) => {
      const key =
        String(car?.buildingName || "Unknown Building").trim() ||
        "Unknown Building";
      if (!groupedByBuilding.has(key)) {
        groupedByBuilding.set(key, []);
      }
      groupedByBuilding.get(key).push(car);
    });

    groupedByBuilding.forEach((cars, buildingName) => {
      const sheetName = resolveUniqueSheetName(workbook, buildingName);
      const sheet = workbook.addWorksheet(sheetName);
      const totalColsForBuildingSheet = 8 + daysInMonth;

      sheet.mergeCells(1, 1, 1, totalColsForBuildingSheet);
      const titleCell = sheet.getCell(1, 1);
      titleCell.value = `${buildingName} - ${monthName.toUpperCase()} ${year}`;
      titleCell.font = { bold: true, size: 12, color: { argb: "FFFFFF" } };
      titleCell.alignment = { horizontal: "center", vertical: "middle" };
      titleCell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "1F4E78" },
      };

      const headerRow = sheet.addRow([
        "Sl. No",
        "Parking No",
        "Car No.",
        "Date of Start",
        "Cleaning",
        ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
        "Scheduled",
        "Due Payment",
        "Due Date",
      ]);

      headerRow.eachCell((cell, colNumber) => {
        cell.font = { bold: true, size: 9, color: { argb: "FFFFFF" } };
        cell.alignment = { horizontal: "center", vertical: "middle" };
        cell.border = {
          top: { style: "thin" },
          left: { style: "thin" },
          bottom: { style: "thin" },
          right: { style: "thin" },
        };
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "2F75B5" },
        };

        if (colNumber > 5 && colNumber <= 5 + daysInMonth) {
          const dayIndex = colNumber - 6;
          const date = moment(findQuery.assignedDate.$gte).add(
            dayIndex,
            "days",
          );
          if (date.day() === 0) {
            cell.fill = {
              type: "pattern",
              pattern: "solid",
              fgColor: { argb: "FFFF00" },
            };
            cell.font = { bold: true, size: 9, color: { argb: "000000" } };
          }
        }
      });

      const dayTotals = new Array(daysInMonth).fill(0);
      let scheduledTotal = 0;
      let dueTotal = 0;

      cars.forEach((car, index) => {
        const marks = Array.isArray(car?.dailyMarks)
          ? car.dailyMarks
          : new Array(daysInMonth).fill(0);
        const rowScheduledTotal = marks.reduce(
          (sum, mark) => sum + (mark || 0),
          0,
        );
        const rowDueAmount = Math.max(0, toNumberSafe(car?.dueAmount));

        marks.forEach((mark, markIndex) => {
          dayTotals[markIndex] += Number(mark || 0);
        });
        scheduledTotal += rowScheduledTotal;
        dueTotal += rowDueAmount;

        const row = sheet.addRow([
          index + 1,
          car?.parkingNo || "-",
          car?.carNumber || "-",
          car?.dateOfStart || "-",
          car?.cleaning || "-",
          ...marks.map((mark) => (mark > 0 ? mark : "")),
          rowScheduledTotal,
          rowDueAmount,
          car?.dueDateDisplay || car?.dueDate || "-",
        ]);

        row.eachCell((cell, colNumber) => {
          cell.border = {
            top: { style: "thin" },
            left: { style: "thin" },
            bottom: { style: "thin" },
            right: { style: "thin" },
          };
          cell.alignment = { horizontal: "center", vertical: "middle" };
          cell.font = { size: 9 };

          if (colNumber > 5 && colNumber <= 5 + daysInMonth) {
            const dayIndex = colNumber - 6;
            const date = moment(findQuery.assignedDate.$gte).add(
              dayIndex,
              "days",
            );
            if (date.day() === 0) {
              cell.fill = {
                type: "pattern",
                pattern: "solid",
                fgColor: { argb: "FFF8C6" },
              };
            }
          }
        });
      });

      const totalRow = sheet.addRow([
        "",
        "TOTAL",
        "",
        "",
        "",
        ...dayTotals,
        scheduledTotal,
        dueTotal,
        "",
      ]);

      totalRow.eachCell((cell, colNumber) => {
        cell.font = { bold: true, size: 10 };
        cell.alignment = { horizontal: "center", vertical: "middle" };
        cell.border = {
          top: { style: "thin" },
          left: { style: "thin" },
          bottom: { style: "thin" },
          right: { style: "thin" },
        };
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "D9E1F2" },
        };

        if (colNumber > 5 && colNumber <= 5 + daysInMonth) {
          const dayIndex = colNumber - 6;
          const date = moment(findQuery.assignedDate.$gte).add(
            dayIndex,
            "days",
          );
          if (date.day() === 0) {
            cell.fill = {
              type: "pattern",
              pattern: "solid",
              fgColor: { argb: "FFFF00" },
            };
          }
        }
      });

      sheet.getColumn(1).width = 8;
      sheet.getColumn(2).width = 16;
      sheet.getColumn(3).width = 14;
      sheet.getColumn(4).width = 14;
      sheet.getColumn(5).width = 10;
      for (let col = 6; col <= 5 + daysInMonth; col++) {
        sheet.getColumn(col).width = 4;
      }
      sheet.getColumn(6 + daysInMonth).width = 12;
      sheet.getColumn(7 + daysInMonth).width = 14;
      sheet.getColumn(8 + daysInMonth).width = 14;
    });
  }

  return workbook;
};
