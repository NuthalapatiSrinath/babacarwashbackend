const PaymentsModel = require("../../models/payments.model");
const JobsModel = require("../../models/jobs.model");
const OneWashModel = require("../../models/onewash.model");
const BookingsModel = require("../../models/bookings.model");
const CommonHelper = require("../../../helpers/common.helper");
const service = module.exports;

service.list = async (userInfo, query) => {
  const customerCandidates = [
    userInfo._id,
    String(userInfo._id),
    userInfo._id?.toString?.(),
  ].filter(Boolean);

  const paginationData = CommonHelper.paginationData(query);
  const findQuery = {
    isDeleted: false,
    customer: { $in: [...new Set(customerCandidates)] },
  };
  const total = await PaymentsModel.countDocuments(findQuery);
  const data = await PaymentsModel.find(findQuery)
    .sort({ _id: -1 })
    .skip(paginationData.skip)
    .limit(paginationData.limit)
    .populate("customer mall building")
    .lean();

  if (!data.length) {
    return { total, data };
  }

  const jobIds = data.map((payment) => payment?.job).filter(Boolean);

  if (!jobIds.length) {
    return { total, data };
  }

  const [jobs, onewashJobs] = await Promise.all([
    JobsModel.find({ _id: { $in: jobIds } }, { _id: 1, booking: 1 }).lean(),
    OneWashModel.find({ _id: { $in: jobIds } }, { _id: 1, booking: 1 }).lean(),
  ]);

  const allJobs = [...jobs, ...onewashJobs];
  const jobsMap = new Map(allJobs.map((job) => [String(job._id), job]));

  const bookingIds = allJobs.map((job) => job?.booking).filter(Boolean);

  if (!bookingIds.length) {
    return { total, data };
  }

  const deletedBookings = await BookingsModel.find(
    { _id: { $in: bookingIds }, isDeleted: true },
    { _id: 1 },
  ).lean();

  const deletedBookingIds = new Set(
    deletedBookings.map((booking) => String(booking._id)),
  );

  const filteredData = data.filter((payment) => {
    const paymentJobId = payment?.job ? String(payment.job) : "";
    if (!paymentJobId) return true;

    const job = jobsMap.get(paymentJobId);
    if (!job?.booking) return true;

    return !deletedBookingIds.has(String(job.booking));
  });

  const normalizedData = filteredData.map((payment) => {
    const totalAmount = Number(
      payment?.total_amount ?? payment?.amount_charged ?? 0,
    );
    const amountPaid = Number(payment?.amount_paid ?? 0);
    const effectiveBalance = Math.max(0, totalAmount - amountPaid);
    const normalizedStatus =
      effectiveBalance <= 0
        ? "completed"
        : String(payment?.status || "pending");
    const normalizedSettled =
      effectiveBalance <= 0
        ? "completed"
        : String(payment?.settled || "pending");

    return {
      ...payment,
      total_amount: totalAmount,
      amount_paid: amountPaid,
      balance: effectiveBalance,
      status: normalizedStatus,
      settled: normalizedSettled,
    };
  });

  return { total: normalizedData.length, data: normalizedData };
};
