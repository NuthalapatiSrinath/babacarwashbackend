"use strict";

const AdminActivityModel = require("../../models/admin-activity.model");
const UserModel = require("../../models/users.model");
const mongoose = require("mongoose");

const controller = module.exports;

/* ── POST /batch — receive batch of activities from admin panel ── */
controller.trackBatch = async (req, res) => {
  try {
    const adminId = req.user._id;
    const { activities } = req.body;

    if (!activities || !Array.isArray(activities) || activities.length === 0) {
      return res
        .status(400)
        .json({ status: false, message: "No activities provided" });
    }

    const ip =
      req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
      req.connection?.remoteAddress ||
      req.ip;

    const docs = activities.map((a) => ({
      admin: adminId,
      sessionId: a.sessionId,
      activityType: a.activityType || "other",
      page: a.page || {},
      action: a.action || {},
      scroll: a.scroll || {},
      device: a.device || {},
      location: { ip, ...(a.location || {}) },
      duration: a.duration || null,
      timestamp: a.timestamp ? new Date(a.timestamp) : new Date(),
      metadata: a.metadata || {},
    }));

    await AdminActivityModel.insertMany(docs, { ordered: false });

    return res.status(200).json({
      status: true,
      message: `Tracked ${docs.length} activities`,
    });
  } catch (error) {
    console.error("[AdminActivity] Batch error:", error.message);
    return res.status(500).json({ status: false, message: "Server error" });
  }
};

/* ── Helper: build date filter ── */
function buildDateFilter(dateRange, startDate, endDate, startTime, endTime) {
  // Custom date range takes priority
  if (startDate) {
    const filter = {};
    let gte = new Date(startDate);
    let lte = endDate ? new Date(endDate) : null;

    // Apply custom time if provided (format: "HH:mm")
    if (startTime) {
      const [h, m] = startTime.split(":").map(Number);
      gte.setHours(h, m, 0, 0);
    }
    if (lte && endTime) {
      const [h, m] = endTime.split(":").map(Number);
      lte.setHours(h, m, 59, 999);
    }

    filter.timestamp = { $gte: gte };
    if (lte) filter.timestamp.$lte = lte;
    return filter;
  }

  // Preset ranges
  const now = new Date();
  if (dateRange === "today") {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    return { timestamp: { $gte: start } };
  } else if (dateRange === "week") {
    return { timestamp: { $gte: new Date(now.getTime() - 7 * 86400000) } };
  } else if (dateRange === "month") {
    return { timestamp: { $gte: new Date(now.getTime() - 30 * 86400000) } };
  }
  return {};
}

