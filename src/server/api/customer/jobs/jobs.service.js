const JobsModel = require("../../models/jobs.model");
const CustomersModel = require("../../models/customers.model");
const CustomerCandidatesHelper = require("../customer-candidates.helper");
const CommonHelper = require("../../../helpers/common.helper");
const service = module.exports;

service.list = async (userInfo, query) => {
  const paginationData = CommonHelper.paginationData(query);
  const customerCandidates =
    await CustomerCandidatesHelper.getRelatedCustomerCandidates(userInfo);

  if (!customerCandidates.length) {
    return { total: 0, data: [] };
  }

  const findQuery = {
    isDeleted: false,
    customer: { $in: [...new Set(customerCandidates)] },
  };

  const [total, jobs, customerData] = await Promise.all([
    JobsModel.countDocuments(findQuery),
    JobsModel.find(findQuery)
      .sort({ _id: -1 })
      .skip(paginationData.skip)
      .limit(paginationData.limit)
      .populate("worker building")
      .lean(),
    CustomersModel.find(
      { _id: { $in: customerCandidates } },
      { vehicles: 1 },
    ).lean(),
  ]);

  const vehicles = customerData.flatMap((customer) => customer?.vehicles || []);

  for (const job of jobs) {
    const vehicle = vehicles.find((v) => String(v._id) === String(job.vehicle));
    if (vehicle) {
      job.vehicleData = {
        _id: vehicle._id,
        registration_no: vehicle.registration_no,
        vehicle_type: vehicle.vehicle_type,
        vehicleName: vehicle.vehicleName,
        parking_no: vehicle.parking_no,
      };
      job.registration_no = job.registration_no || vehicle.registration_no;
      job.parking_no = job.parking_no || vehicle.parking_no;
    }
  }

  return { total, data: jobs };
};
