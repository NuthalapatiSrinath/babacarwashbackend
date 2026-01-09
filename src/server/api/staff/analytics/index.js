const router = require('express').Router()
const controller = require('./analytics.controller')
const AuthHelper = require('../auth/auth.helper')

router.get('/', AuthHelper.authenticate, controller.list);

module.exports = router
