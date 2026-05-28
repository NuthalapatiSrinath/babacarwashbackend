const WorkersModel = require('../../models/workers.model');
const service = module.exports;

service.getProfile = async (user) => {
    try {
        console.log('Profile Service - User ID:', user?._id);
        
        const worker = await WorkersModel.findOne(
            { _id: user._id, isDeleted: false },
            {
                _id: 1,
                id: 1,
                name: 1,
                mobile: 1,
                email: 1,
                employeeCode: 1,
                companyName: 1,
                joiningDate: 1,
                buildings: 1,
                malls: 1,
                sites: 1,
                service_type: 1,
                role: 1,
                status: 1,
                supervisor: 1,
                profileImage: 1,
                attendanceSheetPreferences: 1,
                passportNumber: 1,
                passportExpiry: 1,
                visaNumber: 1,
                visaExpiry: 1,
                emiratesId: 1,
                emiratesIdExpiry: 1,
                createdAt: 1,
                updatedAt: 1
            }
        )
        .populate('buildings', 'name address')
        .populate('malls', 'name address')
        .populate('sites', 'name address')
        .lean();

        if (!worker) {
            throw 'Worker not found';
        }

        console.log('Profile Service - Worker found:', worker.name);
        return worker;
    } catch (error) {
        console.error('Error in getProfile service:', error);
        throw error;
    }
};

service.updateAttendanceSheetPreferences = async (user, preferences = {}) => {
    try {
        const worker = await WorkersModel.findOne({ _id: user._id, isDeleted: false });

        if (!worker) {
            throw 'Worker not found';
        }

        const currentPreferences = worker.attendanceSheetPreferences || {};

        worker.attendanceSheetPreferences = {
            downloadPreset:
                typeof preferences.downloadPreset === 'string'
                    ? preferences.downloadPreset
                    : currentPreferences.downloadPreset,
            offsetX: Number.isFinite(Number(preferences.offsetX))
                ? Number(preferences.offsetX)
                : currentPreferences.offsetX || 0,
            offsetY: Number.isFinite(Number(preferences.offsetY))
                ? Number(preferences.offsetY)
                : currentPreferences.offsetY || 0,
            fontScale: Number.isFinite(Number(preferences.fontScale))
                ? Number(preferences.fontScale)
                : currentPreferences.fontScale || 1,
            updatedAt: new Date(),
        };

        await worker.save();
        return await service.getProfile(user);
    } catch (error) {
        console.error('Error in updateAttendanceSheetPreferences service:', error);
        throw error;
    }
};
