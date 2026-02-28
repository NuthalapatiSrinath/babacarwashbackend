const CustomersModel = require("../../models/customers.model");
const LocationsModel = require("../locations/locations.model");
const BuildingsModel = require("../../models/buildings.model");
const MallsModel = require("../../models/malls.model");
const WorkersModel = require("../../models/workers.model");
const ImportLogsModel = require("../../models/import-logs.model");
const PaymentsModel = require("../../models/payments.model");
const CounterService = require("../../../utils/counters");
const CommonHelper = require("../../../helpers/common.helper");
const JobsService = require("../../staff/jobs/jobs.service");
const mongoose = require("mongoose");
const JobsModel = require("../../models/jobs.model");
const moment = require("moment");
const service = module.exports;

// ---------------------------------------------------------
// STANDARD CRUD
// ---------------------------------------------------------

service.list = async (userInfo, query) => {
  const paginationData = CommonHelper.paginationData(query);
  const search = query.search ? query.search.trim() : "";

  // Base Query - Filter by CUSTOMER status only, not vehicle status
  const findQuery = {
    isDeleted: false,
    status: Number(query.status) || 1, // Filter by CUSTOMER status (1=active, 2=inactive)
  };

  console.log(
    "🔍 [CUSTOMER LIST] Filtering by customer status:",
    query.status,
    "Query:",
    findQuery,
  );

  // Add Building Filter
  if (query.building && query.building.trim() !== "") {
    findQuery.building = query.building;
    console.log("🏢 [CUSTOMER LIST] Filtering by building:", query.building);
  }

  // Add Worker Filter (worker is on vehicle level)
  // Use $elemMatch to ensure at least one vehicle has this specific worker assigned (not null)
  if (query.worker && query.worker !== "__ANY_WORKER__") {
    // ✅ FIX: Skip filter when __ANY_WORKER__ is selected (show ALL customers)
    // Specific worker filter - handle both ObjectId and string comparison
    const workerString = query.worker.toString();
    const workerObjectId = mongoose.Types.ObjectId.isValid(query.worker)
      ? new mongoose.Types.ObjectId(query.worker)
      : null;

    // Match either string or ObjectId representation
    if (workerObjectId) {
      findQuery.vehicles = {
        $elemMatch: {
          $or: [{ worker: workerObjectId }, { worker: workerString }],
        },
      };
    } else {
      findQuery.vehicles = {
        $elemMatch: {
          worker: workerString,
        },
      };
    }
    console.log(
      "👷 [CUSTOMER LIST] Filtering by specific worker:",
      query.worker,
      "String:",
      workerString,
      "ObjectId:",
      workerObjectId,
    );
  } else if (query.worker === "__ANY_WORKER__") {
    console.log("👷 [CUSTOMER LIST] Showing ALL customers (no worker filter)");
  }

  if (search) {
    const searchRegex = { $regex: search, $options: "i" };
    const orConditions = [
      { mobile: searchRegex },
      { flat_no: searchRegex },
      { "vehicles.registration_no": searchRegex },
      { "vehicles.parking_no": searchRegex },
    ];

    // ✅ FIX: Handle Space in Name Search (e.g., "John Doe")
    const nameParts = search.split(/\s+/); // Split by space
    if (nameParts.length > 1) {
      // If search has space, try to match First + Last Name combination
      orConditions.push({
        $and: [
          { firstName: { $regex: nameParts[0], $options: "i" } },
          { lastName: { $regex: nameParts.slice(1).join(" "), $options: "i" } },
        ],
      });
    } else {
      // Single word search -> Check both fields independently
      orConditions.push({ firstName: searchRegex });
      orConditions.push({ lastName: searchRegex });
    }

    // Add Building & Worker Search Logic (Existing)
    const buildings = await BuildingsModel.find(
      { isDeleted: false, name: searchRegex },
      { _id: 1 },
    ).lean();
    if (buildings.length) {
      orConditions.push({ building: { $in: buildings.map((e) => e._id) } });
    }

    const workers = await WorkersModel.find(
      { isDeleted: false, name: searchRegex },
      { _id: 1 },
    ).lean();
    if (workers.length) {
      orConditions.push({
        "vehicles.worker": { $in: workers.map((e) => e._id) },
      });
    }

    // Combine all conditions with OR
    findQuery.$or = orConditions;
  }

  // Count Total
  const total = await CustomersModel.countDocuments(findQuery);

  console.log(`📊 [CUSTOMER LIST] Query: ${JSON.stringify(findQuery)}`);
  console.log(`📊 [CUSTOMER LIST] Total matching customers: ${total}`);

  // Debug: Check what's actually in the DB
  const allCustomers = await CustomersModel.countDocuments({});
  const notDeletedCustomers = await CustomersModel.countDocuments({
    isDeleted: false,
  });
  console.log(
    `🔍 [DEBUG] Total in DB: ${allCustomers}, Not Deleted: ${notDeletedCustomers}`,
  );

  // Check specific status values
  const status1Count = await CustomersModel.countDocuments({
    isDeleted: false,
    status: 1,
  });
  const status2Count = await CustomersModel.countDocuments({
    isDeleted: false,
    status: 2,
  });
  const statusStringCount = await CustomersModel.countDocuments({
    isDeleted: false,
    status: "1",
  });
  console.log(
    `📊 [DEBUG] Status counts - Number(1): ${status1Count}, Number(2): ${status2Count}, String("1"): ${statusStringCount}`,
  );

  // ⚡ OPTIMIZED: Fetch Data with populate (single query instead of N+1)
  let data = await CustomersModel.find(findQuery)
    .sort({ _id: -1 })
    .skip(paginationData.skip)
    .limit(paginationData.limit)
    .lean();

  // ✅ Fix any invalid building values before populate
  // Handles "", " ", or any non-ObjectId string to prevent CastError
  data.forEach((customer) => {
    if (
      customer.building !== null &&
      customer.building !== undefined &&
      !mongoose.Types.ObjectId.isValid(customer.building)
    ) {
      customer.building = null;
    }
  });

  // Now populate safely
  data = await CustomersModel.populate(data, {
    path: "building",
    match: { isDeleted: false },
    populate: {
      path: "location_id",
    },
  });

  console.log("\n🔍 [DEBUG] First 3 customers returned from query:");
  data.slice(0, 3).forEach((customer, idx) => {
    console.log(`  Customer ${idx + 1}:`, customer._id);
    console.log(`    Name: ${customer.firstName} ${customer.lastName}`);
    console.log(`    Vehicles count: ${customer.vehicles?.length || 0}`);
    customer.vehicles?.forEach((v, vIdx) => {
      console.log(
        `      Vehicle ${vIdx + 1}: ${v.registration_no}, Worker: ${v.worker}`,
      );
    });
  });

  // ⚡ OPTIMIZED: Bulk populate workers for all vehicles in a single query
  const allWorkerIds = new Set();
  data.forEach((customer) => {
    customer.vehicles?.forEach((vehicle) => {
      if (vehicle.worker) {
        allWorkerIds.add(vehicle.worker.toString());
      }
    });
  });

  // Fetch all workers in one query
  const workerMap = {};
  if (allWorkerIds.size > 0) {
    const workers = await WorkersModel.find({
      _id: { $in: Array.from(allWorkerIds) },
      isDeleted: false,
    }).lean();

    workers.forEach((worker) => {
      workerMap[worker._id.toString()] = worker;
    });
  }

  // Assign populated workers to vehicles
  data.forEach((customer) => {
    if (customer.vehicles && customer.vehicles.length > 0) {
      customer.vehicles.forEach((vehicle) => {
        if (vehicle.worker) {
          const workerId = vehicle.worker.toString();
          vehicle.worker = workerMap[workerId] || null;
        }
      });
      // ✅ Don't filter vehicles by status - show all vehicles regardless of customer status
      // Vehicle status is independent and managed separately
    }
  });

  // Add pending dues for each customer and vehicle - OPTIMIZED with bulk query
  console.log(
    "\n💰 [CUSTOMER LIST] Starting pending dues calculation for",
    data.length,
    "customers",
  );

  if (data.length > 0) {
    const customerIds = data.map((c) => c._id);

    // Single bulk query for all pending payments (payments already have vehicle info embedded)
    const allPendingPayments = await PaymentsModel.find({
      customer: { $in: customerIds },
      isDeleted: false,
      status: "pending",
    }).lean();

    console.log(
      "📊 [CUSTOMER LIST] Found",
      allPendingPayments.length,
      "total pending payments",
    );

    // Group payments by vehicle (registration_no) and calculate dues
    const vehicleDuesMap = {};
    const customerDuesMap = {};

    allPendingPayments.forEach((payment) => {
      const customerId = payment.customer?.toString();
      const registrationNo = payment.vehicle?.registration_no;

      if (!registrationNo || !customerId) {
        console.log("⚠️ [CUSTOMER LIST] Skipping payment - missing data:", {
          paymentId: payment._id,
          customerId,
          registrationNo,
          hasCustomer: !!payment.customer,
          hasVehicle: !!payment.vehicle,
        });
        return;
      }

      const amountDue =
        (payment.amount_charged || 0) - (payment.amount_paid || 0);

      if (amountDue > 0) {
        // Track vehicle-wise dues
        const vehicleKey = `${customerId}_${registrationNo}`;
        if (!vehicleDuesMap[vehicleKey]) {
          vehicleDuesMap[vehicleKey] = { totalDue: 0, pendingCount: 0 };
        }
        vehicleDuesMap[vehicleKey].totalDue += amountDue;
        vehicleDuesMap[vehicleKey].pendingCount += 1;

        // Track customer-wise dues (sum of all vehicles)
        if (!customerDuesMap[customerId]) {
          customerDuesMap[customerId] = { totalDue: 0, pendingCount: 0 };
        }
        customerDuesMap[customerId].totalDue += amountDue;
        customerDuesMap[customerId].pendingCount += 1;
      }
    });

    console.log(
      "💰 [CUSTOMER LIST] Vehicle dues map entries:",
      Object.keys(vehicleDuesMap).length,
      "- Sample:",
      Object.entries(vehicleDuesMap).slice(0, 3),
    );

    // Fetch last paid payment for each vehicle to show payment method
    const allPaidPayments = await PaymentsModel.find({
      customer: { $in: customerIds },
      isDeleted: false,
      status: "completed",
    })
      .sort({ collectedDate: -1, _id: -1 })
      .lean();

    console.log(
      "💳 [CUSTOMER LIST] Found",
      allPaidPayments.length,
      "completed payments",
    );

    // Track last payment for each vehicle
    const vehicleLastPaymentMap = {};

    allPaidPayments.forEach((payment) => {
      const customerId = payment.customer?.toString();
      const registrationNo = payment.vehicle?.registration_no;

      if (!registrationNo || !customerId) return;

      const vehicleKey = `${customerId}_${registrationNo}`;

      // Only store the first (most recent) payment for each vehicle
      if (!vehicleLastPaymentMap[vehicleKey]) {
        const isMonthEndClosed = (payment.notes || "")
          .toLowerCase()
          .includes("closed by month-end");

        vehicleLastPaymentMap[vehicleKey] = {
          amount: payment.amount_paid || 0,
          paymentMethod: isMonthEndClosed ? "monthly_close" : "customer",
          date: payment.collectedDate || payment.updatedAt,
        };
      }
    });

    console.log(
      "💳 [CUSTOMER LIST] Last payment map entries:",
      Object.keys(vehicleLastPaymentMap).length,
    );

    // Assign dues to each vehicle and customer
    data.forEach((customer) => {
      const customerId = customer._id.toString();

      // Assign customer-level dues
      const customerDues = customerDuesMap[customerId] || {
        totalDue: 0,
        pendingCount: 0,
      };
      customer.pendingDues = customerDues.totalDue;
      customer.pendingCount = customerDues.pendingCount;

      // Assign vehicle-level dues
      if (customer.vehicles && customer.vehicles.length > 0) {
        customer.vehicles.forEach((vehicle) => {
          const vehicleKey = `${customerId}_${vehicle.registration_no}`;
          const vehicleDues = vehicleDuesMap[vehicleKey] || {
            totalDue: 0,
            pendingCount: 0,
          };
          vehicle.pendingDues = vehicleDues.totalDue;
          vehicle.pendingCount = vehicleDues.pendingCount;

          // Add last payment info
          const lastPayment = vehicleLastPaymentMap[vehicleKey];
          if (lastPayment) {
            vehicle.lastPayment = lastPayment;
          }
        });
      }
    });

    console.log(
      "✅ [CUSTOMER LIST] Pending dues calculation complete (vehicle-wise, optimized bulk query)\n",
    );
  }

  return { total, data };
};

