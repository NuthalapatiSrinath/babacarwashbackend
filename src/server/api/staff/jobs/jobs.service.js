const moment = require("moment-timezone");
const JobsModel = require("../../models/jobs.model");
const CustomersModel = require("../../models/customers.model");
const BookingsModel = require("../../models/bookings.model");
const PaymentsModel = require("../../models/payments.model");
const UsersModel = require("../../models/users.model");
const CounterService = require("../../../utils/counters");
const AuthHelper = require("../auth/auth.helper");
const mongoose = require("mongoose");
const service = module.exports;

const normalizeObjectId = (value) => {
  if (value == null) return null;

  if (value instanceof mongoose.Types.ObjectId) {
    return value.toString();
  }

  if (typeof value === "string" && mongoose.Types.ObjectId.isValid(value)) {
    return value;
  }

  if (typeof value === "object") {
    const nested = value._id ?? value.id;
    if (
      nested instanceof mongoose.Types.ObjectId ||
      (typeof nested === "string" && mongoose.Types.ObjectId.isValid(nested))
    ) {
      return nested.toString();
    }
  }

  return null;
};

const areSameId = (a, b) => {
  const left = normalizeObjectId(a) || String(a ?? "");
  const right = normalizeObjectId(b) || String(b ?? "");
  return left && right && left === right;
};

const getMobileAddressText = (job) => {
  if (typeof job?.address === "string" && job.address.trim()) {
    return job.address.trim();
  }

  if (
    job?.location &&
    typeof job.location === "string" &&
    job.location.trim()
  ) {
    return job.location.trim();
  }

  const map = job?.locationMap;
  if (!map) return "Current Location";
  if (typeof map === "string" && map.trim()) return map.trim();

  if (typeof map === "object") {
    const parts = [
      map.address,
      map.formatted_address,
      map.place_name,
      map.name,
      map.locality,
      map.city,
      map.state,
      map.country,
    ]
      .filter((x) => typeof x === "string" && x.trim())
      .map((x) => x.trim());
    if (parts.length) return [...new Set(parts)].join(", ");
  }

  return "Current Location";
};

