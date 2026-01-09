const moment = require('moment')
const uuidV4 = require('uuid/v4')
const config = require('../../../utils/config')
const CustomersModel = require('../../models/customers.model')
const JobsModel = require('../../models/jobs.model')
const OTPModel = require('../../models/otps.model')
const AuthTokensModel = require('../../models/auth-tokens.model')
const CommonHelper = require('../../../helpers/common.helper')
const AuthHelper = require('./auth.helper')
const EmailNotifications = require('../../../notifications/email.notifications')
const Events = require('../../../hooks/signup.event')
const service = module.exports

service.signup = async (payload) => {
    const isExists = await CustomersModel.countDocuments({ mobile: payload.mobile })
    if (isExists) {
        throw 'ALREADY-REGISTERED'
    }
    const password = AuthHelper.getPasswordHash(payload.password)
    const userData = await new CustomersModel({ ...payload, hPassword: password, password: payload.password }).save()
    const token = AuthHelper.createToken({ _id: userData._id })
    delete userData.hPassword
    delete userData.password
    return { token, ...JSON.parse(JSON.stringify(userData)) }
}

service.signin = async (payload) => {
    try {
        const userData = await CustomersModel.findOne({ mobile: payload.mobile })
        if (!userData) {
            throw 'UNAUTHORIZED'
        }
        if (!AuthHelper.verifyPasswordHash(payload.password, userData.hPassword)) {
            throw "UNAUTHORIZED"
        }
        const token = AuthHelper.createToken({ _id: userData._id })
        delete userData.hPassword
        delete userData.password
        return { token, ...JSON.parse(JSON.stringify(userData)) }
    } catch (error) {
        throw error
    }
}

service.forgotPassword = async (payload) => {
    try {

        const userData = await CustomersModel.findOne({ email: payload.email }).lean()

        if (!userData) {
            throw 'INVALID'
        }

        const token = uuidV4()
        await new AuthTokensModel({ user: userData._id, type: "password-reset", token, expiresAt: moment().subtract('day', 1) }).save()
        EmailNotifications.forgotPasswordLink({ ...userData, resetLink: `${config.redirectUrls.resetPassword}?token=${token}` })

    } catch (error) {
        throw error
    }
}

service.resetPassword = async (payload) => {
    try {

        const tokenData = await AuthTokensModel.findOne({ token: payload.token, consumed: false })
            .populate('user')
            .lean()

        if (!tokenData) {
            throw "INVALID"
        }

        const password = AuthHelper.getPasswordHash(payload.password)

        await CustomersModel.updateOne({ _id: tokenData.user._id }, { $set: { password } })
        await AuthTokensModel.updateOne({ _id: tokenData._id }, { $set: { consumed: true } })

        EmailNotifications.resetPasswordConfirmation(tokenData.user)

    } catch (error) {
        throw error
    }
}

service.me = async (payload) => {
    const user = await CustomersModel.findOne({ _id: payload._id }, { password: 0, hPassword: 0 }).lean()
    const bookings = await JobsModel.countDocuments({ isDeleted: false, customer: user._id })
    return { ...user, bookings }
}
