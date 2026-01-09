const router = require('express').Router()
const controller = require('./payments.controller')
const AuthHelper = require('../auth/auth.helper')

router.get('/', AuthHelper.authenticate, controller.list);
router.post('/', AuthHelper.authenticate, controller.create);
router.get('/:id', AuthHelper.authenticate, controller.info);
router.put('/:id', AuthHelper.authenticate, controller.update);
router.delete('/:id', AuthHelper.authenticate, controller.delete);
router.delete('/:id/undo', AuthHelper.authenticate, controller.undoDelete);

router.put('/:id/update', AuthHelper.authenticate, controller.updatePayment);
router.put('/:id/collect', AuthHelper.authenticate, controller.collectPayment);
router.put('/collect/settle', AuthHelper.authenticate, controller.settlePayment);
router.get('/settlements/list', AuthHelper.authenticate, controller.settlements);
router.put('/settlements/:id', AuthHelper.authenticate, controller.updateSettlements);

router.get('/export/list', AuthHelper.authenticate, controller.exportData);
router.get('/export/statement/monthly', AuthHelper.authenticate, controller.monthlyStatement);

module.exports = router
