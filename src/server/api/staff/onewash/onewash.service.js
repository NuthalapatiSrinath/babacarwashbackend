const moment = require("moment");
const fs = require("fs");
const OneWashModel = require("../../models/onewash.model");
const PaymentsModel = require("../../models/payments.model");
const MallsModel = require("../../models/malls.model");
const BuildingsModel = require("../../models/buildings.model");
const CounterService = require("../../../utils/counters");
const CommonHelper = require("../../../helpers/common.helper");
const service = module.exports;

service.list = async (userInfo, query) => {
  const paginationData = CommonHelper.paginationData(query);
  const counts = {
    pending: await OneWashModel.countDocuments({
      worker: userInfo._id,
      isDeleted: false,
      status: "pending",
    }),
    completed: await OneWashModel.countDocuments({
      worker: userInfo._id,
      isDeleted: false,
      status: "completed",
    }),
  };
  const total = await OneWashModel.countDocuments({
    worker: userInfo._id,
    isDeleted: false,
    status: "pending",
  });
  const data = await OneWashModel.find({
    worker: userInfo._id,
    isDeleted: false,
    status: "pending",
  })
    .sort({ _id: -1 })
    .populate([
      { path: "customer", model: "customers" },
      { path: "location", model: "locations" },
      { path: "building", model: "buildings" },
    ])
    .lean();

  const jobsMap = {};

  for (const iterator of data) {
    if (!iterator.customer) {
      continue;
    }
    iterator.vehicle = iterator.customer.vehicles.find(
      (e) => e._id == iterator.vehicle,
    );
    let key = `${iterator.location._id}-${iterator.building._id}`;
    if (jobsMap[key]) {
      jobsMap[key].jobs.push(iterator);
    } else {
      jobsMap[key] = {
        location: iterator.location,
        building: iterator.building,
        jobs: [iterator],
      };
    }
  }

  const jobsDataMap = [];

  for (const key in jobsMap) {
    jobsDataMap.push({
      location: jobsMap[key].location,
      building: jobsMap[key].building,
      jobs: jobsMap[key].jobs,
    });
  }

  return { total, data: jobsDataMap, counts };
};

service.info = async (userInfo, id) => {
  return OneWashModel.findOne({ _id: id, isDeleted: false }).lean();
};

