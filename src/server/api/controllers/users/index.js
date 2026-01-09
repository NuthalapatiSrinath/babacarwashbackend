const router = require('express').Router()
const controller = require('./users.controller')
const AuthHelper = require('../auth/auth.helper')
const CloudUploadHelper = require('../../../cloud/aws/index')

router.get('/', controller.list);
router.get('/:id', controller.info);
router.get('/:id/accountId', controller.infoByAccountId);
router.get('/team/list', AuthHelper.authenticate, controller.team);

router.get('/me/info', AuthHelper.authenticate, controller.me);
router.put('/', AuthHelper.authenticate, CloudUploadHelper.UploadImages, controller.update);
router.put('/invite-team', AuthHelper.authenticate, controller.inviteTeam);

router.get('/team/export/list', AuthHelper.authenticate, controller.exportData);

module.exports = router
