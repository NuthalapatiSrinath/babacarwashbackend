const BookingsModel = require("../../models/bookings.model");
const CustomersModel = require("../../models/customers.model");
const JobsModel = require("../../models/jobs.model");
const OneWashModel = require("../../models/onewash.model");
const PaymentsModel = require("../../models/payments.model");
const CounterService = require("../../../utils/counters");
const CommonHelper = require("../../../helpers/common.helper");
const InAppNotifications = require("../../../notifications/in-app.notifications");
const mongoose = require("mongoose");

const service = module.exports;

const isValidObjectId = (value) =>
  typeof value === "string" && mongoose.Types.ObjectId.isValid(value);

service.list = async (userInfo, query) => {
  const paginationData = CommonHelper.paginationData(query);
  const total = await BookingsModel.countDocuments({ isDeleted: false });
  const data = await BookingsModel.find({ isDeleted: false })
    .sort({ _id: -1 })
    .skip(paginationData.skip)
    .limit(paginationData.limit)
    .populate([
      { path: "customer" },
      { path: "mall", select: "name" },
      { path: "worker", select: "name" },
    ])
    .lean();

  const locationIds = new Set();
  const buildingIds = new Set();

  for (const item of data) {
    if (isValidObjectId(item.location)) locationIds.add(item.location);
    if (isValidObjectId(item.building)) buildingIds.add(item.building);
    if (item.customer) {
      if (isValidObjectId(item.customer.location)) {
        locationIds.add(item.customer.location);
      }
      if (isValidObjectId(item.customer.building)) {
        buildingIds.add(item.customer.building);
      }
    }
  }

  const [locations, buildings] = await Promise.all([
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
  const buildingMap = new Map(buildings.map((b) => [String(b._id), b]));

  for (const iterator of data) {
    if (isValidObjectId(iterator.location)) {
      iterator.location = locationMap.get(String(iterator.location)) || null;
    }
    if (isValidObjectId(iterator.building)) {
      iterator.building = buildingMap.get(String(iterator.building)) || null;
    }

    if (iterator.customer) {
      if (isValidObjectId(iterator.customer.location)) {
        iterator.customer.location =
          locationMap.get(String(iterator.customer.location)) || null;
      }
      if (isValidObjectId(iterator.customer.building)) {
        iterator.customer.building =
          buildingMap.get(String(iterator.customer.building)) || null;
      }
    }

    iterator.vehicle = iterator?.customer?.vehicles.find(
      (e) => e._id == iterator.vehicle,
    );
  }
  return { total, data };
};

service.info = async (userInfo, id) => {
  return BookingsModel.findOne({ _id: id, isDeleted: false }).lean();
};

service.create = async (userInfo, payload) => {
  const id = await CounterService.id("bookings");
  const data = {
    createdBy: userInfo._id,
    updatedBy: userInfo._id,
    id,
    ...payload,
  };
  await new BookingsModel(data).save();
};

service.update = async (userInfo, id, payload) => {
  await BookingsModel.updateOne({ _id: id }, { $set: payload });
};

service.delete = async (userInfo, id, payload) => {
  const numericId = Number(id);
  const bookingData = await BookingsModel.findOne({
    $or: [
      { _id: id },
      ...(Number.isFinite(numericId) ? [{ id: numericId }] : []),
    ],
  }).lean();

  if (!bookingData) {
    throw "Booking not found.";
  }

  const jobMatchOr = [{ booking: bookingData._id }];

  // Fallback cleanup for legacy jobs created from customer bookings without booking linkage.
  if (bookingData.customer && bookingData.vehicle && bookingData.service_type) {
    const bookingDate = bookingData.date
      ? new Date(bookingData.date)
      : new Date(bookingData.createdAt || Date.now());
    const dayStart = new Date(bookingDate);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(bookingDate);
    dayEnd.setHours(23, 59, 59, 999);

    jobMatchOr.push({
      createdBy: "Customer Booking",
      customer: bookingData.customer,
      vehicle: bookingData.vehicle,
      service_type: bookingData.service_type,
      assignedDate: { $gte: dayStart, $lte: dayEnd },
      immediate: true,
    });
  }

  const linkedJobs = await JobsModel.find(
    { $or: jobMatchOr },
    { _id: 1 },
  ).lean();
  const jobIds = linkedJobs.map((job) => job._id);

  const onewashMatchOr = [{ booking: bookingData._id }];

  if (bookingData.customer && bookingData.vehicle && bookingData.service_type) {
    const bookingDate = bookingData.date
      ? new Date(bookingData.date)
      : new Date(bookingData.createdAt || Date.now());
    const dayStart = new Date(bookingDate);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(bookingDate);
    dayEnd.setHours(23, 59, 59, 999);

    onewashMatchOr.push({
      createdBy: "Customer Booking",
      customer: bookingData.customer,
      service_type: bookingData.service_type,
      createdAt: { $gte: dayStart, $lte: dayEnd },
      isDeleted: false,
    });
  }

  const linkedOneWashJobs = await OneWashModel.find(
    { $or: onewashMatchOr },
    { _id: 1 },
  ).lean();
  const onewashJobIds = linkedOneWashJobs.map((job) => job._id);

  if (jobIds.length) {
    await PaymentsModel.deleteMany({ job: { $in: jobIds } });
    await JobsModel.deleteMany({ _id: { $in: jobIds } });
  }

  if (onewashJobIds.length) {
    await PaymentsModel.deleteMany({ job: { $in: onewashJobIds } });
    await OneWashModel.deleteMany({ _id: { $in: onewashJobIds } });
  }

  return await BookingsModel.deleteOne({ _id: bookingData._id });
};

service.undoDelete = async (userInfo, id) => {
  throw "Undo is not available because bookings are permanently deleted.";
};

service.assignWorker = async (userInfo, bookingId, payload) => {
  const bookingData = await BookingsModel.findOne({ _id: bookingId })
    .populate("customer mall worker")
    .lean();
  if (bookingData.service_type == "residence") {
    await CustomersModel.updateOne(
      { _id: bookingData.customer },
      {
        $set: {
          location: payload.location,
          building: payload.building,
        },
      },
    );
    await CustomersModel.updateOne(
      { "vehicles._id": bookingData.vehicle },
      {
        $set: {
          "vehicles.$.worker": payload.worker,
        },
      },
    );
  }
  await BookingsModel.updateOne({ _id: bookingId }, { $set: payload });
};

service.accept = async (userInfo, bookingId) => {
  const bookingData = await BookingsModel.findOne({ _id: bookingId })
    .populate("customer")
    .lean();
  const vehicleData = bookingData.customer.vehicles.find(
    (e) => e._id == bookingData.vehicle,
  );

  if (bookingData.service_type == "residence") {
    const existingResidentialJob = await JobsModel.findOne({
      booking: bookingData._id,
      createdBy: "Customer Booking",
      isDeleted: false,
    }).lean();

    const residentialJobData = {
      vehicle: bookingData.vehicle,
      registration_no: vehicleData.registration_no,
      parking_no: bookingData.parking_no || vehicleData.parking_no,
      worker: bookingData.worker || vehicleData.worker || null,
      customer: bookingData.customer._id,
      location: bookingData.location || bookingData.customer.location || null,
      building: bookingData.building || bookingData.customer.building || null,
      amount: bookingData.amount,
      service_type: bookingData.service_type,
      // Residence staff list uses current shift window; using "now" guarantees immediate visibility.
      assignedDate: new Date(),
      booking: bookingData._id,
      createdBy: "Customer Booking",
      createdByName: "Customer Booking",
      createdSource: "Customer App",
      onewash: true,
      immediate: true,
    };

    if (existingResidentialJob?._id) {
      await JobsModel.updateOne(
        { _id: existingResidentialJob._id },
        {
          $set: {
            ...residentialJobData,
            status: existingResidentialJob.status || "pending",
            updatedBy: userInfo._id,
          },
        },
      );
    } else {
      const id = await CounterService.id("jobs");
      await new JobsModel({
        id,
        ...residentialJobData,
        status: "pending",
      }).save();
    }
  }

  if (bookingData.service_type == "mall") {
    const existingMallJob = await JobsModel.findOne({
      booking: bookingData._id,
      createdBy: "Customer Booking",
      isDeleted: false,
    }).lean();

    const mallJobData = {
      vehicle: bookingData.vehicle,
      parking_no: bookingData.parking_no,
      parking_floor: bookingData.parking_floor,
      registration_no: vehicleData.registration_no,
      worker: bookingData.worker || vehicleData.worker || null,
      mall: bookingData.mall,
      customer: bookingData.customer._id,
      amount: bookingData.amount,
      service_type: bookingData.service_type,
      // Ensure the accepted customer booking is visible immediately in staff jobs.
      assignedDate: new Date(),
      booking: bookingData._id,
      createdBy: "Customer Booking",
      createdByName: "Customer Booking",
      createdSource: "Customer App",
      onewash: true,
      immediate: true,
    };

    if (existingMallJob?._id) {
      await JobsModel.updateOne(
        { _id: existingMallJob._id },
        {
          $set: {
            ...mallJobData,
            status: existingMallJob.status || "pending",
            updatedBy: userInfo._id,
          },
        },
      );
    } else {
      const id = await CounterService.id("jobs");
      await new JobsModel({
        id,
        ...mallJobData,
        status: "pending",
      }).save();
    }
  }

  if (bookingData.service_type == "mobile") {
    const id = await CounterService.id("jobs");
    const jobData = {
      id,
      vehicle: bookingData.vehicle,
      address: bookingData.address,
      registration_no: vehicleData.registration_no,
      customer: bookingData.customer._id,
      amount: bookingData.amount,
      locationMap: bookingData.location,
      worker: bookingData.worker,
      service_type: bookingData.service_type,
      assignedDate: new Date(bookingData.date),
      booking: bookingData._id,
      createdBy: "Customer Booking",
      createdByName: "Customer Booking",
      createdSource: "Customer App",
      onewash: true,
      immediate: true,
    };

    delete bookingData.location;

    await new JobsModel(jobData).save();
  }

  await InAppNotifications.send({
    worker: bookingData.worker,
    type: "new-booking",
    payload: {
      parking_no: bookingData.parking_no,
      registration_no: vehicleData.registration_no,
      worker: bookingData.worker,
      customer: bookingData.customer._id,
    },
  });

  await BookingsModel.updateOne(
    { _id: bookingId },
    { $set: { status: "accepted" } },
  );
};