service.info = async (userInfo, id) => {
  return CustomersModel.findOne({ _id: id, isDeleted: false }).lean();
};

service.create = async (userInfo, payload) => {
  const findUserQuery = { isDeleted: false, $or: [{ mobile: payload.mobile }] };
  if (payload.email) findUserQuery.$or.push({ email: payload.email });

  const userExists = await CustomersModel.countDocuments(findUserQuery);
  if (userExists) throw "USER-EXISTS";

  const id = await CounterService.id("customers");
  const data = {
    createdBy: userInfo._id,
    updatedBy: userInfo._id,
    id,
    ...payload,
  };
  const customerData = await new CustomersModel(data).save();
  await JobsService.createJob(customerData);
};

service.update = async (userInfo, id, payload) => {
  // If status is being changed to inactive (2), check for pending dues
  if (payload.status === 2) {
    const duesCheck = await service.checkPendingDues(id);

    if (duesCheck.hasPendingDues) {
      const error = new Error(
        `PENDING_DUES: Customer has outstanding payment of AED ${duesCheck.totalDue.toFixed(2)} across ${duesCheck.pendingCount} transaction(s). Please clear all dues before deactivating.`,
      );
      error.code = "PENDING_DUES";
      error.totalDue = duesCheck.totalDue;
      error.pendingCount = duesCheck.pendingCount;
      error.payments = duesCheck.payments;
      throw error;
    }
  }

  // If vehicles array exists, update vehicle info
  if (payload.vehicles && payload.vehicles.length > 0) {
    // Get current customer data first to preserve onboard_dates
    const currentCustomer = await CustomersModel.findById(id).lean();

    // Process each vehicle
    for (const vehicle of payload.vehicles) {
      // For existing vehicles
      if (vehicle._id && currentCustomer) {
        const existingVehicle = currentCustomer.vehicles?.find(
          (v) => v._id.toString() === vehicle._id.toString(),
        );
        if (existingVehicle) {
          // ONE-TIME MIGRATION: If onboard_date doesn't exist in DB, set it from start_date
          if (!existingVehicle.onboard_date && existingVehicle.start_date) {
            vehicle.onboard_date = existingVehicle.start_date;
          }
          // Otherwise, keep the existing onboard_date (don't let frontend override it)
          else if (existingVehicle.onboard_date) {
            vehicle.onboard_date = existingVehicle.onboard_date;
          }

          // If status is changing from inactive (0) to active (1), update start_date to today
          if (existingVehicle.status === 0 && vehicle.status === 1) {
            vehicle.start_date = new Date(); // Set to today's date on reactivation
          }
        }
      }
    }

    const vehiclesToUpdate = payload.vehicles;
    delete payload.vehicles;

    // Update customer fields
    await CustomersModel.updateOne({ _id: id }, { $set: payload });

    // ✅ FIX: Replace entire vehicles array to properly handle additions, updates, AND deletions
    // This ensures removed vehicles are actually deleted from the database
    await CustomersModel.updateOne(
      { _id: id },
      { $set: { vehicles: vehiclesToUpdate } },
    );

    const customerData = await CustomersModel.findOne({ _id: id }).lean();
    await JobsService.createJob(customerData);
  } else {
    // Just update customer fields (like status)
    await CustomersModel.updateOne({ _id: id }, { $set: payload });
  }
};

