"use strict";

const SupervisorActivityModel = require("../../models/supervisor-activity.model");
const UserModel = require("../../models/users.model");
const mongoose = require("mongoose");
const axios = require("axios");

const controller = module.exports;

/* ── IP Geolocation cache ── */
const geoCache = new Map();
const GEO_CACHE_TTL = 24 * 60 * 60 * 1000;
let cachedPublicIP = null;
let publicIPFetchedAt = 0;

function isLocalIP(ip) {
  return (
    !ip ||
    ip === "::1" ||
    ip === "127.0.0.1" ||
    ip === "::ffff:127.0.0.1" ||
    ip.startsWith("192.168.") ||
    ip.startsWith("10.") ||
    ip.startsWith("172.16.") ||
    ip.startsWith("172.17.") ||
    ip.startsWith("172.18.") ||
    ip.startsWith("172.19.") ||
    ip.startsWith("172.2") ||
    ip.startsWith("172.30.") ||
    ip.startsWith("172.31.") ||
    ip.startsWith("::ffff:192.168.") ||
    ip.startsWith("::ffff:10.") ||
    ip === "localhost"
  );
}

async function getPublicIP() {
  if (cachedPublicIP && Date.now() - publicIPFetchedAt < 60 * 60 * 1000) {
    return cachedPublicIP;
  }
  try {
    const { data } = await axios.get("https://api.ipify.org?format=json", {
      timeout: 3000,
    });
    if (data && data.ip) {
      cachedPublicIP = data.ip;
      publicIPFetchedAt = Date.now();
      return data.ip;
    }
  } catch (err) {
    try {
      const { data } = await axios.get("http://ip-api.com/json/?fields=query", {
        timeout: 3000,
      });
      if (data && data.query) {
        cachedPublicIP = data.query;
        publicIPFetchedAt = Date.now();
        return data.query;
      }
    } catch (e) {}
  }
  return null;
}

async function getGeoFromIP(ip) {
  let resolvedIP = ip;
  if (isLocalIP(ip)) {
    const pubIP = await getPublicIP();
    if (pubIP) {
      resolvedIP = pubIP;
    } else {
      return {
        city: "Local",
        region: "",
        country: "Local",
        isp: "",
        timezone: "",
      };
    }
  }

  const cached = geoCache.get(resolvedIP);
  if (cached && Date.now() - cached.ts < GEO_CACHE_TTL) {
    return cached.data;
  }

  try {
    const { data } = await axios.get(
      `http://ip-api.com/json/${resolvedIP}?fields=status,city,regionName,country,isp,timezone,query`,
      { timeout: 3000 },
    );
    if (data.status === "success") {
      const geo = {
        city: data.city || "",
        region: data.regionName || "",
        country: data.country || "",
        isp: data.isp || "",
        timezone: data.timezone || "",
      };
      geoCache.set(resolvedIP, { data: geo, ts: Date.now() });
      return geo;
    }
  } catch (err) {}
  return { city: "", region: "", country: "", isp: "", timezone: "" };
}

