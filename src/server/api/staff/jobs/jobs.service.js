const moment = require('moment-timezone')
const JobsModel = require('../../models/jobs.model')
const CustomersModel = require('../../models/customers.model')
const BookingsModel = require('../../models/bookings.model')
const PaymentsModel = require('../../models/payments.model')
const UsersModel = require('../../models/users.model')
const CounterService = require('../../../utils/counters')
const AuthHelper = require('../auth/auth.helper')
const service = module.exports

service.list = async (userInfo, query) => {

    const findQuery = {
        worker: userInfo._id,
        isDeleted: false,
        $or: [{
            assignedDate: {
                $gte: moment().add(1, 'day').tz('Asia/Dubai').startOf('day').format(),
                $lte: moment().add(1, 'day').tz('Asia/Dubai').endOf('day').format()
            }
        }, {
            immediate: true,
            assignedDate: {
                $gte: moment().tz('Asia/Dubai').startOf('day').format(),
                $lte: moment().tz('Asia/Dubai').endOf('day').format()
            }
        }],
        ...(query.status ? { status: query.status } : { status: 'pending' })
    }

    if (query.status == 'rejected') {
        findQuery.$or[0].assignedDate.$gte = moment().subtract(7, 'day').tz('Asia/Dubai').startOf('day').format()
        findQuery.$or[1].assignedDate.$gte = moment().subtract(7, 'day').tz('Asia/Dubai').startOf('day').format()
    }

    if (query.search) {

        const customers = await CustomersModel.find({
            isDeleted: false,
            $or: [
                { "vehicles.registration_no": { $regex: query.search, $options: 'i' } },
                { "vehicles.parking_no": { $regex: query.search, $options: 'i' } }]
        }).lean()

        if (customers.length) {
            let vehicles = []
            for (const customer of customers) {
                for (const vehicle of customer.vehicles) {
                    vehicles.push(vehicle._id)
                }
            }
            findQuery.vehicle = { $in: vehicles }
        }

    }

    const rejectedQuery = JSON.parse(JSON.stringify(findQuery))
    rejectedQuery.$or[0].assignedDate.$gte = moment().subtract(7, 'day').tz('Asia/Dubai').startOf('day').format()
    rejectedQuery.$or[1].assignedDate.$gte = moment().subtract(7, 'day').tz('Asia/Dubai').startOf('day').format()

    const counts = {
        pending: await JobsModel.countDocuments({ ...findQuery, status: 'pending' }),
        completed: await JobsModel.countDocuments({ ...findQuery, status: 'completed' }),
        rejected: await JobsModel.countDocuments({
            ...rejectedQuery,
            status: 'rejected'
        })
    }

    const total = await JobsModel.countDocuments(findQuery)
    const data = await JobsModel.find(findQuery)
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
        let key = ['mobile', 'mall'].includes(iterator.service_type) ? iterator.service_type.toUpperCase() : `${iterator.location._id}-${iterator.building._id}`
        if (jobsMap[key]) {
            jobsMap[key].jobs.push(iterator)
        } else {
            jobsMap[key] = {
                location: iterator.location,
                building: iterator.building,
                jobs: [iterator],
                service_type: iterator.service_type
            }
        }
    }

    const jobsDataMap = []
    const buildings = []

    for (const key in jobsMap) {
        buildings.push(jobsMap[key].building)
        jobsDataMap.push({
            location: jobsMap[key].location,
            building: jobsMap[key].building,
            jobs: jobsMap[key].jobs,
            service_type: jobsMap[key].service_type
        })
    }

    return { total, data: jobsDataMap, counts, buildings }

}

service.info = async (userInfo, id) => {
    return JobsModel.findOne({ _id: id, isDeleted: false }).lean()
}

service.create = async (userInfo, payload) => {
    const id = await CounterService.id("workers")
    const data = { createdBy: userInfo._id, updatedBy: userInfo._id, id, ...payload, hPassword: AuthHelper.getPasswordHash(payload.password) }
    await new JobsModel(data).save()
}

service.update = async (userInfo, id, payload) => {
    await JobsModel.updateOne({ _id: id }, { $set: payload })
}

