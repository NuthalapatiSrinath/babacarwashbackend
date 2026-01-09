
const InAppNotificationsModel = require('../../models/in-app-notifications.model')

const service = module.exports

service.inAppCount = async (userInfo) => {
    return InAppNotificationsModel.countDocuments({ worker: userInfo._id, isRead: false })
}

service.inApp = async (userInfo) => {
    const data = await InAppNotificationsModel.find({ worker: userInfo._id, isRead: false }).sort({ _id: -1 })
    await InAppNotificationsModel.updateMany({ _id: data.map(e => e._id) }, { $set: { isRead: true } })
    return data
}
