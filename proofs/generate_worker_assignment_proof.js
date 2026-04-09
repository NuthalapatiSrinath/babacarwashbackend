const fs = require("fs");
const path = require("path");
const moment = require("moment-timezone");
const utils = require("../src/server/utils");
const database = require("../src/server/database");
const WorkerModel = require("../src/server/api/models/workers.model");
const CustomersModel = require("../src/server/api/models/customers.model");
const JobsModel = require("../src/server/api/models/jobs.model");

const tz = "Asia/Dubai";
const toDubai = (d) =>
  d ? moment(d).tz(tz).format("YYYY-MM-DD HH:mm:ss") : null;
const toMs = (d) => (d ? new Date(d).getTime() : null);

function csvEscape(value) {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (s.includes(",") || s.includes("\n") || s.includes('"')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

(async () => {
  const app = utils.initialize();
  await database.initialize(app);

  const targetWorker = await WorkerModel.findOne({
    mobile: "971543762711",
    isDeleted: false,
  }).lean();

  if (!targetWorker) {
    console.log(JSON.stringify({ error: "Target worker not found" }, null, 2));
    process.exit(1);
  }

  const now = moment().tz(tz);
  const isBeforeShiftCutoff =
    now.hour() < 18 || (now.hour() === 18 && now.minute() < 30);
  const shiftStart = isBeforeShiftCutoff
    ? moment()
        .tz(tz)
        .subtract(1, "day")
        .hour(18)
        .minute(30)
        .second(0)
        .millisecond(0)
    : moment().tz(tz).hour(18).minute(30).second(0).millisecond(0);
  const shiftEnd = isBeforeShiftCutoff
    ? moment().tz(tz).hour(18).minute(30).second(0).millisecond(0)
    : moment()
        .tz(tz)
        .add(1, "day")
        .hour(18)
        .minute(30)
        .second(0)
        .millisecond(0);
  const prevShiftStart = shiftStart.clone().subtract(1, "day");
  const prevShiftEnd = shiftEnd.clone().subtract(1, "day");

  const customers = await CustomersModel.find({
    isDeleted: false,
    building: { $exists: true, $ne: "" },
    "vehicles.worker": targetWorker._id,
  })
    .select(
      "id firstName lastName mobile flat_no building createdAt updatedAt vehicles",
    )
    .lean();

  const vehicleMap = new Map();
  for (const c of customers) {
    for (const v of c.vehicles || []) {
      if (
        String(v.worker || "") === String(targetWorker._id) &&
        Number(v.status) !== 2
      ) {
        vehicleMap.set(String(v._id), {
          vehicleId: String(v._id),
          registrationNo: v.registration_no || "",
          scheduleType: v.schedule_type || "",
          vehicleStatus: v.status,
          vehicleCreatedAt: v.createdAt || null,
          vehicleCreatedAtDubai: toDubai(v.createdAt),
          customerMongoId: String(c._id),
          customerId: c.id || "",
          customerName: `${c.firstName || ""} ${c.lastName || ""}`.trim(),
          customerMobile: c.mobile || "",
          building: c.building || "",
          flatNo: c.flat_no || "",
          customerCreatedAt: c.createdAt || null,
          customerCreatedAtDubai: toDubai(c.createdAt),
          customerUpdatedAt: c.updatedAt || null,
          customerUpdatedAtDubai: toDubai(c.updatedAt),
        });
      }
    }
  }

  const vehicleIds = Array.from(vehicleMap.keys());

  const currentShiftJobs = await JobsModel.find({
    isDeleted: { $ne: true },
    vehicle: { $in: vehicleIds },
    assignedDate: { $gte: shiftStart.toDate(), $lte: shiftEnd.toDate() },
    worker: { $ne: targetWorker._id },
  })
    .select(
      "_id vehicle worker assignedDate createdAt status isDone isCancelled",
    )
    .lean();

  const oldWorkerIds = [
    ...new Set(
      currentShiftJobs.map((j) => String(j.worker || "")).filter(Boolean),
    ),
  ];

  const prevShiftJobs = await JobsModel.find({
    isDeleted: { $ne: true },
    vehicle: { $in: vehicleIds },
    assignedDate: {
      $gte: prevShiftStart.toDate(),
      $lte: prevShiftEnd.toDate(),
    },
  })
    .select("vehicle worker assignedDate createdAt")
    .sort({ assignedDate: -1 })
    .lean();

  const prevByVehicle = new Map();
  for (const j of prevShiftJobs) {
    const key = String(j.vehicle);
    if (!prevByVehicle.has(key)) prevByVehicle.set(key, j);
    oldWorkerIds.push(String(j.worker || ""));
  }

  const workers = await WorkerModel.find({
    _id: { $in: [...new Set(oldWorkerIds)] },
  })
    .select("_id name mobile")
    .lean();
  const workerMap = new Map(workers.map((w) => [String(w._id), w]));

  const rows = currentShiftJobs
    .map((j) => {
      const key = String(j.vehicle);
      const v = vehicleMap.get(key) || {};
      const oldWorker = workerMap.get(String(j.worker || ""));
      const prev = prevByVehicle.get(key);
      const prevWorker = prev
        ? workerMap.get(String(prev.worker || "")) ||
          (String(prev.worker || "") === String(targetWorker._id)
            ? targetWorker
            : null)
        : null;

      const jobCreatedAtMs = toMs(j.createdAt);
      const customerUpdatedAtMs = toMs(v.customerUpdatedAt);

      return {
        registrationNo: v.registrationNo || "",
        vehicleId: key,
        scheduleType: v.scheduleType || "",
        customerId: v.customerId || "",
        customerMongoId: v.customerMongoId || "",
        customerName: v.customerName || "",
        customerMobile: v.customerMobile || "",
        building: v.building || "",
        flatNo: v.flatNo || "",
        currentVehicleWorkerName: targetWorker.name,
        currentVehicleWorkerMobile: targetWorker.mobile,
        jobWorkerName: oldWorker?.name || "",
        jobWorkerMobile: oldWorker?.mobile || "",
        jobWorkerId: String(j.worker || ""),
        jobId: String(j._id),
        jobAssignedDateDubai: toDubai(j.assignedDate),
        jobCreatedAtDubai: toDubai(j.createdAt),
        customerUpdatedAtDubai: v.customerUpdatedAtDubai || null,
        vehicleCreatedAtDubai: v.vehicleCreatedAtDubai || null,
        previousShiftWorkerName: prevWorker?.name || "",
        previousShiftWorkerMobile: prevWorker?.mobile || "",
        previousShiftAssignedDateDubai: prev
          ? toDubai(prev.assignedDate)
          : null,
        previousShiftJobCreatedAtDubai: prev ? toDubai(prev.createdAt) : null,
        proof_jobCreatedBeforeCustomerUpdate:
          jobCreatedAtMs !== null && customerUpdatedAtMs !== null
            ? jobCreatedAtMs < customerUpdatedAtMs
            : null,
      };
    })
    .sort((a, b) => {
      const aa = a.customerUpdatedAtDubai || "";
      const bb = b.customerUpdatedAtDubai || "";
      if (aa < bb) return -1;
      if (aa > bb) return 1;
      return a.registrationNo.localeCompare(b.registrationNo);
    });

  const summary = {
    generatedAtDubai: moment().tz(tz).format("YYYY-MM-DD HH:mm:ss"),
    shiftWindowDubai: {
      currentStart: shiftStart.format("YYYY-MM-DD HH:mm:ss"),
      currentEnd: shiftEnd.format("YYYY-MM-DD HH:mm:ss"),
      previousStart: prevShiftStart.format("YYYY-MM-DD HH:mm:ss"),
      previousEnd: prevShiftEnd.format("YYYY-MM-DD HH:mm:ss"),
    },
    targetWorker: {
      name: targetWorker.name,
      mobile: targetWorker.mobile,
      id: String(targetWorker._id),
    },
    currentlyAssignedVehiclesCount: vehicleIds.length,
    mismatchedCurrentShiftJobsCount: rows.length,
    uniqueMismatchedVehiclesCount: new Set(rows.map((r) => r.vehicleId)).size,
    jobsCreatedBeforeCustomerUpdateCount: rows.filter(
      (r) => r.proof_jobCreatedBeforeCustomerUpdate === true,
    ).length,
    oldWorkersInCurrentShiftJobs: Array.from(
      new Set(rows.map((r) => `${r.jobWorkerName} (${r.jobWorkerMobile})`)),
    ),
  };

  const stamp = moment().tz(tz).format("YYYYMMDD_HHmmss");
  const jsonPath = path.join(
    process.cwd(),
    "proofs",
    `worker_assignment_proof_${stamp}.json`,
  );
  const csvPath = path.join(
    process.cwd(),
    "proofs",
    `worker_assignment_proof_${stamp}.csv`,
  );

  fs.writeFileSync(
    jsonPath,
    JSON.stringify({ summary, rows }, null, 2),
    "utf8",
  );

  const headers = [
    "registrationNo",
    "vehicleId",
    "scheduleType",
    "customerId",
    "customerMongoId",
    "customerName",
    "customerMobile",
    "building",
    "flatNo",
    "currentVehicleWorkerName",
    "currentVehicleWorkerMobile",
    "jobWorkerName",
    "jobWorkerMobile",
    "jobWorkerId",
    "jobId",
    "jobAssignedDateDubai",
    "jobCreatedAtDubai",
    "customerUpdatedAtDubai",
    "vehicleCreatedAtDubai",
    "previousShiftWorkerName",
    "previousShiftWorkerMobile",
    "previousShiftAssignedDateDubai",
    "previousShiftJobCreatedAtDubai",
    "proof_jobCreatedBeforeCustomerUpdate",
  ];
  const csv = [
    headers.join(","),
    ...rows.map((r) => headers.map((h) => csvEscape(r[h])).join(",")),
  ].join("\n");
  fs.writeFileSync(csvPath, csv, "utf8");

  console.log(
    JSON.stringify(
      {
        summary,
        files: {
          json: jsonPath,
          csv: csvPath,
        },
        first10Rows: rows.slice(0, 10),
      },
      null,
      2,
    ),
  );

  process.exit(0);
})();
