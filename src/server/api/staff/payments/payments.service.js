const PaymentsModel = require("../../models/payments.model");
const PaymentSettlementsModel = require("../../models/payment-settlements.model");
const OneWashModel = require("../../models/onewash.model");
const JobsModel = require("../../models/jobs.model");
const MallsModel = require("../../models/malls.model");
const BuildingsModel = require("../../models/buildings.model");
const TransactionsModel = require("../../models/transactions.model");
const CounterService = require("../../../utils/counters");
const CommonHelper = require("../../../helpers/common.helper");
const service = module.exports;

service.list = async (userInfo, query) => {
  const paginationData = CommonHelper.paginationData(query);
  const findQuery = {
    worker: userInfo._id,
    isDeleted: false,
    ...(query.search
      ? {
          $or: [
            {
              "vehicle.registration_no": {
                $regex: new RegExp(query.search.trim(), "i"),
              },
            },
            {
              "vehicle.parking_no": {
                $regex: new RegExp(query.search.trim(), "i"),
              },
            },
          ],
        }
      : null),
    ...(query.status
      ? {
          status: query.status,
          ...(query.status == "completed" ? { settled: "pending" } : null),
        }
      : { status: "pending" }),
    ...(userInfo.service_type == "residence" && query.startDate
      ? {
          createdAt: {
            $gte: new Date(query.startDate),
            $lte: new Date(query.endDate),
          },
        }
      : null),
  };

  const pending = await PaymentsModel.find({ ...findQuery, status: "pending" });
  const completedAmount = await PaymentsModel.find(
    { ...findQuery, status: "completed", settled: "pending" },
    { amount_paid: 1 },
  ).lean();
  const total = await PaymentsModel.countDocuments(findQuery);
  const data = await PaymentsModel.find(findQuery)
    .sort({ _id: -1 })
    .skip(paginationData.skip)
    .limit(paginationData.limit)
    .populate([
      { path: "job", model: "jobs" },
      { path: "location", model: "locations" },
      { path: "building", model: "buildings" },
      { path: "customer", model: "customers" },
    ])
    .lean();

  const onewashPayments = data.filter((e) => e.onewash);
  const residencePayments = data.filter((e) => !e.onewash);

  const paymentsMap = {};

  for (const iterator of residencePayments) {
    let key = `${iterator?.location?._id}-${iterator?.building?._id}`;
    if (paymentsMap[key]) {
      paymentsMap[key].payments.push(iterator);
    } else {
      paymentsMap[key] = {
        location: iterator.location,
        building: iterator.building,
        payments: [iterator],
      };
    }
  }

  const paymentsDataMap = [];
  const buildings = [];

  for (const key in paymentsMap) {
    buildings.push(paymentsMap[key].building);
    paymentsDataMap.push({
      location: paymentsMap[key].location,
      building: paymentsMap[key].building,
      payments: paymentsMap[key].payments,
    });
  }

  const counts = {
    pending: pending.length,
    pendingAmount: pending.reduce(
      (p, c) => p + (c.amount_charged + c.old_balance),
      0,
    ),
    completed: completedAmount.length,
    completedAmount: completedAmount.reduce((p, c) => p + c.amount_paid, 0),
  };

  return {
    total,
    data: { onewash: onewashPayments, residence: paymentsDataMap },
    counts: {
      ...counts,
    },
    settleData: {
      count: completedAmount.length,
      amount: completedAmount.reduce((p, c) => p + c.amount_paid, 0),
      paymentIds: completedAmount.map((e) => e._id.toString()),
    },
  };
};

service.info = async (userInfo, id) => {
  return PaymentsModel.findOne({ _id: id, isDeleted: false }).lean();
};

service.create = async (userInfo, payload) => {
  const id = await CounterService.id("payments");
  const data = {
    createdBy: userInfo._id,
    updatedBy: userInfo._id,
    id,
    ...payload,
  };
  await new PaymentsModel(data).save();
};

service.update = async (userInfo, id, payload) => {
  await PaymentsModel.updateOne({ _id: id }, { $set: payload });
};

service.delete = async (userInfo, id, payload) => {
  return await PaymentsModel.updateOne(
    { _id: id },
    { isDeleted: true, deletedBy: userInfo._id },
  );
};

