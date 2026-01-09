const router = require('express').Router()
const controller = require('./buildings.controller')
const AuthHelper = require('../auth/auth.helper')

router.get('/', AuthHelper.authenticate, controller.list);
router.get('/:id', AuthHelper.authenticate, controller.info);

module.exports = router
