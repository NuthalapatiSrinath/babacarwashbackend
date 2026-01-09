module.exports.initialize = async (input = {}) => {

    let { modules, config } = input
    let { mongoose } = modules
    let tries = 0

    if (!config.database.mongo) {
        throw new Error('mongodb credentials are missing')
    }

    mongoose.set('debug', config.database.mongo.debug)

    await mongoose.connect(config.database.mongo.uri, config.database.mongo.options)

    mongoose.connection.on('error', (error) => {
        mongoose.disconnect()
        throw error
    })

    mongoose.connection.on('connected', () => {
        tries = 0
    })

    mongoose.connection.on('disconnected', async () => {
        tries += 1
        await mongoose.connect(config.database.mongo.uri, config.database.mongo.options)
        if (tries > 3) {
            process.exit(1)
        }
    })

    return { mongoose }

}
