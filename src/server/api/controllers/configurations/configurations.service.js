const ConfigurationsModel = require("../../models/configurations.model");
const {
  emitConfigurationUpdated,
} = require("../../../events/configurations.events");
const service = module.exports;

service.fetch = async (userInfo) => {
  return ConfigurationsModel.findOne({}).sort({ updatedAt: -1 });
};

service.update = async (userInfo, payload) => {
  const latestConfig = await ConfigurationsModel.findOne({}).sort({
    updatedAt: -1,
  });

  if (latestConfig) {
    await ConfigurationsModel.updateOne(
      { _id: latestConfig._id },
      { $set: payload },
    );
  } else {
    await ConfigurationsModel.create(payload);
  }

  const updatedConfig = await ConfigurationsModel.findOne({}).sort({
    updatedAt: -1,
  });

  emitConfigurationUpdated({
    contactNumber: updatedConfig?.contactNumber || "",
    dashboardMarqueeText: updatedConfig?.dashboardMarqueeText || "",
  });

  return updatedConfig;
};
