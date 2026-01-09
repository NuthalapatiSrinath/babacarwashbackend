const service = require('./auth.service')
const controller = module.exports

controller.signin = async (req, res) => {
    try {
        const { body } = req
        const data = await service.signin(body)
        return res.status(200).json({ statusCode: 200, message: 'success', data })
    } catch (error) {
        if (error == 'UNAUTHORIZED') {
            return res.status(401).json({ statusCode: 401, message: 'Invalid mobile or password' })
        }
        console.error(error)
        return res.status(401).json({ statusCode: 500, message: 'Internal server error', error })
    }
}
