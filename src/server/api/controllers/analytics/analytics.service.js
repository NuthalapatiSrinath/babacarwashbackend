const moment = require("moment");
const CounterService = require("../../../utils/counters");
const CommonHelper = require("../../../helpers/common.helper");
const JobsModel = require("../../models/jobs.model");
const WorkersModel = require("../../models/workers.model");
const OneWashModel = require("../../models/onewash.model");
const PaymentsModel = require("../../models/payments.model");
const service = module.exports;

service.admin = async (userInfo, query) => {
  const jobs = {
    pending: await JobsModel.countDocuments({ status: "pending" }),
    completed: await JobsModel.countDocuments({ status: "completed" }),
  };

  const payments = {
    pending: await PaymentsModel.countDocuments({ status: "pending" }),
    completed: await PaymentsModel.countDocuments({ status: "completed" }),
  };

  return {
    counts: {
      jobs,
      payments,
    },
    charts: {},
  };
};

service.jobsChart = async (query) => {
  const result = await JobsModel.aggregate([
    {
      $match: {
        status: { $in: ["completed", "pending"] },
        ...query,
      },
    },
    {
      $group: {
        _id: {
          month: { $month: "$createdAt" },
          status: "$status",
        },
        count: { $sum: 1 },
      },
    },
    {
      $sort: { "_id.month": 1 },
    },
  ]);

  const monthNames = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const monthData = {};

  result.forEach(({ _id, count }) => {
    const monthIndex = _id.month - 1;
    const monthName = monthNames[monthIndex];

    if (!monthData[monthName]) {
      monthData[monthName] = { completed: 0, pending: 0 };
    }

    if (_id.status === "completed") {
      monthData[monthName].completed = count;
    } else if (_id.status === "pending") {
      monthData[monthName].pending = count;
    }
  });

  const filteredMonths = Object.keys(monthData);
  const completedCounts = filteredMonths.map(
    (month) => monthData[month].completed
  );
  const pendingCounts = filteredMonths.map((month) => monthData[month].pending);

  return {
    labels: filteredMonths,
    completed: completedCounts,
    pending: pendingCounts,
  };
};

service.onewashJobsChart = async (query) => {
  const result = await OneWashModel.aggregate([
    {
      $match: {
        status: { $in: ["completed", "pending"] },
        ...query,
      },
    },
    {
      $group: {
        _id: {
          month: { $month: "$createdAt" },
          status: "$status",
        },
        count: { $sum: 1 },
      },
    },
    {
      $sort: { "_id.month": 1 },
    },
  ]);

  const monthNames = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const monthData = {};

  result.forEach(({ _id, count }) => {
    const monthIndex = _id.month - 1;
    const monthName = monthNames[monthIndex];

    if (!monthData[monthName]) {
      monthData[monthName] = { completed: 0, pending: 0 };
    }

    if (_id.status === "completed") {
      monthData[monthName].completed = count;
    } else if (_id.status === "pending") {
      monthData[monthName].pending = count;
    }
  });

  const filteredMonths = Object.keys(monthData);
  const completedCounts = filteredMonths.map(
    (month) => monthData[month].completed
  );
  const pendingCounts = filteredMonths.map((month) => monthData[month].pending);

  return {
    labels: filteredMonths,
    completed: completedCounts,
    pending: pendingCounts,
  };
};

service.paymentsChart = async (query) => {
  const result = await PaymentsModel.aggregate([
    {
      $match: {
        status: { $in: ["completed", "pending"] },
        ...query,
      },
    },
    {
      $group: {
        _id: {
          month: { $month: "$createdAt" },
          status: "$status",
        },
        count: { $sum: 1 },
      },
    },
    {
      $sort: { "_id.month": 1 },
    },
  ]);

  const monthNames = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const monthData = {};

  result.forEach(({ _id, count }) => {
    const monthIndex = _id.month - 1;
    const monthName = monthNames[monthIndex];

    if (!monthData[monthName]) {
      monthData[monthName] = { completed: 0, pending: 0 };
    }

    if (_id.status === "completed") {
      monthData[monthName].completed = count;
    } else if (_id.status === "pending") {
      monthData[monthName].pending = count;
    }
  });

  const filteredMonths = Object.keys(monthData);
  const completedCounts = filteredMonths.map(
    (month) => monthData[month].completed
  );
  const pendingCounts = filteredMonths.map((month) => monthData[month].pending);

  return {
    labels: filteredMonths,
    completed: completedCounts,
    pending: pendingCounts,
  };
};