service.delete = async (userInfo, id, payload) => {
    return await JobsModel.updateOne({ _id: id }, { isDeleted: true, deletedBy: userInfo._id })
}

service.undoDelete = async (userInfo, id) => {
    return await JobsModel.updateOne({ _id: id }, { isDeleted: false, updatedBy: userInfo._id })
}

service.jobCompleted = async (userInfo, id, payload) => {

    const jobData = await JobsModel.findOne({ _id: id }).lean()
    const data = {
        status: 'completed',
        completedDate: new Date(),
        updatedBy: userInfo._id
    }

    await JobsModel.updateOne({ _id: id }, { $set: data })

    if (jobData.createdBy == 'Customer Booking') {
        const bookingData = await BookingsModel.findOne({ _id: jobData.booking }).lean()
        const usersData = JSON.parse(JSON.stringify(await CustomersModel.findOne({ _id: bookingData.customer }).lean()))
        const vehicleData = usersData.vehicles.find(e => e._id == bookingData.vehicle)
        const paymentId = await CounterService.id("payments")
        const paymentData = {
            id: paymentId,
            job: id,
            amount_charged: bookingData.amount,
            total_amount: bookingData.amount,
            amount_paid: 0,
            vehicle: {
                registration_no: vehicleData.registration_no,
                parking_no: vehicleData.parking_no
            },
            customer: bookingData.customer,
            worker: bookingData.worker,
            service_type: bookingData.service_type,
            ...(bookingData.mall ? { mall: bookingData.mall } : null),
            ...(bookingData.building ? { building: bookingData.building } : null),
            createdBy: userInfo._id,
            updatedBy: userInfo._id,
            onewash: true,
            status: 'pending'
        }
        await new PaymentsModel(paymentData).save()
        await BookingsModel.updateOne({ _id: jobData.booking }, { $set: data })
    }

}


service.jobRejected = async (userInfo, id, payload) => {
    const data = {
        status: 'rejected',
        ...payload,
        completedDate: new Date(),
        updatedBy: userInfo._id
    }
    await JobsModel.updateOne({ _id: id }, { $set: data })
}

service.createJob = async (customer, createdBy = 'Cron Scheduler') => {

    const todayDate = moment().tz('Asia/Dubai').startOf('day').tz('Asia/Dubai')
    const jobs = []

    for (const vehicle of customer.vehicles) {

        if (createdBy == 'Customer Booking') {
            vehicle.start_date = moment(vehicle.start_date).startOf('day').tz('Asia/Dubai')
        }

        if (vehicle.status == 2 && moment(vehicle.deactivateDate).isBefore(todayDate)) {
            console.log('Vehicle is inactive', vehicle._id, customer._id)
            continue
        } else if (moment(vehicle.start_date).isAfter(todayDate)) {
            console.log('Vehicle start date is ahead', vehicle._id, customer._id)
            continue
        }

        if (vehicle.schedule_type == 'daily') {
            jobs.push({
                vehicle: vehicle._id,
                assignedDate: new Date(todayDate),
                customer: customer._id,
                worker: vehicle.worker,
                location: customer.location,
                building: customer.building,
                createdBy,
                immediate: true
            })
        }

        if (vehicle.schedule_type == 'weekly') {
            for (const day of vehicle.schedule_days) {
                if (day.value == todayDate.get("day")) {
                    jobs.push({
                        vehicle: vehicle._id,
                        assignedDate: new Date(todayDate),
                        customer: customer._id,
                        worker: vehicle.worker,
                        location: customer.location,
                        building: customer.building,
                        createdBy,
                        immediate: true
                    })
                }
            }
        }

    }

    await JobsModel.insertMany(jobs)

}

service.createImmediateJob = async (customer, startDate, createdBy = 'Cron Scheduler') => {

    const todayDate = moment(startDate).tz('Asia/Dubai').startOf('day').tz('Asia/Dubai')
    const jobs = []

    for (const vehicle of customer.vehicles) {
        jobs.push({
            immediate: true,
            vehicle: vehicle._id,
            assignedDate: new Date(todayDate),
            customer: customer._id,
            worker: vehicle.worker,
            location: customer.location,
            building: customer.building,
            createdBy
        })
    }

    await JobsModel.insertMany(jobs)

}