service.list = async (userInfo, query) => {
  // Residence workers use 18:30-to-18:30 shift windows.
  // Non-residence workers use normal Dubai calendar day windows.

  const now = moment().tz("Asia/Dubai");
  const currentHour = now.hours();
  const currentMinute = now.minutes();
  const useResidenceShift = userInfo.service_type === "residence";

  let startTime, endTime;

  if (useResidenceShift) {
    // Check if current time is before or after 18:30
    if (currentHour < 18 || (currentHour === 18 && currentMinute < 30)) {
      // Before 18:30 → show yesterday 18:30 to today 18:30
      startTime = moment()
        .tz("Asia/Dubai")
        .subtract(1, "day")
        .hours(18)
        .minutes(30)
        .seconds(0)
        .milliseconds(0);
      endTime = moment()
        .tz("Asia/Dubai")
        .hours(18)
        .minutes(30)
        .seconds(0)
        .milliseconds(0);
    } else {
      // After 18:30 → show today 18:30 to tomorrow 18:30
      startTime = moment()
        .tz("Asia/Dubai")
        .hours(18)
        .minutes(30)
        .seconds(0)
        .milliseconds(0);
      endTime = moment()
        .tz("Asia/Dubai")
        .add(1, "day")
        .hours(18)
        .minutes(30)
        .seconds(0)
        .milliseconds(0);
    }
  } else {
    // Non-residence default: current Dubai calendar day
    startTime = moment()
      .tz("Asia/Dubai")
      .startOf("day")
      .seconds(0)
      .milliseconds(0);
    endTime = moment().tz("Asia/Dubai").endOf("day");
  }

  console.log(
    "📋 [STAFF JOBS LIST] ==========================================",
  );
  console.log("📋 Worker ID:", userInfo._id);
  console.log("📋 Current Dubai Time:", now.format("YYYY-MM-DD HH:mm:ss"));
  console.log(
    "📋 Shift Window: ",
    startTime.format("YYYY-MM-DD HH:mm"),
    "→",
    endTime.format("YYYY-MM-DD HH:mm"),
  );
  console.log(
    "📋 Window Mode:",
    useResidenceShift ? "residence-shift" : "calendar-day",
  );
  console.log("📋 Query Status:", query.status || "pending (default)");

  // Base query for current shift (used for pending/completed counts)
  const currentShiftQuery = {
    worker: userInfo._id,
    isDeleted: false,
    assignedDate: {
      $gte: startTime.toDate(),
      $lte: endTime.toDate(),
    },
  };

  // Query for displaying data (deep copy to avoid modifying currentShiftQuery)
  const findQuery = {
    worker: userInfo._id,
    isDeleted: false,
    assignedDate: {
      $gte: startTime.toDate(),
      $lte: endTime.toDate(),
    },
    ...(query.status ? { status: query.status } : { status: "pending" }),
  };

  console.log("📋 Find Query:", JSON.stringify(findQuery, null, 2));

  // Debug: Check ALL jobs for this worker to see what's in DB
  const allWorkerJobs = await JobsModel.find({
    worker: userInfo._id,
    isDeleted: false,
  })
    .select("assignedDate status immediate createdBy")
    .limit(10)
    .lean();

  console.log("📋 Sample jobs for this worker (up to 10):");
  allWorkerJobs.forEach((job) => {
    console.log(
      `   - ${job._id}: ${moment(job.assignedDate).tz("Asia/Dubai").format("YYYY-MM-DD HH:mm:ss")} | Status: ${job.status} | Immediate: ${job.immediate} | By: ${job.createdBy}`,
    );
  });

  // For rejected tab, extend date range to last 7 days
  if (query.status == "rejected") {
    findQuery.assignedDate.$gte = startTime
      .clone()
      .subtract(7, "days")
      .toDate();
  }

  if (query.search) {
    const customers = await CustomersModel.find({
      isDeleted: false,
      $or: [
        { "vehicles.registration_no": { $regex: query.search, $options: "i" } },
        { "vehicles.parking_no": { $regex: query.search, $options: "i" } },
      ],
    }).lean();

    if (customers.length) {
      let vehicles = [];
      for (const customer of customers) {
        for (const vehicle of customer.vehicles) {
          vehicles.push(vehicle._id);
        }
      }
      findQuery.vehicle = { $in: vehicles };
    }
  }

  // Rejected query: extend date range to last 7 days for rejected count
  const rejectedQuery = {
    worker: userInfo._id,
    isDeleted: false,
    assignedDate: {
      $gte: startTime.clone().subtract(7, "days").toDate(),
      $lte: endTime.toDate(),
    },
  };

  console.log(
    "📋 Current Shift Query (for pending/completed):",
    JSON.stringify(currentShiftQuery, null, 2),
  );
  console.log(
    "📋 Rejected Query (7 days):",
    JSON.stringify(rejectedQuery, null, 2),
  );

  const isValidCustomerBookingJob = async (queryObj) => {
    const jobs = await JobsModel.find(queryObj)
      .select("booking createdBy")
      .lean();
    if (!jobs.length) return 0;

    const bookingIds = jobs
      .filter((j) => j.createdBy === "Customer Booking" && j.booking)
      .map((j) => String(j.booking));

    const existingBookingSet = new Set();
    if (bookingIds.length) {
      const existing = await BookingsModel.find({
        _id: { $in: [...new Set(bookingIds)] },
      })
        .select("_id")
        .lean();
      for (const b of existing) {
        existingBookingSet.add(String(b._id));
      }
    }

    return jobs.filter((j) => {
      if (j.createdBy !== "Customer Booking") return true;
      if (!j.booking) return false;
      return existingBookingSet.has(String(j.booking));
    }).length;
  };

  // Counts: Pending/Completed use current shift, Rejected uses 7-day range.
  // For customer-created jobs, exclude orphan records whose booking no longer exists.
  const counts = {
    pending: await isValidCustomerBookingJob({
      ...currentShiftQuery,
      status: "pending",
    }),
    completed: await isValidCustomerBookingJob({
      ...currentShiftQuery,
      status: "completed",
    }),
    rejected: await isValidCustomerBookingJob({
      ...rejectedQuery,
      status: "rejected",
    }),
  };

  console.log(
    "📋 Counts - Pending:",
    counts.pending,
    "| Completed:",
    counts.completed,
    "| Rejected:",
    counts.rejected,
  );

  let data = await JobsModel.find(findQuery)
    .sort({ _id: -1 })
    .populate([{ path: "customer", model: "customers" }])
    .lean();

  const locationIds = new Set();
  const buildingIds = new Set();

  for (const item of data) {
    const locationId = normalizeObjectId(item.location);
    const buildingId = normalizeObjectId(item.building);

    if (locationId) locationIds.add(locationId);
    if (buildingId) buildingIds.add(buildingId);
  }

  const [locations, buildingDocs] = await Promise.all([
    locationIds.size
      ? mongoose
          .model("locations")
          .find(
            { _id: { $in: [...locationIds] }, isDeleted: false },
            { address: 1 },
          )
          .lean()
      : Promise.resolve([]),
    buildingIds.size
      ? mongoose
          .model("buildings")
          .find(
            { _id: { $in: [...buildingIds] }, isDeleted: false },
            { name: 1 },
          )
          .lean()
      : Promise.resolve([]),
  ]);

  const locationMap = new Map(locations.map((l) => [String(l._id), l]));
  const buildingMap = new Map(buildingDocs.map((b) => [String(b._id), b]));

  for (const item of data) {
    const locationId = normalizeObjectId(item.location);
    const buildingId = normalizeObjectId(item.building);

    if (locationId) {
      item.location = locationMap.get(locationId) || {
        _id: locationId,
        address: "Unknown Location",
      };
    } else if (item.service_type === "mobile") {
      item.location = {
        _id: `mobile-location-${item._id}`,
        address: getMobileAddressText(item),
      };
    } else {
      item.location =
        item.location && typeof item.location === "object"
          ? item.location
          : null;
    }

    if (buildingId) {
      item.building = buildingMap.get(buildingId) || {
        _id: buildingId,
        name: "Unknown Building",
      };
    } else if (item.service_type === "mobile") {
      item.building = {
        _id: `mobile-building-${item._id}`,
        name: "Mobile Wash",
      };
    } else {
      item.building =
        item.building && typeof item.building === "object"
          ? item.building
          : null;
    }
  }

  const customerBookingIds = data
    .filter((j) => j.createdBy === "Customer Booking" && j.booking)
    .map((j) => String(j.booking));

  const existingBookingSet = new Set();
  if (customerBookingIds.length) {
    const existingBookings = await BookingsModel.find({
      _id: { $in: [...new Set(customerBookingIds)] },
    })
      .select("_id")
      .lean();
    for (const b of existingBookings) {
      existingBookingSet.add(String(b._id));
    }
  }

  data = data.filter((job) => {
    if (job.createdBy !== "Customer Booking") return true;
    if (!job.booking) return false;
    return existingBookingSet.has(String(job.booking));
  });

  const total = data.length;

  console.log("📋 Counts:", counts);
  console.log("📋 Total Jobs Found:", total);
  console.log("📋 Data Length:", data.length);
  if (data.length > 0) {
    console.log("📋 First Job Sample:", JSON.stringify(data[0], null, 2));
  } else {
    console.log("📋 ❌ NO JOBS FOUND!");
  }

  const jobsMap = {};

  for (const iterator of data) {
    if (!iterator.customer) {
      continue;
    }

    const customerVehicles = Array.isArray(iterator.customer.vehicles)
      ? iterator.customer.vehicles
      : [];

    iterator.vehicle =
      customerVehicles.find((vehicle) =>
        areSameId(vehicle?._id, iterator.vehicle),
      ) || null;

    let key = ["mobile", "mall"].includes(iterator.service_type)
      ? iterator.service_type.toUpperCase()
      : `${iterator.location?._id || `loc-${iterator._id}`}-${iterator.building?._id || `bld-${iterator._id}`}`;
    if (jobsMap[key]) {
      jobsMap[key].jobs.push(iterator);
    } else {
      jobsMap[key] = {
        location: iterator.location,
        building: iterator.building,
        jobs: [iterator],
        service_type: iterator.service_type,
      };
    }
  }

  const jobsDataMap = [];
  const buildings = [];

  for (const key in jobsMap) {
    buildings.push(jobsMap[key].building);
    jobsDataMap.push({
      location: jobsMap[key].location,
      building: jobsMap[key].building,
      jobs: jobsMap[key].jobs,
      service_type: jobsMap[key].service_type,
    });
  }

  console.log("📋 Final Result - jobsDataMap length:", jobsDataMap.length);
  console.log("📋 Final Result - buildings:", buildings.length);
  console.log(
    "📋 [STAFF JOBS LIST] END ==========================================",
  );

  return { total, data: jobsDataMap, counts, buildings };
};