service.create = async (userInfo, payload) => {
  const id = await CounterService.id("onewash");

  if (payload.mall == "") delete payload.mall;
  if (payload.building == "") delete payload.building;

  if (payload.mall) {
    const PricingModel = require("../../models/pricing.model");

    console.log("🏢 [BACKEND] Mall onewash creation:", {
      mall: payload.mall,
      vehicle_type: payload.vehicle_type,
      wash_type: payload.wash_type,
    });

    // Try to get pricing from pricing table first
    const pricingData = await PricingModel.findOne({
      mall: payload.mall,
      service_type: "mall",
      isDeleted: false,
    }).lean();

    console.log(
      "💵 [BACKEND] Pricing data found:",
      JSON.stringify(pricingData, null, 2),
    );

    if (pricingData) {
      // Determine vehicle data
      const vehicleData =
        payload.vehicle_type === "suv" ? pricingData["4x4"] : pricingData.sedan;

      console.log(
        "🚗 [BACKEND] Vehicle data:",
        JSON.stringify(vehicleData, null, 2),
      );

      // Check if wash_types pricing is configured
      if (
        vehicleData &&
        vehicleData.wash_types &&
        (vehicleData.wash_types.inside || vehicleData.wash_types.outside) &&
        payload.wash_type
      ) {
        // Use wash_types pricing (Inside/Outside/Total method)
        payload.amount = vehicleData.wash_types[payload.wash_type];
        console.log("✅ [BACKEND] Using wash_types pricing:", {
          wash_type: payload.wash_type,
          amount: payload.amount,
        });
      } else if (vehicleData && vehicleData.onetime) {
        // Use onetime pricing
        payload.amount = vehicleData.onetime;
        console.log("✅ [BACKEND] Using onetime pricing:", payload.amount);
      } else {
        // Fallback to mall's default amount
        mallData = await MallsModel.findOne({ _id: payload.mall });
        payload.amount = mallData?.amount || 20;
        console.log("⚠️ [BACKEND] Using mall default amount:", payload.amount);
      }
    } else {
      // Fallback to mall's default amount if no pricing data
      mallData = await MallsModel.findOne({ _id: payload.mall });
      payload.amount = mallData?.amount || 20;
      console.log(
        "⚠️ [BACKEND] No pricing data, using mall default:",
        payload.amount,
      );
    }
  }

  if (payload.building) {
    buildingData = await BuildingsModel.findOne({ _id: payload.building });
    payload.amount = buildingData.amount;
  }

  const isAddedQuery = {
    createdAt: { $gt: new Date(moment().utc().subtract(12, "hours")) },
    ...(payload.mall ? { mall: payload.mall } : null),
    ...(payload.building ? { building: payload.building } : null),
    registration_no: payload.registration_no,
    parking_no: payload.parking_no,
  };

  const isAdded = await OneWashModel.findOne(isAddedQuery);

  if (isAdded) {
    fs.appendFileSync(`${Date.now()}.json`, JSON.stringify(payload));
    throw "The car is already added";
  }

  const data = {
    createdBy: userInfo._id,
    updatedBy: userInfo._id,
    id,
    ...payload,
    worker: userInfo._id,
    status: "pending",
  };

  const onewashData = await new OneWashModel(data).save();
  const paymentId = await CounterService.id("payments");

  const paymentData = {
    id: paymentId,
    job: onewashData._id,
    amount_charged: data.amount,
    amount_paid: 0,
    total_amount: data.amount,
    vehicle: {
      registration_no: data.registration_no,
      parking_no: data.parking_no,
    },
    worker: userInfo._id,
    service_type: data.service_type,
    ...(data.mall ? { mall: data.mall } : null),
    ...(data.building ? { building: data.building } : null),
    createdBy: userInfo._id,
    updatedBy: userInfo._id,
    onewash: true,
    status: "pending",
  };

  await new PaymentsModel(paymentData).save();
};

service.update = async (userInfo, id, payload) => {
  await OneWashModel.updateOne({ _id: id }, { $set: payload });
};

service.delete = async (userInfo, id, payload) => {
  return await OneWashModel.updateOne(
    { _id: id },
    { isDeleted: true, deletedBy: userInfo._id },
  );
};

service.undoDelete = async (userInfo, id) => {
  return await OneWashModel.updateOne(
    { _id: id },
    { isDeleted: false, updatedBy: userInfo._id },
  );
};

service.getPricing = async (userInfo) => {
  const PricingModel = require("../../models/pricing.model");

  console.log("🔍 [BACKEND] getPricing called for user:", {
    service_type: userInfo.service_type,
    mall: userInfo.mall,
    malls: userInfo.malls,
    userId: userInfo._id,
    name: userInfo.name,
  });

  // Get pricing based on user's service type
  let query = { isDeleted: false, service_type: userInfo.service_type };

  // Handle mall assignment - check both mall (single) and malls (array)
  if (userInfo.service_type === "mall") {
    const mallId =
      userInfo.mall ||
      (userInfo.malls && userInfo.malls.length > 0 ? userInfo.malls[0] : null);

    if (mallId) {
      query.mall = mallId;
      console.log("✅ [BACKEND] Using mall ID:", mallId);
    } else {
      console.log(
        "⚠️ [BACKEND] WARNING: Mall worker has no mall assigned! Full userInfo:",
        JSON.stringify(userInfo, null, 2)
      );
    }
  }

  console.log("📋 [BACKEND] Pricing query:", query);

  const pricing = await PricingModel.findOne(query).lean();

  console.log("💰 [BACKEND] Pricing found:", JSON.stringify(pricing, null, 2));

  return pricing;
};
