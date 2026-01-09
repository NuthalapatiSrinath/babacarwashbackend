const dotenv = require('dotenv')
const path = require('path')
const mongoose = require('mongoose')
const WorkersModel = require('../server/api/models/workers.model')
const CustomersModel = require('../server/api/models/customers.model')
const JobsModel = require('../server/api/models/jobs.model')
const config = require('../server/utils/config')

const start = async () => {

    try {

        await mongoose.connect(config.database.mongo.uri, config.database.mongo.options)

        let isNonEmpty = true
        let page = 0
        let limit = 100

        do {

            let workers = await WorkersModel.find({ isDeleted: false, _id: "65bb428feb0f074fc6791a39" })
                .sort({ _id: 1 })
                .skip(page * limit)
                .limit(limit)
                .lean()

            for (const worker of workers) {
                const customers = await CustomersModel.find({ "vehicles.worker": worker._id }).lean()
                for (const iterator of customers) {
                    for (const vehicle of iterator.vehicles) {
                        const jobs = await JobsModel.count({ vehicle: vehicle._id })
                        console.log(jobs)
                    }
                }
            }

            isNonEmpty = workers.length
            page++

        } while (isNonEmpty);


        console.log("Completed")

    } catch (error) {
        console.error(error)
    }

}; start()