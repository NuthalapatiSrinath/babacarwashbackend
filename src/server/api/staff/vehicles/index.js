const router = require('express').Router()
const controller = require('./vehicles.controller')
const AuthHelper = require('../auth/auth.helper')

router.get('/inactive', AuthHelper.authenticate, controller.inactiveList);
router.put('/:id/activate', AuthHelper.authenticate, controller.activateVehicle);

module.exports = router
