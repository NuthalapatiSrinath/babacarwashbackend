const service = require('./attendance.service')
const controller = module.exports

controller.orgList = async (req, res) => {
    try {
        const data = await service.orgList()
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

controller.exportData = async (req, res) => {
    try {
        const { user, query } = req
        const workbook = await service.exportData(user, query)
        res.setHeader(
            'Content-Type',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        )
        res.setHeader(
            'Content-Disposition',
            `attachment; filename="Attendance_Export_${Date.now()}.xlsx"`
        )
        await workbook.xlsx.write(res)
        return res.end()
    } catch (error) {
        console.error(error)
        return res.status(500).json({ status: false, message: 'Internal server error', error })
    }
}
