// Set permissions for a user (admin only)
service.setPermissions = async (userId, permissions) => {
  return UsersModel.findByIdAndUpdate(
    userId,
    { $set: { permissions } },
    { new: true }
  ).lean();
};
const UsersModel = require("../../models/users.model");
const CommonHelper = require("../../../helpers/common.helper");
const service = module.exports;

service.me = async (userInfo) => {
  const findQuery = { _id: userInfo._id };
  return UsersModel.findOne(findQuery);
};

service.list = async (userInfo, queryParams) => {
  const paginationData = CommonHelper.paginationData(queryParams);
  const findQuery = {
    ...(queryParams.type ? { type: queryParams.type } : null),
    ...(queryParams.search
      ? { name: { $regex: `.*${queryParams.search}.*` } }
      : null),
  };
  const total = await UsersModel.countDocuments(findQuery);
  const data = await UsersModel.find(findQuery)
    .sort({ _id: -1 })
    .skip(paginationData.skip)
    .limit(paginationData.limit)
    .lean();
  return { total, data };
};

service.info = async (userInfo, id) => {
  const findQuery = { _id: id };
  return UsersModel.findOne(findQuery);
};

service.infoByAccountId = async (userInfo, id) => {
  const findQuery = { "accountInfo.accountId": id };
  return UsersModel.findOne(findQuery);
};

service.team = async (userInfo, payload) => {
  return await UsersModel.find({
    accountInfo: {
      accountId: userInfo.accountInfo.accountId,
      accountType: "child",
    },
  });
};

service.inviteTeam = async (userInfo, payload) => {
  for (const iterator of payload) {
    await new UsersModel({
      email: iterator,
      accountInfo: {
        accountId: userInfo.accountInfo.accountId,
        accountType: "child",
      },
    }).save();
  }
};

service.exportData = async (userInfo, query) => {
  try {
    const data = await UsersModel.find({
      "accountInfo.accountId": userInfo.accountInfo.accountId,
    }).lean();
    return data.map((e) => {
      return {
        ...e,
      };
    });
  } catch (error) {
    throw error;
  }
};
