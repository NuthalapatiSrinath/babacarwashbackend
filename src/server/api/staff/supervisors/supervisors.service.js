const UsersModel = require('../../models/users.model')
const service = module.exports

service.list = async () => {
    return await UsersModel.find({ isDeleted: false, role: 'supervisor' }).sort({ _id: -1 }).lean()
}
