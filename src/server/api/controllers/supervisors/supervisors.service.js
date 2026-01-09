const exceljs = require("exceljs");
const moment = require("moment");
const UsersModel = require("../../models/users.model");
const WorkersModel = require("../../models/workers.model");
const OneWashModel = require("../../models/onewash.model");
const CounterService = require("../../../utils/counters");
const CommonHelper = require("../../../helpers/common.helper");
const AuthHelper = require("../auth/auth.helper");
const service = module.exports;

service.list = async (userInfo, query) => {
  const paginationData = CommonHelper.paginationData(query);
  const findQuery = { isDeleted: false, role: "supervisor" };
  const total = await UsersModel.countDocuments(findQuery);
  const data = await UsersModel.find(findQuery)
    .sort({ _id: -1 })
    .skip(paginationData.skip)
    .limit(paginationData.limit)
    .populate([
      {
        path: "buildings",
        model: "buildings",
        populate: [{ path: "location_id", model: "locations" }],
      },
      {
        path: "mall",
        model: "malls",
      },
    ])
    .lean();
  return { total, data };
};

service.info = async (userInfo, id) => {
  return UsersModel.findOne({ _id: id, isDeleted: false }).lean();
};

service.create = async (userInfo, payload) => {
  const id = await CounterService.id("users");
  const isExists = await UsersModel.countDocuments({
    role: "supervisor",
    isDeleted: false,
    number: payload.number,
  });
  if (isExists) {
    throw "Oops! The supervisor already created";
  }
  const data = {
    id,
    ...payload,
    createdBy: userInfo._id,
    updatedBy: userInfo._id,
    role: "supervisor",
    hPassword: AuthHelper.getPasswordHash(payload.password),
  };
  await new UsersModel(data).save();
};

service.update = async (userInfo, id, payload) => {
  await UsersModel.updateOne({ _id: id }, { $set: payload });
};

service.delete = async (userInfo, id, payload) => {
  return await UsersModel.updateOne(
    { _id: id },
    { isDeleted: true, deletedBy: userInfo._id }
  );
};

service.undoDelete = async (userInfo, id) => {
  return await UsersModel.updateOne(
    { _id: id },
    { isDeleted: false, updatedBy: userInfo._id }
  );
};

service.teamList = async (userInfo, query) => {
  const paginationData = CommonHelper.paginationData(query);
  const findQuery = {
    isDeleted: false,
    ...(userInfo.service_type == "mall"
      ? { malls: { $in: [userInfo.mall] } }
      : null),
    ...(userInfo.service_type == "residence"
      ? {
          buildings: {
            $in: (userInfo.buildings || []).filter((b) => b && b.trim()),
          },
        }
      : null),
    ...(query.search
      ? {
          $or: [
            { name: { $regex: query.search, $options: "i" } },
            { mobile: { $regex: query.search, $options: "i" } },
          ],
        }
      : null),
  };
  const total = await WorkersModel.countDocuments(findQuery);
  const data = await WorkersModel.find(findQuery)
    .sort({ _id: -1 })
    .skip(paginationData.skip)
    .limit(paginationData.limit)
    .lean();
  return { total, data };
};

service.exportData = async (userInfo, query) => {
  const findWorkerQuery = {
    isDeleted: false,
    ...(userInfo.service_type == "mall"
      ? { malls: { $in: [userInfo.mall] } }
      : null),
    ...(userInfo.service_type == "residence"
      ? {
          buildings: {
            $in: (userInfo.buildings || []).filter((b) => b && b.trim()),
          },
        }
      : null),
  };

  const workers = await WorkersModel.find(findWorkerQuery);
  const workerIds = workers.map((e) => e._id.toString());

  const findQuery = {
    isDeleted: false,
    ...(query.search
      ? {
          $or: [
            { parking_no: { $regex: query.search, $options: "i" } },
            { registration_no: { $regex: query.search, $options: "i" } },
          ],
        }
      : null),
    ...(query.startDate
      ? {
          createdAt: {
            $gte: new Date(query.startDate),
            $lte: new Date(query.endDate),
          },
        }
      : null),
    ...(query.service_type ? { service_type: query.service_type } : null),
    ...(query.worker
      ? { worker: query.worker }
      : { worker: { $in: workerIds } }),
  };

  if (query.search) {
    const workers = await WorkersModel.find(
      { isDeleted: false, name: { $regex: query.search, $options: "i" } },
      { _id: 1 }
    ).lean();
    if (workers.length) {
      findQuery.$or.push({
        worker: { $in: workers.map((e) => e._id.toString()) },
      });
    }
  }

  const data = await OneWashModel.find(findQuery, {
    _id: 0,
    status: 0,
    isDeleted: 0,
    createdBy: 0,
    updatedBy: 0,
    id: 0,
    updatedAt: 0,
  })
    .sort({ _id: -1 })
    .populate([
      { path: "worker", model: "workers" },
      { path: "mall", model: "malls" },
    ])
    .lean();

  const workbook = new exceljs.Workbook();

  const worksheet = workbook.addWorksheet("Report");
  const keys = Object.keys(data[0]);
  worksheet.addRow(keys);

  for (const iterator of data) {
    iterator.createdAt = moment(iterator.createdAt).format("YYYY-MM-DD");
    iterator.worker = iterator.worker.name;
    iterator.mall = iterator.mall.name;
    const values = Object.values(iterator);
    worksheet.addRow(values);
  }

  return workbook;
};
