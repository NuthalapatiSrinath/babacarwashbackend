const moment = require("moment");
const SalarySlipModel = require("../../models/SalarySlip.model");
const WorkersModel = require("../../models/workers.model");
const OnewashModel = require("../../models/onewash.model");
const JobsModel = require("../../models/jobs.model");

const service = {};

/**
 * Calculates salary data either fresh or updates an existing draft.
 * @param {string} workerId
 * @param {number} month (0-11)
 * @param {number} year
 * @param {object} manualInputs (Optional overrides for editable fields)
 */
service.calculateOrUpdateSlip = async (
  workerId,
  month,
  year,
  manualInputs = {},
) => {
  // 1. Fetch Worker Details
  const worker = await WorkersModel.findById(workerId).lean();
  if (!worker) throw new Error("Worker not found");

  // 2. Fetch Wash Data for the Month
  const startDate = moment(new Date(year, month, 1)).startOf("month");
  const endDate = moment(new Date(year, month, 1)).endOf("month");
  const daysInMonth = startDate.daysInMonth();

  const [onewashData, jobsData] = await Promise.all([
    OnewashModel.find({
      worker: workerId,
      isDeleted: false,
      createdAt: { $gte: startDate, $lte: endDate },
    })
      .select("createdAt")
      .lean(),
    JobsModel.find({
      worker: workerId,
      isDeleted: false,
      status: "completed",
      completedDate: { $gte: startDate, $lte: endDate },
    })
      .select("completedDate")
      .lean(),
  ]);

  // Aggregate Daily Washes
  const dailyCounts = {};
  let totalWashes = 0;
  let presentDaysCount = 0;

  // Initialize all days to 0
  for (let i = 1; i <= daysInMonth; i++) dailyCounts[i.toString()] = 0;

  const process = (job, dateField) => {
    if (!job[dateField]) return;
    const day = moment(job[dateField]).date().toString();
    dailyCounts[day] = (dailyCounts[day] || 0) + 1;
    totalWashes++;
  };
  onewashData.forEach((j) => process(j, "createdAt"));
  jobsData.forEach((j) => process(j, "completedDate"));

  // Calculate Present Days
  for (let i = 1; i <= daysInMonth; i++) {
    if (dailyCounts[i.toString()] > 0) presentDaysCount++;
  }

  // --- 3. Perform Financial Calculations ---

  // Rule: Basic Salary only if washes >= 100
  const BASIC_SALARY_STD = 550.0;
  const basicSalary = totalWashes >= 100 ? BASIC_SALARY_STD : 0.0;

  const RATE_PER_WASH = 1.35;

  // Total earned based on washes
  const totalWashEarnings = totalWashes * RATE_PER_WASH;

  // Extra work (OT)
  const extraWorkOt = Math.max(0, totalWashEarnings - basicSalary);

  // Incentive Rule: < 500 = 0, 500-999 = 100, >= 1000 = 200
  let extraPaymentIncentive = 0.0;
  if (totalWashes >= 1000) {
    extraPaymentIncentive = 200.0;
  } else if (totalWashes >= 500) {
    extraPaymentIncentive = 100.0;
  } else {
    extraPaymentIncentive = 0.0;
  }

  const totalDebit = basicSalary + extraWorkOt + extraPaymentIncentive;

  // --- 4. Last Month Balance (Auto-Carry Forward) ---
  let calculatedLastMonthBalance = 0.0;

  if (manualInputs.lastMonthBalance === undefined) {
    const prevDate = moment(new Date(year, month, 1)).subtract(1, "month");
    const prevMonth = prevDate.month();
    const prevYear = prevDate.year();

    const prevSlip = await SalarySlipModel.findOne({
      worker: workerId,
      month: prevMonth,
      year: prevYear,
    })
      .select("closingBalance")
      .lean();

    if (prevSlip && prevSlip.closingBalance) {
      const decimalPart = prevSlip.closingBalance % 1;
      calculatedLastMonthBalance = Number(decimalPart.toFixed(2));
    }
  }

  // Deductions (Credits) - Use manual inputs or defaults

  // ✅ NEW RULE: Etisalat 26.25 only if >= 100 washes
  const etisalatDefault = totalWashes >= 100 ? 26.25 : 0.0;

  const etisalatBalance =
    manualInputs.etisalatBalance !== undefined
      ? Number(manualInputs.etisalatBalance)
      : etisalatDefault;

  const lastMonthBalance =
    manualInputs.lastMonthBalance !== undefined
      ? Number(manualInputs.lastMonthBalance)
      : calculatedLastMonthBalance;

  const advance = Number(manualInputs.advance) || 0.0;
  const c3Pay = Number(manualInputs.c3Pay) || 0.0;

  const totalCredit = etisalatBalance + lastMonthBalance + advance + c3Pay;

  // Closing Balance
  const closingBalance = totalDebit - totalCredit;

  // --- 5. Prepare Data Object ---
  const slipData = {
    worker: workerId,
    month,
    year,
    employeeName: worker.name,
    employeeCode: worker.employeeCode || "N/A",
    dailyData: dailyCounts,
    totalWashes,
    basicSalary: basicSalary.toFixed(2),
    extraWorkOt: extraWorkOt.toFixed(2),
    extraPaymentIncentive: extraPaymentIncentive.toFixed(2),
    totalDebit: totalDebit.toFixed(2),
    etisalatBalance: etisalatBalance.toFixed(2),
    lastMonthBalance: lastMonthBalance.toFixed(2),
    advance: advance.toFixed(2),
    c3Pay: c3Pay.toFixed(2),
    totalCredit: totalCredit.toFixed(2),
    closingBalance: closingBalance.toFixed(2),
    presentDays: presentDaysCount,
    absentDays: manualInputs.absentDays || 0,
    noDutyDays: manualInputs.noDutyDays || 0,
    sickLeaveDays: manualInputs.sickLeaveDays || 0,
    daysInMonth,
  };

  return slipData;
};

// Get existing slip or generate a preview
service.getSlip = async (workerId, month, year) => {
  let slip = await SalarySlipModel.findOne({
    worker: workerId,
    month,
    year,
  }).lean();

  if (slip) {
    return { ...slip, status: slip.status };
  } else {
    // Calculate a fresh preview
    const previewData = await service.calculateOrUpdateSlip(
      workerId,
      month,
      year,
    );
    return { ...previewData, status: "new_preview", _id: null };
  }
};

// Save or Update a slip
service.saveSlip = async (data, adminName) => {
  const { workerId, month, year, manualInputs, status } = data;

  const calculatedData = await service.calculateOrUpdateSlip(
    workerId,
    month,
    year,
    manualInputs,
  );

  const updatePayload = {
    ...calculatedData,
    status: status || "draft",
    preparedBy: adminName,
  };

  const slip = await SalarySlipModel.findOneAndUpdate(
    { worker: workerId, month, year },
    updatePayload,
    { new: true, upsert: true, setDefaultsOnInsert: true },
  );
  return slip;
};

module.exports = service;
