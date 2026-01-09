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
        let limit = 200

        do {

            let customers = await CustomersModel.find({ isDeleted: false, status: 2 })
                .sort({ _id: 1 })
                .skip(page * limit)
                .limit(limit)
                .lean()

            console.log(`customers ${customers.length}`)

            for (const iterator of customers) {
                for (const vehicle of iterator.vehicles) {
                    const jobs = await JobsModel.remove({ vehicle: vehicle._id })
                    console.log(jobs)
                }
            }

            isNonEmpty = customers.length
            page++

        } while (isNonEmpty);


        console.log("Completed")

    } catch (error) {
        console.error(error)
    }

}; start()