service.delete = async (userInfo, id, reason) => {
  return await CustomersModel.updateOne(
    { _id: id },
    {
      isDeleted: true,
      deletedBy: userInfo._id,
      deletedAt: new Date(),
      deleteReason: reason || null,
    },
  );
};

service.undoDelete = async (userInfo, id) => {
  return await CustomersModel.updateOne(
    { _id: id },
    { isDeleted: false, updatedBy: userInfo._id },
  );
};

// ---------------------------------------------------------
// CHECK PENDING DUES
// ---------------------------------------------------------

// Helper function to check if customer has pending dues
service.checkPendingDues = async (customerId) => {
  try {
    // Find all payments that are pending (status="pending" means not yet paid)
    const query = {
      customer: customerId,
      isDeleted: false,
      status: "pending",
    };

    const pendingPayments = await PaymentsModel.find(query).lean();

    if (pendingPayments && pendingPayments.length > 0) {
      // Calculate actual pending amount: amount_charged - amount_paid
      const paymentsWithDues = [];
      let totalDue = 0;

      pendingPayments.forEach((payment) => {
        const amountDue =
          (payment.amount_charged || 0) - (payment.amount_paid || 0);

        if (amountDue > 0) {
          paymentsWithDues.push({
            ...payment,
            amountDue: amountDue,
          });
          totalDue += amountDue;
        }
      });

      if (paymentsWithDues.length > 0 && totalDue > 0) {
        return {
          hasPendingDues: true,
          totalDue: totalDue,
          pendingCount: paymentsWithDues.length,
          payments: paymentsWithDues,
        };
      }
    }

    return {
      hasPendingDues: false,
      totalDue: 0,
      pendingCount: 0,
      payments: [],
    };
  } catch (error) {
    console.error("❌ [checkPendingDues] Error:", error);
    return {
      hasPendingDues: false,
      totalDue: 0,
      pendingCount: 0,
      payments: [],
    };
  }
};

// Helper function to check if vehicle has pending dues
service.checkVehiclePendingDues = async (customerId, vehicleId) => {
  try {
    // Get customer to find vehicle details
    const customer = await CustomersModel.findById(customerId).lean();
    if (!customer) {
      throw new Error("Customer not found");
    }

    const vehicle = customer.vehicles.find(
      (v) => v._id.toString() === vehicleId,
    );
    if (!vehicle) {
      throw new Error("Vehicle not found");
    }

    console.log(
      `🚗 [checkVehiclePendingDues] Checking dues for vehicle: ${vehicle.registration_no}`,
    );

    // Query payments directly by customer and vehicle registration_no
    const pendingPayments = await PaymentsModel.find({
      customer: customerId,
      "vehicle.registration_no": vehicle.registration_no,
      isDeleted: false,
      status: "pending",
    }).lean();

    console.log(
      `📊 [checkVehiclePendingDues] Found ${pendingPayments.length} pending payments for vehicle ${vehicle.registration_no}`,
    );

    if (pendingPayments && pendingPayments.length > 0) {
      // Calculate actual pending amount: amount_charged - amount_paid
      const paymentsWithDues = [];
      let totalDue = 0;

      pendingPayments.forEach((payment) => {
        const amountDue =
          (payment.amount_charged || 0) - (payment.amount_paid || 0);
        if (amountDue > 0) {
          paymentsWithDues.push({
            ...payment,
            amountDue: amountDue,
          });
          totalDue += amountDue;
        }
      });

      if (paymentsWithDues.length > 0) {
        console.log(
          `💰 [checkVehiclePendingDues] Vehicle ${vehicle.registration_no} has AED ${totalDue} pending dues`,
        );
        return {
          hasPendingDues: true,
          totalDue: totalDue,
          pendingCount: paymentsWithDues.length,
          payments: paymentsWithDues,
          vehicleNo: vehicle.registration_no,
        };
      }
    }

    console.log(
      `✅ [checkVehiclePendingDues] Vehicle ${vehicle.registration_no} has no pending dues`,
    );
    return {
      hasPendingDues: false,
      totalDue: 0,
      pendingCount: 0,
      payments: [],
      vehicleNo: vehicle.registration_no,
    };
  } catch (error) {
    console.error("❌ [checkVehiclePendingDues] Error:", error);
    throw error;
  }
};

service.vehicleDeactivate = async (userInfo, id, payload) => {
  // Find customer with this vehicle
  const customer = await CustomersModel.findOne({ "vehicles._id": id }).lean();
  if (!customer) {
    throw new Error("VEHICLE_NOT_FOUND");
  }

  // Check for pending dues on this vehicle
  const duesCheck = await service.checkVehiclePendingDues(customer._id, id);

  if (duesCheck.hasPendingDues) {
    const error = new Error(
      `PENDING_DUES: Vehicle ${duesCheck.vehicleNo} has pending dues of AED ${duesCheck.totalDue.toFixed(2)}. Please clear all outstanding payments before deactivating.`,
    );
    error.code = "PENDING_DUES";
    error.totalDue = duesCheck.totalDue;
    error.pendingCount = duesCheck.pendingCount;
    error.payments = duesCheck.payments; // Include full payment details
    throw error;
  }

  await CustomersModel.updateOne(
    { "vehicles._id": id },
    {
      $set: {
        "vehicles.$.status": 2,
        "vehicles.$.deactivateReason": payload.deactivateReason || null,
        "vehicles.$.deactivateDate": payload.deactivateDate || new Date(),
        "vehicles.$.reactivateDate": payload.reactivateDate || null,
        "vehicles.$.deactivatedBy": userInfo._id,
      },
    },
  );

  return { message: "Vehicle deactivated successfully" };
};

service.vehicleActivate = async (userInfo, id, payload) => {
  // Only update start_date on activation, onboard_date remains unchanged
  await CustomersModel.updateOne(
    { "vehicles._id": id },
    {
      $set: {
        "vehicles.$.status": 1,
        "vehicles.$.start_date": payload.start_date || new Date(),
        "vehicles.$.restart_date":
          payload.restart_date || payload.start_date || new Date(),
        "vehicles.$.activatedBy": userInfo._id,
      },
      $unset: {
        "vehicles.$.deactivateReason": "",
        "vehicles.$.deactivateDate": "",
        "vehicles.$.reactivateDate": "",
      },
    },
  );
};

service.deactivate = async (userInfo, id, payload) => {
  // Check for pending dues before deactivating customer
  const duesCheck = await service.checkPendingDues(id);

  if (duesCheck.hasPendingDues) {
    const error = new Error(
      `PENDING_DUES: Customer has outstanding payment of AED ${duesCheck.totalDue.toFixed(2)} across ${duesCheck.pendingCount} transaction(s). Please clear all dues before deactivating.`,
    );
    error.code = "PENDING_DUES";
    error.totalDue = duesCheck.totalDue;
    error.pendingCount = duesCheck.pendingCount;
    error.payments = duesCheck.payments; // Include full payment details
    throw error;
  }

  await CustomersModel.updateOne(
    { _id: id },
    {
      $set: {
        status: 2,
        deactivateReason: payload.deactivateReason || null,
        deactivateDate: payload.deactivateDate || new Date(),
        reactivateDate: payload.reactivateDate || null,
        deactivatedBy: userInfo._id,
      },
    },
  );

  return { message: "Customer deactivated successfully" };
};

