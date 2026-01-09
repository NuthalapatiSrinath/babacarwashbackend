const service = require('./payments.service')
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

controller.collectPayment = async (req, res) => {
    try {
        const { user, params, body } = req
        const data = await service.collectPayment(user, params.id, body)
        return res.status(200).json({ statusCode: 200, message: 'success', data })
    } catch (error) {
        if (error == "EXCESS-AMOUNT") {
            return res.status(400).json({ status: false, message: 'Amount should not be greater than pending amount' })
        }
        console.error(error)
        return res.status(400).json({ status: false, message: 'Internal server error', error })
    }
}

controller.settlePayment = async (req, res) => {
    try {
        const { user, params, body } = req
        const data = await service.settlePayment(user, params.id, body)
        return res.status(200).json({ statusCode: 200, message: 'success', data })
    } catch (error) {
        console.error(error)
        return res.status(400).json({ status: false, message: 'Internal server error', error })
    }
}