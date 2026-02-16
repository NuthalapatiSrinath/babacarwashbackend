const SitesModel = require("../../models/sites.model");
const CounterService = require("../../../utils/counters");
const CommonHelper = require("../../../helpers/common.helper");
const InAppNotifications = require("../../../notifications/in-app.notifications");
const service = module.exports;

service.list = async (userInfo, query) => {
  const paginationData = CommonHelper.paginationData(query);
  const total = await SitesModel.countDocuments({ isDeleted: false });
  const data = await SitesModel.find({ isDeleted: false })
    .sort({ _id: -1 })
    .skip(paginationData.skip)
    .limit(paginationData.limit)
    .lean();
  return { total, data };
};

service.info = async (userInfo, id) => {
  return SitesModel.findOne({ _id: id, isDeleted: false }).lean();
};

service.create = async (userInfo, payload) => {
  const id = await CounterService.id("malls");
  const isExists = await SitesModel.countDocuments({
    isDeleted: false,
    name: payload.name,
  });
  if (isExists) {
    throw "Oops! Site already exists";
  }
  const data = {
    createdBy: userInfo._id,
    updatedBy: userInfo._id,
    id,
    ...payload,
  };
  await new SitesModel(data).save();

  // Send notification about new site creation
  try {
    await InAppNotifications.send({
      worker: userInfo._id,
      message: `New site "${payload.name}" has been created`,
      createdBy: userInfo._id,
    });
  } catch (error) {
    console.error("Failed to send notification:", error);
  }
};

service.update = async (userInfo, id, payload) => {
  const isExists = await SitesModel.countDocuments({
    _id: { $ne: id },
    isDeleted: false,
    name: payload.name,
  });
  if (isExists) {
    throw "Oops! Site already exists";
  }
  await SitesModel.updateOne({ _id: id }, { $set: payload });

  // Send notification about site update
  try {
    await InAppNotifications.send({
      worker: userInfo._id,
      message: `Site "${payload.name}" has been updated`,
      createdBy: userInfo._id,
    });
  } catch (error) {
    console.error("Failed to send notification:", error);
  }
};

service.delete = async (userInfo, id, payload) => {
  const site = await SitesModel.findOne({ _id: id });
  const result = await SitesModel.updateOne(
    { _id: id },
    { isDeleted: true, deletedBy: userInfo._id },
  );

  // Send notification about site deletion
  try {
    await InAppNotifications.send({
      worker: userInfo._id,
      message: `Site "${site?.name || "Unknown"}" has been deleted`,
      createdBy: userInfo._id,
    });
  } catch (error) {
    console.error("Failed to send notification:", error);
  }

  return result;
};

service.undoDelete = async (userInfo, id) => {
  return await SitesModel.updateOne(
    { _id: id },
    { isDeleted: false, updatedBy: userInfo._id },
  );
};
