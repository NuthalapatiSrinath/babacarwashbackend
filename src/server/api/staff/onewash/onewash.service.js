const moment = require('moment')
const fs = require('fs')
const OneWashModel = require('../../models/onewash.model')
const PaymentsModel = require('../../models/payments.model')
const MallsModel = require('../../models/malls.model')
const BuildingsModel = require('../../models/buildings.model')
const CounterService = require('../../../utils/counters')
const CommonHelper = require('../../../helpers/common.helper')
const service = module.exports

service.list = async (userInfo, query) => {
    const paginationData = CommonHelper.paginationData(query)
    const counts = {
        pending: await OneWashModel.countDocuments({ worker: userInfo._id, isDeleted: false, status: 'pending' }),
        completed: await OneWashModel.countDocuments({ worker: userInfo._id, isDeleted: false, status: 'completed' }),
    }
    const total = await OneWashModel.countDocuments({ worker: userInfo._id, isDeleted: false, status: 'pending' })
    const data = await OneWashModel.find({ worker: userInfo._id, isDeleted: false, status: 'pending' })
        .sort({ _id: -1 })
        .populate([
            { path: 'customer', model: 'customers', },
            { path: 'location', model: 'locations' },
            { path: 'building', model: 'buildings' },
        ])
        .lean()

    const jobsMap = {}

    for (const iterator of data) {
        if (!iterator.customer) {
            continue
        }
        iterator.vehicle = iterator.customer.vehicles.find(e => e._id == iterator.vehicle)
        let key = `${iterator.location._id}-${iterator.building._id}`
        if (jobsMap[key]) {
            jobsMap[key].jobs.push(iterator)
        } else {
            jobsMap[key] = {
                location: iterator.location,
                building: iterator.building,
                jobs: [iterator]
            }
        }
    }

    const jobsDataMap = []

    for (const key in jobsMap) {
        jobsDataMap.push({
            location: jobsMap[key].location,
            building: jobsMap[key].building,
            jobs: jobsMap[key].jobs
        })
    }

    return { total, data: jobsDataMap, counts }

}

service.info = async (userInfo, id) => {
    return OneWashModel.findOne({ _id: id, isDeleted: false }).lean()
}

service.create = async (userInfo, payload) => {

    const id = await CounterService.id("onewash")

    if (payload.mall == '') delete payload.mall
    if (payload.building == '') delete payload.building

    if (payload.mall) {
        mallData = await MallsModel.findOne({ _id: payload.mall })
        payload.amount = mallData.amount
    }

    if (payload.building) {
        buildingData = await BuildingsModel.findOne({ _id: payload.building })
        payload.amount = buildingData.amount
    }

    const isAddedQuery = {
        createdAt: { $gt: new Date(moment().utc().subtract(12, 'hours')) },
        ...(payload.mall ? { mall: payload.mall } : null),
        ...(payload.building ? { building: payload.building } : null),
        registration_no: payload.registration_no,
        parking_no: payload.parking_no
    }

    const isAdded = await OneWashModel.findOne(isAddedQuery)

    if (isAdded) {
        fs.appendFileSync(`${Date.now()}.json`, JSON.stringify(payload))
        throw "The car is already added"
    }

    const data = {
        createdBy: userInfo._id,
        updatedBy: userInfo._id,
        id,
        ...payload,
        worker: userInfo._id,
        status: 'pending'
    }

    const onewashData = await new OneWashModel(data).save()
    const paymentId = await CounterService.id("payments")

    const paymentData = {
        id: paymentId,
        job: onewashData._id,
        amount_charged: data.amount,
        amount_paid: 0,
        total_amount: data.amount,
        vehicle: {
            registration_no: data.registration_no,
            parking_no: data.parking_no,
        },
        worker: userInfo._id,
        service_type: data.service_type,
        ...(data.mall ? { mall: data.mall } : null),
        ...(data.building ? { building: data.building } : null),
        createdBy: userInfo._id,
        updatedBy: userInfo._id,
        onewash: true,
        status: 'pending'
    }

    await new PaymentsModel(paymentData).save()

}

service.update = async (userInfo, id, payload) => {
    await OneWashModel.updateOne({ _id: id }, { $set: payload })
}

service.delete = async (userInfo, id, payload) => {
    return await OneWashModel.updateOne({ _id: id }, { isDeleted: true, deletedBy: userInfo._id })
}

service.undoDelete = async (userInfo, id) => {
    return await OneWashModel.updateOne({ _id: id }, { isDeleted: false, updatedBy: userInfo._id })
}
