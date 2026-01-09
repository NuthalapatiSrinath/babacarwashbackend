const BuildingsModel = require('../../models/buildings.model')
const CustomersModel = require('../../models/customers.model')
const CounterService = require('../../../utils/counters')
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
        .populate('location_id')
        .lean()
    return { total, data }
}

service.info = async (userInfo, id) => {
    return BuildingsModel.findOne({ _id: id, isDeleted: false }).populate('location_id').lean()
}

service.create = async (userInfo, payload) => {
    const id = await CounterService.id("buildings")
    const isExists = await BuildingsModel.countDocuments({ isDeleted: false, name: payload.name, location_id: payload.location_id })
    if (isExists) {
        throw "Oops! The building with selected location already exists"
    }
    const data = { createdBy: userInfo._id, updatedBy: userInfo._id, id, ...payload }
    await new BuildingsModel(data).save()
}

service.update = async (userInfo, id, payload) => {
    const isExists = await BuildingsModel.countDocuments({ _id: { $ne: id }, isDeleted: false, name: payload.name, location_id: payload.location_id })
    if (isExists) {
        throw "Oops! The building with selected location already exists"
    }
    await BuildingsModel.updateOne({ _id: id }, { $set: payload })
}

service.delete = async (userInfo, id, payload) => {
    const isExists = await CustomersModel.countDocuments({ isDeleted: false, building: id })
    if (isExists) {
        throw "This building is currently assigned to customers and cannot be deleted"
    }
    return await BuildingsModel.updateOne({ _id: id }, { isDeleted: true, deletedBy: userInfo._id })
}

service.undoDelete = async (userInfo, id) => {
    return await BuildingsModel.updateOne({ _id: id }, { isDeleted: false, updatedBy: userInfo._id })
}
