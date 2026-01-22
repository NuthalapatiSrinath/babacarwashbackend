const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const SalarySlipSchema = new Schema(
  {
    worker: { type: Schema.Types.ObjectId, ref: "workers", required: true },
    month: { type: Number, required: true }, // 0 for Jan, 11 for Dec
    year: { type: Number, required: true },

    // Snapshot of worker details at time of generation
    employeeName: { type: String, required: true },
    employeeCode: { type: String, required: true },

    // --- Daily Breakdown Snapshot ---
    // Store days 1-31 counts so the slip remains static
    dailyData: {
      type: Map,
      of: Number, // e.g., { "1": 42, "2": 0, ... "31": 0 }
      default: {},
    },
    totalWashes: { type: Number, required: true, default: 0 },

    // --- Earnings (Debits) ---
    basicSalary: { type: Number, required: true, default: 550.0 },
    // Calculation: (Total Washes * 1.35) - Basic Salary
    extraWorkOt: { type: Number, required: true, default: 0.0 },
    // Rule: <1000 washes = 100, >=1000 washes = 200
    extraPaymentIncentive: { type: Number, required: true, default: 0.0 },
    totalDebit: { type: Number, required: true, default: 0.0 },

    // --- Deductions/Adjustments (Credits) ---
    // Editable fields
    etisalatBalance: { type: Number, default: 26.25 },
    lastMonthBalance: { type: Number, default: 0.0 }, // The 0.xx amount carried over
    advance: { type: Number, default: 0.0 },
    c3Pay: { type: Number, default: 0.0 },
    totalCredit: { type: Number, required: true, default: 0.0 },

    // --- Final Totals ---
    closingBalance: { type: Number, required: true, default: 0.0 },

    // --- Attendance Summary ---
    presentDays: { type: Number, default: 0 }, // Auto-calculated based on days with washes
    absentDays: { type: Number, default: 0 }, // Manual Input
    noDutyDays: { type: Number, default: 0 }, // Manual Input
    sickLeaveDays: { type: Number, default: 0 }, // Manual Input

    status: {
      type: String,
      enum: ["draft", "finalized"],
      default: "draft",
    },
    preparedBy: { type: String },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// Ensure unique slip per worker per month
SalarySlipSchema.index({ worker: 1, month: 1, year: 1 }, { unique: true });

module.exports = mongoose.model("SalarySlip", SalarySlipSchema);
