const router = require('express').Router();

router.use('/auth', require('./auth'));
router.use('/jobs', require('./jobs'));
router.use('/vehicles', require('./vehicles'));
router.use('/payments', require('./payments'));
router.use('/onewash', require('./onewash'));
router.use('/onewash-payments', require('./onewash-payments'));
router.use('/malls', require('./malls'));
router.use('/buildings', require('./buildings'));
router.use('/history', require('./history'));
router.use('/analytics', require('./analytics'));
router.use('/enquiry', require('./enquiry'));
router.use('/notifications', require('./notifications'));
router.use('/supervisors', require('./supervisors'));

module.exports = router