service.undoDelete = async (userInfo, id) => {
  return await PaymentsModel.updateOne(
    { _id: id },
    { isDeleted: false, updatedBy: userInfo._id },
  );
};

service.collectOnewashPayment = async (userInfo, id, payload, paymentData) => {
  let jobData = await OneWashModel.findOne({ _id: paymentData.job }).lean();

  if (!jobData) {
    jobData = await JobsModel.findOne({ _id: paymentData.job }).lean();
  }

  let amount_paid = 0;
  let tip_amount = 0;

  if (jobData.mall) {
    mallData = await MallsModel.findOne({ _id: jobData.mall });
    amount_paid = payload.amount;
    if (payload.payment_mode != "cash") {
      // Updated tip calculation logic based on wash_type
      let baseAmount;
      if (jobData.wash_type === "total") {
        // Internal + External Wash
        baseAmount = 31.5;
      } else if (jobData.wash_type === "outside") {
        // External Wash only
        baseAmount = 21.5;
      } else {
        // Fallback to existing logic for other types (inside, or undefined)
        baseAmount = mallData.amount + mallData.card_charges;
      }

      if (payload.amount < baseAmount) {
        throw "The amount entered is less than the required amount";
      }
      tip_amount =
        payload.amount > baseAmount ? payload.amount - baseAmount : 0;
    }
  }

  if (jobData.building) {
    buildingData = await BuildingsModel.findOne({ _id: jobData.building });
    amount_paid = payload.amount;
    if (payload.payment_mode != "cash") {
      // Updated tip calculation logic based on wash_type
      let baseAmount;
      if (jobData.wash_type === "total") {
        // Internal + External Wash
        baseAmount = 31.5;
      } else if (jobData.wash_type === "outside") {
        // External Wash only
        baseAmount = 21.5;
      } else {
        // Fallback to existing logic for other types (inside, or undefined)
        baseAmount = buildingData.amount + buildingData.card_charges;
      }

      if (payload.amount < baseAmount) {
        throw "The amount entered is less than the required amount";
      }
      tip_amount =
        payload.amount > baseAmount ? payload.amount - baseAmount : 0;
    }
  }

  if (jobData.service_type == "mobile") {
    amount_paid = payload.amount;
    if (payload.payment_mode != "cash") {
      let finalAmount = payload.amount;
      if (payload.amount < finalAmount) {
        throw "The amount entered is less than the required amount";
      }
      tip_amount =
        payload.amount > finalAmount ? payload.amount - finalAmount : 0;
    }
  }

  await PaymentsModel.updateOne(
    { _id: id },
    {
      $set: {
        amount_paid,
        tip_amount,
        status: "completed",
        payment_mode: payload.payment_mode,
      },
    },
  );

  await OneWashModel.updateOne(
    { _id: jobData._id },
    {
      $set: {
        tip_amount,
        amount: amount_paid,
        payment_mode: payload.payment_mode,
        status: "completed",
      },
    },
  );
};

service.collectPayment = async (userInfo, id, payload) => {
  const paymentData = await PaymentsModel.findOne({ _id: id }).lean();

  if (paymentData.onewash) {
    return this.collectOnewashPayment(userInfo, id, payload, paymentData);
  }

  let status =
    Number(payload.amount) <
    paymentData.amount_charged - paymentData.amount_paid
      ? "pending"
      : "completed";
  let balance =
    paymentData.amount_charged +
    paymentData.old_balance -
    (paymentData.amount_paid + payload.amount);

  await PaymentsModel.updateOne(
    { _id: id },
    {
      $inc: { amount_paid: Number(paymentData.amount_paid + payload.amount) },
      $set: {
        payment_mode: payload.payment_mode,
        balance,
        status,
        collectedDate: new Date(),
      },
    },
  );

  await new TransactionsModel({
    payment: id,
    amount: Number(payload.amount),
    createdBy: userInfo._id,
    updatedBy: userInfo._id,
  }).save();
};

service.settlePayment = async (userInfo, payload) => {
  await new PaymentSettlementsModel({
    payments: payload.paymentIds,
    supervisor: payload.supervisor,
    createdBy: userInfo._id,
  }).save();
  await PaymentsModel.updateMany(
    { _id: { $in: payload.paymentIds } },
    {
      $set: {
        settled: "completed",
        settledDate: new Date(),
      },
    },
  );
};
