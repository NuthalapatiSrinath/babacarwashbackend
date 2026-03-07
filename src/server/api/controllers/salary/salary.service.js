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

  // ==================== DEBUGGING CONSOLE LOGS ====================
  console.log("\n");
  console.log("═══════════════════════════════════════════════════════════");
  console.log("🧮 SALARY SLIP CALCULATION STARTED");
  console.log("═══════════════════════════════════════════════════════════");
  console.log("📅 Period:", `${month + 1}/${year}`);
  console.log("👤 Worker ID:", workerId);
  console.log("👤 Worker Name:", worker.name);
  console.log("\n--- WORKER MODEL FIELDS AVAILABLE ---");
  console.log("🔸 worker.role:", worker.role || "❌ NOT SET");
  console.log("🔸 worker.subRole:", worker.subRole || "❌ NOT SET");
  console.log("🔸 worker.location:", worker.location || "❌ NOT SET");
  console.log("🔸 worker.service_type:", worker.service_type || "❌ NOT SET");
  console.log("🔸 worker.employeeCode:", worker.employeeCode || "N/A");
  console.log("\n--- SALARY SETTINGS LOADED FROM DB ---");
  console.log(
    "💰 carWash.dayDuty.ratePerCar:",
    settings.carWash.dayDuty.ratePerCar,
  );
  console.log(
    "💰 carWash.nightDuty.ratePerCar:",
    settings.carWash.nightDuty.ratePerCar,
  );
  console.log("💰 mall.oneWashRate:", settings.mall.oneWashRate);
  console.log("💰 mall.insideWashRate:", settings.mall.insideWashRate);
  console.log("💰 mall.outsideWashRate:", settings.mall.outsideWashRate);
  console.log("💰 mall.totalWashRate:", settings.mall.totalWashRate);
  console.log("💰 mall.monthlyRate:", settings.mall.monthlyRate);
  console.log("💰 camp.helper.baseSalary:", settings.camp.helper.baseSalary);
  console.log(
    "💰 camp.helper.overtimeRate:",
    settings.camp.helper.overtimeRate,
  );
  console.log("💰 camp.mason.baseSalary:", settings.camp.mason.baseSalary);
  console.log("💰 camp.mason.overtimeRate:", settings.camp.mason.overtimeRate);
  console.log(
    "💰 etisalat.employeeBaseDeduction:",
    settings.etisalat.employeeBaseDeduction,
  );
  console.log("\n--- MANUAL INPUTS PROVIDED ---");
  console.log("✏️ Manual Inputs:", JSON.stringify(manualInputs, null, 2));
  console.log("═══════════════════════════════════════════════════════════\n");

  // Date Range
  const startDate = moment({ year, month }).startOf("month");
  const endDate = moment({ year, month }).endOf("month");
  const daysInMonth = startDate.daysInMonth();

  // 2. Fetch Wash Data
  // Onewash = Direct/One-time (Mall inside/outside/total, Residential Day/Night)
  const oneWashData = await OnewashModel.find({
    worker: workerId,
    isDeleted: false,
    createdAt: { $gte: startDate.toDate(), $lte: endDate.toDate() },
  })
    .select("createdAt wash_type")
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

  // Determine Worker Type Based on service_type field
  // service_type: "mall", "residence", "site", "mobile"
  const workerType = worker.service_type || "residence";
  const location = worker.location || "";

  console.log("\n🔍 DETERMINING CALCULATION METHOD:");
  console.log("➡️ Worker service_type:", worker.service_type);
  console.log("➡️ Worker Type for Calc:", workerType);
  console.log("➡️ Location:", location || "Not specified");

  // === LOGIC A: CAR WASH EMPLOYEES (RESIDENTIAL) ===
  if (workerType === "residence") {
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

    console.log("\n✅ USING: CAR WASH LOGIC");
    console.log("📊 Method:", breakdown.method);
    console.log("🚗 Total Cars:", totalWashes);
    console.log("💵 Rate Used:", config.ratePerCar);
    console.log("💰 Basic Earnings:", earnings.basic.toFixed(2));
    console.log("🎁 Incentive:", earnings.incentive.toFixed(2));
  }

  // === LOGIC B: MALL EMPLOYEES ===
  else if (workerType === "mall") {
    // Break down one-wash counts by wash_type
    let insideWashCount = 0;
    let outsideWashCount = 0;
    let totalWashTypeCount = 0; // inside+outside
    let unknownWashCount = 0;

    oneWashData.forEach((wash) => {
      const wt = wash.wash_type;
      if (wt === "inside") insideWashCount++;
      else if (wt === "outside") outsideWashCount++;
      else if (wt === "total") totalWashTypeCount++;
      else unknownWashCount++;
    });

    // Get rates - use specific rates if configured, else fallback to flat oneWashRate
    const insideRate =
      settings.mall.insideWashRate ?? settings.mall.oneWashRate;
    const outsideRate =
      settings.mall.outsideWashRate ?? settings.mall.oneWashRate;
    const totalRate = settings.mall.totalWashRate ?? settings.mall.oneWashRate;
    const fallbackRate = settings.mall.oneWashRate;

    const payInside = insideWashCount * insideRate;
    const payOutside = outsideWashCount * outsideRate;
    const payTotal = totalWashTypeCount * totalRate;
    const payUnknown = unknownWashCount * fallbackRate;

    const payOneWash = payInside + payOutside + payTotal + payUnknown;
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
    breakdown.insideWashCount = insideWashCount;
    breakdown.outsideWashCount = outsideWashCount;
    breakdown.totalWashTypeCount = totalWashTypeCount;
    breakdown.unknownWashCount = unknownWashCount;
    breakdown.insideRate = insideRate;
    breakdown.outsideRate = outsideRate;
    breakdown.totalRate = totalRate;
    breakdown.oneWashPay = payOneWash;
    breakdown.monthlyPay = payMonthly;
    breakdown.allowance = earnings.allowance.toFixed(2);

    console.log("\n✅ USING: MALL LOGIC");
    console.log("📊 Method:", breakdown.method);
    console.log("🚗 Inside Washes:", insideWashCount, "@ Rate:", insideRate);
    console.log("🚗 Outside Washes:", outsideWashCount, "@ Rate:", outsideRate);
    console.log(
      "🚗 Total (In+Out) Washes:",
      totalWashTypeCount,
      "@ Rate:",
      totalRate,
    );
    if (unknownWashCount > 0)
      console.log(
        "🚗 Unknown Type Washes:",
        unknownWashCount,
        "@ Rate:",
        fallbackRate,
      );
    console.log("💵 OneWash Total Pay:", payOneWash.toFixed(2));
    console.log(
      "📅 Subscription Count:",
      subscriptionCount,
      "@ Rate:",
      settings.mall.monthlyRate,
    );
    console.log("💰 Basic Earnings:", earnings.basic.toFixed(2));
    console.log("🎁 Allowance:", earnings.allowance.toFixed(2));
  }

  // === LOGIC C: CAMP/SITE EMPLOYEES ===
  else if (workerType === "site") {
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

    breakdown.method = `Camp/Site - ${role}`;
    presentDaysCount = daysPresent; // Override auto-calc for camp

    console.log("\n✅ USING: CAMP/SITE LOGIC");
    console.log("📊 Method:", breakdown.method);
    console.log("👷 Role:", role);
    console.log("💰 Base Salary Rate:", roleConfig.baseSalary);
    console.log("⏰ OT Rate:", roleConfig.overtimeRate);
    console.log("📅 Days Present:", daysPresent);
    console.log("⏱️ OT Hours:", otHours);
    console.log("💰 Basic Earnings:", earnings.basic.toFixed(2));
    console.log("⏰ OT Earnings:", earnings.ot.toFixed(2));
    console.log("🎁 Incentive:", earnings.incentive.toFixed(2));
  }

  // === LOGIC D: MOBILE WORKERS (treat as residence for now) ===
  else if (workerType === "mobile") {
    // Mobile workers are typically residence workers doing mobile car wash
    // Use same logic as residence
    const config = settings.carWash.nightDuty; // Default to night duty rates

    earnings.basic = totalWashes * config.ratePerCar;

    if (totalWashes < config.incentiveThreshold) {
      earnings.incentive = config.incentiveLow;
    } else {
      earnings.incentive = config.incentiveHigh;
    }

    breakdown.method = "Mobile Car Wash";
    breakdown.totalCars = totalWashes;
    breakdown.rate = config.ratePerCar;

    console.log("\n✅ USING: MOBILE LOGIC");
    console.log("📊 Method:", breakdown.method);
    console.log("🚗 Total Cars:", totalWashes);
    console.log("💵 Rate Used:", config.ratePerCar);
    console.log("💰 Basic Earnings:", earnings.basic.toFixed(2));
    console.log("🎁 Incentive:", earnings.incentive.toFixed(2));
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

  console.log("\n💸 FINAL CALCULATIONS:");
  console.log("➕ Total Earnings:", totalEarnings.toFixed(2));
  console.log("   - Basic:", earnings.basic.toFixed(2));
  console.log("   - Incentive:", earnings.incentive.toFixed(2));
  console.log("   - Allowance:", earnings.allowance.toFixed(2));
  console.log("   - OT:", earnings.ot.toFixed(2));
  console.log("➖ Total Deductions:", totalDeductions.toFixed(2));
  console.log("   - SIM:", simDeduction.toFixed(2));
  console.log("   - Advance:", advance);
  console.log("   - Other:", otherDeduction);
  console.log("   - Last Month:", lastMonthBalance);
  console.log("💰 NET SALARY:", netSalary.toFixed(2));
  console.log("═══════════════════════════════════════════════════════════\n");

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
    // Mall wash type breakdown
    insideWashCount: breakdown.insideWashCount || 0,
    outsideWashCount: breakdown.outsideWashCount || 0,
    totalWashTypeCount: breakdown.totalWashTypeCount || 0,

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
