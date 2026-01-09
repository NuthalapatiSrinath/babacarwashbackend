const router = require('express').Router()
const controller = require('./analytics.controller')
const AuthHelper = require('../auth/auth.helper')

router.post('/admin', AuthHelper.authenticate, controller.admin);
router.post('/admin/charts', AuthHelper.authenticate, controller.charts);
router.post('/supervisors', AuthHelper.authenticate, controller.supervisors);

module.exports = router
