const MallsModel = require("../../models/malls.model");
const CommonHelper = require("../../../helpers/common.helper");
const service = module.exports;

service.list = async (userInfo, query) => {
  const paginationData = CommonHelper.paginationData(query);

  // Filter by assigned malls for the logged-in worker
  const findQuery = { isDeleted: false };

  if (userInfo.malls && userInfo.malls.length > 0) {
    findQuery._id = { $in: userInfo.malls };
  }

  const total = await MallsModel.countDocuments(findQuery);
  const data = await MallsModel.find(findQuery)
    .sort({ _id: -1 })
    .skip(paginationData.skip)
    .limit(paginationData.limit)
    .lean();

  return { total, data };
};

service.info = async (userInfo, id) => {
  return MallsModel.findOne({ _id: id, isDeleted: false }).lean();
};
