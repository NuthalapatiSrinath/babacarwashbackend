const moment = require('moment-timezone')
const CustomersModel = require('../../server/api/models/customers.model')
const BuildingsModel = require('../../server/api/models/buildings.model')
const JobsModel = require('../../server/api/models/jobs.model')
const CounterService = require('../../server/utils/counters')

const cron = module.exports

cron.run = async () => {

    let customers = JSON.parse(JSON.stringify(await CustomersModel.find({ isDeleted: false, building: { $exists: true } }).populate('building').lean()))
    let tomorrowDate = moment().tz('Asia/Dubai').startOf('day').add(1, 'day').tz('Asia/Dubai')
    let todayData = moment().tz('Asia/Dubai').startOf('day').tz('Asia/Dubai')

    console.log("Assign jobs is running on", moment().tz('Asia/Dubai').format(), "for the date", tomorrowDate.format())

    const jobs = []
    const scheduleId = await CounterService.id("scheduler")

    for (const iterator of customers) {
        for (const vehicle of iterator.vehicles) {

            if (vehicle.status == 2 && moment(vehicle.deactivateDate).isBefore(tomorrowDate)) {
                console.log('Vehicle is inactive', vehicle._id, iterator._id)
                continue
            } else if (moment(vehicle.start_date).isAfter(tomorrowDate)) {
                console.log('Vehicle start date is ahead', vehicle._id, iterator._id)
                continue
            }

            let assignedDate = new Date(tomorrowDate)

            if (iterator.building.schedule_today) {
                assignedDate = new Date(todayData)
            }

            if (vehicle.schedule_type == 'daily') {
                jobs.push({
                    scheduleId,
                    vehicle: vehicle._id,
                    assignedDate,
                    customer: iterator._id,
                    worker: vehicle.worker,
                    location: iterator.location,
                    building: iterator.building._id,
                    createdBy: 'Cron Scheduler',
                    ...(iterator.building.schedule_today ? { immediate: true } : null)
                })
            }

            if (vehicle.schedule_type == 'weekly') {
                let currentDayIncluded = vehicle.schedule_days.filter(e => {
                    if (iterator.building.schedule_today) {
                        return e.value == todayData.get("day")
                    } else {
                        return e.value == tomorrowDate.get("day")
                    }
                })
                if (currentDayIncluded.length) {
                    jobs.push({
                        scheduleId,
                        vehicle: vehicle._id,
                        assignedDate,
                        customer: iterator._id,
                        worker: vehicle.worker,
                        location: iterator.location,
                        building: iterator.building._id,
                        createdBy: 'Cron Scheduler',
                        ...(iterator.building.schedule_today ? { immediate: true } : null)
                    })
                }
            }

        }
    }

    await JobsModel.insertMany(jobs)

    console.log("Assign jobs completed")

}