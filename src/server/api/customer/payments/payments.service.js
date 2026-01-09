const PaymentsModel = require('../../models/payments.model')
const CommonHelper = require('../../../helpers/common.helper')
const service = module.exports

service.list = async (userInfo, query) => {
    const paginationData = CommonHelper.paginationData(query)
    const findQuery = { isDeleted: false, customer: userInfo._id }
    const total = await PaymentsModel.countDocuments(findQuery)
    const data = await PaymentsModel.find(findQuery)
        .sort({ _id: -1 })
        .skip(paginationData.skip)
        .limit(paginationData.limit)
        .populate('customer mall building')
        .lean()
    return { total, data }
}
