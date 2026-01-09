const CustomersModel = require('../../models/customers.model')
const CommonHelper = require('../../../helpers/common.helper')
const JobsService = require('../../staff/jobs/jobs.service')

const service = module.exports

service.inactiveList = async (userInfo, query) => {

    const paginationData = CommonHelper.paginationData(query)
    const findQuery = { isDeleted: false, "vehicles.status": 2, "vehicles.worker": userInfo._id }

    const data = await CustomersModel.find(findQuery)
        .sort({ _id: -1 })
        .skip(paginationData.skip)
        .limit(paginationData.limit)
        .populate([{
            path: 'building',
            model: 'buildings',
            populate: [
                { path: 'location_id', model: 'locations' }
            ]
        }, {
            path: 'vehicles.worker',
            model: 'workers'
        }])
        .lean()

    for (const iterator of data) {
        iterator.vehicles = iterator.vehicles.filter(e => e.status == 2)
    }

    return { data }

}

service.activateVehicle = async (id, user, payload) => {
    await CustomersModel.updateOne({ "vehicles._id": id }, {
        $set: {
            'vehicles.$.start_date': payload.start_date,
            'vehicles.$.status': 1
        }
    })
    const customerData = await CustomersModel.findOne({ "vehicles._id": id }).lean()
    customerData.vehicles = customerData.vehicles.filter(e => e._id == id)
    await JobsService.createImmediateJob(customerData, payload.start_date, 'reactivate')
}
