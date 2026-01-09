const moment = require('moment')
const CustomersModel = require('../../server/api/models/customers.model')
const PaymentsModel = require('../../server/api/models/payments.model')
const CounterService = require('../../server/utils/counters')

const cron = module.exports

cron.run = async () => {
    try {

        const customers = await CustomersModel.find({ isDeleted: false }).lean()
        const paymentsData = []

        for (const iterator of JSON.parse(JSON.stringify(customers))) {
            for (const vehicle of iterator.vehicles) {

                if (vehicle.status == 2) continue

                let lastInvoice = await PaymentsModel.findOne({ customer: iterator._id, "vehicle._id": vehicle._id }).sort({ _id: -1 }).lean()
                let balance = 0

                if (lastInvoice) {
                    if (lastInvoice.status == 'completed') {
                        balance = lastInvoice.balance
                    } else if (lastInvoice.status == 'pending') {
                        balance = ((lastInvoice.amount_charged || 0) - lastInvoice.amount_paid) + lastInvoice.old_balance
                    }
                }

                const paymentId = await CounterService.id("payments")

                paymentsData.push({
                    id: paymentId,
                    status: 'pending',
                    settled: 'pending',
                    onewash: false,
                    worker: vehicle.worker,
                    customer: iterator._id,
                    vehicle: {
                        _id: vehicle._id,
                        registration_no: vehicle.registration_no,
                        parking_no: vehicle.parking_no
                    },
                    amount_charged: (vehicle.amount || 0),
                    total_amount: (vehicle.amount || 0) + balance,
                    old_balance: balance,
                    location: iterator.location,
                    building: iterator.building,
                    createdBy: 'Cron Scheduler',
                    createdAt: moment().tz('Asia/Dubai').startOf('month')
                })

            }
        }

        await PaymentsModel.insertMany(paymentsData)

        console.log("completed")

    } catch (error) {
        console.error(error)
    }
}