service.archive = async (userInfo, id, payload) => {
  return await CustomersModel.updateOne(
    { _id: id },
    { $set: { status: 9, archivedAt: new Date(), archivedBy: userInfo._id } },
  );
};

// ---------------------------------------------------------
// ✅ IMPORT LOGIC
// ---------------------------------------------------------
service.importData = async (userInfo, excelData) => {
  console.log("🔵 [SERVICE] Import started with", excelData?.length, "rows");

  const buildPayload = {
    customer: (data, location, building) => {
      return {
        mobile: data.mobile,
        ...(data.flat_no ? { flat_no: data.flat_no } : null),
        ...(data.firstName ? { firstName: data.firstName } : null),
        ...(data.lastName ? { lastName: data.lastName } : null),
        ...(data.email ? { email: data.email } : null),
        ...(location ? { location: location._id } : null),
        ...(building ? { building: building._id } : null),
        imported: true,
        status: 1, // ✅ FIX: Set active status for imported customers
      };
    },
    vehicle: (data, worker) => {
      const schedule_days = [];
      if (
        data.schedule_type &&
        data.schedule_type.toLowerCase() === "weekly" &&
        data.schedule_days
      ) {
        const days = data.schedule_days.includes(",")
          ? data.schedule_days.split(",")
          : data.schedule_days.split(" ");

        for (const day of days) {
          let dayValue = day.trim();
          if (dayValue) {
            schedule_days.push({
              day: dayValue,
              value: CommonHelper.getDayNumber(dayValue),
            });
          }
        }
      }

      const currentDate = new Date();
      const startDate = data.start_date || currentDate;
      return {
        registration_no: data.registration_no || data.vehicleNo,
        parking_no: data.parking_no || data.parkingNo,
        worker: worker ? worker._id : null,
        amount: data.amount || 0,
        schedule_type: data.schedule_type || "daily",
        schedule_days,
        start_date: startDate,
        onboard_date: data.onboard_date || startDate, // Set onboard_date to start_date if not provided
        advance_amount: data.advance_amount || 0,
        status: 1,
      };
    },
  };

  if (excelData && excelData.length) {
    const counts = { duplicates: [], errors: [], success: 0 };

    for (const iterator of excelData) {
      try {
        if (!iterator.mobile) throw "Mobile number is required";
        if (!iterator.registration_no)
          throw "Vehicle registration number is required";
        if (!iterator.parking_no) throw "Parking number is required";

        // Check if customer exists
        const findUserQuery = {
          isDeleted: false,
          $or: [{ mobile: iterator.mobile }],
        };
        if (iterator.email) findUserQuery.$or.push({ email: iterator.email });

        let customerInfo = await CustomersModel.findOne(findUserQuery);

        const location = iterator.location
          ? await LocationsModel.findOne({
              isDeleted: false,
              address: { $regex: new RegExp(iterator.location.trim(), "i") },
            })
          : null;

        const building = iterator.building
          ? await BuildingsModel.findOne({
              isDeleted: false,
              name: { $regex: new RegExp(iterator.building.trim(), "i") },
            })
          : null;

        let worker = null;
        if (iterator.worker) {
          worker = await WorkersModel.findOne({
            isDeleted: false,
            name: { $regex: new RegExp(iterator.worker.trim(), "i") },
          });
        }

        let addVehicle = false;

        if (customerInfo) {
          // UPDATE EXISTING
          const customerUpdateData = buildPayload.customer(
            iterator,
            location,
            building,
          );
          await CustomersModel.updateOne(
            { _id: customerInfo._id },
            { $set: customerUpdateData },
          );

          const regNo = iterator.registration_no;
          const parkingNo = iterator.parking_no || "";

          // ✅ NEW LOGIC: Check if BOTH vehicle AND parking match
          const hasVehicle = customerInfo.vehicles.find(
            (v) =>
              v.registration_no === regNo && (v.parking_no || "") === parkingNo,
          );

          if (hasVehicle) {
            const vehicleUpdateData = buildPayload.vehicle(iterator, worker);
            await CustomersModel.updateOne(
              { "vehicles._id": hasVehicle._id },
              { $set: { "vehicles.$": vehicleUpdateData } },
            );
            counts.success++;
            continue;
          }
          addVehicle = true;
        }

        const vehicleInfo = buildPayload.vehicle(iterator, worker);

        if (addVehicle) {
          // ✅ NEW LOGIC: Before adding vehicle, check if vehicle+parking exists elsewhere
          const vehicleAndParkingExists = await CustomersModel.findOne({
            _id: { $ne: customerInfo._id }, // Different customer
            vehicles: {
              $elemMatch: {
                registration_no: vehicleInfo.registration_no,
                parking_no: vehicleInfo.parking_no || "",
              },
            },
          });

          if (vehicleAndParkingExists) {
            console.log(
              `⚠️ Vehicle ${vehicleInfo.registration_no} with parking ${vehicleInfo.parking_no || "N/A"} exists elsewhere, skipping add`,
            );
            counts.duplicates.push({
              row: `${iterator.firstName || ""} ${iterator.lastName || ""} - ${iterator.registration_no}`,
              reason:
                "Vehicle+Parking combination already exists with another customer",
            });
            continue;
          }

          await CustomersModel.updateOne(
            { _id: customerInfo._id },
            { $push: { vehicles: vehicleInfo } },
          );
        } else {
          // ✅ NEW LOGIC: Before creating new customer, check if vehicle+parking exists
          const vehicleAndParkingExists = await CustomersModel.findOne({
            vehicles: {
              $elemMatch: {
                registration_no: vehicleInfo.registration_no,
                parking_no: vehicleInfo.parking_no || "",
              },
            },
          });

          if (vehicleAndParkingExists) {
            console.log(
              `⚠️ Vehicle ${vehicleInfo.registration_no} with parking ${vehicleInfo.parking_no || "N/A"} exists elsewhere, skipping customer creation`,
            );
            counts.duplicates.push({
              row: `${iterator.firstName || ""} ${iterator.lastName || ""} - ${iterator.registration_no}`,
              reason: "Vehicle+Parking combination already exists",
            });
            continue;
          }

          // CREATE NEW
          const customer = {
            ...buildPayload.customer(iterator, location, building),
            vehicles: [vehicleInfo],
          };

          const id = await CounterService.id("customers");
          const data = {
            createdBy: userInfo._id,
            updatedBy: userInfo._id,
            id,
            ...customer,
          };
          customerInfo = await new CustomersModel(data).save();
        }

        await JobsService.createJob(customerInfo, "Import API");
        counts.success++;
      } catch (error) {
        console.error("❌ [SERVICE] Import Row Error:", error);
        counts.errors.push({
          row: `${iterator.firstName || ""} ${iterator.lastName || ""} - ${
            iterator.registration_no || "N/A"
          }`,
          error: error.message || error,
        });
      }
    }

    const importLog = await new ImportLogsModel({
      type: "customers-import-excel",
      logs: counts,
    }).save();

    return { _id: importLog._id, ...counts };
  } else {
    throw "No data in the file";
  }
};

