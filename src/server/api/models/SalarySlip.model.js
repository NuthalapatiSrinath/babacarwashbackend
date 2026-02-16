const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const SalarySlipSchema = new Schema(
  {
    worker: { type: Schema.Types.ObjectId, ref: "workers", required: true },
    month: { type: Number, required: true }, // 0=Jan, 11=Dec
    year: { type: Number, required: true },

    // Snapshot details
    employeeName: { type: String },
    employeeCode: { type: String },
    role: { type: String, default: "carwash" }, // carwash, mall, camp

    // --- Counts & Attendance ---
    totalDirectWashes: { type: Number, default: 0 }, // Mall: 3.00, Residential: Total
    totalSubscriptionWashes: { type: Number, default: 0 }, // Mall: 1.35
    totalWashes: { type: Number, default: 0 },

    presentDays: { type: Number, default: 0 },
    absentDays: { type: Number, default: 0 },
    sickLeaveDays: { type: Number, default: 0 },
    otHours: { type: Number, default: 0 }, // For Camp employees

    // --- Earnings (Credits) ---
    basicSalary: { type: Number, default: 0.0 }, // Base Pay or Commission
    incentiveAmount: { type: Number, default: 0.0 }, // Performance Bonus
    overtimeAmount: { type: Number, default: 0.0 }, // Camp OT
    allowanceAmount: { type: Number, default: 0.0 }, // Mall Fixed 200

    totalEarnings: { type: Number, required: true, default: 0.0 },

    // --- Deductions (Debits) ---
    simBillAmount: { type: Number, default: 0.0 }, // Actual Bill Uploaded
    simDeduction: { type: Number, default: 26.25 }, // Calculated Deduction
    absentDeduction: { type: Number, default: 0.0 },
    advanceDeduction: { type: Number, default: 0.0 },
    otherDeduction: { type: Number, default: 0.0 },
    lastMonthBalance: { type: Number, default: 0.0 },

    totalDeductions: { type: Number, required: true, default: 0.0 },

    // --- Final ---
    netSalary: { type: Number, required: true, default: 0.0 }, // Earnings - Deductions

    // --- Audit ---
    calculationBreakdown: { type: Object }, // Stores rates used (JSON)
    status: { type: String, enum: ["draft", "finalized"], default: "draft" },
    preparedBy: { type: String },
    notes: { type: String },
  },
  {
    timestamps: true,
  },
);

// Unique slip per worker per month
SalarySlipSchema.index({ worker: 1, month: 1, year: 1 }, { unique: true });

module.exports = mongoose.model("SalarySlip", SalarySlipSchema);
