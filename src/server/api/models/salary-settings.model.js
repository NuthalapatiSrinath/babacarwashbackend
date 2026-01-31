"use strict";

const mongoose = require("mongoose");

const schema = new mongoose.Schema(
  {
    // Car Wash Employees - Day Duty
    carWashDayDuty: {
      applicableBuildings: {
        type: [String],
        default: ["Ubora Towers", "Marina Plaza"],
      },
      ratePerCar: {
        type: Number,
        default: 1.4,
      },
      incentiveLessThan1000: {
        type: Number,
        default: 100,
      },
      incentiveMoreThan1000: {
        type: Number,
        default: 200,
      },
    },

    // Car Wash Employees - Night Duty
    carWashNightDuty: {
      ratePerCar: {
        type: Number,
        default: 1.35,
      },
      incentiveLessThan1000: {
        type: Number,
        default: 100,
      },
      incentiveMoreThan1000: {
        type: Number,
        default: 200,
      },
    },

    // Etisalat SIM Bill
    etisalatSim: {
      monthlyBill: {
        type: Number,
        default: 52.5,
      },
      companyPays: {
        type: Number,
        default: 26.25,
      },
      employeeDeduction: {
        type: Number,
        default: 26.25,
      },
    },

    // Mall Employees
    mallEmployees: {
      carWashRate: {
        type: Number,
        default: 3.0,
      },
      monthlyVehiclesRate: {
        type: Number,
        default: 1.35,
      },
      fixedExtraPayment: {
        type: Number,
        default: 200,
      },
      absentMoreThan1DayDeduction: {
        type: Number,
        default: 25,
      },
      sundayAbsentDeduction: {
        type: Number,
        default: 50,
      },
      sickLeavePayment: {
        type: Number,
        default: 13.33,
      },
    },

    // Construction Camp Employees
    constructionCamp: {
      helper: {
        baseSalary: {
          type: Number,
          default: 1000,
        },
        overtimeRate: {
          type: Number,
          default: 4.0,
        },
      },
      mason: {
        baseSalary: {
          type: Number,
          default: 1200,
        },
        overtimeRate: {
          type: Number,
          default: 4.5,
        },
      },
      standardWorkingDays: {
        type: Number,
        default: 30,
      },
      normalWorkingHours: {
        type: Number,
        default: 8,
      },
      actualWorkingHours: {
        type: Number,
        default: 10,
      },
      noDutyPayment: {
        type: Number,
        default: 18.33,
      },
      holidayPayment: {
        type: Number,
        default: 18.33,
      },
      sickLeavePayment: {
        type: Number,
        default: 13.33,
      },
      absentDeduction: {
        type: Number,
        default: 25,
      },
      monthlyIncentive: {
        type: Number,
        default: 100,
      },
    },

    // Outside Camp Employees (Hourly)
    outsideCamp: {
      helper: {
        type: Number,
        default: 5.0,
      },
      carpenter: {
        type: Number,
        default: 5.5,
      },
      steelFixer: {
        type: Number,
        default: 5.5,
      },
      painter: {
        type: Number,
        default: 5.5,
      },
      mason: {
        type: Number,
        default: 6.0,
      },
      scaffolder: {
        type: Number,
        default: 6.0,
      },
      electrician: {
        type: Number,
        default: 6.0,
      },
      plumber: {
        type: Number,
        default: 6.0,
      },
    },

    // Metadata
    isActive: {
      type: Boolean,
      default: true,
    },
    lastModifiedBy: {
      type: String,
      default: "System",
    },
  },
  {
    versionKey: false,
    timestamps: true,
  },
);

module.exports = mongoose.model("salary-settings", schema);
