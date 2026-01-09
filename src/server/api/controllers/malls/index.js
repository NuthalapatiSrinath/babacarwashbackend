const router = require('express').Router()
const controller = require('./malls.controller')
const AuthHelper = require('../auth/auth.helper')
const UploadHelper = require('../../../helpers/upload.helper')

router.get('/', AuthHelper.authenticate, controller.list);
router.post('/', AuthHelper.authenticate, controller.create);
router.get('/:id', AuthHelper.authenticate, controller.info);
router.put('/:id', AuthHelper.authenticate, controller.update);
router.delete('/:id', AuthHelper.authenticate, controller.delete);
router.delete('/:id/undo', AuthHelper.authenticate, controller.undoDelete);

module.exports = router