// ---------------------------------------------------------
// ✅ OPTIMIZED EXPORT (Batching & Safe Manual Lookups)
// ---------------------------------------------------------
service.exportData = async (userInfo, query) => {
  const findQuery = {
    isDeleted: false,
    "vehicles.status": Number(query.status) || 1,
  };

  // 1. Fetch Customers (Lean)
  const customerData = await CustomersModel.find(findQuery)
    .sort({ _id: -1 })
    .lean();

  // 2. Gather IDs
  const buildingIds = new Set();
  const locationIds = new Set();
  const workerIds = new Set();

  customerData.forEach((c) => {
    if (isValidObjectId(c.building)) buildingIds.add(c.building);
    if (isValidObjectId(c.location)) locationIds.add(c.location);
    if (c.vehicles && c.vehicles.length) {
      c.vehicles.forEach((v) => {
        if (isValidObjectId(v.worker)) workerIds.add(v.worker);
      });
    }
  });

  // 3. Batch Fetch
  const [buildings, locations, workers] = await Promise.all([
    BuildingsModel.find({ _id: { $in: [...buildingIds] } })
      .select("name")
      .lean(),
    LocationsModel.find({ _id: { $in: [...locationIds] } })
      .select("address")
      .lean(),
    WorkersModel.find({ _id: { $in: [...workerIds] } })
      .select("name")
      .lean(),
  ]);

  // 4. Create Maps
  const buildingMap = buildings.reduce(
    (acc, cur) => ({ ...acc, [cur._id]: cur.name }),
    {},
  );
  const locationMap = locations.reduce(
    (acc, cur) => ({ ...acc, [cur._id]: cur.address }),
    {},
  );
  const workerMap = workers.reduce(
    (acc, cur) => ({ ...acc, [cur._id]: cur.name }),
    {},
  );

  // 5. Map Export Data
  const exportMap = [];

  for (const iterator of customerData) {
    if (!iterator.vehicles || iterator.vehicles.length === 0) continue;

    for (const vehicle of iterator.vehicles) {
      if (vehicle.status !== (Number(query.status) || 1)) continue;

      let row = {
        firstName: iterator.firstName || "",
        lastName: iterator.lastName || "",
        mobile: iterator.mobile || "",
        email: iterator.email || "",
        registration_no: vehicle.registration_no || "",
        parking_no: vehicle.parking_no || "",
        flat_no: iterator.flat_no || "",
        amount: vehicle.amount || 0,
        advance_amount: vehicle.advance_amount || 0,
        building: buildingMap[iterator.building] || "",
        location: locationMap[iterator.location] || "",
        worker: workerMap[vehicle.worker] || "",
        schedule_type: vehicle.schedule_type || "daily",
        schedule_days:
          vehicle.schedule_type === "weekly" &&
          Array.isArray(vehicle.schedule_days)
            ? vehicle.schedule_days.map((e) => e.day).join(", ")
            : "",
        start_date: vehicle.start_date
          ? moment(vehicle.start_date).format("YYYY-MM-DD")
          : "",
        createdAt: vehicle.start_date
          ? moment(vehicle.start_date).format("YYYY-MM-DD")
          : "",
      };

      exportMap.push(row);
    }
  }

  return exportMap;
};

function isValidObjectId(id) {
  if (!id) return false;
  if (mongoose.Types.ObjectId.isValid(id)) {
    return String(id) === new mongoose.Types.ObjectId(id).toString();
  }
  return false;
}

// ... (Rest of Washes List Unchanged)
service.washesList = async (userInfo, query, customerId) => {
  const paginationData = CommonHelper.paginationData(query);
  const findQuery = { isDeleted: false, customer: customerId };

  // Add date filtering if provided
  if (query.startDate || query.endDate) {
    findQuery.assignedDate = {};
    if (query.startDate) {
      findQuery.assignedDate.$gte = new Date(query.startDate);
    }
    if (query.endDate) {
      const endDate = new Date(query.endDate);
      endDate.setHours(23, 59, 59, 999); // Include full end day
      findQuery.assignedDate.$lte = endDate;
    }
  }

  const total = await JobsModel.countDocuments(findQuery);
  let data = await JobsModel.find(findQuery)
    .populate("customer", "name mobile email vehicles")
    .populate("worker", "name mobile")
    .populate("building", "name")
    .populate("location", "address city state")
    .sort({ _id: -1 })
    .skip(paginationData.skip)
    .limit(paginationData.limit)
    .lean();

  // Enrich data with vehicle details from customer's vehicles array
  data = data.map((job) => {
    if (job.customer && job.customer.vehicles && job.vehicle) {
      console.log(
        `🔍 Job ${job.scheduleId}: Looking for vehicle ${job.vehicle}`,
      );
      console.log(
        `👤 Customer has ${job.customer.vehicles.length} vehicles:`,
        job.customer.vehicles.map((v) => ({
          id: v._id.toString(),
          reg: v.registration_no,
          park: v.parking_no,
        })),
      );

      const vehicleData = job.customer.vehicles.find(
        (v) => v._id.toString() === job.vehicle.toString(),
      );

      if (vehicleData) {
        console.log(
          `✅ Match found: ${vehicleData.registration_no} / ${vehicleData.parking_no}`,
        );
        job.registration_no = vehicleData.registration_no;
        job.parking_no = vehicleData.parking_no;
        job.vehicle_type = vehicleData.vehicle_type;
      } else {
        console.log(`❌ No match found for vehicle ${job.vehicle}`);
      }
    } else {
      console.log(
        `⚠️ Job ${job.scheduleId}: Missing customer vehicles or vehicle ID`,
      );
    }
    return job;
  });

  // Get customer info for header
  const customerInfo = await CustomersModel.findById(customerId)
    .select("name mobile email")
    .lean();

  return { total, data, customerInfo };
};

service.exportWashesList = async (userInfo, query, customerId) => {
  const findQuery = { isDeleted: false, customer: customerId };

  // Add date filtering if provided
  if (query.startDate || query.endDate) {
    findQuery.assignedDate = {};
    if (query.startDate) {
      findQuery.assignedDate.$gte = new Date(query.startDate);
    }
    if (query.endDate) {
      const endDate = new Date(query.endDate);
      endDate.setHours(23, 59, 59, 999);
      findQuery.assignedDate.$lte = endDate;
    }
  }

  let data = await JobsModel.find(findQuery)
    .populate("customer", "name mobile email vehicles")
    .populate("worker", "name mobile")
    .populate("building", "name")
    .populate("location", "address city state")
    .sort({ _id: -1 })
    .lean();

  // Enrich data with vehicle details from customer's vehicles array
  data = data.map((job) => {
    if (job.customer && job.customer.vehicles && job.vehicle) {
      const vehicleData = job.customer.vehicles.find(
        (v) => v._id.toString() === job.vehicle.toString(),
      );
      if (vehicleData) {
        job.registration_no = vehicleData.registration_no;
        job.parking_no = vehicleData.parking_no;
        job.vehicle_type = vehicleData.vehicle_type;
      }
    }
    return job;
  });

  const exportMap = [];
  for (const iterator of data) {
    exportMap.push({
      scheduleId: iterator.scheduleId || "",
      assignedDate: iterator.assignedDate
        ? moment(iterator.assignedDate).format("YYYY-MM-DD HH:mm:ss")
        : "",
      completedDate: iterator.completedDate
        ? moment(iterator.completedDate).format("YYYY-MM-DD HH:mm:ss")
        : "",
      status: (iterator.status || "").toUpperCase(),
      vehicleRegistration: iterator.registration_no || "",
      vehicleParking: iterator.parking_no || "",
      building: iterator.building?.name || "",
      location: iterator.location?.address || "",
      worker: iterator.worker?.name || "",
      workerMobile: iterator.worker?.mobile || "",
      customerName: iterator.customer?.name || "",
      customerMobile: iterator.customer?.mobile || "",
      price: iterator.price || 0,
      tips: iterator.tips || 0,
      immediate: iterator.immediate ? "Yes" : "No",
    });
  }
  return exportMap;
};

