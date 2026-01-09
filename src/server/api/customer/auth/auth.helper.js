const crypto = require('crypto')
const jsonwebtoken = require('jsonwebtoken')
const CustomersModel = require('../../models/customers.model')
const config = require('../../../utils/config')
const helper = module.exports

helper.getPasswordHash = (password) => {
    const salt = crypto.randomBytes(16).toString('base64')
    return `${salt}$f$${crypto
        .pbkdf2Sync(password, Buffer.from(salt, 'base64'), 10000, 64, 'sha512')
        .toString('base64')}`
}

helper.verifyPasswordHash = (password, passwordHash) => {
    if (!password || !passwordHash) {
        return false
    }
    const [salt, hash] = passwordHash.split('$f$')
    const cHash = crypto
        .pbkdf2Sync(password, Buffer.from(salt, 'base64'), 10000, 64, 'sha512')
        .toString('base64')
    return cHash === hash
}

helper.createToken = (data, options) => {
    const options2 = options || {}
    return jsonwebtoken.sign(data, config.keys.secret, options2)
}

helper.verifyToken = (data) => {
    return jsonwebtoken.verify(data, config.keys.secret)
}

helper.authenticate = async (req, res, next) => {
    try {

        const { headers } = req
        const data = jsonwebtoken.verify(headers.authorization, config.keys.secret)

        if (data) {
            req.user = await CustomersModel.findOne({ _id: data._id }).lean()
            return next()
        }

        res.status(200).json({ status: false, message: 'Not authorized' })

    } catch (error) {
        res.status(401).json({ status: false, message: 'Not authorized' })
    }
}
