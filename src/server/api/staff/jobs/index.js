const router = require('express').Router()
const controller = require('./jobs.controller')
const AuthHelper = require('../auth/auth.helper')

router.get('/', AuthHelper.authenticate, controller.list);
router.post('/', AuthHelper.authenticate, controller.create);
router.get('/:id', AuthHelper.authenticate, controller.info);
router.put('/:id', AuthHelper.authenticate, controller.update);
router.delete('/:id', AuthHelper.authenticate, controller.delete);
router.delete('/:id/undo', AuthHelper.authenticate, controller.undoDelete);

router.put('/:id/completed', AuthHelper.authenticate, controller.jobCompleted);
router.put('/:id/rejected', AuthHelper.authenticate, controller.jobRejected);

module.exports = router
