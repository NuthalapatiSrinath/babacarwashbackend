const router = require('express').Router()
const controller = require('./configurations.controller')
const AuthHelper = require('../auth/auth.helper')

router.get('/', AuthHelper.authenticate, controller.fetch);
router.put('/', AuthHelper.authenticate, controller.update);

module.exports = router
