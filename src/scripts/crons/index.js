const cron = require('node-cron');

const utils = require('../../server/utils')
const database = require('../../server/database')
const jobs = require('./jobs')
const invoice = require('./invoice')
const attendance = require('./attendance')

const initialize = async () => {
    try {

        const utilsData = utils.initialize()

        await database.initialize(utilsData)

        console.log("MongoDB Connected")

        cron.schedule('5 0 * * *', jobs.run, {
            scheduled: true,
            timezone: "Asia/Dubai"
        });

        cron.schedule('5 0 1 * *', invoice.run, {
            scheduled: true,
            timezone: "Asia/Dubai"
        });

        cron.schedule('5 0 * * *', attendance.run, {
            scheduled: true,
            timezone: "Asia/Dubai"
        });

    } catch (error) {
        console.error(error)
    }
}; initialize()