service.info = async (userInfo, id) => {
  return JobsModel.findOne({ _id: id, isDeleted: false }).lean();
};

service.create = async (userInfo, payload) => {
  const id = await CounterService.id("workers");
  const data = {
    createdBy: userInfo._id,
    createdByName: userInfo.name || "Unknown",
    createdSource: "Staff App",
    updatedBy: userInfo._id,
    id,
    ...payload,
    hPassword: AuthHelper.getPasswordHash(payload.password),
  };
  await new JobsModel(data).save();
};

service.update = async (userInfo, id, payload) => {
  await JobsModel.updateOne({ _id: id }, { $set: payload });
};

service.delete = async (userInfo, id, payload) => {
  return await JobsModel.updateOne(
    { _id: id },
    { isDeleted: true, deletedBy: userInfo._id },
  );
};

service.undoDelete = async (userInfo, id) => {
  return await JobsModel.updateOne(
    { _id: id },
    { isDeleted: false, updatedBy: userInfo._id },
  );
};

service.jobCompleted = async (userInfo, id, payload) => {
  const jobData = await JobsModel.findOne({ _id: id }).lean();
  const data = {
    status: "completed",
    completedDate: new Date(),
    updatedBy: userInfo._id,
  };

  await JobsModel.updateOne({ _id: id }, { $set: data });

  if (jobData.createdBy == "Customer Booking") {
    const bookingData = await BookingsModel.findOne({
      _id: jobData.booking,
    }).lean();
    const assignedWorkerId =
      jobData.worker || bookingData?.worker || userInfo._id;
    const usersData = JSON.parse(
      JSON.stringify(
        await CustomersModel.findOne({ _id: bookingData.customer }).lean(),
      ),
    );
    const vehicleData = usersData.vehicles.find(
      (e) => e._id == bookingData.vehicle,
    );
    const paymentId = await CounterService.id("payments");
    const totalAmount = Number(bookingData.amount || 0);
    const amountPaid = 0;
    const balance = Math.max(0, totalAmount - amountPaid);
    const paymentStatus = balance <= 0 ? "completed" : "pending";
    const paymentData = {
      id: paymentId,
      job: id,
      amount_charged: totalAmount,
      total_amount: totalAmount,
      amount_paid: amountPaid,
      balance,
      vehicle: {
        registration_no: vehicleData.registration_no,
        parking_no: vehicleData.parking_no,
      },
      customer: bookingData.customer,
      worker: assignedWorkerId,
      service_type: bookingData.service_type,
      ...(bookingData.mall ? { mall: bookingData.mall } : null),
      ...(bookingData.building ? { building: bookingData.building } : null),
      createdBy: userInfo._id,
      updatedBy: userInfo._id,
      onewash: false,
      status: paymentStatus,
      settled: paymentStatus === "completed" ? "completed" : "pending",
      ...(paymentStatus === "completed"
        ? { collectedDate: new Date(), settledDate: new Date() }
        : null),
    };
    await new PaymentsModel(paymentData).save();

    // Keep booking worker in sync with the actual completed job worker.
    if (
      !bookingData?.worker ||
      String(bookingData.worker) !== String(assignedWorkerId)
    ) {
      await BookingsModel.updateOne(
        { _id: jobData.booking },
        { $set: { worker: assignedWorkerId } },
      );
    }

    await BookingsModel.updateOne({ _id: jobData.booking }, { $set: data });
  }
};

