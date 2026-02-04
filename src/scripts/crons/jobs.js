const moment = require("moment-timezone");
const CustomersModel = require("../../server/api/models/customers.model");
const BuildingsModel = require("../../server/api/models/buildings.model");
const JobsModel = require("../../server/api/models/jobs.model");
const CounterService = require("../../server/utils/counters");

const cron = module.exports;

cron.run = async (targetDate = null) => {
  // If targetDate is provided, use it; otherwise default to tomorrow
  let tomorrowDate = targetDate
    ? moment.tz(targetDate, "Asia/Dubai").startOf("day")
    : moment().tz("Asia/Dubai").startOf("day").add(1, "day");
  let todayData = moment().tz("Asia/Dubai").startOf("day").tz("Asia/Dubai");

  // Determine if this is a manual run
  const isManualRun = !!targetDate;

  console.log(
    "Assign jobs is running on",
    moment().tz("Asia/Dubai").format(),
    "for the date",
    tomorrowDate.format("YYYY-MM-DD"),
    targetDate ? "(Manual Trigger)" : "(Auto Cron)",
  );

  // ✅ CHECK IF JOBS ALREADY EXIST FOR THIS DATE
  const startOfDay = new Date(tomorrowDate);
  const endOfDay = new Date(tomorrowDate);
  endOfDay.setHours(23, 59, 59, 999);

  const existingJobsCount = await JobsModel.countDocuments({
    assignedDate: {
      $gte: startOfDay,
      $lte: endOfDay,
    },
    isDeleted: { $ne: true }, // Don't count deleted jobs
  });

  if (existingJobsCount > 0) {
    console.log(
      `⚠️ Jobs already exist for ${tomorrowDate.format("YYYY-MM-DD")}. Found ${existingJobsCount} existing jobs. Skipping job creation.`,
    );
    return {
      jobsGenerated: 0,
      targetDate: tomorrowDate.format("YYYY-MM-DD"),
      runTime: moment().tz("Asia/Dubai").format(),
      skipped: true,
      reason: `${existingJobsCount} jobs already exist for this date`,
      existingJobs: existingJobsCount,
    };
  }

  // FIX: Added $ne: "" to filter out invalid empty strings that cause CastError
  let customers = JSON.parse(
    JSON.stringify(
      await CustomersModel.find({
        isDeleted: false,
        building: { $exists: true, $ne: "" },
      })
        .populate("building")
        .lean(),
    ),
  );

  const jobs = [];
  const scheduleId = await CounterService.id("scheduler");

  for (const iterator of customers) {
    // Safety check: if population failed (building is null), skip this customer
    if (!iterator.building) {
      console.log(
        `⚠️ Skipping customer ${iterator._id} - Building not found after populate.`,
      );
      continue;
    }

    for (const vehicle of iterator.vehicles) {
      console.log(
        `\n🚗 Processing vehicle ${vehicle._id} - Type: ${vehicle.schedule_type}, Status: ${vehicle.status}`,
      );

      if (
        vehicle.status == 2 &&
        moment(vehicle.deactivateDate).isBefore(tomorrowDate)
      ) {
        console.log("❌ Vehicle is inactive", vehicle._id, iterator._id);
        continue;
      } else if (moment(vehicle.start_date).isAfter(tomorrowDate)) {
        console.log(
          "❌ Vehicle start date is ahead",
          vehicle._id,
          iterator._id,
        );
        continue;
      }

      let assignedDate = new Date(tomorrowDate);

      if (iterator.building.schedule_today) {
        assignedDate = new Date(todayData);
      }

      if (vehicle.schedule_type == "daily") {
        console.log(
          `✅ Daily schedule for vehicle ${vehicle._id} (Customer: ${iterator.name})`,
        );
        jobs.push({
          scheduleId,
          vehicle: vehicle._id,
          assignedDate,
          customer: iterator._id,
          ...(vehicle.worker ? { worker: vehicle.worker } : {}),
          location: iterator.location,
          building: iterator.building._id,
          createdBy: isManualRun ? "Manual Scheduler" : "Cron Scheduler",
          ...(iterator.building.schedule_today ? { immediate: true } : null),
        });
      }

      if (vehicle.schedule_type == "weekly") {
        const targetDay = iterator.building.schedule_today
          ? todayData.get("day")
          : tomorrowDate.get("day");

        // Map day numbers to day names
        const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
        const targetDayName = dayNames[targetDay];

        console.log(
          `📅 Checking weekly schedule for vehicle ${vehicle._id} (Customer: ${iterator.name})`,
        );
        console.log(
          `   Target day: ${targetDay} (${tomorrowDate.format("dddd")}) - ${targetDayName}`,
        );
        console.log(`   Schedule days exists:`, !!vehicle.schedule_days);
        console.log(`   Schedule days:`, JSON.stringify(vehicle.schedule_days));

        if (!vehicle.schedule_days || vehicle.schedule_days.length === 0) {
          console.log(
            `   ⚠️ No schedule days defined for this vehicle, skipping`,
          );
          continue;
        }

        let isMatchFound = false;

        // Handle different formats of schedule_days
        if (Array.isArray(vehicle.schedule_days)) {
          // Check if it's an array of objects with .value property
          if (
            vehicle.schedule_days[0] &&
            typeof vehicle.schedule_days[0] === "object" &&
            "value" in vehicle.schedule_days[0]
          ) {
            // Format: [{day: "Mon", value: 1}, {day: "Tue", value: 2}]
            isMatchFound = vehicle.schedule_days.some(
              (e) => e.value == targetDay,
            );
          }
          // Check if it's an array of strings like ["Mon,Tue,Wed"]
          else if (
            vehicle.schedule_days[0] &&
            typeof vehicle.schedule_days[0] === "string"
          ) {
            // Format: ["Mon,Tue,Wed,Thu,Fri,Sat,Sun"]
            const daysString = vehicle.schedule_days.join(",");
            isMatchFound = daysString.includes(targetDayName);
            console.log(
              `   Checking if "${daysString}" includes "${targetDayName}": ${isMatchFound}`,
            );
          }
        }

        console.log(`   Match found:`, isMatchFound);

        if (isMatchFound) {
          console.log(`✅ Weekly schedule matched for vehicle ${vehicle._id}`);
          jobs.push({
            scheduleId,
            vehicle: vehicle._id,
            assignedDate,
            customer: iterator._id,
            ...(vehicle.worker ? { worker: vehicle.worker } : {}),
            location: iterator.location,
            building: iterator.building._id,
            createdBy: isManualRun ? "Manual Scheduler" : "Cron Scheduler",
            ...(iterator.building.schedule_today ? { immediate: true } : null),
          });
        } else {
          console.log(`   ❌ No matching day found for vehicle ${vehicle._id}`);
        }
      }
    }
  }

  if (jobs.length > 0) {
    await JobsModel.insertMany(jobs);
    console.log(`Assign jobs completed. Generated ${jobs.length} jobs.`);
  } else {
    console.log("Assign jobs completed. No jobs generated.");
  }

  return {
    jobsGenerated: jobs.length,
    targetDate: tomorrowDate.format("YYYY-MM-DD"),
    runTime: moment().tz("Asia/Dubai").format(),
  };
};
