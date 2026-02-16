"use strict";

const SalarySettings = require("../../models/salary-settings.model");

const service = {};

/**
 * Get salary settings (always returns active configuration)
 */
service.getSettings = async () => {
  try {
    let settings = await SalarySettings.findOne({ isActive: true })
      .sort({ createdAt: -1 })
      .lean();

    // If no settings exist, create default
    if (!settings) {
      settings = await service.createDefaultSettings();
    }

    return settings;
  } catch (error) {
    console.error("Error fetching salary settings:", error);
    throw new Error("Failed to fetch salary settings");
  }
};

/**
 * Update salary settings
 * We create a NEW record with isActive: true and set old ones to false
 * This preserves history.
 */
service.updateSettings = async (data, adminName) => {
  try {
    // 1. Deactivate current settings
    await SalarySettings.updateMany({}, { isActive: false });

    // 2. Prepare new data (ensure structure matches model)
    // ⚠️ CRITICAL: Remove _id to prevent duplicate key error
    const { _id, __v, createdAt, updatedAt, ...cleanData } = data;

    const newSettingsData = {
      ...cleanData,
      isActive: true,
      lastModifiedBy: adminName,
    };

    // 3. Save new settings
    const settings = new SalarySettings(newSettingsData);
    await settings.save();

    return settings;
  } catch (error) {
    console.error("Error updating salary settings:", error);
    throw new Error("Failed to update salary settings");
  }
};

/**
 * Update specific category in salary settings
 */
service.updateCategory = async (category, data, adminName) => {
  try {
    const currentSettings = await SalarySettings.findOne({
      isActive: true,
    }).lean();

    // If no settings, create defaults first
    let baseData =
      currentSettings || (await service.createDefaultSettings()).toObject();

    // Merge the specific category data
    if (baseData[category]) {
      baseData[category] = { ...baseData[category], ...data };
    } else {
      baseData[category] = data;
    }

    // Use the main update function to save as a new version
    return await service.updateSettings(baseData, adminName);
  } catch (error) {
    console.error(`Error updating category ${category}:`, error);
    throw new Error(`Failed to update ${category}`);
  }
};

/**
 * Get specific category settings
 */
service.getCategorySettings = async (category) => {
  try {
    const settings = await service.getSettings();

    if (!settings[category]) {
      // Return empty object if category doesn't exist yet to prevent crash
      return {};
    }

    return settings[category];
  } catch (error) {
    console.error(`Error fetching category ${category}:`, error);
    throw new Error(`Failed to fetch ${category} settings`);
  }
};

/**
 * Reset to default values
 */
service.resetToDefaults = async (adminName) => {
  try {
    // Deactivate all
    await SalarySettings.updateMany({}, { isActive: false });

    // Create fresh defaults
    const settings = await service.createDefaultSettings();

    // Update modified by
    settings.lastModifiedBy = adminName;
    await settings.save();

    return settings;
  } catch (error) {
    console.error("Error resetting to defaults:", error);
    throw new Error("Failed to reset to default settings");
  }
};

/**
 * Helper: Create default settings based on your Document
 */
service.createDefaultSettings = async () => {
  const defaultSettings = new SalarySettings({
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
    etisalat: {
      monthlyBillCap: 52.5,
      companyPays: 26.25,
      employeeBaseDeduction: 26.25,
    },
    mall: {
      oneWashRate: 3.0,
      monthlyRate: 1.35,
      fixedAllowance: 200,
      absentDeduction: 25,
      sundayAbsentDeduction: 50,
      sickLeavePay: 13.33,
    },
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
    slipTemplate: "template1",
    isActive: true,
    lastModifiedBy: "System",
  });

  await defaultSettings.save();
  return defaultSettings;
};

/**
 * Calculate salary based on employee type and configuration
 * Used for the "Calculator" feature in admin panel
 */
