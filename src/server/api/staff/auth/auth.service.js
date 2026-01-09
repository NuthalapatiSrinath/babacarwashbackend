const WorkersModel = require('../../models/workers.model')
const AuthHelper = require('./auth.helper')
const service = module.exports

service.signin = async (payload) => {
    try {

        const isExists = await WorkersModel.countDocuments({ isDeleted: false, mobile: payload.mobile })

        if (isExists == 0) {
            throw 'UNAUTHORIZED'
        }

        const userData = await WorkersModel.findOne({ isDeleted: false, mobile: payload.mobile }, {
            _id: 1,
            name: 1,
            email: 1,
            hPassword: 1,
            role: 1,
            buildings: 1,
            malls: 1,
            mobile: 1,
            service_type: 1
        })
            .populate('buildings malls')
            .lean()

        if (!AuthHelper.verifyPasswordHash(payload.password, userData.hPassword)) {
            throw "UNAUTHORIZED"
        }

        const token = AuthHelper.createToken({ _id: userData._id })
        delete userData.hPassword

        return { token, ...userData }


    } catch (error) {
        throw error
    }
}
