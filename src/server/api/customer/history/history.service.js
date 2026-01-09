const JobsModel = require('../../models/jobs.model')
const CommonHelper = require('../../../helpers/common.helper')
const service = module.exports

service.list = async (userInfo, params) => {
    const findQuery = { isDeleted: false, vehicle: params.id, service_type: { $exists: false } }
    const total = await JobsModel.countDocuments(findQuery)
    const data = await JobsModel.find(findQuery)
        .sort({ _id: -1 })
        .populate('building')
        .lean()
    return { total, data }
}
