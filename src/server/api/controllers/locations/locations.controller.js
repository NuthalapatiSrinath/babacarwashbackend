const csv = require('fast-csv')
const service = require('./locations.service')
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

controller.create = async (req, res) => {
    try {
        const { user, body } = req
        const data = await service.create(user, body)
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
        const { user, params, body } = req
        const data = await service.update(user, params.id, body)
        return res.status(200).json({ statusCode: 200, message: 'success', data })
    } catch (error) {
        if (typeof error == "string") {
            return res.status(400).json({ message: error })
        }
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
        if (typeof error == "string") {
            return res.status(400).json({ message: error })
        }
        console.error(error)
        return res.status(500).json({ message: 'Internal server error', error })
    }
}

controller.undoDelete = async (req, res) => {
    try {
        const { user, params } = req
        const data = await service.undoDelete(user, params.id)
        return res.status(200).json({ statusCode: 200, message: 'success', data })
    } catch (error) {
        console.error(error)
        return res.status(500).json({ message: 'Internal server error', error })
    }
}
