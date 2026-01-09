const OneWashModel = require('../../models/onewash.model')
const CommonHelper = require('../../../helpers/common.helper')
const service = module.exports

service.list = async (userInfo, query) => {

    const paginationData = CommonHelper.paginationData(query)
    const findQuery = {
        isDeleted: false,
        worker: userInfo._id,
        service_type: query.service_type,
        ...(query.mall ? { mall: query.mall } : null),
        ...(query.building ? { building: query.building } : null),
        ...(query.search ? {
            $or: [
                { registration_no: { $regex: query.search, $options: 'i' } },
                { parking_no: { $regex: query.search, $options: 'i' } },
            ]
        } : null),
        ...(query.startDate ? {
            createdAt: {
                $gte: new Date(query.startDate),
                $lte: new Date(query.endDate)
            }
        } : null),
    }

    const populate = query.service_type ? (query.service_type == 'mall' ? 'mall' : 'building') : ''
    const total = await OneWashModel.countDocuments(findQuery)
    const data = await OneWashModel.find(findQuery)
        .sort({ _id: -1 })
        .skip(paginationData.skip)
        .limit(paginationData.limit)
        .populate(populate)
        .lean()

    return { total, data }

}
