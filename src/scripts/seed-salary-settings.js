/**
 * Seed Script: Initialize Default Salary Settings
 * * This script creates the default salary configuration in the database
 * matching the new nested schema structure.
 * * Run: node src/scripts/seed-salary-settings.js
 */

const mongoose = require("mongoose");
require("dotenv").config();

// Ensure path matches your project structure
const SalarySettings = require("../server/api/models/salary-settings.model");

const defaultSettings = {
  // 1. Car Wash (Residential)
  carWash: {
    dayDuty: {
      applicableBuildings: ["Ubora Towers", "Marina Plaza"],
      ratePerCar: 1.4,
      incentiveThreshold: 1000,
      incentiveLow: 100,
      incentiveHigh: 200,
    },
    nightDuty: {
      ratePerCar: 1.35,
      incentiveThreshold: 1000,
      incentiveLow: 100,
      incentiveHigh: 200,
    },
  },

  // 2. Etisalat Sim
  etisalat: {
    monthlyBillCap: 52.5,
    companyPays: 26.25,
    employeeBaseDeduction: 26.25,
  },

  // 3. Mall Employees
  mall: {
    oneWashRate: 3.0,
    monthlyRate: 1.35,
    fixedAllowance: 200,
    absentDeduction: 25,
    sundayAbsentDeduction: 50,
    sickLeavePay: 13.33,
  },

  // 4. Construction / Camp
  camp: {
    helper: {
      baseSalary: 1000,
      overtimeRate: 4.0,
    },
    mason: {
      baseSalary: 1200,
      overtimeRate: 4.5,
    },
    settings: {
      standardDays: 30,
      normalHours: 8,
      actualHours: 10,
      noDutyPay: 18.33,
      holidayPay: 18.33,
      sickLeavePay: 13.33,
      monthlyIncentive: 100,
    },
  },

  // 5. Outside Camp (Hourly)
  outside: {
    helper: 5.0,
    carpenter: 5.5,
    steelFixer: 5.5,
    painter: 5.5,
    mason: 6.0,
    scaffolder: 6.0,
    electrician: 6.0,
    plumber: 6.0,
  },

  isActive: true,
  lastModifiedBy: "System Seed",
};

async function seedSalarySettings() {
  try {
    // Connect to MongoDB
    console.log("Connecting to MongoDB...");
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log("✅ Connected to MongoDB");

    // Check if settings already exist
    const existingSettings = await SalarySettings.findOne({ isActive: true });

    if (existingSettings) {
      console.log("⚠️  Active salary settings already exist!");
      console.log("Settings ID:", existingSettings._id);
      console.log("\nOptions:");
      console.log("1. To keep existing settings: Do nothing.");
      console.log(
        "2. To reset: Delete the 'salarysettings' collection in MongoDB Compass and run this script again.",
      );

      await mongoose.connection.close();
      return;
    }

    // Create default settings
    console.log("Creating default salary settings...");
    const settings = new SalarySettings(defaultSettings);
    await settings.save();

    console.log("✅ Default salary settings created successfully!");

    // Validation Log
    console.log("\nSettings Verification:");
    console.log("======================");
    console.log(
      "Car Wash Day Rate:",
      settings.carWash.dayDuty.ratePerCar,
      "AED",
    );
    console.log("Mall One Wash Rate:", settings.mall.oneWashRate, "AED");
    console.log("Camp Helper Salary:", settings.camp.helper.baseSalary, "AED");
    console.log("Camp OT Rate:", settings.camp.helper.overtimeRate, "AED/hr");
    console.log("Outside Mason Rate:", settings.outside.mason, "AED/hr");
    console.log("======================");

    await mongoose.connection.close();
    console.log("\n✅ Database connection closed");
    process.exit(0);
  } catch (error) {
    console.error("❌ Error seeding salary settings:", error);
    process.exit(1);
  }
}

seedSalarySettings();
