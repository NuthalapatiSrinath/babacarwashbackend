const LocationsModel = require('./locations.model')
const BuildingsModel = require('../../models/buildings.model')
const CounterService = require('../../../utils/counters')
const CommonHelper = require('../../../helpers/common.helper')
const service = module.exports

service.list = async (userInfo, query) => {
    const paginationData = CommonHelper.paginationData(query)
    const findQuery = {
        isDeleted: false,
        ...(query.search ? { $or: [{ address: { $regex: query.search, $options: 'i' } }] } : null),
    }
    const total = await LocationsModel.countDocuments(findQuery)
    const data = await LocationsModel.find(findQuery)
        .sort({ _id: -1 })
        .skip(paginationData.skip)
        .limit(paginationData.limit)
        .lean()
    return { total, data }
}

service.info = async (userInfo, id) => {
    return LocationsModel.findOne({ _id: id, isDeleted: false }).lean()
}

service.create = async (userInfo, payload) => {
    const id = await CounterService.id("locations")
    const isExists = await LocationsModel.countDocuments({ isDeleted: false, address: payload.address })
    if (isExists) {
        throw "Oops! Location already exists"
    }
    const data = { createdBy: userInfo._id, updatedBy: userInfo._id, id, ...payload }
    await new LocationsModel(data).save()
}

service.update = async (userInfo, id, payload) => {
    const isExists = await LocationsModel.countDocuments({ _id: { $ne: id }, isDeleted: false, address: payload.address })
    if (isExists) {
        throw "Oops! Location already exists"
    }
    await LocationsModel.updateOne({ _id: id }, { $set: payload })
}

service.delete = async (userInfo, id, payload) => {
    const isExists = await BuildingsModel.countDocuments({ isDeleted: false, location_id: id })
    if (isExists) {
        throw "This location is currently assigned to a building and cannot be deleted"
    }
    return await LocationsModel.updateOne({ _id: id }, { isDeleted: true, deletedBy: userInfo._id })
}

service.undoDelete = async (userInfo, id) => {
    return await LocationsModel.updateOne({ _id: id }, { isDeleted: false, updatedBy: userInfo._id })
}
