const PricingsModel = require('../../models/pricing.model')
const CounterService = require('../../../utils/counters')
const CommonHelper = require('../../../helpers/common.helper')
const service = module.exports

service.list = async (userInfo, query) => {
    const paginationData = CommonHelper.paginationData(query)
    const total = await PricingsModel.countDocuments({ isDeleted: false })
    const data = await PricingsModel.find({ isDeleted: false })
        .sort({ _id: -1 })
        .skip(paginationData.skip)
        .limit(paginationData.limit)
        .lean()
    return { total, data }
}