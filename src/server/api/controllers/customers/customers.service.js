const CustomersModel = require("../../models/customers.model");
const LocationsModel = require("../locations/locations.model");
const BuildingsModel = require("../../models/buildings.model");
const MallsModel = require("../../models/malls.model");
const WorkersModel = require("../../models/workers.model");
const ImportLogsModel = require("../../models/import-logs.model");
const CounterService = require("../../../utils/counters");
const CommonHelper = require("../../../helpers/common.helper");
const JobsService = require("../../staff/jobs/jobs.service");
const JobsModel = require("../../models/jobs.model");
const moment = require("moment");
const service = module.exports;

service.list = async (userInfo, query) => {
  console.log("🔍 [CUSTOMERS SERVICE] List called with query:", query);

  const paginationData = CommonHelper.paginationData(query);
  const findQuery = {
    isDeleted: false,
    "vehicles.status": Number(query.status) || 1,
    ...(query.search
      ? {
          $or: [
            { mobile: { $regex: query.search, $options: "i" } },
            { flat_no: { $regex: query.search, $options: "i" } },
            {
              "vehicles.registration_no": {
                $regex: query.search,
                $options: "i",
              },
            },
            { "vehicles.parking_no": { $regex: query.search, $options: "i" } },
          ],
        }
      : null),
  };

  if (query.search) {
    const buildings = await BuildingsModel.find(
      { isDeleted: false, name: { $regex: query.search, $options: "i" } },
      { _id: 1 }
    ).lean();

    if (buildings.length) {
      findQuery.$or.push({
        building: { $in: buildings.map((e) => e._id.toString()) },
      });
    }

    const workers = await WorkersModel.find(
      { isDeleted: false, name: { $regex: query.search, $options: "i" } },
      { _id: 1 }
    ).lean();

    if (workers.length) {
      findQuery.$or.push({
        "vehicles.worker": { $in: workers.map((e) => e._id.toString()) },
      });
    }
  }

  const total = await CustomersModel.aggregate([
    { $match: findQuery },
    {
      $group: {
        _id: null,
        total: { $sum: { $size: "$vehicles" } },
      },
    },
  ]);

  // Fetch without populate first to avoid errors with invalid ObjectIds
  let data = await CustomersModel.find(findQuery)
    .sort({ _id: -1 })
    .skip(paginationData.skip)
    .limit(paginationData.limit)
    .lean();

  // Populate each reference separately with error handling
  for (let customer of data) {
    // Populate building
    if (customer.building) {
      try {
        const building = await BuildingsModel.findOne({
          _id: customer.building,
          isDeleted: false,
        })
          .populate("location_id")
          .lean();
        customer.building = building || null;
      } catch (e) {
        console.log("⚠️ Failed to populate building:", customer.building);
        customer.building = null;
      }
    }

    // Populate workers for each vehicle
    if (customer.vehicles && customer.vehicles.length > 0) {
      for (let vehicle of customer.vehicles) {
        if (vehicle.worker) {
          try {
            const worker = await WorkersModel.findOne({
              _id: vehicle.worker,
              isDeleted: false,
            }).lean();
            vehicle.worker = worker || null;
          } catch (e) {
            console.log("⚠️ Failed to populate worker:", vehicle.worker);
            vehicle.worker = null;
          }
        }
      }
    }
  }

  for (const iterator of data) {
    iterator.vehicles = iterator.vehicles.filter(
      (e) => e.status == (Number(query.status) || 1)
    );
  }

  console.log(
    "✅ [CUSTOMERS SERVICE] Returning data, total:",
    total.length ? total[0].total : null,
    "records:",
    data.length
  );

  return { total: total.length ? total[0].total : null, data };
};

service.info = async (userInfo, id) => {
  return CustomersModel.findOne({ _id: id, isDeleted: false }).lean();
};

