const modules = require('./modules')
const config = require('./config')

module.exports.initialize = () => {

    const utils = {
        modules,
        config
    }

    return utils

}