// ---------------------------------------------------------
// HELPER FUNCTIONS FOR IMPORT
// ---------------------------------------------------------

const getCellText = (cell) => {
  if (!cell || cell.value === null || cell.value === undefined) return "";
  if (typeof cell.value === "object" && cell.value.text)
    return cell.value.text.toString().trim();
  return cell.value.toString().trim();
};

const parseExcelDate = (value) => {
  if (!value) return undefined;

  // Handle Date objects (from ExcelJS auto-parse)
  if (value instanceof Date) {
    if (isNaN(value.getTime())) return undefined;
    // Normalize to midnight UTC to prevent timezone shifts
    return new Date(
      Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()),
    );
  }

  // Handle Excel serial number (e.g., 46024)
  if (typeof value === "number") {
    const utcMs = Math.round((value - 25569) * 86400 * 1000);
    const d = new Date(utcMs);
    // Normalize to midnight UTC
    return new Date(
      Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
    );
  }

  if (typeof value === "string") {
    const raw = value.trim();

    // Try DD/MM/YYYY format (as per our template)
    if (raw.includes("/")) {
      const parts = raw.split("/");
      if (parts.length === 3) {
        const day = parseInt(parts[0]);
        const month = parseInt(parts[1]);
        const year = parseInt(parts[2]);
        if (!isNaN(day) && !isNaN(month) && !isNaN(year)) {
          return new Date(Date.UTC(year, month - 1, day));
        }
      }
    }

    // Try YYYY-MM-DD format
    if (raw.match(/^\d{4}-\d{2}-\d{2}$/)) {
      const [y, m, d] = raw.split("-").map(Number);
      return new Date(Date.UTC(y, m - 1, d));
    }
  }

  // Fallback: try to parse and normalize to UTC
  const date = new Date(value);
  if (isNaN(date.getTime())) return undefined;
  return new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
  );
};

// Generate auto mobile number (2000000xxx format)
const generateAutoMobile = async () => {
  const latestCustomer = await CustomersModel.findOne({
    mobile: /^2000000\d{3}$/,
  })
    .sort({ mobile: -1 })
    .lean();

  if (latestCustomer && latestCustomer.mobile) {
    const lastNumber = parseInt(latestCustomer.mobile.substring(7));
    const nextNumber = lastNumber + 1;
    return `2000000${String(nextNumber).padStart(3, "0")}`;
  }

  return "2000000001"; // Start from 2000000001
};

// ---------------------------------------------------------
// IMPORT FROM EXCEL
// ---------------------------------------------------------

