const moment = require('moment')
const uuidV4 = require('uuid/v4')
const config = require('../../../utils/config')
const UsersModel = require('../../models/users.model')
const OTPModel = require('../../models/otps.model')
const AuthTokensModel = require('../../models/auth-tokens.model')
const CommonHelper = require('../../../helpers/common.helper')
const AuthHelper = require('./auth.helper')
const EmailNotifications = require('../../../notifications/email.notifications')
const Events = require('../../../hooks/signup.event')
const service = module.exports

service.signup = async (payload) => {

    const isExists = await UsersModel.countDocuments({ email: payload.email })

    if (isExists) {
        throw 'ALREADY-REGISTERED'
    }

    const password = AuthHelper.getPasswordHash(payload.password)
    const userData = {
        ...payload,
        password,
        accountInfo: {
            accountId: uuidV4(),
            accountType: 'root',
            accountCategory: 'REGULAR'
        }
    }

    const data = await new UsersModel(userData).save()

    Events.signup(data)

    return data

}

service.signin = async (payload) => {
    try {

        const isExists = await UsersModel.countDocuments({ number: payload.number })

        if (isExists == 0) {
            throw 'UNAUTHORIZED'
        }

        const userData = await UsersModel.findOne({ number: payload.number }, {
            _id: 1, name: 1, email: 1, hPassword: 1, role: 1, service_type: 1
        }).lean()

        if (!AuthHelper.verifyPasswordHash(payload.password, userData.hPassword)) {
            throw "UNAUTHORIZED"
        }

        const token = AuthHelper.createToken({ _id: userData._id })

        delete userData.hPassword
        delete userData.password

        return { token, ...userData }


    } catch (error) {
        throw error
    }
}

service.verification = async (payload) => {

    const isExists = await UsersModel.countDocuments({ email: payload.email })

    if (isExists) {
        throw 'ALREADY-REGISTERED'
    }

    const lastOTP = await OTPModel.findOne({ email: payload.email })
        .sort({ _id: -1 })
        .lean()

    if (lastOTP && moment().isBefore(moment(lastOTP.createdAt).add(60, 'seconds'))) {
        throw "FREQUENT"
    }

    const otp = CommonHelper.RandomNumber(4)

    await EmailNotifications.send({ email: payload.email, otp })
    return await new OTPModel({ email: payload.email, otp }).save()

}

service.verificationValidation = async (payload) => {

    const lastOTP = await OTPModel.findOne({ email: payload.email })
        .sort({ _id: -1 })
        .lean()

    if (lastOTP && lastOTP.otp == payload.otp) {
        return true
    }

    throw "INVALID"

}

service.forgotPassword = async (payload) => {
    try {

        const userData = await UsersModel.findOne({ email: payload.email }).lean()

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

        await UsersModel.updateOne({ _id: tokenData.user._id }, { $set: { password } })
        await AuthTokensModel.updateOne({ _id: tokenData._id }, { $set: { consumed: true } })

        EmailNotifications.resetPasswordConfirmation(tokenData.user)

    } catch (error) {
        throw error
    }
}