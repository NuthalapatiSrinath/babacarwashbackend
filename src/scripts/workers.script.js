const dotenv = require('dotenv')
const path = require('path')
const mongoose = require('mongoose')
const WorkersModel = require('../server/api/models/workers.model')
const config = require('../server/utils/config')

const start = async () => {

    try {

        await mongoose.connect(config.database.mongo.uri, config.database.mongo.options)

        let isNonEmpty = true
        let page = 0
        let limit = 100

        do {

            let workers = await WorkersModel.find({})
                .sort({ _id: 1 })
                .skip(page * limit)
                .limit(limit)
                .lean()

            for (const worker of workers) {
                console.log(worker.mobile, typeof worker.mobile)
                await WorkersModel.update({ _id: worker._id }, { $set: { mobile: worker.mobile } })
            }

            isNonEmpty = workers.length
            page++

        } while (isNonEmpty);


        console.log("Completed")

    } catch (error) {
        console.error(error)
    }

}; start()