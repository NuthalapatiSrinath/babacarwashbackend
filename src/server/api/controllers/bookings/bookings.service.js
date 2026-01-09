const BookingsModel = require('../../models/bookings.model')
const CustomersModel = require('../../models/customers.model')
const JobsModel = require('../../models/jobs.model')
const CounterService = require('../../../utils/counters')
const JobService = require('../../staff/jobs/jobs.service')
const CommonHelper = require('../../../helpers/common.helper')
const InAppNotifications = require('../../../notifications/in-app.notifications')

const service = module.exports

service.list = async (userInfo, query) => {
    const paginationData = CommonHelper.paginationData(query)
    const total = await BookingsModel.countDocuments({ isDeleted: false })
    const data = await BookingsModel.find({ isDeleted: false })
        .sort({ _id: -1 })
        .skip(paginationData.skip)
        .limit(paginationData.limit)
        .populate('customer mall worker')
        .lean()
    for (const iterator of data) {
        iterator.vehicle = iterator?.customer?.vehicles.find(e => e._id == iterator.vehicle)
    }
    return { total, data }
}

service.info = async (userInfo, id) => {
    return BookingsModel.findOne({ _id: id, isDeleted: false }).lean()
}

service.create = async (userInfo, payload) => {
    const id = await CounterService.id("bookings")
    const data = { createdBy: userInfo._id, updatedBy: userInfo._id, id, ...payload }
    await new BookingsModel(data).save()
}

service.update = async (userInfo, id, payload) => {
    await BookingsModel.updateOne({ _id: id }, { $set: payload })
}

service.delete = async (userInfo, id, payload) => {
    return await BookingsModel.updateOne({ _id: id }, { isDeleted: true, deletedBy: userInfo._id })
}

service.undoDelete = async (userInfo, id) => {
    return await BookingsModel.updateOne({ _id: id }, { isDeleted: false, updatedBy: userInfo._id })
}

service.assignWorker = async (userInfo, bookingId, payload) => {
    const bookingData = await BookingsModel.findOne({ _id: bookingId }).populate('customer mall worker').lean()
    if (bookingData.service_type == 'residence') {
        await CustomersModel.updateOne({ _id: bookingData.customer }, {
            $set: {
                location: payload.location,
                building: payload.building,
            }
        })
        await CustomersModel.updateOne({ "vehicles._id": bookingData.vehicle }, {
            $set: {
                "vehicles.$.worker": payload.worker
            }
        })
    }
    await BookingsModel.updateOne({ _id: bookingId }, { $set: payload })
}

service.accept = async (userInfo, bookingId) => {

    const bookingData = await BookingsModel.findOne({ _id: bookingId }).populate('customer').lean()
    const vehicleData = bookingData.customer.vehicles.find(e => e._id == bookingData.vehicle)
    const id = await CounterService.id("jobs")

    if (bookingData.service_type == 'residence') {

        await JobService.createJob({
            ...bookingData.customer,
            vehicles: [vehicleData]
        }, 'Customer Booking')

    }

    if (bookingData.service_type == 'mall') {

        const jobData = {
            id,
            vehicle: bookingData.vehicle,
            parking_no: bookingData.parking_no,
            parking_floor: bookingData.parking_floor,
            registration_no: vehicleData.registration_no,
            worker: bookingData.worker,
            mall: bookingData.mall,
            customer: bookingData.customer._id,
            amount: bookingData.amount,
            service_type: bookingData.service_type,
            assignedDate: new Date(bookingData.date),
            booking: bookingData._id,
            createdBy: 'Customer Booking',
            onewash: true,
            immediate: true
        }

        await new JobsModel(jobData).save()

    }

    if (bookingData.service_type == 'mobile') {

        const jobData = {
            id,
            vehicle: bookingData.vehicle,
            address: bookingData.address,
            registration_no: vehicleData.registration_no,
            customer: bookingData.customer._id,
            amount: bookingData.amount,
            locationMap: bookingData.location,
            worker: bookingData.worker,
            service_type: bookingData.service_type,
            assignedDate: new Date(bookingData.date),
            booking: bookingData._id,
            createdBy: 'Customer Booking',
            onewash: true,
            immediate: true
        }

        delete bookingData.location

        await new JobsModel(jobData).save()

    }

    await InAppNotifications.send({
        worker: bookingData.worker,
        type: 'new-booking',
        payload: {
            parking_no: bookingData.parking_no,
            registration_no: vehicleData.registration_no,
            worker: bookingData.worker,
            customer: bookingData.customer._id
        }
    })

    await BookingsModel.updateOne({ _id: bookingId }, { $set: { status: "accepted" } })

}