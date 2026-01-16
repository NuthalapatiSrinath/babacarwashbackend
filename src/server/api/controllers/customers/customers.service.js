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
const mongoose = require("mongoose");
const service = module.exports;

// ---------------------------------------------------------
// STANDARD CRUD
// ---------------------------------------------------------

service.list = async (userInfo, query) => {
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

  // ✅ COUNT CUSTOMERS (Matches Pagination Logic)
  const total = await CustomersModel.countDocuments(findQuery);

  let data = await CustomersModel.find(findQuery)
    .sort({ _id: -1 })
    .skip(paginationData.skip)
    .limit(paginationData.limit)
    .lean();

  // Populate references
  for (let customer of data) {
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
        customer.building = null;
      }
    }

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
            vehicle.worker = null;
          }
        }
      }
    }
  }

  // Filter vehicles for display
  for (const iterator of data) {
    iterator.vehicles = iterator.vehicles.filter(
      (e) => e.status == (Number(query.status) || 1)
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

service.delete = async (userInfo, id, reason) => {
  return await CustomersModel.updateOne(
    { _id: id },
    {
      isDeleted: true,
      deletedBy: userInfo._id,
      deletedAt: new Date(),
      deleteReason: reason || null,
    }
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

service.archive = async (userInfo, id, payload) => {
  return await CustomersModel.updateOne(
    { _id: id },
    { $set: { status: 9, archivedAt: new Date(), archivedBy: userInfo._id } }
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

      return {
        registration_no: data.registration_no || data.vehicleNo,
        parking_no: data.parking_no || data.parkingNo,
        worker: worker ? worker._id : null,
        amount: data.amount || 0,
        schedule_type: data.schedule_type || "daily",
        schedule_days,
        start_date: data.start_date || new Date(),
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
            building
          );
          await CustomersModel.updateOne(
            { _id: customerInfo._id },
            { $set: customerUpdateData }
          );

          const regNo = iterator.registration_no;
          const hasVehicle = customerInfo.vehicles.find(
            (v) => v.registration_no === regNo
          );

          if (hasVehicle) {
            const vehicleUpdateData = buildPayload.vehicle(iterator, worker);
            await CustomersModel.updateOne(
              { "vehicles._id": hasVehicle._id },
              { $set: { "vehicles.$": vehicleUpdateData } }
            );
            counts.success++;
            continue;
          }
          addVehicle = true;
        }

        const vehicleInfo = buildPayload.vehicle(iterator, worker);

        if (addVehicle) {
          await CustomersModel.updateOne(
            { _id: customerInfo._id },
            { $push: { vehicles: vehicleInfo } }
          );
        } else {
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
    {}
  );
  const locationMap = locations.reduce(
    (acc, cur) => ({ ...acc, [cur._id]: cur.address }),
    {}
  );
  const workerMap = workers.reduce(
    (acc, cur) => ({ ...acc, [cur._id]: cur.name }),
    {}
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
  const total = await JobsModel.countDocuments(findQuery);
  let data = await JobsModel.find(findQuery)
    .sort({ _id: -1 })
    .skip(paginationData.skip)
    .limit(paginationData.limit)
    .lean();
  return { total, data };
};

service.exportWashesList = async (userInfo, query, customerId) => {
  const findQuery = { isDeleted: false, customer: customerId };
  let data = await JobsModel.find(findQuery).sort({ _id: -1 }).lean();
  const exportMap = [];
  for (const iterator of data) {
    exportMap.push({
      scheduleId: iterator.scheduleId || "",
      assignedDate: iterator.assignedDate
        ? moment(iterator.assignedDate).format("YYYY-MM-DD HH:mm:ss")
        : "",
      status: (iterator.status || "").toUpperCase(),
    });
  }
  return exportMap;
};
