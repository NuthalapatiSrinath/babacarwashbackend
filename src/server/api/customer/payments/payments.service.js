const PaymentsModel = require("../../models/payments.model");
const JobsModel = require("../../models/jobs.model");
const OneWashModel = require("../../models/onewash.model");
const BookingsModel = require("../../models/bookings.model");
const service = module.exports;

const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toBool = (value) => {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return false;
  return ["true", "1", "yes", "y"].includes(value.trim().toLowerCase());
};

const normalizePageParams = (query = {}) => {
  const hasPageNo = query.pageNo !== undefined;
  const pageNo = hasPageNo
    ? Math.max(0, toNumber(query.pageNo, 0))
    : Math.max(0, toNumber(query.page, 1) - 1);

  const hasPageSize = query.pageSize !== undefined;
  const pageSizeRaw = hasPageSize
    ? toNumber(query.pageSize, 30)
    : toNumber(query.limit, 30);
  const pageSize = Math.max(1, Math.min(200, pageSizeRaw || 30));

  return {
    pageNo,
    pageSize,
    skip: pageNo * pageSize,
    limit: pageSize,
  };
};

const normalizeDateRange = (query = {}) => {
  if (query.startDate || query.endDate) {
    const start = query.startDate ? new Date(query.startDate) : null;
    const end = query.endDate ? new Date(query.endDate) : null;

    if (
      start &&
      !Number.isNaN(start.getTime()) &&
      end &&
      !Number.isNaN(end.getTime())
    ) {
      end.setHours(23, 59, 59, 999);
      return { start, end };
    }

    if (start && !Number.isNaN(start.getTime())) {
      const inferredEnd = new Date(start);
      inferredEnd.setHours(23, 59, 59, 999);
      return { start, end: inferredEnd };
    }
  }

  if (query.year !== undefined && query.month !== undefined) {
    const year = toNumber(query.year, -1);
    const month = toNumber(query.month, -1);
    if (year > 0 && month >= 1 && month <= 12) {
      const start = new Date(year, month - 1, 1);
      const end = new Date(year, month, 0, 23, 59, 59, 999);
      return { start, end };
    }
  }

  return null;
};

service.list = async (userInfo, query) => {
  const customerCandidates = [
    userInfo._id,
    String(userInfo._id),
    userInfo._id?.toString?.(),
  ].filter(Boolean);
  const paginationData = normalizePageParams(query);
  const findQuery = {
    isDeleted: false,
    customer: { $in: [...new Set(customerCandidates)] },
  };
  const data = await PaymentsModel.find(findQuery)
    .sort({ _id: -1 })
    .populate("customer mall building")
    .lean();

  if (!data.length) {
    return { total: 0, data: [] };
  }

  const jobIds = data.map((payment) => payment?.job).filter(Boolean);
  const [jobs, onewashJobs] = jobIds.length
    ? await Promise.all([
        JobsModel.find({ _id: { $in: jobIds } }, { _id: 1, booking: 1 }).lean(),
        OneWashModel.find(
          { _id: { $in: jobIds } },
          { _id: 1, booking: 1 },
        ).lean(),
      ])
    : [[], []];

  const allJobs = [...jobs, ...onewashJobs];
  const jobsMap = new Map(allJobs.map((job) => [String(job._id), job]));

  const bookingIds = allJobs.map((job) => job?.booking).filter(Boolean);
  const deletedBookings = bookingIds.length
    ? await BookingsModel.find(
        { _id: { $in: bookingIds }, isDeleted: true },
        { _id: 1 },
      ).lean()
    : [];

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

  let normalizedData = filteredData.map((payment) => {
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

  const statusFilter = String(query?.status || "").toLowerCase();
  const sourceFilter = String(query?.source || "").toLowerCase();
  const modeFilter = String(query?.payment_mode || "").toLowerCase();
  const carryForwardOnly = toBool(query?.carry_forward);
  const searchTerm = String(query?.search || "")
    .trim()
    .toLowerCase();
  const dateRange = normalizeDateRange(query);

  if (statusFilter && statusFilter !== "all") {
    normalizedData = normalizedData.filter((payment) => {
      const balance = Number(payment?.balance || 0);
      const paymentStatus = String(payment?.status || "pending").toLowerCase();

      const isCompleted =
        (paymentStatus === "completed" ||
          paymentStatus === "success" ||
          paymentStatus === "settled") &&
        balance <= 0;

      if (statusFilter === "pending" || statusFilter === "open")
        return !isCompleted;
      if (statusFilter === "completed" || statusFilter === "settled")
        return isCompleted;
      return paymentStatus === statusFilter;
    });
  }

  if (sourceFilter && sourceFilter !== "all") {
    normalizedData = normalizedData.filter((payment) => {
      const isOneWash = payment?.onewash === true;
      if (sourceFilter === "jobs" || sourceFilter === "onewash")
        return isOneWash;
      if (sourceFilter === "booking" || sourceFilter === "residence")
        return !isOneWash;
      return true;
    });
  }

  if (modeFilter && modeFilter !== "all") {
    normalizedData = normalizedData.filter(
      (payment) =>
        String(payment?.payment_mode || "").toLowerCase() === modeFilter,
    );
  }

  if (carryForwardOnly) {
    normalizedData = normalizedData.filter(
      (payment) => Number(payment?.old_balance || 0) > 0,
    );
  }

  if (dateRange) {
    normalizedData = normalizedData.filter((payment) => {
      const rawDate = payment?.collectedDate || payment?.createdAt;
      if (!rawDate) return false;
      const paymentDate = new Date(rawDate);
      if (Number.isNaN(paymentDate.getTime())) return false;
      return paymentDate >= dateRange.start && paymentDate <= dateRange.end;
    });
  }

  if (searchTerm) {
    normalizedData = normalizedData.filter((payment) => {
      const registrationNo = String(
        payment?.vehicle?.registration_no || payment?.registration_no || "",
      ).toLowerCase();
      const receiptNo = String(payment?.receipt_no || "").toLowerCase();
      const serviceType = String(payment?.service_type || "").toLowerCase();
      const buildingName = String(payment?.building?.name || "").toLowerCase();
      const mallName = String(payment?.mall?.name || "").toLowerCase();

      return (
        registrationNo.includes(searchTerm) ||
        receiptNo.includes(searchTerm) ||
        serviceType.includes(searchTerm) ||
        buildingName.includes(searchTerm) ||
        mallName.includes(searchTerm)
      );
    });
  }

  const total = normalizedData.length;
  const pagedData = normalizedData.slice(
    paginationData.skip,
    paginationData.skip + paginationData.limit,
  );

  return { total, data: pagedData };
};
