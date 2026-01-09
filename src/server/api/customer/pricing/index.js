const router = require('express').Router()
const controller = require('./pricing.controller')
const AuthHelper = require('../auth/auth.helper')
const UploadHelper = require('../../../helpers/upload.helper')

router.get('/', AuthHelper.authenticate, controller.list);

module.exports = router
