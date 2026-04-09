"use strict";

const fs = require("fs");
const path = require("path");
const moment = require("moment-timezone");

const utils = require("./src/server/utils");
const database = require("./src/server/database");
const JobsModel = require("./src/server/api/models/jobs.model");
const PaymentsModel = require("./src/server/api/models/payments.model");
const WorkersModel = require("./src/server/api/models/workers.model");

function parseArgs(argv) {
  const args = {
    file: "./proofs/worker_assignment_proof_20260403_221300.json",
    apply: false,
  };

  for (let i = 2; i < argv.length; i++) {
    const token = argv[i];
    if (token === "--apply") args.apply = true;
    if (token === "--file" && argv[i + 1]) {
      args.file = argv[i + 1];
      i++;
    }
  }

  return args;
}

function normalizeStatus(status) {
  return String(status || "pending")
    .trim()
    .toLowerCase();
}

function isSafePendingStatus(status) {
  const s = normalizeStatus(status);
  return !["completed", "rejected", "cancelled", "canceled"].includes(s);
}

(async () => {
  const args = parseArgs(process.argv);
  const proofPath = path.resolve(args.file);

  if (!fs.existsSync(proofPath)) {
    throw new Error(`Proof file not found: ${proofPath}`);
  }

  const proof = JSON.parse(fs.readFileSync(proofPath, "utf8"));
  const rows = Array.isArray(proof.rows) ? proof.rows : [];

  if (!rows.length) {
    throw new Error("Proof file has no rows to process.");
  }

  const newWorkerId = String(proof?.summary?.targetWorker?.id || "");
  if (!newWorkerId) {
    throw new Error("Proof file missing summary.targetWorker.id");
  }

  const app = utils.initialize();
  await database.initialize(app);

  const jobIds = rows.map((r) => String(r.jobId)).filter(Boolean);
  const uniqueJobIds = [...new Set(jobIds)];
  const byJobId = new Map(rows.map((r) => [String(r.jobId), r]));

  const [jobs, payments, targetWorker] = await Promise.all([
    JobsModel.find({ _id: { $in: uniqueJobIds } }).lean(),
    PaymentsModel.find({
      isDeleted: { $ne: true },
      job: { $in: uniqueJobIds },
    })
      .select("_id job status amount_paid total_amount")
      .lean(),
    WorkersModel.findOne({ _id: newWorkerId, isDeleted: false })
      .select("_id name mobile")
      .lean(),
  ]);

  if (!targetWorker) {
    throw new Error(`Target worker not found or deleted: ${newWorkerId}`);
  }

  const paymentByJob = new Map();
  for (const p of payments) {
    const key = String(p.job || "");
    if (!paymentByJob.has(key)) paymentByJob.set(key, []);
    paymentByJob.get(key).push(p);
  }

  const report = {
    input: {
      proofFile: proofPath,
      apply: args.apply,
      requestedRows: rows.length,
      uniqueJobIds: uniqueJobIds.length,
      targetWorker: {
        id: String(targetWorker._id),
        name: targetWorker.name,
        mobile: targetWorker.mobile,
      },
    },
    summary: {
      foundJobs: jobs.length,
      eligible: 0,
      updated: 0,
      skipped_notFound: 0,
      skipped_alreadyTargetWorker: 0,
      skipped_oldWorkerMismatch: 0,
      skipped_statusNotPending: 0,
      skipped_hasPayments: 0,
      skipped_vehicleMismatch: 0,
      skipped_assignedDateMismatch: 0,
    },
    details: [],
  };

  const jobsById = new Map(jobs.map((j) => [String(j._id), j]));

  const eligibleIds = [];

  for (const id of uniqueJobIds) {
    const source = byJobId.get(id);
    const job = jobsById.get(id);

    if (!job) {
      report.summary.skipped_notFound += 1;
      report.details.push({
        jobId: id,
        action: "skip",
        reason: "job_not_found",
      });
      continue;
    }

    const expectedOldWorkerId = String(source?.jobWorkerId || "");
    const currentWorkerId = String(job.worker || "");

    if (currentWorkerId === newWorkerId) {
      report.summary.skipped_alreadyTargetWorker += 1;
      report.details.push({
        jobId: id,
        action: "skip",
        reason: "already_target_worker",
      });
      continue;
    }

    if (!expectedOldWorkerId || currentWorkerId !== expectedOldWorkerId) {
      report.summary.skipped_oldWorkerMismatch += 1;
      report.details.push({
        jobId: id,
        action: "skip",
        reason: "old_worker_mismatch",
        expectedOldWorkerId,
        currentWorkerId,
      });
      continue;
    }

    if (!isSafePendingStatus(job.status)) {
      report.summary.skipped_statusNotPending += 1;
      report.details.push({
        jobId: id,
        action: "skip",
        reason: "status_not_pending",
        status: job.status,
      });
      continue;
    }

    if (String(job.vehicle || "") !== String(source?.vehicleId || "")) {
      report.summary.skipped_vehicleMismatch += 1;
      report.details.push({
        jobId: id,
        action: "skip",
        reason: "vehicle_mismatch",
        expectedVehicleId: String(source?.vehicleId || ""),
        currentVehicleId: String(job.vehicle || ""),
      });
      continue;
    }

    const sourceAssigned = String(source?.jobAssignedDateDubai || "");
    const jobAssigned = job.assignedDate
      ? moment(job.assignedDate).tz("Asia/Dubai").format("YYYY-MM-DD")
      : "";
    const sourceAssignedDateOnly = sourceAssigned
      ? moment
          .tz(sourceAssigned, "YYYY-MM-DD HH:mm:ss", "Asia/Dubai")
          .format("YYYY-MM-DD")
      : "";
    if (
      sourceAssignedDateOnly &&
      jobAssigned &&
      sourceAssignedDateOnly !== jobAssigned
    ) {
      report.summary.skipped_assignedDateMismatch += 1;
      report.details.push({
        jobId: id,
        action: "skip",
        reason: "assigned_date_mismatch",
        expectedAssignedDate: sourceAssignedDateOnly,
        currentAssignedDate: jobAssigned,
      });
      continue;
    }

    const linkedPayments = paymentByJob.get(id) || [];
    if (linkedPayments.length > 0) {
      report.summary.skipped_hasPayments += 1;
      report.details.push({
        jobId: id,
        action: "skip",
        reason: "has_linked_payments",
        paymentIds: linkedPayments.map((p) => String(p._id)),
      });
      continue;
    }

    report.summary.eligible += 1;
    eligibleIds.push(id);
    report.details.push({
      jobId: id,
      action: args.apply ? "update" : "preview_update",
      fromWorkerId: currentWorkerId,
      toWorkerId: newWorkerId,
      status: job.status || "pending",
      registrationNo: source?.registrationNo || "",
      customerId: source?.customerId || null,
    });
  }

  if (args.apply && eligibleIds.length > 0) {
    const bulkOps = eligibleIds.map((id) => {
      const source = byJobId.get(id);
      return {
        updateOne: {
          filter: {
            _id: id,
            isDeleted: { $ne: true },
            worker: String(source?.jobWorkerId || ""),
            status: {
              $nin: ["completed", "rejected", "cancelled", "canceled"],
            },
            vehicle: String(source?.vehicleId || ""),
          },
          update: {
            $set: {
              worker: newWorkerId,
              updatedBy: "repair_worker_assignment_from_proof",
              assignmentRepairTag: "proof_20260403_221300",
              assignmentRepairAt: new Date(),
            },
          },
        },
      };
    });

    const result = await JobsModel.bulkWrite(bulkOps, { ordered: false });
    report.summary.updated = Number(result.modifiedCount || 0);
  }

  const outputName = args.apply
    ? `repair_apply_${Date.now()}.json`
    : `repair_preview_${Date.now()}.json`;
  const outputPath = path.join(process.cwd(), "proofs", outputName);
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2), "utf8");

  console.log(
    JSON.stringify(
      {
        ok: true,
        output: outputPath,
        summary: report.summary,
        apply: args.apply,
      },
      null,
      2,
    ),
  );

  process.exit(0);
})().catch((error) => {
  console.error("Repair script failed:", error.message || error);
  process.exit(1);
});
