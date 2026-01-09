const router = require('express').Router()
const controller = require('./auth.controller')

router.post('/signin', controller.signin);

module.exports = router
