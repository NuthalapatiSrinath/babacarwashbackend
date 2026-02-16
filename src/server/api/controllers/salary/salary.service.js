const moment = require("moment");
const SalarySlipModel = require("../../models/SalarySlip.model");
const WorkersModel = require("../../models/workers.model");
const OnewashModel = require("../../models/onewash.model");
const JobsModel = require("../../models/jobs.model");
const SalarySettingsService = require("./salary-settings.service");

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
  // 1. Fetch Resources
  const worker = await WorkersModel.findById(workerId).lean();
  if (!worker) throw new Error("Worker not found");

  const settings = await SalarySettingsService.getSettings();

  // Date Range
  const startDate = moment({ year, month }).startOf("month");
  const endDate = moment({ year, month }).endOf("month");
  const daysInMonth = startDate.daysInMonth();

  // 2. Fetch Wash Data
  // Onewash = Direct/One-time (Mall 3.00, Residential Day/Night)
  const oneWashData = await OnewashModel.find({
    worker: workerId,
    isDeleted: false,
    createdAt: { $gte: startDate.toDate(), $lte: endDate.toDate() },
  })
    .select("createdAt")
    .lean();

  // Jobs = Subscriptions (Mall 1.35, Residential Day/Night)
  const jobsData = await JobsModel.find({
    worker: workerId,
    isDeleted: false,
    status: "completed",
    completedDate: { $gte: startDate.toDate(), $lte: endDate.toDate() },
  })
    .select("completedDate")
    .lean();

  // Aggregate Daily Counts (for attendance/calendar view)
  const dailyCounts = {};
  for (let i = 1; i <= daysInMonth; i++) dailyCounts[i.toString()] = 0;

  let presentDaysCount = 0;
  const processDates = (items, dateField) => {
    items.forEach((item) => {
      if (!item[dateField]) return;
      const day = moment(item[dateField]).date().toString();
      dailyCounts[day] = (dailyCounts[day] || 0) + 1;
    });
  };

  processDates(oneWashData, "createdAt");
  processDates(jobsData, "completedDate");

  // Calculate Present Days based on activity
  for (let i = 1; i <= daysInMonth; i++) {
    if (dailyCounts[i.toString()] > 0) presentDaysCount++;
  }

  // --- 3. Perform Financial Calculations ---

  // Counts
  const oneWashCount = oneWashData.length;
  const subscriptionCount = jobsData.length;
  const totalWashes = oneWashCount + subscriptionCount;

  // Initialize Financials
  let earnings = { basic: 0, incentive: 0, allowance: 0, ot: 0 };
  let breakdown = { method: "Standard", ratesUsed: {} };

  // Determine Worker Role & Location
  // Ensure your Worker Model has a 'role' field. Defaulting to 'carwash' if missing.
  const workerType = worker.role || "carwash";
  const location = worker.location || "";

  // === LOGIC A: CAR WASH EMPLOYEES (RESIDENTIAL) ===
  if (workerType === "carwash") {
    // Check Location for Day Duty vs Night Duty
    const dayDutyBuildings = settings.carWash.dayDuty.applicableBuildings || [];
    const isDayDuty = dayDutyBuildings.some((b) => location.includes(b));
    const config = isDayDuty
      ? settings.carWash.dayDuty
      : settings.carWash.nightDuty;

    // Rate Calculation
    earnings.basic = totalWashes * config.ratePerCar;

    // Incentive Calculation
    if (totalWashes < config.incentiveThreshold) {
      earnings.incentive = config.incentiveLow;
    } else {
      earnings.incentive = config.incentiveHigh;
    }

    breakdown.method = isDayDuty
      ? "Residential Day Duty"
      : "Residential Night Duty";
    breakdown.totalCars = totalWashes;
    breakdown.rate = config.ratePerCar;
  }

  // === LOGIC B: MALL EMPLOYEES ===
  else if (workerType === "mall") {
    // 3.00 for One Wash, 1.35 for Monthly
    const payOneWash = oneWashCount * settings.mall.oneWashRate;
    const payMonthly = subscriptionCount * settings.mall.monthlyRate;
    earnings.basic = payOneWash + payMonthly;

    // Fixed Allowance (Pro-rated)
    // Rule: 200 / 30 * Days Worked
    // Use manual input for 'presentDays' if provided, else use calculated count or 30
    const daysWorked =
      manualInputs.presentDays !== undefined
        ? Number(manualInputs.presentDays)
        : 30;
    const dailyAllowance = settings.mall.fixedAllowance / 30;
    earnings.allowance = dailyAllowance * daysWorked;

    breakdown.method = "Mall Structure";
    breakdown.oneWashPay = payOneWash;
    breakdown.monthlyPay = payMonthly;
    breakdown.allowance = earnings.allowance.toFixed(2);
  }

  // === LOGIC C: CAMP EMPLOYEES ===
  else if (workerType === "camp" || workerType === "constructionCamp") {
    const role = worker.subRole || "helper"; // 'helper' or 'mason'
    const roleConfig = settings.camp[role] || settings.camp.helper;
    const general = settings.camp.settings;

    // Use manual inputs for attendance as camp workers might not have 'wash' data
    const daysPresent =
      manualInputs.presentDays !== undefined
        ? Number(manualInputs.presentDays)
        : 0;
    const otHours = Number(manualInputs.otHours) || 0;
    const absentDays = Number(manualInputs.absentDays) || 0;

    // Base Salary (Pro-rated)
    earnings.basic =
      (roleConfig.baseSalary / general.standardDays) * daysPresent;

    // Overtime
    earnings.ot = otHours * roleConfig.overtimeRate;

    // Monthly Incentive (Full Attendance)
    if (daysPresent >= general.standardDays && absentDays === 0) {
      earnings.incentive = general.monthlyIncentive;
    }

    breakdown.method = `Camp - ${role}`;
    presentDaysCount = daysPresent; // Override auto-calc for camp
  }

  // === DEDUCTIONS ===

  // 1. Etisalat Sim
  const billAmount = Number(manualInputs.simBillAmount) || 0;
  let simDeduction = settings.etisalat.employeeBaseDeduction;

  if (billAmount > settings.etisalat.monthlyBillCap) {
    simDeduction += billAmount - settings.etisalat.monthlyBillCap;
  }

  // 2. Other Deductions
  const advance = Number(manualInputs.advance) || 0;
  const otherDeduction = Number(manualInputs.otherDeduction) || 0; // Generic 'absentDeduction' etc.

  // 3. Last Month Balance (Fetch if not manually provided)
  let lastMonthBalance = 0.0;
  if (manualInputs.lastMonthBalance !== undefined) {
    lastMonthBalance = Number(manualInputs.lastMonthBalance);
  } else {
    const prevDate = moment(new Date(year, month, 1)).subtract(1, "month");
    const prevSlip = await SalarySlipModel.findOne({
      worker: workerId,
      month: prevDate.month(),
      year: prevDate.year(),
    })
      .select("closingBalance")
      .lean();

    if (prevSlip && prevSlip.closingBalance < 0) {
      // Only carry forward negative balances (debts)? Or decimals?
      // Document implied carrying forward decimal remainders usually.
      // Adapting your previous code:
      const decimalPart = prevSlip.closingBalance % 1;
      lastMonthBalance = Number(decimalPart.toFixed(2));
    }
  }

  // Totals
  const totalEarnings =
    earnings.basic + earnings.incentive + earnings.allowance + earnings.ot;
  const totalDeductions =
    simDeduction + advance + otherDeduction + lastMonthBalance;
  const netSalary = totalEarnings - totalDeductions;

  // --- 5. Prepare Data Object ---
  return {
    worker: workerId,
    month,
    year,
    employeeName: worker.name,
    employeeCode: worker.employeeCode || "N/A",
    role: workerType,

    // Counts
    dailyData: dailyCounts,
    totalDirectWashes: oneWashCount,
    totalSubscriptionWashes: subscriptionCount,
    totalWashes: totalWashes,

    // Earnings
    basicSalary: Number(earnings.basic.toFixed(2)),
    extraPaymentIncentive: Number(earnings.incentive.toFixed(2)),
    allowanceAmount: Number(earnings.allowance.toFixed(2)),
    overtimeAmount: Number(earnings.ot.toFixed(2)),
    totalEarnings: Number(totalEarnings.toFixed(2)),

    // Deductions
    simBillAmount: billAmount,
    simDeduction: Number(simDeduction.toFixed(2)),
    advanceDeduction: advance,
    otherDeduction: otherDeduction,
    lastMonthBalance: lastMonthBalance,
    totalDeductions: Number(totalDeductions.toFixed(2)),

    // Final
    closingBalance: Number(netSalary.toFixed(2)), // This is the Net Salary Payable

    // Attendance & Manual Inputs
    presentDays: presentDaysCount,
    absentDays: Number(manualInputs.absentDays) || 0,
    sickLeaveDays: Number(manualInputs.sickLeaveDays) || 0,
    otHours: Number(manualInputs.otHours) || 0,

    calculationBreakdown: breakdown,
    daysInMonth,
  };
};

/**
 * Get existing slip or generate a preview
 */
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

/**
 * Save or Update a slip
 */
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
