const dotenv = require('dotenv')
const path = require('path')
const mongoose = require('mongoose')
const PaymentsModel = require('../server/api/models/payments.model')
const config = require('../server/utils/config')
const CounterService = require('../server/utils/counters')

const start = async () => {

    try {

        await mongoose.connect(config.database.mongo.uri, config.database.mongo.options)

        let isNonEmpty = true
        let page = 0
        let limit = 10000

        do {

            let payments = await PaymentsModel.find({ onewash: false })
                .sort({ _id: -1 })
                .skip(page * limit)
                .limit(limit)
                .lean()

            for (const payment of payments) {
                if (!payment.id) {
                    const id = await CounterService.id("payments")
                    await PaymentsModel.updateOne({ _id: payment._id }, { $set: { id } })
                }
            }

            isNonEmpty = payments.length
            page++

        } while (isNonEmpty);


        console.log("Completed")

    } catch (error) {
        console.error(error)
    }

}; start()