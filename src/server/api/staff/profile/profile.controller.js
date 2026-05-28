const service = require('./profile.service');
const controller = module.exports;

controller.getProfile = async (req, res) => {
    try {
        console.log('Profile Controller - User:', req.user);
        const data = await service.getProfile(req.user);
        return res.send({ statusCode: 200, message: 'success', data });
    } catch (error) {
        console.error('Error in getProfile:', error);
        return res.status(400).send({ statusCode: 400, message: error });
    }
};

controller.updateAttendanceSheetPreferences = async (req, res) => {
    try {
        const data = await service.updateAttendanceSheetPreferences(req.user, req.body || {});
        return res.send({ statusCode: 200, message: 'success', data });
    } catch (error) {
        console.error('Error in updateAttendanceSheetPreferences:', error);
        return res.status(400).send({ statusCode: 400, message: error });
    }
};
