const BuildingsModel = require('../../models/buildings.model')
const CommonHelper = require('../../../helpers/common.helper')
const service = module.exports

service.list = async (userInfo, query) => {
    const paginationData = CommonHelper.paginationData(query)
    const findQuery = {
        isDeleted: false,
        ...(query.search ? { $or: [{ name: { $regex: query.search, $options: 'i' } }] } : null),
    }
    const total = await BuildingsModel.countDocuments(findQuery)
    const data = await BuildingsModel.find(findQuery)
        .sort({ _id: -1 })
        .skip(paginationData.skip)
        .limit(paginationData.limit)
        .populate('vehicle mall building')
        .lean()
    return { total, data }
}
