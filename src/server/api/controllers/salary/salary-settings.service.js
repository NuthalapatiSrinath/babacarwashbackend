const SalarySettings = require("../../models/salary-settings.model");

/**
 * Get salary settings (always returns active configuration)
 */
exports.getSettings = async () => {
  try {
    let settings = await SalarySettings.findOne({ isActive: true }).lean();

    // If no settings exist, create default
    if (!settings) {
      settings = await createDefaultSettings();
    }

    return settings;
  } catch (error) {
    console.error("Error fetching salary settings:", error);
    throw new Error("Failed to fetch salary settings");
  }
};

/**
 * Update salary settings
 */
exports.updateSettings = async (data, adminName) => {
  try {
    let settings = await SalarySettings.findOne({ isActive: true });

    if (!settings) {
      // Create new if doesn't exist
      settings = new SalarySettings(data);
    } else {
      // Update existing
      Object.assign(settings, data);
    }

    settings.lastModifiedBy = adminName;
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
exports.updateCategory = async (category, data, adminName) => {
  try {
    let settings = await SalarySettings.findOne({ isActive: true });

    if (!settings) {
      settings = await createDefaultSettings();
    }

    // Validate category exists
    if (!settings[category]) {
      throw new Error(`Invalid category: ${category}`);
    }

    // Update the specific category
    settings[category] = { ...settings[category], ...data };
    settings.lastModifiedBy = adminName;
    await settings.save();

    return settings;
  } catch (error) {
    console.error(`Error updating category ${category}:`, error);
    throw new Error(`Failed to update ${category}`);
  }
};

/**
 * Get specific category settings
 */
exports.getCategorySettings = async (category) => {
  try {
    const settings = await SalarySettings.findOne({ isActive: true }).lean();

    if (!settings) {
      const defaultSettings = await createDefaultSettings();
      return defaultSettings[category];
    }

    if (!settings[category]) {
      throw new Error(`Invalid category: ${category}`);
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
exports.resetToDefaults = async (adminName) => {
  try {
    // Deactivate current settings
    await SalarySettings.updateMany({}, { isActive: false });

    // Create new default settings
    const settings = await createDefaultSettings();
    settings.lastModifiedBy = adminName;
    await settings.save();

    return settings;
  } catch (error) {
    console.error("Error resetting to defaults:", error);
    throw new Error("Failed to reset to default settings");
  }
};

/**
 * Helper: Create default settings
 */
async function createDefaultSettings() {
  const defaultSettings = new SalarySettings({
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
    lastModifiedBy: "System",
  });

  await defaultSettings.save();
  return defaultSettings;
}

/**
 * Calculate salary based on employee type and configuration
 */
exports.calculateSalary = async (employeeType, employeeData) => {
  try {
    const config = await exports.getSettings();

    let calculation = {
      basicSalary: 0,
      extraWorkOt: 0,
      extraPaymentIncentive: 0,
      totalDebit: 0,
      breakdown: {},
    };

    switch (employeeType) {
      case "carWashDay": {
        const rate = config.carWashDayDuty.ratePerCar;
        calculation.basicSalary = employeeData.totalCars * rate;

        if (employeeData.totalCars < 1000) {
          calculation.extraPaymentIncentive =
            config.carWashDayDuty.incentiveLessThan1000;
        } else {
          calculation.extraPaymentIncentive =
            config.carWashDayDuty.incentiveMoreThan1000;
        }

        calculation.totalDebit =
          calculation.basicSalary + calculation.extraPaymentIncentive;
        calculation.breakdown = {
          totalCars: employeeData.totalCars,
          ratePerCar: rate,
          incentive: calculation.extraPaymentIncentive,
        };
        break;
      }

      case "carWashNight": {
        const rate = config.carWashNightDuty.ratePerCar;
        calculation.basicSalary = employeeData.totalCars * rate;

        if (employeeData.totalCars < 1000) {
          calculation.extraPaymentIncentive =
            config.carWashNightDuty.incentiveLessThan1000;
        } else {
          calculation.extraPaymentIncentive =
            config.carWashNightDuty.incentiveMoreThan1000;
        }

        calculation.totalDebit =
          calculation.basicSalary + calculation.extraPaymentIncentive;
        calculation.breakdown = {
          totalCars: employeeData.totalCars,
          ratePerCar: rate,
          incentive: calculation.extraPaymentIncentive,
        };
        break;
      }

      case "mall": {
        const carWashIncome =
          employeeData.carWashCount * config.mallEmployees.carWashRate;
        const monthlyVehiclesIncome =
          employeeData.monthlyVehicles *
          config.mallEmployees.monthlyVehiclesRate;
        calculation.basicSalary = carWashIncome + monthlyVehiclesIncome;

        // Calculate prorated extra payment
        const daysWorked = employeeData.daysWorked || 30;
        calculation.extraPaymentIncentive =
          (config.mallEmployees.fixedExtraPayment / 30) * daysWorked;

        calculation.totalDebit =
          calculation.basicSalary + calculation.extraPaymentIncentive;
        calculation.breakdown = {
          carWashCount: employeeData.carWashCount,
          monthlyVehicles: employeeData.monthlyVehicles,
          daysWorked: daysWorked,
          carWashIncome: carWashIncome.toFixed(2),
          monthlyVehiclesIncome: monthlyVehiclesIncome.toFixed(2),
          extraPayment: calculation.extraPaymentIncentive.toFixed(2),
        };
        break;
      }

      case "constructionCamp": {
        const role = employeeData.role || "helper";
        const roleConfig = config.constructionCamp[role];
        const daysPresent = employeeData.daysPresent || 0;

        // Basic salary
        calculation.basicSalary =
          (roleConfig.baseSalary /
            config.constructionCamp.standardWorkingDays) *
          daysPresent;

        // Overtime
        const overtimeHours =
          config.constructionCamp.actualWorkingHours -
          config.constructionCamp.normalWorkingHours;
        calculation.extraWorkOt =
          overtimeHours * roleConfig.overtimeRate * daysPresent;

        // Monthly incentive
        if (
          daysPresent >= config.constructionCamp.standardWorkingDays &&
          employeeData.absentDays === 0
        ) {
          calculation.extraPaymentIncentive =
            config.constructionCamp.monthlyIncentive;
        }

        calculation.totalDebit =
          calculation.basicSalary +
          calculation.extraWorkOt +
          calculation.extraPaymentIncentive;
        calculation.breakdown = {
          role: role,
          baseSalary: roleConfig.baseSalary,
          daysPresent: daysPresent,
          overtimeHours: overtimeHours,
          overtimeRate: roleConfig.overtimeRate,
          incentive: calculation.extraPaymentIncentive,
        };
        break;
      }

      case "outsideCamp": {
        const position = employeeData.position || "helper";
        const hourlyRate = config.outsideCamp[position];
        const totalHours = employeeData.totalHours || 0;

        calculation.basicSalary = totalHours * hourlyRate;
        calculation.totalDebit = calculation.basicSalary;
        calculation.breakdown = {
          position: position,
          hourlyRate: hourlyRate,
          totalHours: totalHours,
        };
        break;
      }

      default:
        throw new Error(`Unknown employee type: ${employeeType}`);
    }

    return calculation;
  } catch (error) {
    console.error("Error calculating salary:", error);
    throw new Error("Failed to calculate salary");
  }
};
