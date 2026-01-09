const router = require('express').Router()
const controller = require('./auth.controller')

router.post('/signup', controller.signup);
router.post('/signin', controller.signin);
router.post('/verification', controller.verification);
router.post('/verification-validation', controller.verificationValidation);
router.post('/forgot-password', controller.forgotPassword);
router.post('/reset-password', controller.resetPassword);

module.exports = router
