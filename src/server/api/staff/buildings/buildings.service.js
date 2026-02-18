const BuildingsModel = require("../../models/buildings.model");
const CommonHelper = require("../../../helpers/common.helper");
const service = module.exports;

service.list = async (userInfo, query) => {
  const paginationData = CommonHelper.paginationData(query);

  // Filter by assigned buildings for the logged-in worker
  const findQuery = { isDeleted: false };

  if (userInfo.buildings && userInfo.buildings.length > 0) {
    findQuery._id = { $in: userInfo.buildings };
  }

  const total = await BuildingsModel.countDocuments(findQuery);
  const data = await BuildingsModel.find(findQuery)
    .sort({ _id: -1 })
    .skip(paginationData.skip)
    .limit(paginationData.limit)
    .lean();

  return { total, data };
};

service.info = async (userInfo, id) => {
  return BuildingsModel.findOne({ _id: id, isDeleted: false }).lean();
};