service.create = async (userInfo, payload) => {
  const findUserQuery = { isDeleted: false, $or: [{ mobile: payload.mobile }] };
  if (payload.email) {
    findUserQuery.$or.push({ email: payload.email });
  }
  const userExists = await CustomersModel.countDocuments(findUserQuery);
  if (userExists) {
    throw "USER-EXISTS";
  }
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
  const vehicle = payload.vehicles[0];
  delete payload.vehicles;
  await CustomersModel.updateOne({ _id: id }, { $set: payload });
  await CustomersModel.updateOne(
    { _id: id, "vehicles._id": vehicle._id },
    { $set: { "vehicles.$": vehicle } }
  );
  const customerData = await CustomersModel.findOne({ _id: id }).lean();
  await JobsService.createJob(customerData);
};

service.delete = async (userInfo, id, payload) => {
  return await CustomersModel.updateOne(
    { _id: id },
    { isDeleted: true, deletedBy: userInfo._id }
  );
};

service.undoDelete = async (userInfo, id) => {
  return await CustomersModel.updateOne(
    { _id: id },
    { isDeleted: false, updatedBy: userInfo._id }
  );
};

service.vehicleDeactivate = async (userInfo, id, payload) => {
  await CustomersModel.updateOne(
    { "vehicles._id": id },
    {
      $set: {
        "vehicles.$.status": 2,
        "vehicles.$.deactivateReason": payload.deactivateReason,
        "vehicles.$.deactivateDate": payload.deactivateDate,
        "vehicles.$.deactivatedBy": userInfo._id,
      },
    }
  );
};

service.vehicleActivate = async (userInfo, id, payload) => {
  await CustomersModel.updateOne(
    { "vehicles._id": id },
    {
      $set: {
        "vehicles.$.status": 1,
        "vehicles.$.start_date": payload.start_date,
        "vehicles.$.activatedBy": userInfo._id,
      },
    }
  );
};

service.deactivate = async (userInfo, id, payload) => {
  await CustomersModel.updateOne(
    { _id: id },
    { $set: { status: 2, ...payload } }
  );
};

// ✅ UPDATED ARCHIVE: Sets status to 9 (as per your existing logic)
service.archive = async (userInfo, id, payload) => {
  return await CustomersModel.updateOne(
    { _id: id },
    { $set: { status: 9, archivedAt: new Date(), archivedBy: userInfo._id } }
  );
};

