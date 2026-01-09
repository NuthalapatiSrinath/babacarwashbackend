const router = require('express').Router()
const controller = require('./buildings.controller')
const AuthHelper = require('../auth/auth.helper')

router.get('/', AuthHelper.authenticate, controller.list);

module.exports = router
