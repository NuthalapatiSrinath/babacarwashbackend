const exceljs = require("exceljs");
const moment = require("moment");

const WorkersModel = require("../../models/workers.model");
const StaffModel = require("../../models/staff.model");
const AttendanceModel = require("../../models/attendance.model");

const service = module.exports;

service.orgList = async (userInfo, query) => {
  const WorkersData = await WorkersModel.find({ isDeleted: false }).lean();
  const StaffData = await StaffModel.find({ isDeleted: false }).lean();
  return [...WorkersData, ...StaffData];
};

service.list = async (userInfo, query) => {
  const findQuery = {
    ...(query.startDate
      ? {
          date: {
            $gte: new Date(query.startDate),
            $lte: new Date(query.endDate),
          },
        }
      : null),
    ...(query.search
      ? { $or: [{ name: { $regex: query.search, $options: "i" } }] }
      : null),
    ...(query.worker
      ? { $or: [{ worker: query.worker }, { staff: query.worker }] }
      : null),
  };

  if (query.premise == "site") {
    const staffQuery = {
      isDeleted: false,
      ...(query.site ? { site: query.site } : null),
    };
    const staffData = await StaffModel.find(staffQuery, { _id: 1 }).lean();
    findQuery.staff = { $in: staffData.map((e) => e._id) };
  }

  if (["mall", "residence"].includes(query.premise)) {
    const workerQuery = {
      isDeleted: false,
      service_type: query.premise,
      ...(query.mall ? { malls: { $in: query.mall } } : null),
      ...(query.building
        ? {
            buildings: {
              $in: (Array.isArray(query.building)
                ? query.building
                : [query.building]
              ).filter((b) => b && b.trim()),
            },
          }
        : null),
    };
    const staffData = await WorkersModel.find(workerQuery, { _id: 1 }).lean();
    findQuery.worker = { $in: staffData.map((e) => e._id) };
  }

  const data = await AttendanceModel.find(findQuery)
    .sort({ _id: -1 })
    .populate("worker staff")
    .lean();

  return { data };
};

service.update = async (userInfo, payload) => {
  const updateData = {
    present: payload.present,
    type: payload.type,
    ...(payload.notes ? { notes: payload.notes } : null),
  };
  await AttendanceModel.updateMany(
    { _id: { $in: payload.ids } },
    { $set: updateData }
  );
};

service.exportData = async (userInfo, query) => {
  const findQuery = {
    ...(query.startDate
      ? {
          date: {
            $gte: new Date(query.startDate),
            $lte: new Date(query.endDate),
          },
        }
      : null),
    ...(query.search
      ? { $or: [{ name: { $regex: query.search, $options: "i" } }] }
      : null),
    ...(query.worker
      ? { $or: [{ worker: query.worker }, { staff: query.worker }] }
      : null),
  };

  if (query.premise == "site") {
    const staffQuery = {
      isDeleted: false,
      ...(query.site ? { site: query.site } : null),
    };
    const staffData = await StaffModel.find(staffQuery, { _id: 1 }).lean();
    findQuery.staff = { $in: staffData.map((e) => e._id) };
  }

  if (["mall", "residence"].includes(query.premise)) {
    const workerQuery = {
      isDeleted: false,
      service_type: query.premise,
      ...(query.mall ? { malls: { $in: query.mall } } : null),
      ...(query.building
        ? {
            buildings: {
              $in: (Array.isArray(query.building)
                ? query.building
                : [query.building]
              ).filter((b) => b && b.trim()),
            },
          }
        : null),
    };
    const staffData = await WorkersModel.find(workerQuery, { _id: 1 }).lean();
    findQuery.worker = { $in: staffData.map((e) => e._id) };
  }

  const data = await AttendanceModel.find(findQuery)
    .sort({ _id: -1 })
    .populate("worker staff")
    .lean();

  const workbook = new exceljs.Workbook();
  const worksheet = workbook.addWorksheet("Report");

  worksheet.addRow(["Date", "Name", "Status", "Notes"]);

  for (const iterator of data) {
    iterator.date = moment(iterator.completedDate).format("DD-MM-YYYY");
    iterator.name = iterator.worker
      ? iterator.worker.name
      : iterator.staff.name;
    iterator.status = iterator.present
      ? "PRESENT"
      : iterator.type.toUpperCase();
    worksheet.addRow([
      iterator.date,
      iterator.name,
      iterator.status,
      iterator.notes,
    ]);
  }

  return workbook;
};
