const BookingsModel = require("../../models/bookings.model");
const CustomersModel = require("../../models/customers.model");
const ConfigurationsModel = require("../../models/configurations.model");
const CounterService = require("../../../utils/counters");
const EmailNotificationService = require("../../../notifications/email.notifications");
const CommonHelper = require("../../../helpers/common.helper");
const service = module.exports;

service.list = async (userInfo, query) => {
  const customerCandidates = [
    userInfo._id,
    String(userInfo._id),
    userInfo._id?.toString?.(),
  ].filter(Boolean);

  const customerQuery = { customer: { $in: [...new Set(customerCandidates)] } };

  const paginationData = CommonHelper.paginationData(query);
  const total = await BookingsModel.countDocuments({
    ...customerQuery,
    isDeleted: false,
  });
  const data = await BookingsModel.find({
    ...customerQuery,
    isDeleted: false,
  })
    .sort({ _id: -1 })
    .skip(paginationData.skip)
    .limit(paginationData.limit)
    .populate("customer mall worker")
    .lean();
  for (const iterator of data) {
    iterator.vehicle = iterator.customer.vehicles.find(
      (e) => e._id == iterator.vehicle,
    );
  }
  const configurationsData = await ConfigurationsModel.findOne({});
  return { total, data, configurationsData };
};

service.info = async (userInfo, id) => {
  return BookingsModel.findOne({ _id: id, isDeleted: false }).lean();
};

service.create = async (userInfo, payload) => {
  let id = await CounterService.id("bookings");
  let customerData = await CustomersModel.findOne({ _id: userInfo._id }).lean();
  let vehicleData = customerData.vehicles.find((e) => e._id == payload.vehicle);

  const parkingNo = (payload.parking_no || "").toString().trim();
  if (parkingNo) {
    await CustomersModel.updateOne(
      { "vehicles._id": payload.vehicle },
      { $set: { "vehicles.$.parking_no": parkingNo } },
    );
    payload.parking_no = parkingNo;
  }

  // Auto-note vehicle start date on first booking for better admin visibility.
  if (vehicleData && !vehicleData.start_date) {
    const startedAt = payload.start_date || payload.date || new Date();
    await CustomersModel.updateOne(
      { "vehicles._id": payload.vehicle },
      { $set: { "vehicles.$.start_date": startedAt } },
    );
  }

  if (payload.service_type == "residence") {
    // Normalize schedule_days to proper case
    const dayNameMap = {
      sun: "Sun",
      mon: "Mon",
      tue: "Tue",
      wed: "Wed",
      thu: "Thu",
      fri: "Fri",
      sat: "Sat",
      sunday: "Sun",
      monday: "Mon",
      tuesday: "Tue",
      wednesday: "Wed",
      thursday: "Thu",
      friday: "Fri",
      saturday: "Sat",
    };
    if (payload.schedule_days && Array.isArray(payload.schedule_days)) {
      payload.schedule_days = payload.schedule_days.map((d) => {
        if (typeof d === "object" && d.day) {
          return { ...d, day: dayNameMap[d.day.toLowerCase()] || d.day };
        } else if (typeof d === "string") {
          return dayNameMap[d.toLowerCase()] || d;
        }
        return d;
      });
    }
    await CustomersModel.updateOne(
      { _id: userInfo._id },
      { $set: { flat_no: payload.flat_no } },
    );
    await CustomersModel.updateOne(
      { "vehicles._id": payload.vehicle },
      {
        $set: {
          "vehicles.$.schedule_type": payload.schedule_type,
          "vehicles.$.schedule_days": payload.schedule_days,
          "vehicles.$.start_date": payload.start_date,
          "vehicles.$.parking_no": payload.parking_no,
          "vehicles.$.amount": payload.amount,
        },
      },
    );
  }

  const data = {
    createdBy: userInfo._id,
    updatedBy: userInfo._id,
    id,
    ...payload,
    customer: userInfo._id,
  };

  await EmailNotificationService.sendMail({
    email: "customerregistration@babagroup.ae",
    subject: `Hooray! We've received a new ${payload.service_type.toUpperCase()} booking.`,
    body: `
            <p>Hi.</p>
            <p>
                A booking has been made by <b>${customerData.mobile}</b>
                for car number <b>${vehicleData.registration_no}</b> of type <b>${vehicleData.vehicle_type}</b>
            </p>
            <p> For more details <a href="http://3.29.249.5:3001/bookings" target="_blank">View bookings</a> </p>
            <p>Thank you</p>
        `,
  });

  await new BookingsModel(data).save();
};

service.update = async (userInfo, id, payload) => {
  await BookingsModel.updateOne({ _id: id }, { $set: payload });
};

service.delete = async (userInfo, id, payload) => {
  return await BookingsModel.deleteOne({ _id: id, customer: userInfo._id });
};

service.undoDelete = async (userInfo, id) => {
  throw "Undo is not available because bookings are permanently deleted.";
};
