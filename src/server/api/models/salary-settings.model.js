"use strict";

const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const SalarySettingsSchema = new Schema(
  {
    // 1. Car Wash Employees - Residential
    carWash: {
      dayDuty: {
        applicableBuildings: {
          type: [String],
          default: ["Ubora Towers", "Marina Plaza"],
        },
        ratePerCar: { type: Number, default: 1.4 },
        incentiveThreshold: { type: Number, default: 1000 },
        incentiveLow: { type: Number, default: 100 },
        incentiveHigh: { type: Number, default: 200 },
      },
      nightDuty: {
        ratePerCar: { type: Number, default: 1.35 },
        incentiveThreshold: { type: Number, default: 1000 },
        incentiveLow: { type: Number, default: 100 },
        incentiveHigh: { type: Number, default: 200 },
      },
    },

    // 2. Etisalat SIM Deductions
    etisalat: {
      monthlyBillCap: { type: Number, default: 52.5 },
      companyPays: { type: Number, default: 26.25 },
      employeeBaseDeduction: { type: Number, default: 26.25 },
    },

    // 3. Mall Employees
    mall: {
      oneWashRate: { type: Number, default: 3.0 }, // Direct car wash
      monthlyRate: { type: Number, default: 1.35 }, // Subscription vehicles
      fixedAllowance: { type: Number, default: 200 }, // Pro-rated
      absentDeduction: { type: Number, default: 25 },
      sundayAbsentDeduction: { type: Number, default: 50 },
      sickLeavePay: { type: Number, default: 13.33 },
    },

    // 4. Construction / Camp Employees
    camp: {
      helper: {
        baseSalary: { type: Number, default: 1000 },
        overtimeRate: { type: Number, default: 4.0 },
      },
      mason: {
        baseSalary: { type: Number, default: 1200 },
        overtimeRate: { type: Number, default: 4.5 },
      },
      settings: {
        standardDays: { type: Number, default: 30 },
        normalHours: { type: Number, default: 8 },
        actualHours: { type: Number, default: 10 },
        noDutyPay: { type: Number, default: 18.33 },
        holidayPay: { type: Number, default: 18.33 },
        sickLeavePay: { type: Number, default: 13.33 },
        monthlyIncentive: { type: Number, default: 100 },
      },
    },

    // 5. Outside Camp (Hourly)
    outside: {
      helper: { type: Number, default: 5.0 },
      carpenter: { type: Number, default: 5.5 },
      steelFixer: { type: Number, default: 5.5 },
      painter: { type: Number, default: 5.5 },
      mason: { type: Number, default: 6.0 },
      scaffolder: { type: Number, default: 6.0 },
      electrician: { type: Number, default: 6.0 },
      plumber: { type: Number, default: 6.0 },
    },

    // 6. Salary Slip Template Selection
    slipTemplate: {
      type: String,
      enum: ["template1", "template2"],
      default: "template1",
    },

    isActive: { type: Boolean, default: true },
    lastModifiedBy: { type: String, default: "System" },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

module.exports = mongoose.model("SalarySettings", SalarySettingsSchema);
