const csv = require('fast-csv')
const service = require('./jobs.service')
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
        if (error.code == 11000) {
            return res.status(409).json({ statusCode: 409, message: 'Oops! Location already exists', error })
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

controller.exportData = async (req, res) => {
    try {
        const { user, query } = req
        const workbook = await service.exportData(user, query)
        workbook.xlsx.write(res).then(() => {
            res.end();
        }).catch((err) => {
            console.error(err);
            res.status(500).send('Internal Server Error');
        });
    } catch (error) {
        console.error(error)
        return res.status(200).json({ status: false, message: 'Internal server error', error })
    }
}

controller.monthlyStatement = async (req, res) => {
    try {
        const { user, query } = req
        const workbook = await service.monthlyStatement(user, query)
        workbook.xlsx.write(res).then(() => {
            res.end();
        }).catch((err) => {
            console.error(err);
            res.status(500).send('Internal Server Error');
        });
    } catch (error) {
        console.error(error)
        return res.status(200).json({ status: false, message: 'Internal server error', error })
    }
}
