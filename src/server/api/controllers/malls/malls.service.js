const MallsModel = require('../../models/malls.model')
const CounterService = require('../../../utils/counters')
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

service.create = async (userInfo, payload) => {
    const id = await CounterService.id("malls")
    const isExists = await MallsModel.countDocuments({ isDeleted: false, name: payload.name })
    if (isExists) {
        throw "Oops! Mall already exists"
    }
    const data = { createdBy: userInfo._id, updatedBy: userInfo._id, id, ...payload }
    await new MallsModel(data).save()
}

service.update = async (userInfo, id, payload) => {
    const isExists = await MallsModel.countDocuments({ _id: { $ne: id }, isDeleted: false, name: payload.name })
    if (isExists) {
        throw "Oops! Mall already exists"
    }
    await MallsModel.updateOne({ _id: id }, { $set: payload })
}

service.delete = async (userInfo, id, payload) => {
    return await MallsModel.updateOne({ _id: id }, { isDeleted: true, deletedBy: userInfo._id })
}

service.undoDelete = async (userInfo, id) => {
    return await MallsModel.updateOne({ _id: id }, { isDeleted: false, updatedBy: userInfo._id })
}
