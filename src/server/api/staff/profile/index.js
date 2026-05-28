const router = require('express').Router();
const controller = require('./profile.controller');
const AuthHelper = require('../auth/auth.helper');

router.get('/', AuthHelper.authenticate, controller.getProfile);
router.patch('/attendance-sheet-preferences', AuthHelper.authenticate, controller.updateAttendanceSheetPreferences);

module.exports = router;
