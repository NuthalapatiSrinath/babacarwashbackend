const router = require('express').Router()
const controller = require('./supervisors.controller')
const AuthHelper = require('../auth/auth.helper')

router.get('/', AuthHelper.authenticate, controller.list);
router.post('/', AuthHelper.authenticate, controller.create);
router.get('/:id', AuthHelper.authenticate, controller.info);
router.put('/:id', AuthHelper.authenticate, controller.update);
router.delete('/:id', AuthHelper.authenticate, controller.delete);
router.delete('/:id/undo', AuthHelper.authenticate, controller.undoDelete);

router.get('/team/list', AuthHelper.authenticate, controller.teamList);
router.get('/export/list', AuthHelper.authenticate, controller.exportData);

module.exports = router
