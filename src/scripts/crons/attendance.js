const WorkersModel = require('../../server/api/models/workers.model')
const AttendanceModel = require('../../server/api/models/attendance.model')
const StaffModel = require('../../server/api/models/staff.model')

const cron = module.exports

cron.run = async () => {
    try {

        const workers = await WorkersModel.find({ isDeleted: false }).lean()
        const staff = await StaffModel.find({ isDeleted: false }).lean()
        const attendanceData = []

        for (const iterator of JSON.parse(JSON.stringify(workers))) {
            attendanceData.push({
                date: new Date(),
                worker: iterator._id,
                present: false
            })
        }

        for (const iterator of JSON.parse(JSON.stringify(staff))) {
            attendanceData.push({
                date: new Date(),
                staff: iterator._id,
                present: false
            })
        }

        await AttendanceModel.insertMany(attendanceData)

        console.log("completed")

    } catch (error) {
        console.error(error)
    }
}