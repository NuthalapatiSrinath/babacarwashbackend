const router = require('express').Router()
const controller = require('./attendance.controller')
const AuthHelper = require('../auth/auth.helper')

router.get('/org/list', AuthHelper.authenticate, controller.orgList);

router.get('/', AuthHelper.authenticate, controller.list);
router.put('/', AuthHelper.authenticate, controller.update);

router.get('/export/list', AuthHelper.authenticate, controller.exportData);

module.exports = router
