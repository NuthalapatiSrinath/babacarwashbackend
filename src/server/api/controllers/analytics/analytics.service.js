const moment = require("moment");
const NodeCache = require("node-cache");
const CounterService = require("../../../utils/counters");
const CommonHelper = require("../../../helpers/common.helper");
const JobsModel = require("../../models/jobs.model");
const WorkersModel = require("../../models/workers.model");
const OneWashModel = require("../../models/onewash.model");
const PaymentsModel = require("../../models/payments.model");
const CustomersModel = require("../../models/customers.model");
const BuildingsModel = require("../../models/buildings.model");
const StaffModel = require("../../models/staff.model");
const service = module.exports;

// Initialize cache with 5-minute TTL (300 seconds)
const dashboardCache = new NodeCache({ stdTTL: 300, checkperiod: 60 });

// ⚡ BLAZING FAST Dashboard Service with Caching
// Optimized for 425K+ documents - Target: < 2 seconds with cache
service.dashboardAll = async (userInfo, query) => {
  try {
    const startTime = Date.now();
    console.log("🚀 Dashboard fetch started...");
    
    // Generate cache key based on query parameters
    const cacheKey = `dashboard_${JSON.stringify(query || {})}`;
    
    // Check cache first
    const cachedData = dashboardCache.get(cacheKey);
    if (cachedData) {
      const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(2);
      console.log(`✅ Dashboard loaded from CACHE in ${elapsedTime}s`);
      return {
        ...cachedData,
        _meta: {
          ...cachedData._meta,
          cached: true,
          cacheAge: Math.round((Date.now() - cachedData._meta.timestamp) / 1000),
          loadTime: `${elapsedTime}s (cached)`,
        },
      };
    }

    // Parse date filters
    const dateFilter = {};
    const hasDateFilter = query.startDate && query.endDate;
    if (hasDateFilter) {
      dateFilter.createdAt = {
        $gte: new Date(query.startDate),
        $lte: new Date(query.endDate),
      };
    }

    // Date ranges
    const now = new Date();
    const yearStart = new Date(now.getFullYear(), 0, 1);
    const yearEnd = new Date(now.getFullYear() + 1, 0, 1);
    const todayStart = new Date(now.setHours(0, 0, 0, 0));
    const yesterdayStart = new Date(todayStart);
    yesterdayStart.setDate(yesterdayStart.getDate() - 1);
    const thisWeekStart = new Date(todayStart);
    thisWeekStart.setDate(thisWeekStart.getDate() - now.getDay());
    const lastWeekStart = new Date(thisWeekStart);
    lastWeekStart.setDate(lastWeekStart.getDate() - 7);
    const lastWeekEnd = new Date(thisWeekStart);
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = thisMonthStart;
    const last30Days = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // ⚡ Execute optimized parallel queries with sampling
    const [jobsData, paymentsData, simpleCountsData] = await Promise.all([
      // Jobs aggregation with $facet
      JobsModel.aggregate([
        { $match: { isDeleted: false } },
        {
          $facet: {
            basicStats: [
              { $match: hasDateFilter ? dateFilter : {} },
              {
                $group: {
                  _id: null,
                  total: { $sum: 1 },
                  completed: { $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] } },
                  pending: { $sum: { $cond: [{ $eq: ["$status", "pending"] }, 1, 0] } },
                  cancelled: { $sum: { $cond: [{ $eq: ["$status", "cancelled"] }, 1, 0] } },
                  residence: { $sum: { $cond: [{ $eq: ["$service_type", "residence"] }, 1, 0] } },
                  commercial: { $sum: { $cond: [{ $eq: ["$service_type", "commercial"] }, 1, 0] } },
                  mall: { $sum: { $cond: [{ $eq: ["$service_type", "mall"] }, 1, 0] } },
                  onewash: { $sum: { $cond: [{ $eq: ["$service_type", "onewash"] }, 1, 0] } },
                },
              },
            ],
            chartData: [
              { $match: { status: { $in: ["completed", "pending"] }, createdAt: { $gte: yearStart, $lt: yearEnd } } },
              { $group: { _id: { month: { $month: "$createdAt" }, status: "$status" }, count: { $sum: 1 } } },
              { $sort: { "_id.month": 1 } },
              { $limit: 24 },
            ],
            serviceDistribution: [
              { $match: { service_type: { $exists: true, $ne: null, $ne: "" }, ...(hasDateFilter ? dateFilter : {}) } },
              { $limit: 50000 },
              {
                $group: {
                  _id: "$service_type",
                  count: { $sum: 1 },
                  completed: { $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] } },
                  pending: { $sum: { $cond: [{ $eq: ["$status", "pending"] }, 1, 0] } },
                  cancelled: { $sum: { $cond: [{ $eq: ["$status", "cancelled"] }, 1, 0] } },
                },
              },
              { $sort: { count: -1 } },
            ],
            topWorkers: [
              { $match: { status: "completed", worker: { $exists: true, $ne: null }, ...(hasDateFilter ? dateFilter : {}) } },
              { $limit: 100000 },
              { $group: { _id: "$worker", totalJobs: { $sum: 1 } } },
              { $sort: { totalJobs: -1 } },
              { $limit: 10 },
              { $lookup: { from: "workers", localField: "_id", foreignField: "_id", as: "workerInfo" } },
              { $unwind: { path: "$workerInfo", preserveNullAndEmptyArrays: true } },
            ],
            buildingAnalytics: [
              { $match: { customer: { $exists: true, $ne: null }, ...(hasDateFilter ? dateFilter : {}) } },
              { $limit: 50000 },
              { $lookup: { from: "customers", localField: "customer", foreignField: "_id", as: "customerInfo" } },
              { $unwind: { path: "$customerInfo", preserveNullAndEmptyArrays: true } },
              {
                $group: {
                  _id: "$customerInfo.building",
                  totalJobs: { $sum: 1 },
                  completedJobs: { $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] } },
                },
              },
              { $match: { _id: { $exists: true, $ne: null } } },
              { $sort: { totalJobs: -1 } },
              { $limit: 20 },
              { $lookup: { from: "buildings", localField: "_id", foreignField: "_id", as: "buildingInfo" } },
              { $unwind: { path: "$buildingInfo", preserveNullAndEmptyArrays: true } },
            ],
            todayJobs: [{ $match: { createdAt: { $gte: todayStart } } }, { $count: "count" }],
            yesterdayJobs: [{ $match: { createdAt: { $gte: yesterdayStart, $lt: todayStart } } }, { $count: "count" }],
            thisWeekJobs: [{ $match: { createdAt: { $gte: thisWeekStart } } }, { $count: "count" }],
            lastWeekJobs: [{ $match: { createdAt: { $gte: lastWeekStart, $lt: lastWeekEnd } } }, { $count: "count" }],
            thisMonthJobs: [{ $match: { createdAt: { $gte: thisMonthStart } } }, { $count: "count" }],
            lastMonthJobs: [{ $match: { createdAt: { $gte: lastMonthStart, $lt: lastMonthEnd } } }, { $count: "count" }],
          },
        },
      ]),

      // Payments aggregation with $facet
      PaymentsModel.aggregate([
        { $match: { isDeleted: false } },
        {
          $facet: {
            paymentStats: [
              { $match: hasDateFilter ? dateFilter : {} },
              { $limit: 100000 },
              {
                $group: {
                  _id: "$status",
                  count: { $sum: 1 },
                  totalAmount: { $sum: "$amount_charged" },
                  paidAmount: { $sum: "$amount_paid" },
                  balance: { $sum: "$balance" },
                },
              },
            ],
            residenceChartData: [
              { $match: { status: { $in: ["completed", "pending"] }, createdAt: { $gte: yearStart, $lt: yearEnd }, onewash: false } },
              { $group: { _id: { month: { $month: "$createdAt" }, status: "$status" }, count: { $sum: 1 } } },
              { $sort: { "_id.month": 1 } },
              { $limit: 24 },
            ],
            onewashChartData: [
              { $match: { status: { $in: ["completed", "pending"] }, createdAt: { $gte: yearStart, $lt: yearEnd }, onewash: true } },
              { $group: { _id: { month: { $month: "$createdAt" }, status: "$status" }, count: { $sum: 1 } } },
              { $sort: { "_id.month": 1 } },
              { $limit: 24 },
            ],
            revenueTrends: [
              { $match: { status: "completed", createdAt: { $gte: hasDateFilter ? dateFilter.createdAt.$gte : last30Days } } },
              { $limit: 50000 },
              { $group: { _id: { date: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } } }, revenue: { $sum: "$amount_paid" }, count: { $sum: 1 } } },
              { $sort: { "_id.date": 1 } },
              { $limit: 90 },
            ],
            topWorkersRevenue: [
              { $match: { status: "completed", worker: { $exists: true, $ne: null }, ...(hasDateFilter ? dateFilter : {}) } },
              { $limit: 100000 },
              { $group: { _id: "$worker", totalRevenue: { $sum: "$amount_paid" }, totalJobs: { $sum: 1 } } },
              { $sort: { totalRevenue: -1 } },
              { $limit: 1 },
            ],
            serviceRevenue: [
              { $match: { status: "completed", job: { $exists: true, $ne: null }, ...(hasDateFilter ? dateFilter : {}) } },
              { $limit: 50000 },
              { $lookup: { from: "jobs", localField: "job", foreignField: "_id", as: "jobInfo" } },
              { $unwind: { path: "$jobInfo", preserveNullAndEmptyArrays: true } },
              { $match: { "jobInfo.service_type": { $exists: true, $ne: null } } },
              { $group: { _id: "$jobInfo.service_type", revenue: { $sum: "$amount_paid" } } },
            ],
            todayRevenue: [{ $match: { status: "completed", createdAt: { $gte: todayStart } } }, { $group: { _id: null, total: { $sum: "$amount_paid" } } }],
            yesterdayRevenue: [{ $match: { status: "completed", createdAt: { $gte: yesterdayStart, $lt: todayStart } } }, { $group: { _id: null, total: { $sum: "$amount_paid" } } }],
            thisWeekRevenue: [{ $match: { status: "completed", createdAt: { $gte: thisWeekStart } } }, { $group: { _id: null, total: { $sum: "$amount_paid" } } }],
            lastWeekRevenue: [{ $match: { status: "completed", createdAt: { $gte: lastWeekStart, $lt: lastWeekEnd } } }, { $group: { _id: null, total: { $sum: "$amount_paid" } } }],
            thisMonthRevenue: [{ $match: { status: "completed", createdAt: { $gte: thisMonthStart } } }, { $group: { _id: null, total: { $sum: "$amount_paid" } } }],
            lastMonthRevenue: [{ $match: { status: "completed", createdAt: { $gte: lastMonthStart, $lt: lastMonthEnd } } }, { $group: { _id: null, total: { $sum: "$amount_paid" } } }],
          },
        },
      ]),

      // Simple counts
      Promise.all([
        CustomersModel.aggregate([
          { $match: { isDeleted: false } },
          {
            $facet: {
              counts: [{ $group: { _id: null, total: { $sum: 1 }, active: { $sum: { $cond: [{ $eq: ["$status", 1] }, 1, 0] } }, inactive: { $sum: { $cond: [{ $eq: ["$status", 0] }, 1, 0] } } } }],
              vehicles: [{ $unwind: { path: "$vehicles", preserveNullAndEmptyArrays: false } }, { $group: { _id: null, totalVehicles: { $sum: 1 } } }],
            },
          },
        ]),
        WorkersModel.aggregate([{ $match: { isDeleted: false } }, { $group: { _id: null, total: { $sum: 1 }, active: { $sum: { $cond: [{ $eq: ["$status", 1] }, 1, 0] } }, inactive: { $sum: { $cond: [{ $eq: ["$status", 0] }, 1, 0] } } } }]),
        BuildingsModel.countDocuments({ isDeleted: false }),
        StaffModel.aggregate([{ $match: { isDeleted: false } }, { $group: { _id: null, total: { $sum: 1 }, active: { $sum: { $cond: [{ $eq: ["$status", 1] }, 1, 0] } } } }]),
        OneWashModel.aggregate([
          { $match: { status: { $in: ["completed", "pending"] }, isDeleted: false, createdAt: { $gte: yearStart, $lt: yearEnd } } },
          { $group: { _id: { month: { $month: "$createdAt" }, status: "$status" }, count: { $sum: 1 } } },
          { $sort: { "_id.month": 1 } },
          { $limit: 24 },
        ]),
      ]),
    ]);

    // Process results
    const jobStats = jobsData[0].basicStats[0] || {};
    const jobsChartData = jobsData[0].chartData || [];
    const serviceDistributionJobs = jobsData[0].serviceDistribution || [];
    const topWorkersJobData = jobsData[0].topWorkers || [];
    const buildingStatsData = jobsData[0].buildingAnalytics || [];
    const todayJobsCount = jobsData[0].todayJobs[0]?.count || 0;
    const yesterdayJobsCount = jobsData[0].yesterdayJobs[0]?.count || 0;
    const thisWeekJobsCount = jobsData[0].thisWeekJobs[0]?.count || 0;
    const lastWeekJobsCount = jobsData[0].lastWeekJobs[0]?.count || 0;
    const thisMonthJobsCount = jobsData[0].thisMonthJobs[0]?.count || 0;
    const lastMonthJobsCount = jobsData[0].lastMonthJobs[0]?.count || 0;

    const paymentStats = paymentsData[0].paymentStats || [];
    const paymentsChartData = paymentsData[0].residenceChartData || [];
    const onewashPaymentsChartData = paymentsData[0].onewashChartData || [];
    const revenueTrendsData = paymentsData[0].revenueTrends || [];
    const topWorkersPaymentData = paymentsData[0].topWorkersRevenue || [];
    const serviceDistributionRevenue = paymentsData[0].serviceRevenue || [];
    const todayRevenue = paymentsData[0].todayRevenue[0]?.total || 0;
    const yesterdayRevenue = paymentsData[0].yesterdayRevenue[0]?.total || 0;
    const thisWeekRevenue = paymentsData[0].thisWeekRevenue[0]?.total || 0;
    const lastWeekRevenue = paymentsData[0].lastWeekRevenue[0]?.total || 0;
    const thisMonthRevenue = paymentsData[0].thisMonthRevenue[0]?.total || 0;
    const lastMonthRevenue = paymentsData[0].lastMonthRevenue[0]?.total || 0;

    const [customersData, workersData, totalBuildings, staffData, onewashJobsChartData] = simpleCountsData;
    const customerStats = customersData[0].counts[0] || {};
    const totalVehicles = customersData[0].vehicles[0]?.totalVehicles || 0;
    const workerStats = workersData[0] || {};
    const staffStats = staffData[0] || {};

    // Process payment stats
    let totalPayments = 0, collectedPayments = 0, pendingPayments = 0, overduePayments = 0, paymentCount = 0;
    paymentStats.forEach((stat) => {
      paymentCount += stat.count;
      totalPayments += stat.totalAmount || 0;
      if (stat._id === "collected" || stat._id === "completed") collectedPayments += stat.paidAmount || 0;
      else if (stat._id === "pending") pendingPayments += stat.totalAmount || 0;
      else if (stat._id === "overdue") overduePayments += stat.totalAmount || 0;
    });

    // Calculate metrics
    const totalJobs = jobStats.total || 0;
    const completedJobs = jobStats.completed || 0;
    const activeWorkers = workerStats.active || 0;
    const collectionRate = totalPayments > 0 ? (collectedPayments / totalPayments) * 100 : 0;
    const completionRate = totalJobs > 0 ? (completedJobs / totalJobs) * 100 : 0;
    const avgPaymentPerJob = completedJobs > 0 ? collectedPayments / completedJobs : null;
    const avgJobsPerWorker = activeWorkers > 0 ? Math.round((totalJobs / activeWorkers) * 100) / 100 : 0;
    
    console.log("📊 Performance Metrics:", {
      totalJobs,
      activeWorkers,
      avgJobsPerWorker,
      completionRate: Math.round(completionRate * 100) / 100,
    });

    // Process chart data
    const processChartData = (data) => {
      const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      const monthData = {};
      data.forEach(({ _id, count }) => {
        const monthName = monthNames[_id.month - 1];
        if (!monthData[monthName]) monthData[monthName] = { completed: 0, pending: 0 };
        monthData[monthName][_id.status === "completed" ? "completed" : "pending"] = count;
      });
      const months = Object.keys(monthData);
      return { labels: months, completed: months.map((m) => monthData[m].completed), pending: months.map((m) => monthData[m].pending) };
    };

    // Process top workers - filter out those without worker info
    const paymentMap = Object.fromEntries(topWorkersPaymentData.map(s => [String(s._id), s.totalRevenue]));
    const topWorkers = topWorkersJobData
      .filter((w) => w.workerInfo && w.workerInfo.name) // Only include workers with valid data
      .map((w) => ({
        workerId: w._id,
        name: w.workerInfo.name,
        phone: w.workerInfo.phone || "",
        totalJobs: w.totalJobs,
        totalRevenue: paymentMap[String(w._id)] || null,
      }));

    // Top performer stats
    const topPerformer = topWorkersPaymentData.length > 0 ? {
      workerId: topWorkersPaymentData[0]._id,
      totalRevenue: topWorkersPaymentData[0].totalRevenue,
      totalJobs: topWorkersPaymentData[0].totalJobs,
    } : null;

    // Process service distribution - ensure all 4 service types always show
    const revenueMap = Object.fromEntries(serviceDistributionRevenue.map(i => [i._id, i.revenue]));
    
    // Create a map from existing data
    const existingServicesMap = {};
    serviceDistributionJobs.forEach((item) => {
      if (item._id) {
        existingServicesMap[item._id] = {
          serviceType: item._id,
          count: item.count,
          completed: item.completed,
          pending: item.pending,
          cancelled: item.cancelled,
          revenue: revenueMap[item._id] || null,
        };
      }
    });

    // Ensure all 4 service types are present
    const requiredServiceTypes = ["residence", "site", "mall", "mobile"];
    const serviceDistribution = requiredServiceTypes.map((serviceType) => {
      if (existingServicesMap[serviceType]) {
        return existingServicesMap[serviceType];
      }
      // Return default structure with 0 counts if service type doesn't exist
      return {
        serviceType: serviceType,
        count: 0,
        completed: 0,
        pending: 0,
        cancelled: 0,
        revenue: null,
      };
    });

    // Process building analytics - filter out buildings without valid data
    const buildingAnalytics = buildingStatsData
      .filter((stat) => stat.buildingInfo && stat.buildingInfo.name) // Only include buildings with valid data
      .map((stat) => ({
        buildingId: stat._id,
        buildingName: stat.buildingInfo.name,
        totalJobs: stat.totalJobs,
        completedJobs: stat.completedJobs,
      }));

    // Comparative data
    const calcChange = (current, previous) => ({
      value: current - previous,
      percentage: previous > 0 ? (((current - previous) / previous) * 100).toFixed(2) : 0,
    });
    
    const comparativeData = {
      daily: {
        today: { jobs: todayJobsCount, revenue: todayRevenue },
        yesterday: { jobs: yesterdayJobsCount, revenue: yesterdayRevenue },
        change: {
          jobs: todayJobsCount - yesterdayJobsCount,
          jobsPercentage: calcChange(todayJobsCount, yesterdayJobsCount).percentage,
          revenue: todayRevenue - yesterdayRevenue,
          revenuePercentage: calcChange(todayRevenue, yesterdayRevenue).percentage,
        },
      },
      weekly: {
        thisWeek: { jobs: thisWeekJobsCount, revenue: thisWeekRevenue },
        lastWeek: { jobs: lastWeekJobsCount, revenue: lastWeekRevenue },
        change: {
          jobs: thisWeekJobsCount - lastWeekJobsCount,
          jobsPercentage: calcChange(thisWeekJobsCount, lastWeekJobsCount).percentage,
          revenue: thisWeekRevenue - lastWeekRevenue,
          revenuePercentage: calcChange(thisWeekRevenue, lastWeekRevenue).percentage,
        },
      },
      monthly: {
        thisMonth: { jobs: thisMonthJobsCount, revenue: thisMonthRevenue },
        lastMonth: { jobs: lastMonthJobsCount, revenue: lastMonthRevenue },
        change: {
          jobs: thisMonthJobsCount - lastMonthJobsCount,
          jobsPercentage: calcChange(thisMonthJobsCount, lastMonthJobsCount).percentage,
          revenue: thisMonthRevenue - lastMonthRevenue,
          revenuePercentage: calcChange(thisMonthRevenue, lastMonthRevenue).percentage,
        },
      },
    };

    const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`✅ Dashboard loaded in ${elapsedTime}s`);

    const result = {
      adminStats: {
        payments: {
          total: totalPayments,
          collected: collectedPayments,
          pending: pendingPayments,
          overdue: overduePayments,
          count: paymentCount,
          averagePerJob: avgPaymentPerJob,
          collectionRate: collectionRate,
        },
        jobs: {
          total: totalJobs,
          completed: completedJobs,
          pending: jobStats.pending || 0,
          cancelled: jobStats.cancelled || 0,
          completionRate: completionRate,
        },
        serviceTypes: {
          residence: jobStats.residence || 0,
          commercial: jobStats.commercial || 0,
          mall: jobStats.mall || 0,
          onewash: jobStats.onewash || 0,
        },
        customers: {
          total: customerStats.total || 0,
          active: customerStats.active || 0,
          inactive: customerStats.inactive || 0,
          vehicles: totalVehicles,
        },
        workers: {
          total: workerStats.total || 0,
          active: workerStats.active || 0,
          inactive: workerStats.inactive || 0,
          avgJobsPerWorker: avgJobsPerWorker,
        },
        buildings: {
          total: totalBuildings,
        },
        staff: {
          total: staffStats.total || 0,
          active: staffStats.active || 0,
        },
        performance: {
          avgJobsPerWorker: avgJobsPerWorker,
          avgRevenuePerJob: avgPaymentPerJob ? Math.round(avgPaymentPerJob * 100) / 100 : null,
          completionRate: Math.round(completionRate * 100) / 100,
          collectionRate: Math.round(collectionRate * 100) / 100,
          activeWorkersPercentage: workerStats.total > 0 ? Math.round((workerStats.active / workerStats.total) * 10000) / 100 : 0,
          totalVehicles: totalVehicles,
        },
      },
      charts: {
        residence: {
          jobs: processChartData(jobsChartData),
          payments: processChartData(paymentsChartData),
        },
        onewash: {
          jobs: processChartData(onewashJobsChartData),
          payments: processChartData(onewashPaymentsChartData),
        },
      },
      revenueTrends: revenueTrendsData.map((item) => ({
        date: item._id.date,
        revenue: item.revenue,
        count: item.count,
      })),
      topWorkers: topWorkers,
      serviceDistribution: serviceDistribution,
      buildingAnalytics: buildingAnalytics,
      comparativeData: comparativeData,
      _meta: {
        loadTime: `${elapsedTime}s`,
        timestamp: Date.now(),
        cached: false,
        note: "Optimized for 425K+ documents with 5-min cache",
      },
    };

    // Store in cache
    dashboardCache.set(cacheKey, result);
    console.log(`💾 Dashboard data cached for 5 minutes`);

    return result;
  } catch (error) {
    console.error("❌ Dashboard All Service Error:", error);
    throw error;
  }
};


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
            $in: (userInfo.buildings || [])
              .filter((b) => b)
              .map((b) => (typeof b === 'string' ? b.trim() : b.toString()))
              .filter((b) => b),
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
