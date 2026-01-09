const router = require('express').Router()
const controller = require('./import-logs.controller')
const AuthHelper = require('../auth/auth.helper')

router.get('/', AuthHelper.authenticate, controller.list);
router.get('/:id', AuthHelper.authenticate, controller.info);

module.exports = router
