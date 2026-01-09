const service = require('./configurations.service')
const controller = module.exports

controller.fetch = async (req, res) => {
    try {
        const { user } = req
        const data = await service.fetch(user)
        return res.status(200).json({ statusCode: 200, message: 'success', data })
    } catch (error) {
        if (typeof error == "string") {
            return res.status(400).json({ message: error })
        }
        console.error(error)
        return res.status(500).json({ message: 'Internal server error', error })
    }
}

controller.update = async (req, res) => {
    try {
        const { user, body } = req
        const data = await service.update(user, body)
        return res.status(200).json({ statusCode: 200, message: 'success', data })
    } catch (error) {
        if (typeof error == "string") {
            return res.status(400).json({ message: error })
        }
        console.error(error)
        return res.status(500).json({ message: 'Internal server error', error })
    }
}
