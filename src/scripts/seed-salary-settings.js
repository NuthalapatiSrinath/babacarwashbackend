/**
 * Seed Script: Initialize Default Salary Settings
 *
 * This script creates the default salary configuration in the database
 * Run: node src/scripts/seed-salary-settings.js
 */

const mongoose = require("mongoose");
require("dotenv").config();

const SalarySettings = require("../server/api/models/salary-settings.model");

const defaultSettings = {
  carWashDayDuty: {
    applicableBuildings: ["Ubora Towers", "Marina Plaza"],
    ratePerCar: 1.4,
    incentiveLessThan1000: 100,
    incentiveMoreThan1000: 200,
  },
  carWashNightDuty: {
    ratePerCar: 1.35,
    incentiveLessThan1000: 100,
    incentiveMoreThan1000: 200,
  },
  etisalatSim: {
    monthlyBill: 52.5,
    companyPays: 26.25,
    employeeDeduction: 26.25,
  },
  mallEmployees: {
    carWashRate: 3.0,
    monthlyVehiclesRate: 1.35,
    fixedExtraPayment: 200,
    absentMoreThan1DayDeduction: 25,
    sundayAbsentDeduction: 50,
    sickLeavePayment: 13.33,
  },
  constructionCamp: {
    helper: {
      baseSalary: 1000,
      overtimeRate: 4.0,
    },
    mason: {
      baseSalary: 1200,
      overtimeRate: 4.5,
    },
    standardWorkingDays: 30,
    normalWorkingHours: 8,
    actualWorkingHours: 10,
    noDutyPayment: 18.33,
    holidayPayment: 18.33,
    sickLeavePayment: 13.33,
    absentDeduction: 25,
    monthlyIncentive: 100,
  },
  outsideCamp: {
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
      console.log("1. Keep existing settings (no changes)");
      console.log("2. Deactivate existing and create new defaults");
      console.log(
        "\nTo force reset, manually delete or deactivate existing settings first.",
      );

      await mongoose.connection.close();
      return;
    }

    // Create default settings
    console.log("Creating default salary settings...");
    const settings = new SalarySettings(defaultSettings);
    await settings.save();

    console.log("✅ Default salary settings created successfully!");
    console.log("\nSettings Summary:");
    console.log("==================");
    console.log(
      "Car Wash Day Duty Rate:",
      settings.carWashDayDuty.ratePerCar,
      "AED",
    );
    console.log(
      "Car Wash Night Duty Rate:",
      settings.carWashNightDuty.ratePerCar,
      "AED",
    );
    console.log(
      "Mall Car Wash Rate:",
      settings.mallEmployees.carWashRate,
      "AED",
    );
    console.log(
      "Construction Helper Salary:",
      settings.constructionCamp.helper.baseSalary,
      "AED",
    );
    console.log(
      "Construction Mason Salary:",
      settings.constructionCamp.mason.baseSalary,
      "AED",
    );
    console.log(
      "Outside Camp Helper Rate:",
      settings.outsideCamp.helper,
      "AED/hour",
    );
    console.log("\nSettings ID:", settings._id);
    console.log("==================");

    await mongoose.connection.close();
    console.log("\n✅ Database connection closed");
    console.log("✅ Seed completed successfully!");
  } catch (error) {
    console.error("❌ Error seeding salary settings:", error);
    process.exit(1);
  }
}

// Run the seed function
seedSalarySettings();