service.charts = async (userInfo, query) => {
  const jobs = await this.jobsChart({
    createdAt: {
      $gte: new Date(new Date().getFullYear(), 0, 1),
      $lt: new Date(new Date().getFullYear() + 1, 0, 1),
    },
  });

  const payments = await this.paymentsChart({
    createdAt: {
      $gte: new Date(new Date().getFullYear(), 0, 1),
      $lt: new Date(new Date().getFullYear() + 1, 0, 1),
    },
    onewash: false,
  });

  const onewashJobs = await this.onewashJobsChart({
    createdAt: {
      $gte: new Date(new Date().getFullYear(), 0, 1),
      $lt: new Date(new Date().getFullYear() + 1, 0, 1),
    },
  });

  const onewashPayments = await this.paymentsChart({
    createdAt: {
      $gte: new Date(new Date().getFullYear(), 0, 1),
      $lt: new Date(new Date().getFullYear() + 1, 0, 1),
    },
    onewash: true,
  });

  return {
    residence: {
      jobs,
      payments,
    },
    onewash: {
      jobs: onewashJobs,
      payments: onewashPayments,
    },
  };
};

service.supervisors = async (userInfo, body) => {
  const findQuery = {
    isDeleted: false,
    ...(userInfo.service_type == "mall"
      ? { malls: { $in: [userInfo.mall] } }
      : null),
    ...(userInfo.service_type == "residence"
      ? {
          buildings: {
            $in: (userInfo.buildings || []).filter((b) => b && b.trim()),
          },
        }
      : null),
  };

  const workers = await WorkersModel.find(findQuery);
  const workerIds = workers.map((e) => e._id.toString());

  const totalJobs = await OneWashModel.count({
    isDeleted: false,
    worker: { $in: workerIds },
  });
  const totalPayments = await PaymentsModel.aggregate([
    {
      $match: {
        isDeleted: false,
        worker: { $in: workerIds },
        status: "completed",
      },
    },
    { $group: { _id: "$payment_mode", amount: { $sum: "$amount_paid" } } },
  ]);

  const totalAmount = totalPayments.length
    ? totalPayments.reduce((p, c) => p + c.amount, 0)
    : 0;
  const totalCash = totalPayments.length
    ? totalPayments.filter((e) => e._id == "cash")
    : 0;
  const totalCard = totalPayments.length
    ? totalPayments.filter((e) => e._id == "card")
    : 0;
  const totalBank = totalPayments.length
    ? totalPayments.filter((e) => e._id == "bank transfer")
    : 0;

  const findWashQuery = {
    isDeleted: false,
    worker: { $in: workerIds },
    ...(body.startDate
      ? {
          createdAt: {
            $gte: new Date(body.startDate),
            $lte: new Date(body.endDate),
          },
        }
      : null),
  };

  const todaysJobs = await OneWashModel.count(findWashQuery);
  const todaysPayments = await PaymentsModel.aggregate([
    { $match: { ...findWashQuery, status: "completed" } },
    { $group: { _id: "$payment_mode", amount: { $sum: "$amount_paid" } } },
  ]);

  const todaysAmount = todaysPayments.length
    ? todaysPayments.reduce((p, c) => p + c.amount, 0)
    : 0;
  const todaysCash = todaysPayments.length
    ? todaysPayments.filter((e) => e._id == "cash")
    : 0;
  const todaysCard = todaysPayments.length
    ? todaysPayments.filter((e) => e._id == "card")
    : 0;
  const todaysBank = todaysPayments.length
    ? todaysPayments.filter((e) => e._id == "bank transfer")
    : 0;

  return {
    counts: {
      totalJobs,
      totalAmount,
      totalCash: totalCash.length ? totalCash[0].amount : 0,
      totalCard: totalCard.length ? totalCard[0].amount : 0,
      totalBank: totalBank.length ? totalBank[0].amount : 0,
      todaysJobs,
      todaysAmount,
      todaysCash: todaysCash.length ? todaysCash[0].amount : 0,
      todaysCard: todaysCard.length ? todaysCard[0].amount : 0,
      todaysBank: todaysBank.length ? todaysBank[0].amount : 0,
    },
    charts: {},
  };
};
