const service = require('./analytics.service')
const controller = module.exports

controller.admin = async (req, res) => {
    try {
        const { user, query } = req
        const data = await service.admin(user, query)
        return res.status(200).json({ statusCode: 200, message: 'success', data })
    } catch (error) {
        console.error(error)
        return res.status(500).json({ message: 'Internal server error', error })
    }
}

controller.charts = async (req, res) => {
    try {
        const { user, query } = req
        const data = await service.charts(user, query)
        return res.status(200).json({ statusCode: 200, message: 'success', data })
    } catch (error) {
        console.error(error)
        return res.status(500).json({ message: 'Internal server error', error })
    }
}

controller.supervisors = async (req, res) => {
    try {
        const { user, body } = req
        const data = await service.supervisors(user, body)
        return res.status(200).json({ statusCode: 200, message: 'success', data })
    } catch (error) {
        console.error(error)
        return res.status(500).json({ message: 'Internal server error', error })
    }
}