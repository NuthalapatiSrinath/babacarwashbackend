const PaymentsModel = require("../../models/payments.model");
const JobsModel = require("../../models/jobs.model");
const OneWashModel = require("../../models/onewash.model");
const BookingsModel = require("../../models/bookings.model");
const CustomerCandidatesHelper = require("../customer-candidates.helper");
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
  const parseQueryDate = (value, { endOfDay = false } = {}) => {
    if (!value) return null;
    const text = String(value).trim();
    if (!text) return null;

    // Date-only filters should follow business timezone (Dubai, UTC+4).
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
      const timePart = endOfDay ? "23:59:59.999" : "00:00:00.000";
      const parsed = new Date(`${text}T${timePart}+04:00`);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }

    const parsed = new Date(text);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  };

  if (query.startDate || query.endDate) {
    const start = parseQueryDate(query.startDate, { endOfDay: false });
    const end = parseQueryDate(query.endDate, { endOfDay: true });

    if (start && end) {
      return { start, end };
    }

    if (start) {
      const inferredEnd = parseQueryDate(query.startDate, { endOfDay: true });
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

const getPaymentTimestamp = (payment = {}) => {
  const raw = payment.collectedDate || payment.createdAt || payment.updatedAt;
  if (raw) {
    const time = new Date(raw).getTime();
    if (!Number.isNaN(time)) return time;
  }

  const fallback = String(payment._id || "");
  if (!fallback) return 0;
  const parsed = new Date(fallback).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
};

const getVehicleDedupKey = (payment = {}) => {
  const registration = String(
    payment?.vehicle?.registration_no || payment?.registration_no || "",
  )
    .trim()
    .toUpperCase();

  if (registration) {
    return `${String(payment?.service_type || "").toLowerCase()}|reg|${registration}`;
  }

  const vehicleId = String(
    payment?.vehicle?._id || payment?.vehicleId || "",
  ).trim();
  if (vehicleId) {
    return `${String(payment?.service_type || "").toLowerCase()}|vid|${vehicleId}`;
  }

  return "";
};

const dedupeLatestPendingByVehicle = (rows = []) => {
  if (!Array.isArray(rows) || rows.length <= 1) return rows;

  const latestByVehicle = new Map();
  const passthrough = [];

  for (const row of rows) {
    const vehicleKey = getVehicleDedupKey(row);

    if (!vehicleKey) {
      passthrough.push(row);
      continue;
    }

    const current = latestByVehicle.get(vehicleKey);
    if (!current) {
      latestByVehicle.set(vehicleKey, row);
      continue;
    }

    if (getPaymentTimestamp(row) > getPaymentTimestamp(current)) {
      latestByVehicle.set(vehicleKey, row);
    }
  }

  return [...latestByVehicle.values(), ...passthrough].sort(
    (a, b) => getPaymentTimestamp(b) - getPaymentTimestamp(a),
  );
};

const isSettledPayment = (payment = {}) => {
  const due = Number(payment?.balance || 0);
  const status = String(payment?.status || "pending").toLowerCase();
  return (
    (status === "completed" || status === "success" || status === "settled") &&
    due <= 0
  );
};

const summarySourceWithLatestPending = (rows = []) => {
  if (!Array.isArray(rows) || !rows.length) return [];

  const settled = [];
  const pending = [];

  for (const row of rows) {
    if (isSettledPayment(row)) {
      settled.push(row);
    } else {
      pending.push(row);
    }
  }

  return [...settled, ...dedupeLatestPendingByVehicle(pending)];
};

service.list = async (userInfo, query) => {
  const customerCandidates =
    await CustomerCandidatesHelper.getRelatedCustomerCandidates(userInfo);
  if (!customerCandidates.length) {
    return { total: 0, data: [] };
  }
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
      const dateCandidates = [
        // Prefer bill-generation timestamps for monthly cycle filtering.
        payment?.createdAt,
        payment?.bill_date,
        payment?.billDate,
        payment?.billing_date,
        payment?.updatedAt,
        // Fallback only when bill timestamps are absent.
        payment?.collectedDate,
      ];

      for (const rawDate of dateCandidates) {
        if (!rawDate) continue;
        const paymentDate = new Date(rawDate);
        if (Number.isNaN(paymentDate.getTime())) continue;
        return paymentDate >= dateRange.start && paymentDate <= dateRange.end;
      }

      return false;
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

  if (statusFilter === "pending" || statusFilter === "open") {
    // Match admin pending-dues logic: use latest pending row per vehicle.
    normalizedData = dedupeLatestPendingByVehicle(normalizedData);
  }

  const total = normalizedData.length;
  const summarySource =
    statusFilter === "pending" || statusFilter === "open"
      ? normalizedData
      : summarySourceWithLatestPending(normalizedData);
  const summary = summarySource.reduce(
    (acc, payment) => {
      const paid = Number(payment?.amount_paid || 0);
      const due = Number(payment?.balance || 0);
      const status = String(payment?.status || "pending").toLowerCase();
      const isSettled =
        (status === "completed" ||
          status === "success" ||
          status === "settled") &&
        due <= 0;

      acc.totalPaid += paid;
      acc.totalBalance += due;
      acc.totalCount += 1;
      if (isSettled) {
        acc.settledCount += 1;
      } else {
        acc.pendingCount += 1;
      }

      return acc;
    },
    {
      totalPaid: 0,
      totalBalance: 0,
      settledCount: 0,
      pendingCount: 0,
      totalCount: 0,
    },
  );
  const pagedData = normalizedData.slice(
    paginationData.skip,
    paginationData.skip + paginationData.limit,
  );

  return { total, data: pagedData, summary };
};
