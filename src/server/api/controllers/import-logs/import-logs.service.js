const CounterService = require('../../../utils/counters')
const CommonHelper = require('../../../helpers/common.helper')
const ImportLogsModel = require('../../models/import-logs.model')
const service = module.exports

service.list = async (userInfo, query) => {
    const paginationData = CommonHelper.paginationData(query)
    const total = await ImportLogsModel.countDocuments({})
    const data = await ImportLogsModel.find({})
        .sort({ _id: -1 })
        .skip(paginationData.skip)
        .limit(paginationData.limit)
    return { total, data }
}

service.info = async (userInfo, id) => {
    return ImportLogsModel.findOne({ _id: id }).lean()
}