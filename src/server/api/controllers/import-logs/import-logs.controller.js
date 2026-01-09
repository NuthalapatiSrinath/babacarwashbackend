const service = require('./import-logs.service')
const controller = module.exports

controller.list = async (req, res) => {
    try {
        const { user, query } = req
        const data = await service.list(user, query)
        return res.status(200).json({ statusCode: 200, message: 'success', ...data })
    } catch (error) {
        console.error(error)
        return res.status(500).json({ message: 'Internal server error', error })
    }
}

controller.info = async (req, res) => {
    try {
        const { user, params } = req
        const data = await service.info(user, params.id)
        return res.status(200).json({ statusCode: 200, message: 'success', data })
    } catch (error) {
        console.error(error)
        return res.status(500).json({ message: 'Internal server error', error })
    }
}

controller.delete = async (req, res) => {
    try {
        const { user, params, body } = req
        const data = await service.delete(user, params.id)
        return res.status(200).json({ statusCode: 200, message: 'success', data })
    } catch (error) {
        console.error(error)
        return res.status(500).json({ message: 'Internal server error', error })
    }
}