/* ── Reverse geocode lat/lng → full address ── */
const reverseGeoCache = new Map();
async function reverseGeocode(lat, lng) {
  const key = `${lat.toFixed(4)},${lng.toFixed(4)}`;
  const cached = reverseGeoCache.get(key);
  if (cached && Date.now() - cached.ts < GEO_CACHE_TTL) return cached.data;

  try {
    const { data } = await axios.get(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&addressdetails=1&zoom=18`,
      {
        timeout: 5000,
        headers: {
          "User-Agent": "BCW-SupervisorTracker/1.0",
          "Accept-Language": "en",
        },
      },
    );
    if (data && data.display_name) {
      const ad = data.address || {};
      const result = {
        fullAddress: data.display_name,
        road: ad.road || ad.street || "",
        neighbourhood: ad.neighbourhood || ad.suburb || "",
        city: ad.city || ad.town || ad.village || ad.county || "",
        state: ad.state || "",
        postcode: ad.postcode || "",
        country: ad.country || "",
      };
      reverseGeoCache.set(key, { data: result, ts: Date.now() });
      return result;
    }
  } catch (err) {}
  return null;
}

/* ── POST /batch — receive batch of activities from supervisor panel ── */
controller.trackBatch = async (req, res) => {
  try {
    if (!req.user || !req.user._id) {
      return res.status(401).json({ status: false, message: "Not authorized" });
    }
    const supervisorId = req.user._id;
    const { activities } = req.body;

    if (!activities || !Array.isArray(activities) || activities.length === 0) {
      return res
        .status(400)
        .json({ status: false, message: "No activities provided" });
    }

    const rawIP =
      req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
      req.connection?.remoteAddress ||
      req.ip;

    const geo = await getGeoFromIP(rawIP);
    const displayIP = isLocalIP(rawIP) ? cachedPublicIP || rawIP : rawIP;

    const firstLoc = activities[0]?.location;
    let serverGeoAddress = null;
    if (firstLoc && firstLoc.lat && firstLoc.lng && !firstLoc.fullAddress) {
      serverGeoAddress = await reverseGeocode(firstLoc.lat, firstLoc.lng);
    }

    const docs = activities.map((a) => {
      const loc = { ip: displayIP, ...geo, ...(a.location || {}) };
      if (serverGeoAddress && !loc.fullAddress) {
        Object.assign(loc, serverGeoAddress);
      }
      return {
        supervisor: supervisorId,
        sessionId: a.sessionId,
        activityType: a.activityType || "other",
        page: a.page || {},
        action: a.action || {},
        scroll: a.scroll || {},
        device: a.device || {},
        location: loc,
        duration: a.duration || null,
        timestamp: a.timestamp ? new Date(a.timestamp) : new Date(),
        metadata: a.metadata || {},
      };
    });

    await SupervisorActivityModel.insertMany(docs, { ordered: false });

    return res.status(200).json({
      status: true,
      message: `Tracked ${docs.length} activities`,
    });
  } catch (error) {
    console.error("[SupervisorActivity] Batch error:", error.message);
    return res.status(500).json({ status: false, message: "Server error" });
  }
};

/* ── Helper: build date filter ── */
function buildDateFilter(dateRange, startDate, endDate, startTime, endTime) {
  if (startDate) {
    const filter = {};
    let gte = new Date(startDate);
    let lte = endDate ? new Date(endDate) : null;
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

/* ── Helper: fetch tracking data for a given supervisor ── */
async function fetchSupervisorTrackingData(
  supervisorId,
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
  const supervisorFilter = {
    supervisor: new mongoose.Types.ObjectId(supervisorId),
    ...dateFilter,
  };
  const baseFilterNoDevice = { ...supervisorFilter };

  let baseFilter = supervisorFilter;
  if (deviceId) {
    const isFallbackKey = deviceId.includes("_");
    if (isFallbackKey) {
      const parts = deviceId.split("_");
      const browser = parts[0] || "Unknown";
      const platform = parts.slice(1, -1).join("_") || "Unknown";
      const isMobile = parts[parts.length - 1] === "mobile";
      baseFilter = {
        ...supervisorFilter,
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
      baseFilter = { ...supervisorFilter, "device.deviceId": deviceId };
    }
  }

  const [
    supervisorInfo,
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
    UserModel.findById(supervisorId)
      .select("name number role createdAt")
      .lean(),
    SupervisorActivityModel.countDocuments(baseFilter),
    SupervisorActivityModel.distinct("sessionId", baseFilter),
    SupervisorActivityModel.countDocuments({
      ...baseFilter,
      activityType: "scroll",
    }),
    SupervisorActivityModel.countDocuments({
      ...baseFilter,
      activityType: "button_click",
    }),
    SupervisorActivityModel.countDocuments({
      ...baseFilter,
      activityType: { $in: ["page_view", "screen_view"] },
    }),
    SupervisorActivityModel.countDocuments({
      ...baseFilter,
      activityType: "login",
    }),
    SupervisorActivityModel.aggregate([
      { $match: { ...baseFilter, activityType: "screen_time" } },
      { $group: { _id: null, total: { $sum: "$duration" } } },
    ]),
    SupervisorActivityModel.aggregate([
      { $match: { ...baseFilter, duration: { $gt: 0 } } },
      { $group: { _id: null, total: { $sum: "$duration" } } },
    ]),
    SupervisorActivityModel.aggregate([
      { $match: baseFilter },
      { $group: { _id: "$activityType", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]),
    SupervisorActivityModel.aggregate([
      { $match: baseFilter },
      { $group: { _id: { $hour: "$timestamp" }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]),
    SupervisorActivityModel.aggregate([
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
    SupervisorActivityModel.aggregate([
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
    SupervisorActivityModel.findOne(baseFilter)
      .select("device location")
      .sort({ timestamp: -1 })
      .lean(),
    SupervisorActivityModel.aggregate([
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
          language: { $first: { $ifNull: ["$device.language", "—"] } },
          platform: { $first: { $ifNull: ["$device.platform", "—"] } },
          userAgent: { $first: { $ifNull: ["$device.userAgent", ""] } },
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
            $sum: {
              $cond: [{ $eq: ["$activityType", "button_click"] }, 1, 0],
            },
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
          cities: { $addToSet: "$location.city" },
          countries: { $addToSet: "$location.country" },
          regions: { $addToSet: "$location.region" },
          isps: { $addToSet: "$location.isp" },
          fullAddresses: { $addToSet: "$location.fullAddress" },
          latitudes: { $addToSet: "$location.lat" },
          longitudes: { $addToSet: "$location.lng" },
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
          language: 1,
          platform: 1,
          userAgent: 1,
          totalActivities: 1,
          sessionCount: { $size: "$sessions" },
          logins: 1,
          pageViews: 1,
          clicks: 1,
          totalDuration: 1,
          lastSeen: 1,
          firstSeen: 1,
          ips: 1,
          cities: 1,
          countries: 1,
          regions: 1,
          isps: 1,
          fullAddresses: 1,
          latitudes: 1,
          longitudes: 1,
        },
      },
      { $sort: { lastSeen: -1 } },
    ]),
    SupervisorActivityModel.find(baseFilter)
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean(),
    SupervisorActivityModel.countDocuments(baseFilter),
  ]);

  return {
    supervisor: supervisorInfo,
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

/* ── GET /my-tracking — supervisor's own tracking data ── */
controller.getMyTracking = async (req, res) => {
  try {
    if (!req.user || !req.user._id) {
      return res.status(401).json({ status: false, message: "Not authorized" });
    }
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
    const data = await fetchSupervisorTrackingData(
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
    console.error("[SupervisorActivity] getMyTracking error:", error);
    return res.status(500).json({ status: false, message: "Server error" });
  }
};

/* ── GET /all-supervisors — list all supervisors with activity summary ── */
controller.getAllSupervisorsActivity = async (req, res) => {
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
          _id: "$supervisor",
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
          as: "supervisorInfo",
        },
      },
      { $unwind: "$supervisorInfo" },
      {
        $project: {
          supervisorId: "$_id",
          name: "$supervisorInfo.name",
          number: "$supervisorInfo.number",
          role: "$supervisorInfo.role",
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

    const [results, totalSupervisors] = await Promise.all([
      SupervisorActivityModel.aggregate(pipeline),
      SupervisorActivityModel.distinct("supervisor", dateFilter),
    ]);

    return res.status(200).json({
      status: true,
      data: {
        supervisors: results,
        total: totalSupervisors.length,
      },
    });
  } catch (error) {
    console.error("[SupervisorActivity] getAllSupervisors error:", error);
    return res.status(500).json({ status: false, message: "Server error" });
  }
};

/* ── GET /supervisor/:supervisorId — full detail for a specific supervisor ── */
controller.getSupervisorDetail = async (req, res) => {
  try {
    const { supervisorId } = req.params;
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
    const data = await fetchSupervisorTrackingData(
      supervisorId,
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
    console.error("[SupervisorActivity] getSupervisorDetail error:", error);
    return res.status(500).json({ status: false, message: "Server error" });
  }
};
