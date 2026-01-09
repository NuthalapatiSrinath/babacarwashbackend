const BuildingsModel = require('../../models/buildings.model')
const CommonHelper = require('../../../helpers/common.helper')
const service = module.exports

service.list = async (userInfo, query) => {
    const paginationData = CommonHelper.paginationData(query)
    const total = await BuildingsModel.countDocuments({ isDeleted: false })
    const data = await BuildingsModel.find({ isDeleted: false })
        .sort({ _id: -1 })
        .skip(paginationData.skip)
        .limit(paginationData.limit)
        .lean()
    return { total, data }
}

service.info = async (userInfo, id) => {
    return BuildingsModel.findOne({ _id: id, isDeleted: false }).lean()
}
