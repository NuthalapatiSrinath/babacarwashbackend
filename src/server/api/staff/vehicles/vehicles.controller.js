const service = require('./vehicles.service')
const controller = module.exports

controller.inactiveList = async (req, res) => {
    try {
        const { user, query } = req
        const data = await service.inactiveList(user, query)
        return res.status(200).json({ statusCode: 200, message: 'success', ...data })
    } catch (error) {
        console.error(error)
        return res.status(500).json({ message: 'Internal server error', error })
    }
}

controller.activateVehicle = async (req, res) => {
    try {
        const { user, params, body } = req
        const data = await service.activateVehicle(params.id, user, body)
        return res.status(200).json({ statusCode: 200, message: 'success', ...data })
    } catch (error) {
        console.error(error)
        return res.status(500).json({ message: 'Internal server error', error })
    }
}
