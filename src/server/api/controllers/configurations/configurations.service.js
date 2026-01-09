const ConfigurationsModel = require('../../models/configurations.model')
const service = module.exports

service.fetch = async (userInfo) => {
    return ConfigurationsModel.findOne({})
}

service.update = async (userInfo, payload) => {
    await ConfigurationsModel.updateOne({}, { $set: payload }, { upsert: true })
    return ConfigurationsModel.findOne({})
}
