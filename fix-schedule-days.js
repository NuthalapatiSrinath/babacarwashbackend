const utils = require("./src/server/utils");
const database = require("./src/server/database");
const Customer = require("./src/server/api/models/customers.model");

// Map for converting day names to numbers
const dayToNumber = {
  sun: 0,
  sunday: 0,
  mon: 1,
  monday: 1,
  tue: 2,
  tuesday: 2,
  wed: 3,
  wednesday: 3,
  thu: 4,
  thursday: 4,
  fri: 5,
  friday: 5,
  sat: 6,
  saturday: 6,
};

// Map for normalizing short names to full names
const dayToFullName = {
  sun: "Sunday",
  sunday: "Sunday",
  mon: "Monday",
  monday: "Monday",
  tue: "Tuesday",
  tuesday: "Tuesday",
  wed: "Wednesday",
  wednesday: "Wednesday",
  thu: "Thursday",
  thursday: "Thursday",
  fri: "Friday",
  friday: "Friday",
  sat: "Saturday",
  saturday: "Saturday",
};

async function fixScheduleDays() {
  try {
    const utilsData = utils.initialize();
    await database.initialize(utilsData);
    console.log("✅ Connected to MongoDB");

    const customers = await Customer.find({
      "vehicles.schedule_type": "weekly",
    });

    console.log(
      `\n📊 Found ${customers.length} customers with weekly schedules`,
    );

    let fixedCount = 0;
    let issuesFixed = 0;

    for (const customer of customers) {
      let needsUpdate = false;

      for (const vehicle of customer.vehicles) {
        if (
          vehicle.schedule_type === "weekly" &&
          vehicle.schedule_days &&
          Array.isArray(vehicle.schedule_days)
        ) {
          for (let i = 0; i < vehicle.schedule_days.length; i++) {
            const scheduleDay = vehicle.schedule_days[i];

            // Case 1: Object with day and value properties
            if (typeof scheduleDay === "object" && scheduleDay.day) {
              const dayLower = scheduleDay.day.toLowerCase();
              const correctValue = dayToNumber[dayLower];
              const correctDayName = dayToFullName[dayLower];

              if (correctValue !== undefined) {
                let fixed = false;

                // Fix incorrect value
                if (
                  scheduleDay.value === -1 ||
                  scheduleDay.value === undefined ||
                  scheduleDay.value !== correctValue
                ) {
                  console.log(
                    `🔧 Fixing value for vehicle ${vehicle.registration_no}: "${scheduleDay.day}" value ${scheduleDay.value} → ${correctValue}`,
                  );
                  scheduleDay.value = correctValue;
                  fixed = true;
                }

                // Normalize day name (Wed → Wednesday)
                if (
                  correctDayName &&
                  scheduleDay.day !== correctDayName &&
                  scheduleDay.day.toLowerCase() !== correctDayName.toLowerCase()
                ) {
                  console.log(
                    `🔧 Normalizing day name for vehicle ${vehicle.registration_no}: "${scheduleDay.day}" → "${correctDayName}"`,
                  );
                  scheduleDay.day = correctDayName;
                  fixed = true;
                }

                if (fixed) {
                  needsUpdate = true;
                  issuesFixed++;
                }
              }
            }
            // Case 2: Plain string (shouldn't happen, but handle it)
            else if (typeof scheduleDay === "string") {
              const dayLower = scheduleDay.toLowerCase();
              const correctValue = dayToNumber[dayLower];
              const correctDayName = dayToFullName[dayLower];

              if (correctValue !== undefined && correctDayName) {
                console.log(
                  `🔧 Converting string to object for vehicle ${vehicle.registration_no}: "${scheduleDay}" → {day: "${correctDayName}", value: ${correctValue}}`,
                );
                vehicle.schedule_days[i] = {
                  day: correctDayName,
                  value: correctValue,
                };
                needsUpdate = true;
                issuesFixed++;
              }
            }
          }
        }
      }

      if (needsUpdate) {
        await customer.save();
        fixedCount++;
      }
    }

    console.log(`\n✅ Fixed ${issuesFixed} issues in ${fixedCount} customers`);
    process.exit(0);
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
}

fixScheduleDays();
