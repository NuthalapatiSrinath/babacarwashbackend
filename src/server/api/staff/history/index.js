const router = require('express').Router()
const controller = require('./history.controller')
const AuthHelper = require('../auth/auth.helper')

router.get('/onewash', AuthHelper.authenticate, controller.list);

module.exports = router
