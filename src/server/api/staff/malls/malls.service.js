const MallsModel = require('../../models/malls.model')
const CommonHelper = require('../../../helpers/common.helper')
const service = module.exports

service.list = async (userInfo, query) => {
    const paginationData = CommonHelper.paginationData(query)
    const total = await MallsModel.countDocuments({ isDeleted: false })
    const data = await MallsModel.find({ isDeleted: false })
        .sort({ _id: -1 })
        .skip(paginationData.skip)
        .limit(paginationData.limit)
        .lean()
    return { total, data }
}

service.info = async (userInfo, id) => {
    return MallsModel.findOne({ _id: id, isDeleted: false }).lean()
}
