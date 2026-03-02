const LocationsModel = require("../../controllers/locations/locations.model");
const CommonHelper = require("../../../helpers/common.helper");
const service = module.exports;

service.list = async (userInfo, query) => {
  const paginationData = CommonHelper.paginationData(query);
  const findQuery = {
    isDeleted: false,
    ...(query.search
      ? { $or: [{ address: { $regex: query.search, $options: "i" } }] }
      : null),
  };
  const total = await LocationsModel.countDocuments(findQuery);
  const data = await LocationsModel.find(findQuery)
    .sort({ address: 1 })
    .skip(paginationData.skip)
    .limit(paginationData.limit)
    .lean();
  return { total, data };
};
