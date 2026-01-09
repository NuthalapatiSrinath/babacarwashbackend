const router = require('express').Router();

router.use('/auth', require('./auth'));
router.use('/vehicles', require('./vehicles'));
router.use('/bookings', require('./bookings'));
router.use('/pricing', require('./pricing'));
router.use('/malls', require('./malls'));
router.use('/buildings', require('./buildings'));
router.use('/payments', require('./payments'));
router.use('/history', require('./history'));

module.exports = router