/* ── Helper: fetch tracking data for a given adminId ── */
async function fetchAdminTrackingData(
  adminId,
  dateRange,
  page,
  limit,
  startDate,
  endDate,
  startTime,
  endTime,
  deviceId,
) {
  const skip = (parseInt(page) - 1) * parseInt(limit);
  const dateFilter = buildDateFilter(
    dateRange,
    startDate,
    endDate,
    startTime,
    endTime,
  );
  const adminFilter = {
    admin: new mongoose.Types.ObjectId(adminId),
    ...dateFilter,
  };
  // Base filter without device — used for the devices aggregation itself
  const baseFilterNoDevice = { ...adminFilter };

  // Build device filter: match deviceId field directly, OR for old records
  // match the fallback browser_platform_type key
  let baseFilter = adminFilter;
  if (deviceId) {
    // First check if this looks like a fallback key (contains underscores like Chrome_Win32_desktop)
    // or a real deviceId (base64-ish alphanumeric)
    const isFallbackKey = deviceId.includes("_");
    if (isFallbackKey) {
      // Parse the fallback key: browser_platform_mobile/desktop
      const parts = deviceId.split("_");
      const browser = parts[0] || "Unknown";
      const platform = parts.slice(1, -1).join("_") || "Unknown";
      const isMobile = parts[parts.length - 1] === "mobile";
      baseFilter = {
        ...adminFilter,
        $or: [
          { "device.deviceId": deviceId },
          {
            "device.browser": browser,
            "device.platform": platform,
            "device.isMobile": isMobile,
            "device.deviceId": { $exists: false },
          },
        ],
      };
    } else {
      baseFilter = { ...adminFilter, "device.deviceId": deviceId };
    }
  }

  const [
    adminInfo,
    totalActivities,
    sessionAgg,
    scrollAgg,
    clickAgg,
    pageViewAgg,
    loginAgg,
    screenTimeAgg,
    durationAgg,
    activityBreakdown,
    activityByHour,
    activityByDay,
    topPages,
    deviceLatest,
    devicesAgg,
    timeline,
    totalCount,
  ] = await Promise.all([
    UserModel.findById(adminId).select("name number role createdAt").lean(),
    AdminActivityModel.countDocuments(baseFilter),
    AdminActivityModel.distinct("sessionId", baseFilter),
    AdminActivityModel.countDocuments({
      ...baseFilter,
      activityType: "scroll",
    }),
    AdminActivityModel.countDocuments({
      ...baseFilter,
      activityType: "button_click",
    }),
    AdminActivityModel.countDocuments({
      ...baseFilter,
      activityType: { $in: ["page_view", "screen_view"] },
    }),
    AdminActivityModel.countDocuments({ ...baseFilter, activityType: "login" }),
    AdminActivityModel.aggregate([
      { $match: { ...baseFilter, activityType: "screen_time" } },
      { $group: { _id: null, total: { $sum: "$duration" } } },
    ]),
    AdminActivityModel.aggregate([
      { $match: { ...baseFilter, duration: { $gt: 0 } } },
      { $group: { _id: null, total: { $sum: "$duration" } } },
    ]),
    AdminActivityModel.aggregate([
      { $match: baseFilter },
      { $group: { _id: "$activityType", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]),
    AdminActivityModel.aggregate([
      { $match: baseFilter },
      { $group: { _id: { $hour: "$timestamp" }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]),
    AdminActivityModel.aggregate([
      { $match: baseFilter },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$timestamp" } },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: -1 } },
      { $limit: 30 },
    ]),
    AdminActivityModel.aggregate([
      {
        $match: {
          ...baseFilter,
          activityType: { $in: ["page_view", "screen_time"] },
        },
      },
      {
        $group: {
          _id: "$page.path",
          title: { $first: "$page.title" },
          views: {
            $sum: { $cond: [{ $eq: ["$activityType", "page_view"] }, 1, 0] },
          },
          totalDuration: {
            $sum: {
              $cond: [
                { $eq: ["$activityType", "screen_time"] },
                { $ifNull: ["$duration", 0] },
                0,
              ],
            },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { views: -1 } },
      { $limit: 20 },
    ]),
    AdminActivityModel.findOne(baseFilter)
      .select("device location")
      .sort({ timestamp: -1 })
      .lean(),
    // Devices aggregation — always use baseFilterNoDevice so we list ALL devices regardless of current filter
    // Uses deviceId if available, falls back to browser+platform for old data
    AdminActivityModel.aggregate([
      { $match: baseFilterNoDevice },
      {
        $addFields: {
          _deviceKey: {
            $ifNull: [
              "$device.deviceId",
              {
                $concat: [
                  { $ifNull: ["$device.browser", "Unknown"] },
                  "_",
                  { $ifNull: ["$device.platform", "Unknown"] },
                  "_",
                  {
                    $cond: [
                      { $ifNull: ["$device.isMobile", false] },
                      "mobile",
                      "desktop",
                    ],
                  },
                ],
              },
            ],
          },
        },
      },
      {
        $group: {
          _id: "$_deviceKey",
          deviceId: {
            $first: { $ifNull: ["$device.deviceId", "$_deviceKey"] },
          },
          browser: { $first: "$device.browser" },
          os: { $first: { $ifNull: ["$device.os", "$device.platform"] } },
          deviceType: {
            $first: {
              $ifNull: [
                "$device.deviceType",
                {
                  $cond: [
                    { $ifNull: ["$device.isMobile", false] },
                    "Mobile",
                    "Desktop",
                  ],
                },
              ],
            },
          },
          screenResolution: { $first: "$device.screenResolution" },
          deviceLabel: {
            $first: {
              $ifNull: [
                "$device.deviceLabel",
                {
                  $concat: [
                    { $ifNull: ["$device.browser", "Unknown Browser"] },
                    " on ",
                    { $ifNull: ["$device.platform", "Unknown OS"] },
                  ],
                },
              ],
            },
          },
          isMobile: { $first: "$device.isMobile" },
          totalActivities: { $sum: 1 },
          sessions: { $addToSet: "$sessionId" },
          logins: {
            $sum: { $cond: [{ $eq: ["$activityType", "login"] }, 1, 0] },
          },
          pageViews: {
            $sum: {
              $cond: [
                { $in: ["$activityType", ["page_view", "screen_view"]] },
                1,
                0,
              ],
            },
          },
          clicks: {
            $sum: { $cond: [{ $eq: ["$activityType", "button_click"] }, 1, 0] },
          },
          totalDuration: {
            $sum: {
              $cond: [
                { $eq: ["$activityType", "screen_time"] },
                { $ifNull: ["$duration", 0] },
                0,
              ],
            },
          },
          lastSeen: { $max: "$timestamp" },
          firstSeen: { $min: "$timestamp" },
          ips: { $addToSet: "$location.ip" },
        },
      },
      {
        $project: {
          _id: 0,
          deviceId: 1,
          browser: 1,
          os: 1,
          deviceType: 1,
          screenResolution: 1,
          deviceLabel: 1,
          isMobile: 1,
          totalActivities: 1,
          sessionCount: { $size: "$sessions" },
          logins: 1,
          pageViews: 1,
          clicks: 1,
          totalDuration: 1,
          lastSeen: 1,
          firstSeen: 1,
          ips: 1,
        },
      },
      { $sort: { lastSeen: -1 } },
    ]),
    AdminActivityModel.find(baseFilter)
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean(),
    AdminActivityModel.countDocuments(baseFilter),
  ]);

  return {
    admin: adminInfo,
    stats: {
      totalActivities,
      sessionCount: sessionAgg.length,
      totalScrolls: scrollAgg,
      totalClicks: clickAgg,
      totalPageViews: pageViewAgg,
      totalLogins: loginAgg,
      totalScreenTime: screenTimeAgg[0]?.total || 0,
      totalDuration: durationAgg[0]?.total || 0,
    },
    activityBreakdown,
    activityByHour,
    activityByDay: (activityByDay || []).reverse(),
    topPages,
    deviceInfo: deviceLatest || null,
    devices: devicesAgg || [],
    timeline,
    totalPages: Math.ceil(totalCount / parseInt(limit)),
  };
}

/* ── GET /my-tracking — admin's own tracking data ── */
controller.getMyTracking = async (req, res) => {
  try {
    const {
      dateRange = "all",
      page = 1,
      limit = 30,
      startDate,
      endDate,
      startTime,
      endTime,
      deviceId,
    } = req.query;
    const data = await fetchAdminTrackingData(
      req.user._id,
      dateRange,
      page,
      limit,
      startDate,
      endDate,
      startTime,
      endTime,
      deviceId,
    );
    return res.status(200).json({ status: true, data });
  } catch (error) {
    console.error("[AdminActivity] getMyTracking error:", error);
    return res.status(500).json({ status: false, message: "Server error" });
  }
};

/* ── GET /all-admins — list all admin users with their activity summary ── */
controller.getAllAdminsActivity = async (req, res) => {
  try {
    const {
      dateRange = "all",
      page = 1,
      limit = 50,
      startDate,
      endDate,
      startTime,
      endTime,
    } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const dateFilter = buildDateFilter(
      dateRange,
      startDate,
      endDate,
      startTime,
      endTime,
    );

    const pipeline = [
      { $match: dateFilter },
      {
        $group: {
          _id: "$admin",
          totalActivities: { $sum: 1 },
          sessions: { $addToSet: "$sessionId" },
          lastSeen: { $max: "$timestamp" },
          firstSeen: { $min: "$timestamp" },
          pageViews: {
            $sum: {
              $cond: [
                { $in: ["$activityType", ["page_view", "screen_time"]] },
                1,
                0,
              ],
            },
          },
          logins: {
            $sum: { $cond: [{ $eq: ["$activityType", "login"] }, 1, 0] },
          },
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "_id",
          foreignField: "_id",
          as: "adminInfo",
        },
      },
      { $unwind: "$adminInfo" },
      {
        $project: {
          adminId: "$_id",
          name: "$adminInfo.name",
          number: "$adminInfo.number",
          role: "$adminInfo.role",
          totalActivities: 1,
          sessionCount: { $size: "$sessions" },
          pageViews: 1,
          logins: 1,
          lastSeen: 1,
          firstSeen: 1,
        },
      },
      { $sort: { lastSeen: -1 } },
      { $skip: skip },
      { $limit: parseInt(limit) },
    ];

    const [results, totalAdmins] = await Promise.all([
      AdminActivityModel.aggregate(pipeline),
      AdminActivityModel.distinct("admin", dateFilter),
    ]);

    return res.status(200).json({
      status: true,
      data: {
        admins: results,
        total: totalAdmins.length,
      },
    });
  } catch (error) {
    console.error("[AdminActivity] getAllAdmins error:", error);
    return res.status(500).json({ status: false, message: "Server error" });
  }
};

/* ── GET /admin/:adminId — full detail for a specific admin ── */
controller.getAdminDetail = async (req, res) => {
  try {
    const { adminId } = req.params;
    const {
      dateRange = "all",
      page = 1,
      limit = 30,
      startDate,
      endDate,
      startTime,
      endTime,
      deviceId,
    } = req.query;
    const data = await fetchAdminTrackingData(
      adminId,
      dateRange,
      page,
      limit,
      startDate,
      endDate,
      startTime,
      endTime,
      deviceId,
    );
    return res.status(200).json({ status: true, data });
  } catch (error) {
    console.error("[AdminActivity] getAdminDetail error:", error);
    return res.status(500).json({ status: false, message: "Server error" });
  }
};
