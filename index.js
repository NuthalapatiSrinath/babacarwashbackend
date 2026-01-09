'use strict';

const utils = require('./src/server/utils')
const database = require('./src/server/database')
const server = require('./src/server')

const initialize = async () => {

    try {

        const utilsData = utils.initialize()

        await database.initialize(utilsData)
        await server.initialize(utilsData)

        console.log(`BCW Backend | server is up and running in ${utilsData.config.env.toUpperCase()} environment on port ${utilsData.config.port}`);

    } catch (error) {
        console.error('ALERT!', error)
    }

}; initialize()