service.importData = async (userInfo, excelData) => {
  console.log("🔵 [SERVICE] Import started with", excelData?.length, "rows");
  console.log("👤 [SERVICE] User:", userInfo?._id);

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
      };
    },
    vehicle: (data, worker) => {
      const schedule_days = [];
      // Support for Weekly schedule string (e.g., "Mon,Tue")
      if (
        data.schedule_type &&
        data.schedule_type.toLowerCase() === "weekly" &&
        data.schedule_days
      ) {
        for (const day of data.schedule_days.split(",")) {
          let dayValue = day.trim();
          schedule_days.push({
            day: dayValue,
            value: CommonHelper.getDayNumber(dayValue),
          });
        }
      }

      return {
        registration_no: data.registration_no || data.vehicleNo,
        parking_no: data.parking_no || data.parkingNo,
        worker: worker._id,
        amount: data.amount || 0,
        schedule_type: data.schedule_type || "daily",
        schedule_days,
        start_date: data.start_date || data.startDate || new Date(),
        advance_amount: data.advance_amount || data.advance || 0,
        status: 1,
      };
    },
  };

  if (excelData && excelData.length) {
    const counts = { duplicates: [], errors: [], success: 0 };

    for (const iterator of excelData) {
      try {
        console.log("\n📝 [SERVICE] Processing row:", {
          name: `${iterator.firstName} ${iterator.lastName}`,
          mobile: iterator.mobile,
          vehicle: iterator.registration_no,
          worker: iterator.worker,
        });

        if (!iterator.mobile) {
          throw "Mobile number is required";
        }

        if (!iterator.registration_no) {
          throw "Vehicle registration number is required";
        }

        const findUserQuery = {
          isDeleted: false,
          $or: [{ mobile: iterator.mobile }],
        };

        if (iterator.email) findUserQuery.$or.push({ email: iterator.email });

        // 1. Lookups
        console.log("🔍 [SERVICE] Looking up dependencies...");

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

        console.log(
          "🏢 [SERVICE] Building found:",
          building ? building.name : "None"
        );

        const worker = iterator.worker
          ? await WorkersModel.findOne({
              isDeleted: false,
              name: { $regex: new RegExp(iterator.worker.trim(), "i") },
            })
          : null;

        console.log(
          "👷 [SERVICE] Worker found:",
          worker ? worker.name : "None"
        );

        if (!worker) {
          throw `Worker "${
            iterator.worker || "N/A"
          }" not found. Please ensure the worker name exists in the system.`;
        }

        let customerInfo = await CustomersModel.findOne(findUserQuery);
        let addVehicle = false;

        if (customerInfo) {
          console.log(
            "👤 [SERVICE] Existing customer found:",
            customerInfo._id
          );

          // Update existing customer details
          const customerUpdateData = buildPayload.customer(
            iterator,
            location,
            building
          );
          await CustomersModel.updateOne(
            { _id: customerInfo._id },
            { $set: customerUpdateData }
          );

          // Check if vehicle exists for this customer
          const regNo = iterator.registration_no || iterator.vehicleNo;
          const hasVehicle = customerInfo.vehicles.find(
            (v) => v.registration_no === regNo
          );

          if (hasVehicle) {
            console.log("🚗 [SERVICE] Updating existing vehicle");
            const vehicleUpdateData = buildPayload.vehicle(iterator, worker);
            await CustomersModel.updateOne(
              { "vehicles._id": hasVehicle._id },
              { $set: { "vehicles.$": vehicleUpdateData } }
            );
            counts.success++;
            console.log("✅ [SERVICE] Vehicle updated successfully");
            continue;
          }
          addVehicle = true;
          console.log("🚗 [SERVICE] Adding new vehicle to existing customer");
        }

        const vehicleInfo = buildPayload.vehicle(iterator, worker);

        if (addVehicle) {
          await CustomersModel.updateOne(
            { _id: customerInfo._id },
            { $push: { vehicles: vehicleInfo } }
          );
          console.log("✅ [SERVICE] Vehicle added to existing customer");
        } else {
          // Create New Customer
          console.log("👤 [SERVICE] Creating new customer");
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
          console.log("✅ [SERVICE] New customer created:", customerInfo._id);
        }

        // Trigger Job Creation
        console.log("📅 [SERVICE] Creating jobs for customer");
        await JobsService.createJob(customerInfo, "Import API");
        counts.success++;
        console.log("✅ [SERVICE] Row processed successfully");
      } catch (error) {
        console.error("❌ [SERVICE] Import Row Error:", error);
        counts.errors.push({
          row: `${iterator.firstName || ""} ${iterator.lastName || ""} - ${
            iterator.registration_no || iterator.vehicleNo || "N/A"
          }`,
          vehicle: iterator.registration_no || iterator.vehicleNo,
          error: error.message || error,
        });
      }
    }

    console.log("\n📊 [SERVICE] Import Summary:", counts);

    const importLog = await new ImportLogsModel({
      type: "customers-import-excel",
      logs: counts,
    }).save();

    return { _id: importLog._id, ...counts };
  } else {
    throw "No data in the file";
  }
};
service.exportData = async (userInfo, query) => {
  // Use the status from the UI (1 for Active, 2 for Inactive, etc.)
  const findQuery = {
    isDeleted: false,
    "vehicles.status": Number(query.status) || 1,
  };

  const customerData = await CustomersModel.find(findQuery, {
    _id: 0,
    "vehicles._id": 0,
    createdBy: 0,
    updatedBy: 0,
    isDeleted: 0,
    updatedAt: 0,
    id: 0,
    status: 0,
    createdAt: 0,
  })
    .sort({ _id: -1 })
    .populate([
      { path: "location", model: "locations" },
      { path: "building", model: "buildings" },
      { path: "vehicles.worker", model: "workers" },
    ])
    .lean();

  const exportMap = [];

  for (const iterator of customerData) {
    if (!iterator.vehicles || iterator.vehicles.length === 0) continue;

    for (const vehicle of iterator.vehicles) {
      // Only export vehicles that match the status in the query
      if (vehicle.status !== (Number(query.status) || 1)) continue;

      let customer = {
        ...iterator,
        ...vehicle,
        // Optional chaining (?.) prevents crashes if references are missing
        building: iterator.building?.name || "",
        location: iterator.location?.address || "",
        worker: vehicle.worker?.name || "",

        // Formatting schedule days for the Excel sheet
        schedule_days:
          vehicle.schedule_type === "weekly" && vehicle.schedule_days
            ? vehicle.schedule_days.map((e) => e.day).join(", ")
            : "",

        // Formatting dates
        start_date: vehicle.start_date
          ? moment(vehicle.start_date).format("YYYY-MM-DD")
          : "",
        createdAt: vehicle.start_date
          ? moment(vehicle.start_date).format("YYYY-MM-DD")
          : "",
      };

      // Remove the original vehicles array from the flattened row
      delete customer.vehicles;
      exportMap.push(customer);
    }
  }

  return exportMap;
};
service.washesList = async (userInfo, query, customerId) => {
  console.log("🔍 [CUSTOMERS SERVICE] WashesList called");
  console.log("   Customer ID:", customerId);
  console.log("   Query:", query);

  const paginationData = CommonHelper.paginationData(query);
  const findQuery = {
    isDeleted: false,
    customer: customerId,
    ...(query.startDate && query.startDate.trim() !== ""
      ? {
          createdAt: {
            $gte: new Date(query.startDate),
            $lte:
              query.endDate && query.endDate.trim() !== ""
                ? new Date(query.endDate)
                : new Date(),
          },
        }
      : {}),
    ...(query.search
      ? {
          $or: [{ name: { $regex: query.search, $options: "i" } }],
        }
      : {}),
  };

  console.log("   Find Query:", JSON.stringify(findQuery));

  const total = await JobsModel.countDocuments(findQuery);
  console.log("   Total count:", total);

  // Fetch without populate first
  let data = await JobsModel.find(findQuery)
    .sort({ _id: -1 })
    .skip(paginationData.skip)
    .limit(paginationData.limit)
    .lean();

  console.log("   Records found:", data.length);

  // Populate each field separately with error handling
  for (let i = 0; i < data.length; i++) {
    try {
      if (data[i].building) {
        const building = await BuildingsModel.findById(data[i].building).lean();
        data[i].building = building;
      }
    } catch (e) {
      console.warn(
        `Failed to populate building for job ${data[i]._id}:`,
        e.message
      );
      data[i].building = null;
    }

    try {
      if (data[i].location) {
        const location = await LocationsModel.findById(data[i].location).lean();
        data[i].location = location;
      }
    } catch (e) {
      console.warn(
        `Failed to populate location for job ${data[i]._id}:`,
        e.message
      );
      data[i].location = null;
    }

    try {
      if (data[i].mall) {
        const mall = await MallsModel.findById(data[i].mall).lean();
        data[i].mall = mall;
      }
    } catch (e) {
      console.warn(
        `Failed to populate mall for job ${data[i]._id}:`,
        e.message
      );
      data[i].mall = null;
    }

    try {
      if (data[i].customer) {
        const customer = await CustomersModel.findById(data[i].customer).lean();
        console.log(`\n🔍 Job ${data[i].scheduleId}:`);
        console.log(`   Customer: ${customer?.mobile}`);
        console.log(`   Vehicles in customer: ${customer?.vehicles?.length}`);
        console.log(`   Job vehicle ID: ${data[i].vehicle}`);

        // Find vehicle in customer's vehicles array BEFORE replacing customer object
        if (customer && customer.vehicles && data[i].vehicle) {
          const vehicleId = data[i].vehicle.toString();
          console.log(`   Looking for vehicle: ${vehicleId}`);
          console.log(
            `   Available vehicles:`,
            customer.vehicles.map((v) => `${v._id} (${v.registration_no})`)
          );

          const foundVehicle = customer.vehicles.find((v) => {
            if (!v._id) return false;
            const match = v._id.toString() === vehicleId;
            return match;
          });

          data[i].vehicle = foundVehicle || null;
          console.log(
            `   ✅ Result: ${
              foundVehicle
                ? `Found ${foundVehicle.registration_no}`
                : "❌ NOT FOUND"
            }`
          );
        } else {
          console.log(`   ⚠️ No vehicle to match`);
          data[i].vehicle = null;
        }
        data[i].customer = customer;
      }
    } catch (e) {
      console.warn(
        `Failed to populate customer for job ${data[i]._id}:`,
        e.message
      );
      data[i].customer = null;
      data[i].vehicle = null;
    }
  }

  console.log("✅ [CUSTOMERS SERVICE] WashesList completed successfully");
  if (data.length > 0) {
    console.log(
      "📦 Sample job data:",
      JSON.stringify(
        {
          scheduleId: data[0].scheduleId,
          assignedDate: data[0].assignedDate,
          status: data[0].status,
          vehicle: data[0].vehicle
            ? {
                registration_no: data[0].vehicle.registration_no,
                parking_no: data[0].vehicle.parking_no,
              }
            : null,
          building: data[0].building ? { name: data[0].building.name } : null,
          customer: data[0].customer
            ? { mobile: data[0].customer.mobile }
            : null,
        },
        null,
        2
      )
    );
  }
  return { total, data };
};

