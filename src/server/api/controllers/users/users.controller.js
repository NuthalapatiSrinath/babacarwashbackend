const csv = require('fast-csv')
const service = require('./users.service')
const controller = module.exports

controller.me = async (req, res) => {
    try {
        const { user } = req
        const data = await service.me(user)
        return res.status(200).json({ statusCode: 200, message: 'success', data })
    } catch (error) {
        console.error(error)
        return res.status(500).json({ message: 'Internal server error', error })
    }
}
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

controller.infoByAccountId = async (req, res) => {
    try {
        const { user, params } = req
        const data = await service.infoByAccountId(user, params.id)
        return res.status(200).json({ statusCode: 200, message: 'success', data })
    } catch (error) {
        console.error(error)
        return res.status(500).json({ message: 'Internal server error', error })
    }
}

controller.update = async (req, res) => {
    try {
        const { user, body, files } = req
        const data = await service.update(user, body, files)
        return res.status(200).json({ statusCode: 200, message: 'success', data })
    } catch (error) {
        console.error(error)
        return res.status(500).json({ message: 'Internal server error', error })
    }
}

controller.team = async (req, res) => {
    try {
        const { user, body } = req
        const data = await service.team(user, body)
        return res.status(200).json({ statusCode: 200, message: 'success', data })
    } catch (error) {
        console.error(error)
        return res.status(500).json({ message: 'Internal server error', error })
    }
}

controller.inviteTeam = async (req, res) => {
    try {
        const { user, body } = req
        const data = await service.inviteTeam(user, body)
        return res.status(200).json({ statusCode: 200, message: 'success', data })
    } catch (error) {
        console.error(error)
        return res.status(500).json({ message: 'Internal server error', error })
    }
}

controller.exportData = async (req, res) => {
    try {
        const { user, query } = req
        const data = await service.exportData(user, query)
        res.setHeader('Content-Disposition', 'attachment; filename="output.csv"');
        res.setHeader('Content-Type', 'text/csv');
        csv.write(data, { headers: true }).pipe(res);
    } catch (error) {
        console.error(error)
        return res.status(500).json({ message: 'Internal server error', error })
    }
}