service.importDataFromExcel = async (userInfo, fileBuffer) => {
  console.log("🚀 [CUSTOMER IMPORT START] Processing Excel file...");

  const ExcelJS = require("exceljs");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(fileBuffer);
  const worksheet = workbook.getWorksheet(1);

  if (!worksheet) {
    console.error("❌ [IMPORT ERROR] No worksheet found");
    return { success: 0, errors: [{ error: "No worksheet found" }] };
  }

  console.log(`📊 [IMPORT INFO] Total rows in file: ${worksheet.rowCount}`);

  const excelData = [];

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // Skip header

    const firstName = getCellText(row.getCell(1));
    const lastName = getCellText(row.getCell(2));
    const mobile = getCellText(row.getCell(3));
    const email = getCellText(row.getCell(4));
    const registration_no = getCellText(row.getCell(5));
    const parking_no = getCellText(row.getCell(6));
    const flat_no = getCellText(row.getCell(7));
    const schedule_type = getCellText(row.getCell(8));
    const schedule_days = getCellText(row.getCell(9));
    const amount = getCellText(row.getCell(10));
    const advance_amount = getCellText(row.getCell(11));
    const start_date = row.getCell(12).value;
    const onboard_date = row.getCell(13).value; // Read onboard_date from column 13
    const location = getCellText(row.getCell(14)); // Location name
    const building = getCellText(row.getCell(15)); // Building name
    const worker = getCellText(row.getCell(16)); // Worker name

    console.log(
      `🔍 Reading Row ${rowNumber}: ${firstName} ${lastName}, Mobile="${mobile}", Vehicle="${registration_no}", Location="${location}", Building="${building}", Worker="${worker}"`,
    );

    // Skip completely empty rows
    if (!firstName && !registration_no) {
      console.log(`⚠️ Skipped empty row at ${rowNumber}`);
      return;
    }

    excelData.push({
      firstName,
      lastName,
      mobile, // Can be empty - will auto-generate
      email,
      registration_no,
      parking_no,
      flat_no,
      schedule_type,
      schedule_days,
      amount,
      advance_amount,
      start_date,
      onboard_date, // Include onboard_date
      location, // Location name from Excel
      building, // Building name from Excel
      worker, // Worker name from Excel
      rowNumber,
    });
  });

  console.log(`✅ [IMPORT INFO] Extracted ${excelData.length} valid rows.`);

  const results = {
    success: 0,
    errors: [],
    created: 0,
    updated: 0,
    changes: [],
    createdRecords: [],
  };
  const customerGroups = new Map(); // Group vehicles by customer identifier

  // Get the starting auto-mobile number once at the beginning
  const latestCustomer = await CustomersModel.findOne({
    mobile: /^2000000\d{3}$/,
  })
    .sort({ mobile: -1 })
    .lean();

  let autoMobileCounter = 1;
  if (latestCustomer && latestCustomer.mobile) {
    const lastNumber = parseInt(latestCustomer.mobile.substring(7));
    autoMobileCounter = lastNumber + 1;
  }

  // Step 1: Group rows by customer (by mobile only)
  for (const row of excelData) {
    try {
      // Validate required fields
      if (!row.registration_no) {
        throw new Error("Vehicle Registration No is required");
      }
      if (!row.parking_no) {
        throw new Error("Parking No is required");
      }
      if (!row.schedule_type) {
        throw new Error("Schedule Type is required");
      }
      if (!row.amount) {
        throw new Error("Amount is required");
      }

      // Auto-generate mobile if not provided
      // Each row without mobile becomes a separate customer
      let mobile = row.mobile;
      if (!mobile || mobile.trim() === "") {
        mobile = `2000000${String(autoMobileCounter).padStart(3, "0")}`;
        autoMobileCounter++;
        console.log(
          `📱 Auto-generated mobile: ${mobile} for ${row.firstName || "Customer"} - Vehicle ${row.registration_no}`,
        );
      }

      // ✅ Validate Location → Building → Worker chain (case-insensitive)
      let locationDoc = null;
      let buildingDoc = null;
      let workerDoc = null;

      if (row.location) {
        // Find ALL matching locations (handles duplicate location names with different casing)
        // Use \s* around the value to handle leading/trailing whitespace in DB values
        const locationSearchTerm = row.location
          .trim()
          .replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const matchingLocations = await LocationsModel.find({
          isDeleted: false,
          address: {
            $regex: new RegExp(`^\\s*${locationSearchTerm}\\s*$`, "i"),
          },
        }).lean();
        if (!matchingLocations.length) {
          throw new Error(`Location "${row.location}" not found in the system`);
        }
        // Default to the first match
        locationDoc = matchingLocations[0];
      }

      if (row.building) {
        if (!row.location) {
          throw new Error(
            `Building "${row.building}" specified but Location is missing. Please provide Location first.`,
          );
        }

        // Find ALL matching locations to search across all of them for the building
        const locSearchTerm2 = row.location
          .trim()
          .replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const matchingLocations = await LocationsModel.find({
          isDeleted: false,
          address: {
            $regex: new RegExp(`^\\s*${locSearchTerm2}\\s*$`, "i"),
          },
        }).lean();
        const locationIds = matchingLocations.map((l) => l._id.toString());

        const buildingSearchTerm = row.building
          .trim()
          .replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        buildingDoc = await BuildingsModel.findOne({
          isDeleted: false,
          name: {
            $regex: new RegExp(`^\\s*${buildingSearchTerm}\\s*$`, "i"),
          },
          ...(locationIds.length > 0
            ? { location_id: { $in: locationIds } }
            : {}),
        }).lean();
        if (!buildingDoc) {
          throw new Error(
            `Building "${row.building}" not found under location "${row.location}"`,
          );
        }
        // Update locationDoc to the one that actually matches the building
        const matchedLocation = matchingLocations.find(
          (l) => l._id.toString() === buildingDoc.location_id.toString(),
        );
        if (matchedLocation) {
          locationDoc = matchedLocation;
        }
      }

      if (row.worker) {
        if (!row.building) {
          throw new Error(
            `Worker "${row.worker}" specified but Building is missing. Please provide Building first.`,
          );
        }
        const workerSearchTerm = row.worker
          .trim()
          .replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        workerDoc = await WorkersModel.findOne({
          isDeleted: false,
          name: {
            $regex: new RegExp(`^\\s*${workerSearchTerm}\\s*$`, "i"),
          },
          ...(buildingDoc ? { buildings: buildingDoc._id } : {}),
        }).lean();
        if (!workerDoc) {
          throw new Error(
            `Worker "${row.worker}" not found under building "${row.building}"`,
          );
        }
      }

      // Use mobile as the primary grouping key
      if (!customerGroups.has(mobile)) {
        customerGroups.set(mobile, {
          mobile,
          firstName: row.firstName || "",
          lastName: row.lastName || "",
          email: row.email,
          flat_no: row.flat_no || "",
          location: locationDoc ? locationDoc._id : null,
          building: buildingDoc ? buildingDoc._id : null,
          vehicles: [],
        });
      } else {
        // Update location/building if provided on a subsequent row for same customer
        const group = customerGroups.get(mobile);
        if (locationDoc && !group.location) group.location = locationDoc._id;
        if (buildingDoc && !group.building) group.building = buildingDoc._id;
      }

      // Add vehicle to this customer
      const startDate = parseExcelDate(row.start_date) || new Date();
      customerGroups.get(mobile).vehicles.push({
        registration_no: row.registration_no,
        parking_no: row.parking_no || "",
        schedule_type: row.schedule_type,
        schedule_days: row.schedule_days || "",
        amount: parseFloat(row.amount) || 0,
        advance_amount: parseFloat(row.advance_amount) || 0,
        start_date: startDate,
        onboard_date: parseExcelDate(row.onboard_date) || startDate, // Use start_date as fallback
        worker: workerDoc ? workerDoc._id : null,
        status: 1,
        rowNumber: row.rowNumber,
      });
    } catch (err) {
      console.error(
        `❌ Row ${row.rowNumber} Error (${row.firstName || "Customer"}):`,
        err.message,
      );
      results.errors.push({
        row: row.rowNumber,
        name: `${row.firstName || "Customer"} ${row.lastName || ""}`,
        error: err.message,
      });
    }
  }

  // Step 2: Process each customer group
  for (const [mobile, customerData] of customerGroups.entries()) {
    try {
      // Check if customer exists by mobile (exclude soft-deleted)
      let customer = await CustomersModel.findOne({
        mobile: mobile,
        isDeleted: { $ne: true },
      });

      if (customer) {
        console.log(
          `🔄 Updating existing customer: ${customerData.firstName || "Customer"} (Mobile: ${mobile})`,
        );

        // ✅ Snapshot BEFORE values for change tracking
        const beforeSnapshot = {
          firstName: customer.firstName || "",
          lastName: customer.lastName || "",
          email: customer.email || "",
          flat_no: customer.flat_no || "",
          location: customer.location ? customer.location.toString() : null,
          building: customer.building ? customer.building.toString() : null,
          status: customer.status,
          vehicleCount: customer.vehicles ? customer.vehicles.length : 0,
          vehicles: customer.vehicles
            ? customer.vehicles.map((v) => ({
                registration_no: v.registration_no || "",
                parking_no: v.parking_no || "",
                amount: v.amount || 0,
                advance_amount: v.advance_amount || 0,
                schedule_type: v.schedule_type || "",
                worker: v.worker ? v.worker.toString() : null,
                status: v.status,
              }))
            : [],
        };

        // Update customer basic info (keep existing building/location) - only if firstName provided
        if (customerData.firstName) {
          customer.firstName = customerData.firstName;
        }
        if (customerData.lastName) {
          customer.lastName = customerData.lastName;
        }
        if (customerData.email) {
          customer.email = customerData.email;
        }
        if (customerData.flat_no) {
          customer.flat_no = customerData.flat_no;
        }
        // Update location/building if provided in Excel
        if (customerData.location) {
          customer.location = customerData.location;
        }
        if (customerData.building) {
          customer.building = customerData.building;
        }

        // Ensure customer status is active during import
        console.log(
          `  📝 Setting status from ${customer.status} to 1 for mobile: ${mobile}`,
        );
        customer.status = 1;

        // Process each vehicle: check if BOTH vehicle AND parking match together
        for (const newVehicle of customerData.vehicles) {
          // ✅ NEW LOGIC: Check if BOTH registration_no AND parking_no match in THIS customer's vehicles
          const vehicleAndParkingExistInCurrentCustomer =
            customer.vehicles.some(
              (v) =>
                v.registration_no.toLowerCase() ===
                  newVehicle.registration_no.toLowerCase() &&
                (v.parking_no || "").toLowerCase() ===
                  (newVehicle.parking_no || "").toLowerCase(),
            );

          if (vehicleAndParkingExistInCurrentCustomer) {
            console.log(
              `  ⚠️ Vehicle ${newVehicle.registration_no} with parking ${newVehicle.parking_no || "N/A"} already exists for this mobile, skipped`,
            );
            continue;
          }

          // Check if BOTH vehicle AND parking exist with a DIFFERENT active customer (globally)
          const otherCustomerWithVehicleAndParking =
            await CustomersModel.findOne({
              mobile: { $ne: mobile },
              isDeleted: { $ne: true },
              vehicles: {
                $elemMatch: {
                  registration_no: {
                    $regex: new RegExp(`^${newVehicle.registration_no}$`, "i"),
                  },
                  parking_no: {
                    $regex: new RegExp(`^${newVehicle.parking_no || ""}$`, "i"),
                  },
                },
              },
            });

          if (otherCustomerWithVehicleAndParking) {
            console.log(
              `  ⚠️ Vehicle ${newVehicle.registration_no} with parking ${newVehicle.parking_no || "N/A"} already exists with another customer (Mobile: ${otherCustomerWithVehicleAndParking.mobile}), skipped (no transfer)`,
            );
            // ✅ FIX: Don't transfer, just skip
            continue;
          } else {
            // Vehicle+Parking combination doesn't exist anywhere, add it
            customer.vehicles.push(newVehicle);
            console.log(
              `  ➕ Added new vehicle: ${newVehicle.registration_no} (Parking: ${newVehicle.parking_no || "N/A"})`,
            );
          }
        }

        customer.updatedBy = userInfo._id;
        await customer.save(); // ✅ FIX: Use .save() instead of updateOne with document object
        console.log(
          `  ✅ Customer saved. Final status: ${customer.status}, ID: ${customer._id}`,
        );

        // ✅ Build AFTER snapshot and detect changes
        const afterSnapshot = {
          firstName: customer.firstName || "",
          lastName: customer.lastName || "",
          email: customer.email || "",
          flat_no: customer.flat_no || "",
          location: customer.location ? customer.location.toString() : null,
          building: customer.building ? customer.building.toString() : null,
          status: customer.status,
          vehicleCount: customer.vehicles ? customer.vehicles.length : 0,
          vehicles: customer.vehicles
            ? customer.vehicles.map((v) => ({
                registration_no: v.registration_no || "",
                parking_no: v.parking_no || "",
                amount: v.amount || 0,
                advance_amount: v.advance_amount || 0,
                schedule_type: v.schedule_type || "",
                worker: v.worker ? v.worker.toString() : null,
                status: v.status,
              }))
            : [],
        };

        // Compare and collect field-level changes
        const fieldChanges = [];
        const fieldsToCheck = [
          "firstName",
          "lastName",
          "email",
          "flat_no",
          "status",
        ];
        for (const field of fieldsToCheck) {
          if (
            String(beforeSnapshot[field] || "") !==
            String(afterSnapshot[field] || "")
          ) {
            fieldChanges.push({
              field,
              before: beforeSnapshot[field],
              after: afterSnapshot[field],
            });
          }
        }

        // Check location/building changes (resolve names for readability)
        if (beforeSnapshot.location !== afterSnapshot.location) {
          let beforeName = null,
            afterName = null;
          if (beforeSnapshot.location) {
            const loc = await LocationsModel.findById(
              beforeSnapshot.location,
            ).lean();
            beforeName = loc ? loc.address : beforeSnapshot.location;
          }
          if (afterSnapshot.location) {
            const loc = await LocationsModel.findById(
              afterSnapshot.location,
            ).lean();
            afterName = loc ? loc.address : afterSnapshot.location;
          }
          fieldChanges.push({
            field: "location",
            before: beforeName,
            after: afterName,
          });
        }
        if (beforeSnapshot.building !== afterSnapshot.building) {
          let beforeName = null,
            afterName = null;
          if (beforeSnapshot.building) {
            const bld = await BuildingsModel.findById(
              beforeSnapshot.building,
            ).lean();
            beforeName = bld ? bld.name : beforeSnapshot.building;
          }
          if (afterSnapshot.building) {
            const bld = await BuildingsModel.findById(
              afterSnapshot.building,
            ).lean();
            afterName = bld ? bld.name : afterSnapshot.building;
          }
          fieldChanges.push({
            field: "building",
            before: beforeName,
            after: afterName,
          });
        }

        // Check for new vehicles added
        if (afterSnapshot.vehicleCount > beforeSnapshot.vehicleCount) {
          const newCount =
            afterSnapshot.vehicleCount - beforeSnapshot.vehicleCount;
          fieldChanges.push({
            field: "vehicles_added",
            before: `${beforeSnapshot.vehicleCount} vehicle(s)`,
            after: `${afterSnapshot.vehicleCount} vehicle(s) (+${newCount} new)`,
          });
        }

        // Only record if there were actual changes
        if (fieldChanges.length > 0) {
          results.changes.push({
            customerId: customer._id,
            customerName:
              `${customer.firstName || ""} ${customer.lastName || ""}`.trim(),
            mobile: customer.mobile,
            action: "updated",
            fields: fieldChanges,
          });
        }

        results.updated++; // Count customers updated
      } else {
        console.log(
          `➕ Checking new customer: ${customerData.firstName} (Mobile: ${mobile}) with ${customerData.vehicles.length} vehicle(s)`,
        );

        // ✅ FIX: Before creating new customer, check if vehicle+parking combination exists
        // If all vehicles exist, don't create customer at all
        const vehiclesToAdd = [];
        let hasExistingVehicles = false;

        for (const newVehicle of customerData.vehicles) {
          // Check if BOTH vehicle AND parking exist with ANY active customer
          const otherCustomerWithVehicleAndParking =
            await CustomersModel.findOne({
              isDeleted: { $ne: true },
              vehicles: {
                $elemMatch: {
                  registration_no: {
                    $regex: new RegExp(`^${newVehicle.registration_no}$`, "i"),
                  },
                  parking_no: {
                    $regex: new RegExp(`^${newVehicle.parking_no || ""}$`, "i"),
                  },
                },
              },
            });

          if (otherCustomerWithVehicleAndParking) {
            console.log(
              `  ⚠️ Vehicle ${newVehicle.registration_no} with parking ${newVehicle.parking_no || "N/A"} already exists with customer (Mobile: ${otherCustomerWithVehicleAndParking.mobile}), skipped (no customer creation)`,
            );
            hasExistingVehicles = true;
            // ✅ FIX: Don't transfer, don't add to list
          } else {
            // Vehicle+Parking combination doesn't exist, can add it
            vehiclesToAdd.push(newVehicle);
            console.log(
              `  ✅ Vehicle ${newVehicle.registration_no} (Parking: ${newVehicle.parking_no || "N/A"}) is new, will be added`,
            );
          }
        }

        // Only create customer if there are new vehicles to add
        if (vehiclesToAdd.length > 0) {
          const id = await CounterService.id("customers");
          const newCustomer = {
            id,
            firstName: customerData.firstName,
            lastName: customerData.lastName || "",
            mobile: mobile,
            email: customerData.email || "",
            flat_no: customerData.flat_no || "",
            building: customerData.building || null,
            location: customerData.location || null,
            vehicles: vehiclesToAdd,
            status: 1,
            isDeleted: false,
            createdBy: userInfo._id,
          };

          const savedCustomer = await new CustomersModel(newCustomer).save();
          results.created++;

          // Track created record details
          let locationName = null,
            buildingName = null;
          if (customerData.location) {
            const loc = await LocationsModel.findById(
              customerData.location,
            ).lean();
            locationName = loc ? loc.address : null;
          }
          if (customerData.building) {
            const bld = await BuildingsModel.findById(
              customerData.building,
            ).lean();
            buildingName = bld ? bld.name : null;
          }
          results.createdRecords.push({
            customerId: savedCustomer._id,
            customerName:
              `${customerData.firstName || ""} ${customerData.lastName || ""}`.trim(),
            mobile: mobile,
            email: customerData.email || "",
            flat_no: customerData.flat_no || "",
            location: locationName,
            building: buildingName,
            vehicleCount: vehiclesToAdd.length,
            vehicles: vehiclesToAdd.map((v) => ({
              registration_no: v.registration_no,
              parking_no: v.parking_no,
              amount: v.amount,
              schedule_type: v.schedule_type,
            })),
          });
          console.log(
            `  ✅ Created new customer with ${vehiclesToAdd.length} vehicle(s)`,
          );
        } else {
          console.log(
            `  ⚠️ Skipped creating customer - all vehicles already exist`,
          );
        }
      }

      results.success += customerData.vehicles.length;
    } catch (err) {
      console.error(
        `❌ Customer Error (${customerData.firstName}):`,
        err.message,
      );
      results.errors.push({
        row: customerData.vehicles[0]?.rowNumber || 0,
        name: `${customerData.firstName} ${customerData.lastName}`,
        error: err.message,
      });
    }
  }

  console.log("🏁 [CUSTOMER IMPORT COMPLETE]", results);

  // Save import log with full history tracked
  const importLog = await new ImportLogsModel({
    type: "customers-import-excel",
    logs: {
      success: results.success,
      errors: results.errors,
      created: results.created,
      updated: results.updated,
      changes: results.changes,
      createdRecords: results.createdRecords,
    },
  }).save();

  return { _id: importLog._id, ...results };
};
