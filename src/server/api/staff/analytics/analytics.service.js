const moment = require('moment')
const JobsModel = require('../../models/jobs.model')
const OneWashModel = require('../../models/onewash.model')
const service = module.exports

service.list = async (userInfo, query) => {

    const onewashQuery = {
        isDeleted: false,
        worker: userInfo._id,
        createdAt: { $gte: new Date(moment().startOf('day')), $lte: new Date(moment().endOf('day')) }
    }

    const currDayOneWashes = await OneWashModel.find(onewashQuery).lean()
    const currDayJobs = await JobsModel.find({ ...onewashQuery, status: "completed" }).lean()

    onewashQuery.createdAt = {
        $gte: new Date(moment().startOf('month')),
        $lte: new Date(moment().endOf('month').endOf('day'))
    }

    const currMonthOneWashes = await OneWashModel.find(onewashQuery).lean()
    const currMonthJobs = await JobsModel.find({ ...onewashQuery, status: "completed" }).lean()

    onewashQuery.createdAt = {
        $gte: new Date(moment().subtract(1, 'month').startOf('month')),
        $lte: new Date(moment().subtract(1, 'month').endOf('month').endOf('day'))
    }

    const lastMonthOneWashes = await OneWashModel.find(onewashQuery).lean()
    const lastMonthJobs = await JobsModel.find({ ...onewashQuery, status: "completed" }).lean()

    return {
        counts: {
            currDay: {
                washes: currDayJobs.length + currDayOneWashes.length,
                amount: currDayOneWashes.reduce((p, c) => p + c.amount, 0),
                tip_amount: currDayOneWashes.reduce((p, c) => p + (c.tip_amount || 0), 0)
            },
            currMonth: {
                name: moment().format('MMMM'),
                washes: currMonthJobs.length + currMonthOneWashes.length,
                amount: currMonthOneWashes.reduce((p, c) => p + c.amount, 0),
                tip_amount: currMonthOneWashes.reduce((p, c) => p + (c.tip_amount || 0), 0)
            },
            lastMonth: {
                name: moment().subtract(1, 'month').format('MMMM'),
                washes: lastMonthJobs.length + lastMonthOneWashes.length,
                amount: lastMonthOneWashes.reduce((p, c) => p + c.amount, 0),
                tip_amount: lastMonthOneWashes.reduce((p, c) => p + (c.tip_amount || 0), 0)
            }
        }
    }

}
