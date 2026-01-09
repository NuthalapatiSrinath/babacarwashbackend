const InAppNotificationsModel = require('../api/models/in-app-notifications.model')

const InAppNotifications = module.exports

InAppNotifications.send = async (payload) => {
    return new InAppNotificationsModel(payload).save()
}
