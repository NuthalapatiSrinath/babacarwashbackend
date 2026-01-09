const VehiclesModel = require('../../models/vehicles.model')
const CustomersModel = require('../../models/customers.model')
const CounterService = require('../../../utils/counters')
const CommonHelper = require('../../../helpers/common.helper')
const service = module.exports

service.list = async (userInfo, query) => {
    const data = await CustomersModel.findOne({ isDeleted: false, _id: userInfo._id }).lean()
    return { total: data?.vehicles?.length, data: data?.vehicles || [] }
}

service.info = async (userInfo, id) => {
    const data = await CustomersModel.findOne({ _id: userInfo._id })
    return data.vehicles.find(e => e._id == id)
}

service.create = async (userInfo, payload) => {
    await CustomersModel.updateOne({ _id: userInfo._id }, { $push: { vehicles: payload } })
}

service.update = async (userInfo, id, payload) => {
    await CustomersModel.updateOne({ "vehicles._id": id }, {
        $set: {
            'vehicles.$.registration_no': payload.registration_no,
            'vehicles.$.vehicle_type': payload.vehicle_type
        }
    })
}

service.delete = async (userInfo, id) => {
    await CustomersModel.updateOne({ "vehicles._id": id }, { $pull: { vehicles: { _id: id } } })
    const data = await CustomersModel.findOne({ isDeleted: false, _id: userInfo._id }).lean()
    return data.vehicles
}

service.undoDelete = async (userInfo, id) => {
    return await VehiclesModel.updateOne({ _id: id }, { isDeleted: false, updatedBy: userInfo._id })
}
