const router = require('express').Router()
const controller = require('./auth.controller')
const AuthHelper = require('../auth/auth.helper')


router.post('/signup', controller.signup);
router.post('/signin', controller.signin);

router.post('/forgot-password', controller.forgotPassword);
router.post('/reset-password', controller.resetPassword);

router.get('/me', AuthHelper.authenticate, controller.me);

module.exports = router