service.exportWashesList = async (userInfo, query, customerId) => {
  const findQuery = {
    isDeleted: false,
    customer: customerId,
    ...(query.startDate && query.startDate.trim() !== ""
      ? {
          createdAt: {
            $gte: new Date(query.startDate),
            $lte:
              query.endDate && query.endDate.trim() !== ""
                ? new Date(query.endDate)
                : new Date(),
          },
        }
      : {}),
    ...(query.search
      ? {
          $or: [{ name: { $regex: query.search, $options: "i" } }],
        }
      : {}),
  };

  // Fetch without populate first
  let data = await JobsModel.find(findQuery).sort({ _id: -1 }).lean();

  // Populate each field separately with error handling
  for (let i = 0; i < data.length; i++) {
    try {
      if (data[i].building) {
        const building = await BuildingsModel.findById(data[i].building).lean();
        data[i].building = building;
      }
    } catch (e) {
      data[i].building = null;
    }

    try {
      if (data[i].location) {
        const location = await LocationsModel.findById(data[i].location).lean();
        data[i].location = location;
      }
    } catch (e) {
      data[i].location = null;
    }

    try {
      if (data[i].mall) {
        const mall = await MallsModel.findById(data[i].mall).lean();
        data[i].mall = mall;
      }
    } catch (e) {
      data[i].mall = null;
    }

    try {
      if (data[i].customer) {
        const customer = await CustomersModel.findById(data[i].customer).lean();
        // Find vehicle in customer's vehicles array BEFORE replacing customer object
        if (customer && customer.vehicles && data[i].vehicle) {
          const vehicleId = data[i].vehicle.toString();
          data[i].vehicle =
            customer.vehicles.find(
              (v) => v._id && v._id.toString() === vehicleId
            ) || null;
        } else {
          data[i].vehicle = null;
        }
        data[i].customer = customer;
      }
    } catch (e) {
      data[i].customer = null;
      data[i].vehicle = null;
    }
  }

  const exportMap = [];

  for (const iterator of data) {
    const row = {
      scheduleId: iterator.scheduleId || "",
      assignedDate: iterator.assignedDate
        ? moment(iterator.assignedDate).format("YYYY-MM-DD HH:mm:ss")
        : "",
      status: (iterator.status || "").toUpperCase(),
      vehicleNo: iterator.vehicle?.registration_no || "",
      parkingNo: iterator.vehicle?.parking_no || "",
      building: iterator.building?.name || "",
      location: iterator.location?.address || "",
      customerMobile: iterator.customer?.mobile || "",
      customerName: iterator.customer?.firstName
        ? `${iterator.customer.firstName} ${
            iterator.customer.lastName || ""
          }`.trim()
        : "",
    };
    exportMap.push(row);
  }

  return exportMap;
};