service.calculateSalary = async (employeeType, employeeData) => {
  try {
    const config = await service.getSettings();

    let calculation = {
      basicSalary: 0,
      extraWorkOt: 0,
      extraPaymentIncentive: 0,
      totalDebit: 0,
      breakdown: {},
    };

    switch (employeeType) {
      // Logic for Car Wash (Residential)
      case "carWash":
      case "carWashDay":
      case "carWashNight": {
        const location = employeeData.location || "";
        const totalCars = Number(employeeData.totalCars) || 0;

        // Determine if Day Duty (Ubora/Marina) or Night Duty (Others)
        const dayDutyBuildings =
          config.carWash.dayDuty.applicableBuildings || [];
        const isDayDuty = dayDutyBuildings.some((b) => location.includes(b));

        const ruleSet = isDayDuty
          ? config.carWash.dayDuty
          : config.carWash.nightDuty;

        // 1. Basic Pay
        calculation.basicSalary = totalCars * ruleSet.ratePerCar;

        // 2. Incentive
        if (totalCars < ruleSet.incentiveThreshold) {
          calculation.extraPaymentIncentive = ruleSet.incentiveLow;
        } else {
          calculation.extraPaymentIncentive = ruleSet.incentiveHigh;
        }

        calculation.totalDebit =
          calculation.basicSalary + calculation.extraPaymentIncentive;

        calculation.breakdown = {
          type: isDayDuty
            ? "Day Duty (Residential)"
            : "Night Duty (Residential)",
          totalCars,
          rate: ruleSet.ratePerCar,
          incentive: calculation.extraPaymentIncentive,
        };
        break;
      }

      // Logic for Mall
      case "mall": {
        const oneWashCount = Number(employeeData.carWashCount) || 0; // Direct washes
        const monthlyCount = Number(employeeData.monthlyVehicles) || 0; // Subscription cars
        const daysWorked = Number(employeeData.daysWorked) || 30;

        // 1. Commission Pay
        const washPay = oneWashCount * config.mall.oneWashRate;
        const monthlyPay = monthlyCount * config.mall.monthlyRate;
        calculation.basicSalary = washPay + monthlyPay;

        // 2. Fixed Allowance (Pro-rated)
        // Rule: 200 / 30 * Days Worked
        const dailyAllowanceRate = config.mall.fixedAllowance / 30;
        calculation.extraPaymentIncentive = dailyAllowanceRate * daysWorked;

        calculation.totalDebit =
          calculation.basicSalary + calculation.extraPaymentIncentive;

        calculation.breakdown = {
          directWashes: oneWashCount,
          directRate: config.mall.oneWashRate,
          monthlyCars: monthlyCount,
          monthlyRate: config.mall.monthlyRate,
          allowance: calculation.extraPaymentIncentive.toFixed(2),
        };
        break;
      }

      // Logic for Camp (Construction)
      case "constructionCamp":
      case "camp": {
        const role = employeeData.role || "helper"; // helper or mason
        const roleConfig = config.camp[role] || config.camp.helper;
        const settings = config.camp.settings;

        const daysPresent = Number(employeeData.daysPresent) || 0;
        const otHours = Number(employeeData.otHours) || 0;
        const absentDays = Number(employeeData.absentDays) || 0;

        // 1. Basic Salary (Pro-rated)
        // Rule: Base / 30 * Present Days
        const dailyBase = roleConfig.baseSalary / settings.standardDays;
        calculation.basicSalary = dailyBase * daysPresent;

        // 2. Overtime
        calculation.extraWorkOt = otHours * roleConfig.overtimeRate;

        // 3. Monthly Incentive (Full Attendance)
        if (daysPresent >= settings.standardDays && absentDays === 0) {
          calculation.extraPaymentIncentive = settings.monthlyIncentive;
        }

        calculation.totalDebit =
          calculation.basicSalary +
          calculation.extraWorkOt +
          calculation.extraPaymentIncentive;

        calculation.breakdown = {
          role,
          baseSalary: roleConfig.baseSalary,
          dailyRate: dailyBase.toFixed(2),
          daysPresent,
          otHours,
          otRate: roleConfig.overtimeRate,
          incentive: calculation.extraPaymentIncentive,
        };
        break;
      }

      // Logic for Outside Camp
      case "outsideCamp": {
        const position = employeeData.position || "helper";
        // Convert to lowercase to match keys if necessary, or ensure exact match
        const hourlyRate = config.outside[position] || config.outside.helper;
        const totalHours = Number(employeeData.totalHours) || 0;

        calculation.basicSalary = totalHours * hourlyRate;
        calculation.totalDebit = calculation.basicSalary;

        calculation.breakdown = {
          position,
          hourlyRate,
          totalHours,
        };
        break;
      }

      default:
        throw new Error(`Unknown employee type: ${employeeType}`);
    }

    // Formatting for UI
    calculation.basicSalary = Number(calculation.basicSalary.toFixed(2));
    calculation.extraWorkOt = Number(calculation.extraWorkOt.toFixed(2));
    calculation.extraPaymentIncentive = Number(
      calculation.extraPaymentIncentive.toFixed(2),
    );
    calculation.totalDebit = Number(calculation.totalDebit.toFixed(2));

    return calculation;
  } catch (error) {
    console.error("Error calculating salary:", error);
    throw new Error("Failed to calculate salary");
  }
};

module.exports = service;
