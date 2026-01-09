const router = require('express').Router()
const controller = require('./payments.controller')
const AuthHelper = require('../auth/auth.helper')

router.get('/', AuthHelper.authenticate, controller.list);

router.put('/:id/collect', AuthHelper.authenticate, controller.collectPayment);
router.put('/collect/settle', AuthHelper.authenticate, controller.settlePayment);

module.exports = router
