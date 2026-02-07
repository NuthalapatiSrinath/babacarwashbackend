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

  // For manual runs, todayData should be relative to targetDate (day before target)
  // For auto runs, todayData is the actual current day
  let todayData = targetDate
    ? moment.tz(targetDate, "Asia/Dubai").startOf("day").subtract(1, "day")
    : moment().tz("Asia/Dubai").startOf("day").tz("Asia/Dubai");

  // Determine if this is a manual run
  const isManualRun = !!targetDate;

  console.log(
    "Assign jobs is running on",
    moment().tz("Asia/Dubai").format(),
    "for the date",
    tomorrowDate.format("YYYY-MM-DD"),
    targetDate ? "(Manual Trigger)" : "(Auto Cron)",
  );

  // Check if target date is Sunday - if so, only create weekly jobs, skip dailies
  const targetDayOfWeek = tomorrowDate.day();
  const isSunday = targetDayOfWeek === 0;

  console.log(`\n========================================`);
  console.log(`📅 TARGET DATE: ${tomorrowDate.format("YYYY-MM-DD dddd")}`);
  console.log(
    `📅 DAY OF WEEK: ${targetDayOfWeek} (${["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][targetDayOfWeek]})`,
  );
  console.log(`📅 IS SUNDAY: ${isSunday}`);
  console.log(`========================================\n`);

  if (isSunday) {
    console.log(
      `⚠️⚠️⚠️ Target date ${tomorrowDate.format("YYYY-MM-DD")} is SUNDAY - Daily jobs will be skipped! ⚠️⚠️⚠️\n`,
    );
  }

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

  let dailyJobsCreated = 0;
  let dailyJobsSkipped = 0;
  let weeklyJobsCreated = 0;
  let weeklyJobsSkipped = 0;

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

      // Determine the assigned date
      let assignedDate;
      let assignedDateMoment; // Keep moment version for day checking

      // FIXED: Always use tomorrow's date (target date) for scheduling
      // The schedule_today flag should only control the 'immediate' flag, not the assigned date
      // This ensures consistency between manual and auto schedulers
      assignedDateMoment = tomorrowDate.clone();
      assignedDate = tomorrowDate.toDate();

      if (vehicle.schedule_type == "daily") {
        // Skip Sunday (0 = Sunday) for daily schedules
        // IMPORTANT: Check day on moment object directly (preserves timezone)
        const assignedDay = assignedDateMoment.day();

        console.log(
          `🔍 [DAILY CHECK] Vehicle ${vehicle._id}: Date=${assignedDateMoment.format("YYYY-MM-DD")}, Day=${assignedDay} (${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][assignedDay]})`,
        );

        if (assignedDay === 0) {
          console.log(
            `⏭️ [SKIP SUNDAY] Vehicle ${vehicle._id} - Daily schedule, Sunday excluded`,
          );
          dailyJobsSkipped++;
          continue;
        }

        console.log(
          `✅ Daily schedule for vehicle ${vehicle._id} (Customer: ${iterator.name})`,
        );
        dailyJobsCreated++;
        jobs.push({
          scheduleId,
          vehicle: vehicle._id,
          assignedDate,
          customer: iterator._id,
          ...(vehicle.worker ? { worker: vehicle.worker } : {}),
          location: iterator.location,
          building: iterator.building._id,
          createdBy: isManualRun ? "Manual Scheduler" : "Cron Scheduler",
          ...(!isManualRun && iterator.building.schedule_today
            ? { immediate: true }
            : null),
        });
      }

      if (vehicle.schedule_type == "weekly") {
        // IMPORTANT: Check day on moment object directly (preserves timezone)
        const targetDay = assignedDateMoment.day();

        // Map day numbers to day names
        const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
        const targetDayName = dayNames[targetDay];

        console.log(
          `📅 Checking weekly schedule for vehicle ${vehicle._id} (Customer: ${iterator.name})`,
        );
        console.log(
          `   Target date: ${assignedDateMoment.format("YYYY-MM-DD dddd")}, day=${targetDay} (${targetDayName})`,
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
          weeklyJobsCreated++;
          jobs.push({
            scheduleId,
            vehicle: vehicle._id,
            assignedDate,
            customer: iterator._id,
            ...(vehicle.worker ? { worker: vehicle.worker } : {}),
            location: iterator.location,
            building: iterator.building._id,
            createdBy: isManualRun ? "Manual Scheduler" : "Cron Scheduler",
            ...(!isManualRun && iterator.building.schedule_today
              ? { immediate: true }
              : null),
          });
        } else {
          console.log(`   ❌ No matching day found for vehicle ${vehicle._id}`);
          weeklyJobsSkipped++;
        }
      }
    }
  }

  console.log(`\n========================================`);
  console.log(`📊 JOB CREATION SUMMARY`);
  console.log(`========================================`);
  console.log(`Daily Jobs Created: ${dailyJobsCreated}`);
  console.log(`Daily Jobs Skipped (Sunday): ${dailyJobsSkipped}`);
  console.log(`Weekly Jobs Created: ${weeklyJobsCreated}`);
  console.log(`Weekly Jobs Skipped (No Match): ${weeklyJobsSkipped}`);
  console.log(`Total Jobs: ${jobs.length}`);
  console.log(`========================================\n`);

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