service.jobRejected = async (userInfo, id, payload) => {
  // Handle both rejectReason (from old app versions) and rejectionReason (schema field)
  const rejectionReason = payload.rejectionReason || payload.rejectReason;

  const data = {
    status: "rejected",
    rejectionReason: rejectionReason,
    completedDate: new Date(),
    updatedBy: userInfo._id,
  };
  await JobsModel.updateOne({ _id: id }, { $set: data });
};

service.createJob = async (
  customer,
  createdBy = "Cron Scheduler",
  createdSource = null,
  bookingId = null,
) => {
  console.log(
    `🔧 [CREATE JOB] Starting for customer ${customer._id || customer.mobile}, createdBy: ${createdBy}`,
  );
  console.log(
    `🔧 [CREATE JOB] Customer has ${customer.vehicles?.length || 0} vehicles`,
  );

  const todayDate = moment().tz("Asia/Dubai").startOf("day").tz("Asia/Dubai");
  const jobs = [];

  for (const vehicle of customer.vehicles) {
    if (createdBy == "Customer Booking") {
      vehicle.start_date = moment(vehicle.start_date)
        .startOf("day")
        .tz("Asia/Dubai");
    }

    if (
      vehicle.status == 2 &&
      moment(vehicle.deactivateDate).isBefore(todayDate)
    ) {
      console.log("Vehicle is inactive", vehicle._id, customer._id);
      continue;
    } else if (moment(vehicle.start_date).isAfter(todayDate)) {
      console.log("Vehicle start date is ahead", vehicle._id, customer._id);
      continue;
    }

    if (vehicle.schedule_type == "daily") {
      // Skip Sundays for daily schedules (0 = Sunday)
      const todayDayNumber = todayDate.get("day");
      if (todayDayNumber !== 0) {
        jobs.push({
          vehicle: vehicle._id,
          assignedDate: new Date(todayDate),
          customer: customer._id,
          worker: vehicle.worker || null,
          location: customer.location || null,
          building: customer.building || null,
          ...(bookingId ? { booking: bookingId } : null),
          createdBy,
          createdByName: createdBy,
          createdSource:
            createdSource ||
            (createdBy === "Customer Booking" ? "Customer App" : "Cron Job"),
          immediate: true,
        });
      } else {
        console.log(
          `⏭️ [CREATE JOB] Skipping daily vehicle ${vehicle.registration_no} - Sunday excluded`,
        );
      }
    }

    if (vehicle.schedule_type == "weekly") {
      // Parse schedule_days to get day numbers (0=Sunday, 1=Monday, etc.)
      let scheduledDayNumbers = [];

      const dayNameToNumber = {
        Sun: 0,
        Sunday: 0,
        Mon: 1,
        Monday: 1,
        Tue: 2,
        Tuesday: 2,
        Wed: 3,
        Wednesday: 3,
        Thu: 4,
        Thursday: 4,
        Fri: 5,
        Friday: 5,
        Sat: 6,
        Saturday: 6,
      };

      // Case-insensitive day name lookup helper
      const getDayNumber = (name) => {
        if (!name) return undefined;
        const key = Object.keys(dayNameToNumber).find(
          (k) => k.toLowerCase() === name.trim().toLowerCase(),
        );
        return key ? dayNameToNumber[key] : undefined;
      };

      if (typeof vehicle.schedule_days === "string") {
        // Handle comma-separated string: "Mon,Wed,Fri"
        scheduledDayNumbers = vehicle.schedule_days
          .split(",")
          .map((day) => day.trim())
          .map((day) => getDayNumber(day))
          .filter((num) => num !== undefined);
      } else if (Array.isArray(vehicle.schedule_days)) {
        // Handle array format
        scheduledDayNumbers = vehicle.schedule_days
          .flatMap((day) => {
            if (typeof day === "string") {
              // Handle "Mon,Wed,Fri" within array
              return day
                .split(",")
                .map((d) => d.trim())
                .map((d) => getDayNumber(d));
            } else if (typeof day === "object" && day.day) {
              return getDayNumber(day.day);
            } else if (typeof day === "object" && day.value !== undefined) {
              return day.value;
            }
            return null;
          })
          .filter((num) => num !== undefined && num !== null);
      }

      // Check if today matches any of the scheduled days
      const todayDayNumber = todayDate.get("day"); // 0=Sunday, 1=Monday, etc.
      console.log(
        `🔧 [CREATE JOB] Weekly vehicle ${vehicle.registration_no}: scheduled days [${scheduledDayNumbers}], today is ${todayDayNumber}`,
      );

      if (scheduledDayNumbers.includes(todayDayNumber)) {
        console.log(
          `✅ [CREATE JOB] Match! Creating job for vehicle ${vehicle.registration_no}`,
        );
        jobs.push({
          vehicle: vehicle._id,
          assignedDate: new Date(todayDate),
          customer: customer._id,
          worker: vehicle.worker || null,
          location: customer.location || null,
          building: customer.building || null,
          ...(bookingId ? { booking: bookingId } : null),
          createdBy,
          createdByName: createdBy,
          createdSource:
            createdSource ||
            (createdBy === "Customer Booking" ? "Customer App" : "Cron Job"),
          immediate: true,
        });
      } else {
        console.log(
          `⏭️ [CREATE JOB] No match - skipping vehicle ${vehicle.registration_no}`,
        );
      }
    }
  }

  console.log(`🔧 [CREATE JOB] Total jobs to insert: ${jobs.length}`);
  if (jobs.length > 0) {
    // Instead of inserting, check if job exists and update/create accordingly
    for (const jobData of jobs) {
      const existingJob = await JobsModel.findOne({
        vehicle: jobData.vehicle,
        assignedDate: jobData.assignedDate,
        isDeleted: false,
      });

      if (existingJob) {
        // Update existing job (especially worker assignment)
        console.log(
          `🔄 [CREATE JOB] Updating existing job ${existingJob._id} for vehicle ${jobData.vehicle}`,
        );
        await JobsModel.updateOne(
          { _id: existingJob._id },
          {
            $set: {
              worker: jobData.worker,
              location: jobData.location,
              building: jobData.building,
              customer: jobData.customer,
              ...(bookingId ? { booking: bookingId } : null),
              ...(createdBy === "Customer Booking"
                ? {
                    createdBy,
                    createdByName: createdBy,
                    createdSource:
                      createdSource ||
                      (createdBy === "Customer Booking"
                        ? "Customer App"
                        : "Cron Job"),
                    immediate: true,
                  }
                : null),
            },
          },
        );
      } else {
        // Create new job
        console.log(
          `➕ [CREATE JOB] Creating new job for vehicle ${jobData.vehicle}`,
        );
        await new JobsModel(jobData).save();
      }
    }
    console.log(`✅ [CREATE JOB] Successfully processed ${jobs.length} job(s)`);
  } else {
    console.log(
      `⚠️ [CREATE JOB] No jobs to insert (no matching schedule days)`,
    );
  }
};

service.createImmediateJob = async (
  customer,
  startDate,
  createdBy = "Cron Scheduler",
) => {
  const todayDate = moment(startDate)
    .tz("Asia/Dubai")
    .startOf("day")
    .tz("Asia/Dubai");
  const jobs = [];

  for (const vehicle of customer.vehicles) {
    jobs.push({
      immediate: true,
      vehicle: vehicle._id,
      assignedDate: new Date(todayDate),
      customer: customer._id,
      worker: vehicle.worker,
      location: customer.location,
      building: customer.building,
      createdBy,
    });
  }

  await JobsModel.insertMany(jobs);
};
