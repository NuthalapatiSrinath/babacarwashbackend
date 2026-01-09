const EnquiryModel = require('../../models/enquiry.model')
const CounterService = require('../../../utils/counters')
const CommonHelper = require('../../../helpers/common.helper')
const service = module.exports

service.list = async (userInfo, query) => {
    const paginationData = CommonHelper.paginationData(query)
    const total = await EnquiryModel.countDocuments({ isDeleted: false })
    const data = await EnquiryModel.find({ isDeleted: false })
        .sort({ _id: -1 })
        .skip(paginationData.skip)
        .limit(paginationData.limit)
        .lean()
    return { total, data }
}

service.info = async (userInfo, id) => {
    return EnquiryModel.findOne({ _id: id, isDeleted: false }).lean()
}

service.create = async (userInfo, payload) => {
    const id = await CounterService.id("enquiry")
    const data = { createdBy: userInfo._id, updatedBy: userInfo._id, id, ...payload }
    await new EnquiryModel(data).save()
}

service.update = async (userInfo, id, payload) => {
    await EnquiryModel.updateOne({ _id: id }, { $set: payload })
}

service.delete = async (userInfo, id, payload) => {
    return await EnquiryModel.updateOne({ _id: id }, { isDeleted: true, deletedBy: userInfo._id })
}

service.undoDelete = async (userInfo, id) => {
    return await EnquiryModel.updateOne({ _id: id }, { isDeleted: false, updatedBy: userInfo._id })
}
