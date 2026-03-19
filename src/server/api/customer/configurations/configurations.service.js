const ConfigurationsModel = require("../../models/configurations.model");
const service = (module.exports = {});

service.fetch = async () => {
  const config = await ConfigurationsModel.findOne({})
    .sort({ updatedAt: -1 })
    .lean();
  return {
    contactNumber: config?.contactNumber || "",
  };
};
