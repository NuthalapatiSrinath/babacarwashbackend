const service = require('./supervisors.service')
const controller = module.exports

controller.list = async (req, res) => {
    try {
        const data = await service.list()
        return res.status(200).json({ statusCode: 200, message: 'success', data })
    } catch (error) {
        console.error(error)
        return res.status(500).json({ message: 'Internal server error', error })
    }
}
