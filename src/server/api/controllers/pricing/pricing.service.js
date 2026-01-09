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
        .populate('mall')
        .lean()
    return { total, data }
}

service.info = async (userInfo, id) => {
    return PricingsModel.findOne({ _id: id, isDeleted: false }).lean()
}

service.create = async (userInfo, payload) => {
    const id = await CounterService.id("pricing")
    const findQuery = {
        isDeleted: false,
        service_type: payload.service_type,
        ...(payload.mall ? { mall: payload.mall } : null)
    }
    const isExists = await PricingsModel.countDocuments(findQuery)
    if (isExists) {
        throw "Oops! Service type and premise pricing already exists"
    }
    const data = { createdBy: userInfo._id, updatedBy: userInfo._id, id, ...payload }
    await new PricingsModel(data).save()
}

service.update = async (userInfo, id, payload) => {
    const findQuery = {
        isDeleted: false,
        service_type: payload.service_type,
        ...(payload.mall ? { mall: payload.mall } : null)
    }
    const isExists = await PricingsModel.countDocuments({ _id: { $ne: id }, ...findQuery })
    if (isExists) {
        throw "Oops! Service type and premise pricing already exists"
    }
    await PricingsModel.updateOne({ _id: id }, { $set: payload })
}

service.delete = async (userInfo, id, payload) => {
    return await PricingsModel.updateOne({ _id: id }, { isDeleted: true, deletedBy: userInfo._id })
}

service.undoDelete = async (userInfo, id) => {
    return await PricingsModel.updateOne({ _id: id }, { isDeleted: false, updatedBy: userInfo._id })
}
