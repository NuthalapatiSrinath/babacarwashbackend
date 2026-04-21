const moment = require("moment");
const exceljs = require("exceljs");
const mongoose = require("mongoose");

const PaymentsModel = require("../../models/payments.model");
const PaymentSettlementsModel = require("../../models/payment-settlements.model");
const TransactionsModel = require("../../models/transactions.model");
const WorkersModel = require("../../models/workers.model");
const CounterService = require("../../../utils/counters");
const CommonHelper = require("../../../helpers/common.helper");
const InAppNotifications = require("../../../notifications/in-app.notifications");

const service = module.exports;

const toMoney = (value) => {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return 0;
  return Math.round(number * 100) / 100;
};

const moneyEquals = (left, right) => {
  return Math.abs(toMoney(left) - toMoney(right)) < 0.005;
};

const getVehicleMatchQuery = (payment) => {
  if (!payment || !payment.vehicle) return null;

  // Preferred matching for subscription invoices.
  if (
    payment.vehicle &&
    typeof payment.vehicle === "object" &&
    Object.prototype.hasOwnProperty.call(payment.vehicle, "_id") &&
    payment.vehicle._id !== null &&
    payment.vehicle._id !== undefined &&
    payment.vehicle._id !== ""
  ) {
    return { "vehicle._id": payment.vehicle._id };
  }

  if (
    typeof payment.vehicle === "string" ||
    typeof payment.vehicle === "number"
  ) {
    return { "vehicle._id": payment.vehicle };
  }

  if (payment.vehicle?.registration_no) {
    return {
      "vehicle.registration_no": payment.vehicle.registration_no,
      ...(payment.vehicle?.parking_no
        ? { "vehicle.parking_no": payment.vehicle.parking_no }
        : null),
    };
  }

  return null;
};

const getAmountCharged = (payment) => {
  if (payment.amount_charged !== undefined && payment.amount_charged !== null) {
    return toMoney(payment.amount_charged);
  }
  return Math.max(
    0,
    toMoney(payment.total_amount) - toMoney(payment.old_balance),
  );
};

const syncFutureCarryForwardBalances = async ({
  paymentId,
  userId,
  context,
}) => {
  try {
    const sourcePayment = await PaymentsModel.findOne({
      _id: paymentId,
      isDeleted: { $ne: true },
    })
      .select("_id customer vehicle onewash balance")
      .lean();

    if (!sourcePayment || sourcePayment.onewash || !sourcePayment.customer) {
      return { updatedCount: 0, skipped: true };
    }

    const vehicleQuery = getVehicleMatchQuery(sourcePayment);
    if (!vehicleQuery) {
      return { updatedCount: 0, skipped: true };
    }

    const relatedBills = await PaymentsModel.find({
      customer: sourcePayment.customer,
      onewash: false,
      isDeleted: { $ne: true },
      ...vehicleQuery,
    })
      .sort({ createdAt: 1, _id: 1 })
      .select({
        _id: 1,
        amount_charged: 1,
        amount_paid: 1,
        old_balance: 1,
        total_amount: 1,
        balance: 1,
        status: 1,
      })
      .lean();

    if (relatedBills.length < 2) {
      return { updatedCount: 0, skipped: true };
    }

    const sourceIndex = relatedBills.findIndex(
      (bill) => String(bill._id) === String(sourcePayment._id),
    );

    if (sourceIndex === -1 || sourceIndex === relatedBills.length - 1) {
      return { updatedCount: 0, skipped: true };
    }

    let previousBalance = Math.max(
      0,
      toMoney(relatedBills[sourceIndex].balance),
    );
    const now = new Date();
    const bulkOps = [];

    for (let index = sourceIndex + 1; index < relatedBills.length; index++) {
      const bill = relatedBills[index];

      const nextOldBalance = Math.max(0, toMoney(previousBalance));
      const amountCharged = getAmountCharged(bill);
      const nextTotalAmount = toMoney(amountCharged + nextOldBalance);
      const paidAmount = toMoney(bill.amount_paid);
      const nextBalance = Math.max(0, toMoney(nextTotalAmount - paidAmount));
      const nextStatus =
        paidAmount >= nextTotalAmount ? "completed" : "pending";

      const shouldUpdate =
        !moneyEquals(bill.old_balance, nextOldBalance) ||
        !moneyEquals(bill.total_amount, nextTotalAmount) ||
        !moneyEquals(bill.balance, nextBalance) ||
        (bill.status || "pending") !== nextStatus;

      if (shouldUpdate) {
        const updateSet = {
          old_balance: nextOldBalance,
          total_amount: nextTotalAmount,
          balance: nextBalance,
          status: nextStatus,
          updatedAt: now,
        };

        if (userId) {
          updateSet.updatedBy = userId;
        }

        bulkOps.push({
          updateOne: {
            filter: { _id: bill._id },
            update: { $set: updateSet },
          },
        });
      }

      previousBalance = nextBalance;
    }

    if (bulkOps.length > 0) {
      await PaymentsModel.bulkWrite(bulkOps);
      console.log(
        `✅ [CARRY-FORWARD SYNC] ${context || "unknown"}: updated ${bulkOps.length} future bill(s) from payment ${paymentId}`,
      );
    }

    return { updatedCount: bulkOps.length, skipped: false };
  } catch (error) {
    console.error(
      `❌ [CARRY-FORWARD SYNC] ${context || "unknown"}: failed for payment ${paymentId}`,
      error.message,
    );
    return { updatedCount: 0, skipped: true, error: error.message };
  }
};

service.list = async (userInfo, query) => {
  try {
    console.log("🔵 [SERVICE] Payments list started with query:", query);
    const paginationData = CommonHelper.paginationData(query);

    // Validate and parse dates
    let dateFilter = null;
    if (query.startDate && query.startDate.trim() !== "") {
      const startDate = new Date(query.startDate);

      // Check if startDate is valid
      if (!isNaN(startDate.getTime())) {
        dateFilter = {
          createdAt: {
            $gte: startDate,
          },
        };

        // Add endDate if provided and valid
        if (query.endDate && query.endDate.trim() !== "") {
          const endDate = new Date(query.endDate);
          if (!isNaN(endDate.getTime())) {
            dateFilter.createdAt.$lte = endDate;
          }
        }

        console.log("📅 [SERVICE] Date filter applied:");
        console.log(
          "  Start:",
          startDate.toISOString(),
          "→",
          startDate.toString(),
        );
        console.log(
          "  End:",
          dateFilter.createdAt.$lte
            ? new Date(query.endDate).toISOString()
            : "N/A",
        );

        // Log for debugging
        console.log("🔍 [DEBUG] Comparing with sample October date:");
        console.log(
          "  Oct 1 2025 00:00 IST would be stored as:",
          new Date("2025-10-01T00:00:00+05:30").toISOString(),
        );
        console.log(
          "  Oct 1 2025 00:00 UTC would be stored as:",
          new Date("2025-10-01T00:00:00Z").toISOString(),
        );
      } else {
        console.warn(
          "⚠️ [SERVICE] Invalid startDate format, skipping date filter",
        );
      }
    }

    // --- Supervisor team filtering ---
    const isValidId = (id) =>
      id && typeof id === "string" && id.match(/^[0-9a-fA-F]{24}$/);
    let supervisorWorkerFilter = null;

    if (userInfo.role === "supervisor" && userInfo.service_type) {
      const findWorkerQuery = { isDeleted: false };
      if (userInfo.service_type === "mall" && isValidId(userInfo.mall)) {
        findWorkerQuery.malls = { $in: [userInfo.mall] };
      } else if (
        userInfo.service_type === "residence" &&
        Array.isArray(userInfo.buildings)
      ) {
        const validBuildings = userInfo.buildings.filter(isValidId);
        if (validBuildings.length > 0) {
          findWorkerQuery.buildings = { $in: validBuildings };
        }
      }
      const teamWorkers = await WorkersModel.find(findWorkerQuery)
        .select("_id")
        .lean();
      supervisorWorkerFilter = teamWorkers.map((w) => w._id);
    }

    const findQuery = {
      isDeleted: false,
      ...dateFilter,
      onewash: query.onewash == "true",
      ...(query.status ? { status: query.status } : null),
      // Worker filter: specific worker > supervisor team > no constraint
      ...(query.worker && query.worker.trim() !== ""
        ? { worker: query.worker }
        : supervisorWorkerFilter
          ? { worker: { $in: supervisorWorkerFilter } }
          : null),
      ...(query.customer && query.customer.trim() !== ""
        ? { customer: query.customer }
        : null),
      ...(query.createdBy && query.createdBy.trim() !== ""
        ? { createdBy: query.createdBy }
        : null),
      ...(query.building && query.building.trim() !== ""
        ? { building: query.building }
        : null),
      ...(query.mall && query.mall.trim() !== "" ? { mall: query.mall } : null),
      ...(query.payment_mode && query.payment_mode.trim() !== ""
        ? {
            payment_mode: {
              $regex: new RegExp(
                "^" +
                  query.payment_mode.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") +
                  "$",
                "i",
              ),
            },
          }
        : null),
      ...(query.search
        ? {
            $or: [
              {
                "vehicle.registration_no": {
                  $regex: query.search,
                  $options: "i",
                },
              },
              { "vehicle.parking_no": { $regex: query.search, $options: "i" } },
            ],
          }
        : null),
    };
    console.log("🔍 [SERVICE] Find query:", JSON.stringify(findQuery, null, 2));

    const total = await PaymentsModel.countDocuments(findQuery);
    console.log("📊 [SERVICE] Total count:", total);

    // Fetch data without populate first
    let data = await PaymentsModel.find(findQuery)
      .sort({ _id: -1 })
      .skip(paginationData.skip)
      .limit(paginationData.limit)
      .lean();

    console.log(
      "📦 [SERVICE] Data fetched (unpopulated):",
      data.length,
      "records",
    );

    // CRITICAL FIX: Convert empty strings to null before populating
    // Mongoose populate fails on empty strings "" - they must be null or valid ObjectIds
    data = data.map((payment) => {
      if (payment.worker === "") payment.worker = null;
      if (payment.building === "") payment.building = null;
      if (payment.customer && payment.customer.building === "")
        payment.customer.building = null;
      if (payment.customer && payment.customer.location === "")
        payment.customer.location = null;
      return payment;
    });

    // Try to populate each reference separately and catch errors
    try {
      // Populate worker (filter out null values)
      data = await PaymentsModel.populate(data, {
        path: "worker",
        model: "workers",
      });
      console.log("✅ [SERVICE] Workers populated");
    } catch (e) {
      console.warn("⚠️ [SERVICE] Worker populate failed:", e.message);
    }

    try {
      // Populate building (direct field on payment)
      data = await PaymentsModel.populate(data, {
        path: "building",
        model: "buildings",
      });
      console.log("✅ [SERVICE] Buildings populated");
    } catch (e) {
      console.warn("⚠️ [SERVICE] Building populate failed:", e.message);
    }

    try {
      // Populate mall (usually reliable)
      data = await PaymentsModel.populate(data, {
        path: "mall",
        model: "malls",
      });
      console.log("✅ [SERVICE] Malls populated");
    } catch (e) {
      console.warn("⚠️ [SERVICE] Mall populate failed:", e.message);
    }

    try {
      // Populate job (usually reliable)
      data = await PaymentsModel.populate(data, { path: "job", model: "jobs" });
      console.log("✅ [SERVICE] Jobs populated");
    } catch (e) {
      console.warn("⚠️ [SERVICE] Job populate failed:", e.message);
    }

    try {
      // Populate customer (may have issues with nested location/building)
      data = await PaymentsModel.populate(data, {
        path: "customer",
        model: "customers",
      });
      console.log("✅ [SERVICE] Customers populated");

      // Try nested populates
      try {
        data = await PaymentsModel.populate(data, {
          path: "customer.building",
          model: "buildings",
        });
        console.log("✅ [SERVICE] Buildings populated");
      } catch (e) {
        console.warn("⚠️ [SERVICE] Building populate failed:", e.message);
      }

      try {
        data = await PaymentsModel.populate(data, {
          path: "customer.location",
          model: "locations",
        });
        console.log("✅ [SERVICE] Locations populated");
      } catch (e) {
        console.warn(
          "⚠️ [SERVICE] Location populate failed (expected for empty strings):",
          e.message,
        );
      }
    } catch (e) {
      console.warn("⚠️ [SERVICE] Customer populate failed:", e.message);
    }

    console.log("📦 [SERVICE] Final data count:", data.length, "records");

    // Log sample populated data for debugging
    if (data.length > 0) {
      console.log("🔍 [SERVICE] Sample payment document structure:");
      console.log("- building:", data[0].building);
      console.log("- worker:", data[0].worker);
      console.log("- customer.building:", data[0].customer?.building);
    }

    const totalPayments = await PaymentsModel.aggregate([
      { $match: findQuery },
      { $group: { _id: "$payment_mode", amount: { $sum: "$amount_paid" } } },
    ]);
    const totalAmount = totalPayments.length
      ? totalPayments.reduce((p, c) => p + c.amount, 0)
      : 0;
    const cash = totalPayments.length
      ? totalPayments.filter((e) => e._id == "cash")
      : 0;
    const card = totalPayments.length
      ? totalPayments.filter((e) => e._id == "card")
      : 0;
    const bank = totalPayments.length
      ? totalPayments.filter((e) => e._id == "bank transfer")
      : 0;
    const counts = {
      totalJobs: total,
      totalAmount,
      cash: cash.length ? cash[0].amount : 0,
      card: card.length ? card[0].amount : 0,
      bank: bank.length ? bank[0].amount : 0,
    };

    // Add computed fields to each payment record
    const PricingModel = require("../../models/pricing.model");
    const OneWashModel = require("../../models/onewash.model");

    data = await Promise.all(
      data.map(async (payment) => {
        const isMonthEndClosed = (payment.notes || "")
          .toLowerCase()
          .includes("closed by month-end");

        // Compute display_service_type for onewash payments
        let display_service_type = payment.service_type;

        if (payment.onewash) {
          // Look up the OneWash job to get wash_type
          let job = null;

          if (payment.job) {
            job = await OneWashModel.findOne({
              _id: payment.job,
              isDeleted: false,
            })
              .select("wash_type service_type mall building")
              .lean();
          }

          // Fallback: find by worker + vehicle + date
          if (!job && payment.vehicle?.registration_no && payment.worker) {
            const paymentDate = new Date(payment.createdAt);
            const startDate = new Date(paymentDate);
            startDate.setHours(0, 0, 0, 0);
            const endDate = new Date(paymentDate);
            endDate.setHours(23, 59, 59, 999);

            job = await OneWashModel.findOne({
              worker:
                typeof payment.worker === "object"
                  ? payment.worker._id
                  : payment.worker,
              registration_no: payment.vehicle.registration_no,
              createdAt: { $gte: startDate, $lte: endDate },
              isDeleted: false,
            })
              .select("wash_type service_type mall building")
              .lean();
          }

          if (job) {
            if (job.service_type === "residence" || job.building) {
              display_service_type = "Residence";
            } else if (job.mall || payment.mall) {
              const mallId =
                job.mall ||
                (typeof payment.mall === "object"
                  ? payment.mall._id
                  : payment.mall);

              const pricing = await PricingModel.findOne({
                mall: mallId,
                isDeleted: false,
              }).lean();

              // Unified pricing - check flat structure first, then legacy sedan/4x4
              const hasWashTypes1 =
                (pricing && pricing.wash_types) ||
                (pricing && pricing.sedan && pricing.sedan.wash_types);
              if (hasWashTypes1) {
                // Mall has wash types configured - show actual wash type
                if (job.wash_type === "outside") {
                  display_service_type = "Outside";
                } else if (job.wash_type === "total") {
                  display_service_type = "Inside + Outside";
                } else if (job.wash_type === "inside") {
                  display_service_type = "Inside";
                } else {
                  display_service_type = "Mall";
                }
              } else {
                // Mall not configured - show "Mall"
                display_service_type = "Mall";
              }
            } else {
              display_service_type = "Mall";
            }
          } else {
            // Fallback if no job found
            display_service_type = payment.building ? "Residence" : "Mall";
          }
        }

        return {
          ...payment,
          display_service_type,
          isMonthEndClosed, // Flag for month-end closed bills
          paidAmount: payment.amount_paid || 0, // Already exists, but ensure it's present
          balanceAmount: payment.balance || 0, // Already exists, but ensure it's present
        };
      }),
    );

    console.log("✅ [SERVICE] Returning data with counts:", counts);
    return { total, data, counts };
  } catch (error) {
    console.error("❌ [SERVICE] Error in payments list:", error);
    throw error;
  }
};

service.info = async (userInfo, id) => {
  return PaymentsModel.findOne({ _id: id, isDeleted: false }).lean();
};

service.create = async (userInfo, payload) => {
  const id = await CounterService.id("payments");

  // Don't generate receipt_no on creation - only when payment is collected/completed
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

service.updatePayment = async (userInfo, id, payload) => {
  const updatePayload = {
    $set: {
      total_amount: payload.total_amount,
      notes: payload.notes,
    },
  };
  await PaymentsModel.updateOne({ _id: id }, updatePayload);
};

/**
 * Edit the total amount of a payment with reason tracking.
 * Recalculates balance and status, then syncs carry-forward to all future bills.
 */
service.editPaymentAmount = async (userInfo, id, payload) => {
  const { new_total_amount, reason } = payload;

  if (!reason || !reason.trim()) {
    throw "Reason is required when editing payment amount";
  }
  if (
    new_total_amount === undefined ||
    new_total_amount === null ||
    isNaN(new_total_amount)
  ) {
    throw "New total amount is required";
  }
  if (Number(new_total_amount) < 0) {
    throw "Total amount cannot be negative";
  }

  const payment = await PaymentsModel.findOne({
    _id: id,
    isDeleted: false,
  }).lean();
  if (!payment) {
    throw "Payment not found";
  }

  const newTotal = Number(new_total_amount);
  const oldTotal = payment.total_amount || 0;
  const oldBalance = payment.balance || 0;
  const amountPaid = payment.amount_paid || 0;

  // Calculate new balance
  const newBalance = Math.max(0, newTotal - amountPaid);
  const newStatus = amountPaid >= newTotal ? "completed" : "pending";

  // Build edit history entry
  const editEntry = {
    old_total_amount: oldTotal,
    new_total_amount: newTotal,
    old_balance: oldBalance,
    new_balance: newBalance,
    reason: reason.trim(),
    editedBy: userInfo._id,
    editedByName: userInfo.name || userInfo.email || userInfo._id,
    editedAt: new Date(),
  };

  // Update the payment
  const updateData = {
    total_amount: newTotal,
    balance: newBalance,
    status: newStatus,
    updatedBy: userInfo._id,
    updatedAt: new Date(),
  };

  // Generate receipt if now completed
  if (newStatus === "completed" && !payment.receipt_no) {
    updateData.receipt_no = `RCP${String(payment.id).padStart(6, "0")}`;
  }

  await PaymentsModel.updateOne(
    { _id: id },
    {
      $set: updateData,
      $push: { amount_edit_history: editEntry },
    },
  );

  await syncFutureCarryForwardBalances({
    paymentId: id,
    userId: userInfo._id,
    context: "editPaymentAmount",
  });

  console.log(
    `✅ [EDIT AMOUNT] Payment ${id}: total ${oldTotal} → ${newTotal}, balance ${oldBalance} → ${newBalance}, reason: ${reason}`,
  );

  return {
    old_total: oldTotal,
    new_total: newTotal,
    new_balance: newBalance,
    new_status: newStatus,
  };
};

service.collectPayment = async (userInfo, id, payload) => {
  const paymentData = await PaymentsModel.findOne({ _id: id }).lean();

  // Calculate new amounts
  const newAmountPaid = Number(paymentData.amount_paid + payload.amount);
  const balance = paymentData.total_amount - newAmountPaid;

  // ✅ FIX: Status should check against total_amount (includes old_balance), not just amount_charged
  const status =
    newAmountPaid < paymentData.total_amount ? "pending" : "completed";

  // Generate receipt number only when payment becomes completed
  const updateData = {
    amount_paid: newAmountPaid,
    payment_mode: payload.payment_mode,
    balance,
    status,
    collectedDate: payload.payment_date,
  };

  // If payment is fully completed and doesn't have receipt_no yet, generate it
  if (status === "completed" && !paymentData.receipt_no) {
    updateData.receipt_no = `RCP${String(paymentData.id).padStart(6, "0")}`;
  }

  await PaymentsModel.updateOne({ _id: id }, { $set: updateData });

  await syncFutureCarryForwardBalances({
    paymentId: id,
    userId: userInfo._id,
    context: "collectPayment",
  });

  await new TransactionsModel({
    payment: id,
    amount: Number(payload.amount),
    payment_date: payload.payment_date,
    createdBy: userInfo._id,
    updatedBy: userInfo._id,
  }).save();

  // Send notification about payment collection
  try {
    await InAppNotifications.send({
      worker: userInfo._id,
      message: `Payment collected: ₹${payload.amount} | Status: ${status}`,
      createdBy: userInfo._id,
    });
  } catch (error) {
    console.error("Failed to send notification:", error);
  }
};

service.settlements = async (userInfo, query) => {
  try {
    console.log("=== SETTLEMENTS SERVICE START ===");
    console.log("UserInfo:", JSON.stringify(userInfo, null, 2));
    console.log("Query:", JSON.stringify(query, null, 2));

    const paginationData = CommonHelper.paginationData(query);
    console.log("Pagination data:", paginationData);

    const findQuery = {
      isDeleted: false,
      ...(userInfo.role == "supervisor" ? { supervisor: userInfo._id } : {}),
    };
    console.log("Find query:", JSON.stringify(findQuery, null, 2));

    const total = await PaymentSettlementsModel.countDocuments(findQuery);
    console.log("Total settlements found:", total);

    // First, get raw data without any population
    const rawData = await PaymentSettlementsModel.find(findQuery)
      .sort({ _id: -1 })
      .skip(paginationData.skip)
      .limit(paginationData.limit)
      .lean();

    console.log("Raw data fetched:", rawData.length, "records");
    if (rawData.length > 0) {
      console.log("Sample raw record:", JSON.stringify(rawData[0], null, 2));
    }

    const data = [];

    // Manually process each settlement
    for (let i = 0; i < rawData.length; i++) {
      const iterator = rawData[i];
      console.log(
        `Processing settlement ${i + 1}/${rawData.length}`,
        iterator._id,
      );

      // Handle supervisor - check if it's an ObjectId or a string name
      if (iterator.supervisor) {
        if (
          mongoose.Types.ObjectId.isValid(iterator.supervisor) &&
          iterator.supervisor.length === 24
        ) {
          // It's a valid ObjectId, try to populate
          try {
            const supervisor = await mongoose
              .model("users")
              .findById(iterator.supervisor)
              .lean();
            iterator.supervisor = supervisor || { name: "Unknown" };
            console.log(
              "Supervisor populated from ObjectId:",
              iterator.supervisor.name,
            );
          } catch (err) {
            console.error("Error populating supervisor:", err.message);
            iterator.supervisor = { name: "Unknown" };
          }
        } else {
          // It's a string name, use it directly
          console.log("Supervisor is a name string:", iterator.supervisor);
          iterator.supervisor = { name: iterator.supervisor };
        }
      } else {
        iterator.supervisor = { name: "Unknown" };
      }

      // Handle payments array
      if (!Array.isArray(iterator.payments)) {
        console.log("Payments is not an array, converting...");
        iterator.payments = [];
      }

      console.log("Payments array length:", iterator.payments.length);

      // Populate payments if they are ObjectIds
      const populatedPayments = [];
      for (let j = 0; j < iterator.payments.length; j++) {
        const paymentId = iterator.payments[j];
        try {
          if (
            mongoose.Types.ObjectId.isValid(paymentId) &&
            typeof paymentId === "string" &&
            paymentId.length === 24
          ) {
            const payment = await mongoose
              .model("payments")
              .findById(paymentId)
              .lean();
            if (payment) {
              populatedPayments.push(payment);
            }
          } else {
            console.log("Invalid or non-ObjectId payment:", paymentId);
          }
        } catch (err) {
          console.error("Error populating payment:", err.message);
        }
      }
      iterator.payments = populatedPayments;
      console.log("Populated payments count:", iterator.payments.length);

      // Calculate amounts
      iterator.amount = iterator.payments.reduce(
        (p, c) => p + (c?.amount_paid || 0),
        0,
      );
      iterator.cash = iterator.payments
        .filter((e) => e?.payment_mode == "cash")
        .reduce((p, c) => p + (c?.amount_paid || 0), 0);
      iterator.card = iterator.payments
        .filter((e) => e?.payment_mode == "card")
        .reduce((p, c) => p + (c?.amount_paid || 0), 0);
      iterator.bank = iterator.payments
        .filter((e) => e?.payment_mode == "bank transfer")
        .reduce((p, c) => p + (c?.amount_paid || 0), 0);

      console.log(
        "Calculated amounts - Total:",
        iterator.amount,
        "Cash:",
        iterator.cash,
        "Card:",
        iterator.card,
        "Bank:",
        iterator.bank,
      );

      data.push(iterator);
    }

    console.log(
      "Processed data successfully, returning",
      data.length,
      "records",
    );
    console.log("=== SETTLEMENTS SERVICE END ===");
    return { total, data };
  } catch (error) {
    console.error("!!! SERVICE SETTLEMENTS ERROR !!!");
    console.error("Error message:", error.message);
    console.error("Error stack:", error.stack);
    throw error;
  }
};

service.updateSettlements = async (id, userInfo, payload) => {
  return PaymentSettlementsModel.updateOne(
    { _id: id },
    { $set: { status: "completed", updatedBy: userInfo._id } },
  );
};

service.settlePayment = async (userInfo, id, payload) => {
  await PaymentsModel.updateMany(
    { _id: { $in: payload.paymentIds } },
    {
      $set: {
        settled: "completed",
        settledDate: new Date(),
        payment_settled_date: new Date(),
      },
    },
  );
};

// ✅ UPDATED EXPORT DATA (Excel Fix)
service.exportData = async (userInfo, query) => {
  const findQuery = {
    isDeleted: false,
    // Fix: check strictly for 'true' string
    onewash: query.onewash === "true",

    // EXCLUDE empty strings at DB level if possible, but safer to do in JS for existing bad data
    building: { $ne: "" },
    worker: { $ne: "" },

    ...(query.status ? { status: query.status } : null),
  };

  // Date Filter
  if (query.startDate && query.startDate !== "null") {
    const start = new Date(query.startDate);
    if (!isNaN(start.getTime())) {
      let end = query.endDate
        ? new Date(query.endDate)
        : new Date(query.startDate);
      if (!query.endDate || query.endDate.length <= 10) {
        end.setHours(23, 59, 59, 999);
      }
      if (!isNaN(end.getTime())) {
        findQuery.createdAt = { $gte: start, $lte: end };
      }
    }
  }

  // Worker/Building Filters
  if (isValidId(query.worker)) findQuery.worker = query.worker;
  if (isValidId(query.building)) findQuery.building = query.building;

  // Search Logic
  if (query.search) {
    findQuery.$or = [
      { "vehicle.registration_no": { $regex: query.search, $options: "i" } },
      { "vehicle.parking_no": { $regex: query.search, $options: "i" } },
    ];
  }

  // 1. Fetch RAW data (No Populate yet to avoid crash)
  let data = await PaymentsModel.find(findQuery).sort({ _id: -1 }).lean();

  // 2. Filter out bad data (Double safety)
  data = data.filter((item) => {
    // Allow items where building/worker is null/undefined (unassigned),
    // BUT exclude items where they are empty strings ""
    const validBuilding =
      item.building === null ||
      item.building === undefined ||
      isValidId(item.building);
    const validWorker =
      item.worker === null ||
      item.worker === undefined ||
      isValidId(item.worker);
    return validBuilding && validWorker;
  });

  // 3. Safe Populate
  try {
    data = await PaymentsModel.populate(data, [
      {
        path: "customer",
        model: "customers",
        select: "mobile firstName lastName",
      },
      { path: "job", model: "jobs" },
      { path: "worker", model: "workers", select: "name" },
      { path: "mall", model: "malls", select: "name" },
      { path: "building", model: "buildings", select: "name" },
    ]);
  } catch (e) {
    console.error("Export Populate Warning:", e.message);
  }

  // 3.5. Compute display_service_type for onewash payments
  const PricingModel = require("../../models/pricing.model");
  const OneWashModel = require("../../models/onewash.model");

  console.log(`\n🔍 [EXPORT] Processing ${data.length} total payments`);
  console.log(
    `🔍 [EXPORT] OneWash payments: ${data.filter((p) => p.onewash).length}`,
  );

  data = await Promise.all(
    data.map(async (payment, index) => {
      let display_service_type = "-";
      let wash_type = null;

      if (payment.onewash) {
        console.log(`\n📋 [EXPORT] Payment ${index + 1}:`, {
          paymentId: payment._id,
          jobId: payment.job,
          hasJob: !!payment.job,
          mall: payment.mall?._id || payment.mall,
          building: payment.building?._id || payment.building,
          vehicle: payment.vehicle?.registration_no,
          worker: payment.worker?._id,
        });

        // For OneWash payments, look up the job to get wash_type
        let job = null;

        if (payment.job) {
          job = await OneWashModel.findOne({
            _id: payment.job,
            isDeleted: false,
          })
            .select("wash_type service_type mall building")
            .lean();
        }

        // If job not found by ID, try to find by worker + vehicle + date range
        if (!job && payment.vehicle?.registration_no && payment.worker) {
          const paymentDate = new Date(payment.createdAt);
          const startDate = new Date(paymentDate);
          startDate.setHours(0, 0, 0, 0);
          const endDate = new Date(paymentDate);
          endDate.setHours(23, 59, 59, 999);

          job = await OneWashModel.findOne({
            worker:
              typeof payment.worker === "object"
                ? payment.worker._id
                : payment.worker,
            registration_no: payment.vehicle.registration_no,
            createdAt: { $gte: startDate, $lte: endDate },
            isDeleted: false,
          })
            .select("wash_type service_type mall building")
            .lean();

          if (job) {
            console.log(`   ✅ Job found by fallback lookup`);
          }
        }

        console.log(
          `   Job found:`,
          job
            ? {
                wash_type: job.wash_type,
                service_type: job.service_type,
                mall: job.mall,
                building: job.building,
              }
            : "NOT FOUND",
        );

        if (job) {
          wash_type = job.wash_type;

          if (job.service_type === "residence" || job.building) {
            display_service_type = "Residence";
          } else if (job.mall) {
            const mallId =
              typeof job.mall === "object" ? job.mall._id : job.mall;
            const pricing = await PricingModel.findOne({
              mall: mallId,
              isDeleted: false,
            }).lean();

            console.log(
              `   Pricing found:`,
              pricing
                ? {
                    hasWashTypes: !!(
                      pricing.wash_types ||
                      (pricing.sedan && pricing.sedan.wash_types)
                    ),
                  }
                : "NOT FOUND",
            );

            // Unified pricing - check flat structure first, then legacy sedan/4x4
            const hasWashTypes2 =
              (pricing && pricing.wash_types) ||
              (pricing && pricing.sedan && pricing.sedan.wash_types);
            if (hasWashTypes2) {
              // Mall has wash types configured - show actual wash type
              if (wash_type === "outside") {
                display_service_type = "Outside";
              } else if (wash_type === "total") {
                display_service_type = "Inside + Outside";
              } else if (wash_type === "inside") {
                display_service_type = "Inside";
              } else {
                display_service_type = "Mall";
              }
            } else {
              // Mall not configured - show "Mall"
              display_service_type = "Mall";
            }

            console.log(`   ✅ Result: ${display_service_type}`);
          } else {
            display_service_type = "Mall";
          }
        } else {
          // Job not found - fallback
          display_service_type = payment.building ? "Residence" : "Mall";
          console.log(
            `   ⚠️ Job not found, using fallback: ${display_service_type}`,
          );
        }
      } else {
        // Regular residence payments - use vehicle wash_type
        display_service_type =
          payment.vehicle?.wash_type === "outside"
            ? "Outside"
            : payment.vehicle?.wash_type === "total"
              ? "Inside + Outside"
              : payment.vehicle?.wash_type === "inside"
                ? "Inside"
                : "-";
      }

      return {
        ...payment,
        display_service_type,
        wash_type, // Include wash_type for debugging
      };
    }),
  );

  console.log(`\n✅ [EXPORT] Processing complete\n`);

  // 4. Generate Excel
  const workbook = new exceljs.Workbook();
  const worksheet = workbook.addWorksheet("Payments Report");

  worksheet.columns = [
    { header: "Date", key: "createdAt", width: 15 },
    { header: "Time", key: "time", width: 15 },
    { header: "Vehicle No", key: "vehicle", width: 20 },
    { header: "Parking No", key: "parking_no", width: 15 },
    { header: "Service Type", key: "service_type", width: 20 },
    { header: "Worker", key: "worker", width: 25 },
    { header: "Location", key: "location", width: 30 },
    { header: "Amount Paid", key: "amount_paid", width: 15 },
    { header: "Tip Amount", key: "tip_amount", width: 12 },
    { header: "Payment Mode", key: "payment_mode", width: 15 },
    { header: "Status", key: "status", width: 15 },
    { header: "Settle Status", key: "settled", width: 15 },
  ];

  worksheet.getRow(1).font = { bold: true };

  data.forEach((item) => {
    const dateObj = new Date(item.createdAt);
    let locationName = item.mall?.name || item.building?.name || "-";

    worksheet.addRow({
      createdAt: moment(dateObj).format("YYYY-MM-DD"),
      time: moment(dateObj).format("hh:mm A"),
      vehicle: item.vehicle?.registration_no || "-",
      parking_no: item.vehicle?.parking_no || "-",
      service_type: item.display_service_type || "-",
      worker: item.worker?.name || "Unassigned",
      location: locationName,
      amount_paid: item.amount_paid || 0,
      tip_amount: item.tip_amount || 0,
      payment_mode: item.payment_mode || "-",
      status: item.status || "pending",
      settled: item.settled || "pending",
    });
  });

  return workbook;
};

// ✅ UPDATED MONTHLY STATEMENT (PDF Fix)
// ✅ UPDATED MONTHLY COLLECTION SHEET (Matches 17-Field Requirement)
service.monthlyStatement = async (userInfo, query) => {
  // 1. Setup Date Range (Postpaid Cycle)
  // If user selects "January", we look for bills generated in January
  const startOfMonth = moment(new Date(query.year, query.month, 1))
    .startOf("month")
    .utc()
    .format();
  const endOfMonth = moment(new Date(query.year, query.month, 1))
    .endOf("month")
    .utc()
    .format();

  const findQuery = {
    isDeleted: false,
    onewash: query.service_type === "onewash",
    building: { $ne: "" },
    worker: { $ne: "" },
    createdAt: { $gte: startOfMonth, $lte: endOfMonth },
  };

  // 2. Apply Filters
  if (isValidId(query.worker)) {
    findQuery.worker = query.worker;
  } else if (isValidId(query.building)) {
    const workers = await WorkersModel.find(
      { isDeleted: false, buildings: query.building },
      { _id: 1 },
    ).lean();
    findQuery.worker = { $in: workers.map((e) => e._id) };
  }

  // 3. Fetch Data
  let data = await PaymentsModel.find(findQuery)
    // .sort({ "vehicle.parking_no": 1 }) // Use this if parking_no is at root, otherwise sort in JS
    .lean();

  // 4. Populate
  try {
    data = await PaymentsModel.populate(data, [
      { path: "job", model: "jobs" },
      { path: "worker", model: "workers", select: "name" },
      { path: "building", model: "buildings", select: "name" },
      {
        path: "customer",
        model: "customers",
        populate: { path: "building", model: "buildings", select: "name" },
      },
    ]);
  } catch (err) {
    console.error("Populate Warning:", err.message);
  }

  // 5. Helper to Format Data into 17 Fields
  const formatRecord = (item, index) => {
    let vehicle = null;
    // Try to find vehicle details in customer array matches
    if (item.customer && item.customer.vehicles) {
      // Assuming item.vehicle stores registration_no or object with it
      const regNo = item.vehicle?.registration_no || item.vehicle;
      vehicle = item.customer.vehicles.find((v) => v.registration_no === regNo);
    }

    // Calculation Logic
    const subscriptionAmount = item.amount_charged || 0; // Current Month Charge
    const prevDue = item.old_balance || 0; // Previous Pending Due
    const totalDue = item.total_amount || 0; // Total Amount Due
    const paid = item.amount_paid || 0; // Paid Amount
    const balance = totalDue - paid; // Balance Amount

    // 17 Fields Mapping
    return {
      slNo: index + 1, // 1. Serial Number
      parkingNo: item.vehicle?.parking_no || "-", // 2. Parking Number
      carNo: item.vehicle?.registration_no || "-", // 3. Car Number
      mobile: item.customer?.mobile || "No Mobile", // 4. Mobile Number
      flatNo: item.customer?.flat_no || "-", // 5. Flat Number
      startDate: vehicle
        ? moment(vehicle.start_date).format("DD-MM-YYYY")
        : "-", // 6. Start Date
      schedule: vehicle
        ? vehicle.schedule_type === "daily"
          ? "Daily"
          : (() => {
              let dayCount = 1;
              let daysList = "";

              if (
                vehicle.schedule_days &&
                Array.isArray(vehicle.schedule_days)
              ) {
                if (
                  vehicle.schedule_days.length === 1 &&
                  typeof vehicle.schedule_days[0] === "string"
                ) {
                  // Handle case where schedule_days is ["Mon,Wed,Fri"] - array with one comma-separated string
                  const days = vehicle.schedule_days[0]
                    .split(",")
                    .filter((day) => day.trim());
                  dayCount = days.length;
                  daysList = days.map((day) => day.trim()).join(",");
                } else {
                  // Handle case where schedule_days is ["Mon", "Wed", "Fri"] - array of individual days
                  dayCount = vehicle.schedule_days.length;
                  daysList = vehicle.schedule_days.join(",");
                }
              } else if (typeof vehicle.schedule_days === "string") {
                // Handle case where schedule_days is "Mon,Wed,Fri" - direct string
                const days = vehicle.schedule_days
                  .split(",")
                  .filter((day) => day.trim());
                dayCount = days.length;
                daysList = days.map((day) => day.trim()).join(",");
              }

              return `Weekly ${dayCount} times`;
            })()
        : "-", // 7. Weekly Schedule
      advance: vehicle?.advance_amount || 0, // 8. Advance Payment Amount (show actual amount instead of Yes/No)
      subAmount: subscriptionAmount, // 9. Subscription Amount
      prevDue: prevDue, // 10. Previous Payment Due
      totalDue: totalDue, // 11. Total Amount Due
      paid: paid, // 12. Paid Amount
      balance: balance, // 13. Balance Amount
      payDate: item.collectedDate
        ? moment(item.collectedDate).format("DD-MM-YYYY")
        : "-", // 14. Payment Date
      receipt:
        item.status === "completed"
          ? item.receipt_no || `RCP${String(item.id).padStart(6, "0")}`
          : "-", // 15. Receipt Number (Only for completed payments)
      dueDate: item.billing_month
        ? moment(item.billing_month, "YYYY-MM")
            .endOf("month")
            .format("DD-MM-YYYY")
        : moment(item.createdAt)
            .subtract(1, "day")
            .endOf("month")
            .format("DD-MM-YYYY"), // 16. Payment Due Date (End of billing month)
      remarks: item.notes || "-", // 17. Payment Remarks
      customerNotes: item.customer?.notes || "-", // 18. Customer Notes

      // Extra metadata for Grouping
      buildingName:
        item.building?.name ||
        item.customer?.building?.name ||
        "Unknown Building",
      workerName: item.worker?.name || "Unassigned",
    };
  };

  // Log sample record for debugging
  if (data.length > 0) {
    const sample = formatRecord(data[0], 0);
    console.log("📄 [COLLECTION SHEET] Sample Record:");
    console.log("   - Advance Amount:", sample.advance);
    console.log("   - Vehicle Data:", data[0].vehicle);
    console.log(
      "   - Vehicle advance_amount:",
      data[0].vehicle?.advance_amount,
    );
    console.log("   - Customer Notes:", sample.customerNotes);
    console.log("   - Customer Object:", data[0].customer);
  }

  // --- A. JSON RESPONSE (For Frontend PDF Generation) ---
  if (query.format === "json") {
    // Group by Building -> Worker
    const result = [];
    const grouped = {};

    data.forEach((item, index) => {
      const formatted = formatRecord(item, index);
      const bKey = formatted.buildingName;
      const wKey = formatted.workerName;

      if (!grouped[bKey]) grouped[bKey] = {};
      if (!grouped[bKey][wKey]) grouped[bKey][wKey] = [];

      grouped[bKey][wKey].push(formatted);
    });

    Object.keys(grouped).forEach((bName) => {
      const workers = [];
      Object.keys(grouped[bName]).forEach((wName) => {
        workers.push({
          workerName: wName,
          payments: grouped[bName][wName],
        });
      });
      result.push({ buildingName: bName, workers: workers });
    });

    return result;
  }

  // --- B. EXCEL RESPONSE (Standard Download) ---
  const workbook = new exceljs.Workbook();
  const sheet = workbook.addWorksheet("Collection Sheet");

  // 1. Define Columns (17 Required Fields)
  sheet.columns = [
    { header: "Serial Number", key: "slNo", width: 12 },
    { header: "Parking Number", key: "parkingNo", width: 15 },
    { header: "Car Number", key: "carNo", width: 15 },
    { header: "Mobile Number", key: "mobile", width: 15 },
    { header: "Flat Number", key: "flatNo", width: 12 },
    { header: "Cust. Start Date", key: "startDate", width: 15 },
    { header: "Weekly Schedule", key: "schedule", width: 15 },
    { header: "Adv. Pay Option", key: "advance", width: 12 },
    { header: "Subscript. Amount", key: "subAmount", width: 15 },
    { header: "Prev. Payment Due", key: "prevDue", width: 15 },
    { header: "Total Amount Due", key: "totalDue", width: 15 },
    { header: "Paid Amount", key: "paid", width: 15 },
    { header: "Balance Amount", key: "balance", width: 13 },
    { header: "Payment Date", key: "payDate", width: 15 },
    { header: "Receipt Number", key: "receipt", width: 15 },
    { header: "Payment Due Date", key: "dueDate", width: 15 },
    { header: "Payment Remarks", key: "remarks", width: 20 },
    { header: "Customer Notes", key: "customerNotes", width: 25 },
  ];

  // Style Header
  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF1F4E78" },
  };
  headerRow.alignment = {
    horizontal: "center",
    vertical: "middle",
    wrapText: true,
  };
  sheet.getRow(1).height = 30;

  // Add Data
  data.forEach((item, index) => {
    sheet.addRow(formatRecord(item, index));
  });

  return workbook;
};

service.bulkUpdateStatus = async (userInfo, payload) => {
  try {
    const { ids, status } = payload;
    console.log("🔵 [SERVICE] Bulk Update Status Started");
    console.log(`👉 IDs count: ${ids?.length}, Target Status: ${status}`);

    if (!ids || ids.length === 0) {
      console.warn("⚠️ [SERVICE] No IDs provided");
      return;
    }

    // 1. Fetch current documents to calculate values correctly
    const payments = await PaymentsModel.find({ _id: { $in: ids } });
    console.log(`📦 [SERVICE] Found ${payments.length} documents to update`);

    const bulkOps = [];

    for (const payment of payments) {
      const update = {
        status: status, // 'completed' or 'pending'
        updatedBy: userInfo._id,
      };

      // 2. ONLY Modify amounts if setting to COMPLETED
      if (status === "completed") {
        const total = Number(payment.total_amount) || 0;
        const paid = Number(payment.amount_paid) || 0;

        // Only auto-fill payment if they haven't paid fully yet
        if (paid < total) {
          console.log(
            `💰 [SERVICE] Auto-settling payment ${payment._id}: Total ${total}, Paid ${paid} -> New Paid: ${total}`,
          );

          update.amount_paid = total;
          update.balance = 0; // Balance becomes 0
          update.collectedDate = new Date(); // Mark collected now

          // Only set payment mode if it's missing (don't overwrite if they set it before)
          if (!payment.payment_mode) {
            update.payment_mode = "cash";
          }
        }
      }
      // 3. If setting back to PENDING, we DO NOT reset money (safety)
      // If you want to reset money on pending, tell me. For now, we leave money as is to prevent data loss.

      // 4. Push to Bulk Operations
      bulkOps.push({
        updateOne: {
          filter: { _id: payment._id },
          update: { $set: update }, // $set ONLY modifies specific fields, keeps Worker/Vehicle intact
        },
      });
    }

    if (bulkOps.length > 0) {
      console.log(`🚀 [SERVICE] Executing ${bulkOps.length} updates...`);
      const result = await PaymentsModel.bulkWrite(bulkOps);
      console.log("✅ [SERVICE] Bulk write result:", JSON.stringify(result));

      // Keep carry-forward chain consistent for subscription bills after bulk changes.
      const subscriptionChainSeeds = new Map();

      for (const payment of payments) {
        if (payment.onewash || !payment.customer || !payment.vehicle) continue;

        const vehicleToken =
          (payment.vehicle && typeof payment.vehicle === "object"
            ? payment.vehicle._id || payment.vehicle.registration_no
            : payment.vehicle) || payment._id;

        const chainKey = `${String(payment.customer)}__${String(vehicleToken)}`;
        const existingSeed = subscriptionChainSeeds.get(chainKey);

        if (!existingSeed) {
          subscriptionChainSeeds.set(chainKey, payment);
          continue;
        }

        const existingTime = new Date(existingSeed.createdAt || 0).getTime();
        const currentTime = new Date(payment.createdAt || 0).getTime();

        if (currentTime < existingTime) {
          subscriptionChainSeeds.set(chainKey, payment);
        }
      }

      for (const seedPayment of subscriptionChainSeeds.values()) {
        await syncFutureCarryForwardBalances({
          paymentId: seedPayment._id,
          userId: userInfo._id,
          context: "bulkUpdateStatus",
        });
      }
    } else {
      console.log("⚠️ [SERVICE] No operations to execute.");
    }

    return { message: "Updated successfully", count: ids.length };
  } catch (error) {
    console.error("❌ [SERVICE] Bulk Update Error:", error);
    throw error;
  }
};

const isValidId = (id) => {
  if (!id) return false;
  return typeof id === "string"
    ? /^[0-9a-fA-F]{24}$/.test(id)
    : mongoose.Types.ObjectId.isValid(id);
};

// ✅ Month-End Closing Service (with month/year selection)
service.closeMonth = async (userInfo, month, year) => {
  console.log(
    "\n🔵 ========== [BACKEND] MONTH-END CLOSE SERVICE STARTED ==========",
  );
  console.log(`👤 User: ${userInfo.name} (${userInfo.role})`);
  console.log(`📅 Target Month: ${month + 1}/${year} (Month index: ${month})`);

  try {
    // Use provided month/year or default to current
    const targetMonth = month !== undefined ? month : new Date().getMonth();
    const targetYear = year !== undefined ? year : new Date().getFullYear();

    // ✅ VALIDATION: Can only close a month if we're in the next month or later
    const now = moment.tz("Asia/Dubai");
    const currentMonth = now.month();
    const currentYear = now.year();

    // Calculate if target month is current month or future
    const targetDate = new Date(targetYear, targetMonth, 1);
    const currentDate = new Date(currentYear, currentMonth, 1);

    if (targetDate >= currentDate) {
      throw new Error(
        `Cannot close ${targetMonth + 1}/${targetYear} yet. You can only close this month after ${targetMonth + 2}/${targetYear} starts (after cron creates next month's bills).`,
      );
    }

    // ✅ FIXED: Create dates in IST timezone (UTC+5:30) to match how bills are stored
    // December 1st 2025 00:00 IST = November 30th 2025 18:30 UTC
    const monthStart = new Date(
      Date.UTC(targetYear, targetMonth, 1, 0, 0, 0, 0) - 5.5 * 60 * 60 * 1000,
    );
    const monthEnd = new Date(
      Date.UTC(targetYear, targetMonth + 1, 0, 23, 59, 59, 999) -
        5.5 * 60 * 60 * 1000,
    );

    console.log("\n📅 Date Range Calculation:");
    console.log(
      `   Start: ${monthStart.toISOString()} → ${monthStart.toLocaleString("en-US", { timeZone: "Asia/Kolkata" })} IST`,
    );
    console.log(
      `   End:   ${monthEnd.toISOString()} → ${monthEnd.toLocaleString("en-US", { timeZone: "Asia/Kolkata" })} IST`,
    );

    console.log("\n🔍 [SERVICE] Searching for pending bills...");
    console.log("   Query Criteria:");
    console.log("   - isDeleted: false");
    console.log("   - onewash: false (residence only)");
    console.log("   - status: pending");
    console.log(`   - createdAt: $gte ${monthStart.toISOString()}`);
    console.log(`   - createdAt: $lte ${monthEnd.toISOString()}`);

    // Find ALL pending bills from the target month (including balance = 0)
    const pendingBills = await PaymentsModel.find({
      isDeleted: false,
      onewash: false, // Only residence payments
      status: "pending",
      createdAt: {
        $gte: monthStart,
        $lte: monthEnd,
      },
    })
      .populate("customer")
      .lean();

    console.log(
      `\n📦 [SERVICE] Found ${pendingBills.length} pending bills to close`,
    );
    if (pendingBills.length > 0) {
      console.log("\n📋 Bills Details:");
      pendingBills.forEach((bill, idx) => {
        const customerName = bill.customer
          ? `${bill.customer.firstName || ""} ${bill.customer.lastName || ""}`.trim() ||
            "N/A"
          : "N/A";
        console.log(`   ${idx + 1}. Bill ID: ${bill._id}`);
        console.log(`      Customer: ${customerName}`);
        console.log(`      Balance: ₹${bill.balance}`);
        console.log(
          `      Created: ${new Date(bill.createdAt).toLocaleString("en-US", { timeZone: "Asia/Kolkata" })}`,
        );
      });
    }

    let closedCount = 0;
    let newBillsCount = 0;

    console.log("\n🔄 [SERVICE] Processing bills...");

    for (const bill of pendingBills) {
      try {
        const customerName = bill.customer
          ? `${bill.customer.firstName || ""} ${bill.customer.lastName || ""}`.trim() ||
            "N/A"
          : "N/A";
        console.log(
          `\n   📌 Processing Bill ${closedCount + 1}/${pendingBills.length}`,
        );
        console.log(`      Bill ID: ${bill._id}`);
        console.log(`      Customer: ${customerName}`);
        console.log(`      Current Balance: ₹${bill.balance}`);

        // 1. Close the old bill as "completed" with special timestamp
        console.log(`      🔒 Closing bill as 'completed'...`);
        const closeTimestamp = new Date();
        const closedBalance = bill.balance; // Store balance before closing

        await PaymentsModel.updateOne(
          { _id: bill._id },
          {
            $set: {
              status: "completed", // Close it
              balance: 0, // Set balance to 0 (carried forward to next month)
              collectedDate: closeTimestamp, // Mark as "paid" by month-end close
              notes:
                (bill.notes || "") +
                (bill.notes ? " | " : "") +
                `Closed by Month-End on ${closeTimestamp.toLocaleDateString()} - Carried Forward: ${closedBalance} AED`,
              updatedBy: userInfo._id,
              updatedAt: closeTimestamp,
            },
          },
        );
        closedCount++;
        console.log(
          `      ✅ Bill closed successfully - Balance ${closedBalance} carried forward`,
        );

        // 2. Check if next month bill already exists and handle balance carry-forward
        const billDate = new Date(bill.createdAt);
        const nextMonth = billDate.getMonth() + 1;
        const nextYear = billDate.getFullYear() + Math.floor(nextMonth / 12);
        const nextMonthIndex = nextMonth % 12;
        const nextMonthDate = new Date(nextYear, nextMonthIndex, 1);
        const nextMonthEnd = new Date(
          nextYear,
          nextMonthIndex + 1,
          0,
          23,
          59,
          59,
          999,
        );

        console.log(
          `\n      📅 [NEXT MONTH CHECK] Target: ${nextMonthIndex + 1}/${nextYear}`,
        );
        console.log(
          `      📅 Date Range: ${nextMonthDate.toISOString()} to ${nextMonthEnd.toISOString()}`,
        );
        console.log(`      💰 Balance to carry forward: ₹${closedBalance}`);

        // Get vehicle ID for matching
        const vehicleId = bill.vehicle?._id || bill.vehicle;
        console.log(
          `      🔍 Searching for bill: Customer=${bill.customer._id || bill.customer}, Vehicle=${vehicleId}`,
        );

        // Check if bill already exists for this customer/vehicle in next month
        const existingNextMonthBill = await PaymentsModel.findOne({
          customer: bill.customer._id || bill.customer,
          "vehicle._id": vehicleId,
          isDeleted: false,
          onewash: false,
          createdAt: {
            $gte: nextMonthDate,
            $lte: nextMonthEnd,
          },
        }).lean();

        if (existingNextMonthBill) {
          console.log(
            `\n      ✅ [FOUND] Next month bill exists: ${existingNextMonthBill._id}`,
          );
          console.log(`         Current State:`);
          console.log(
            `         - Old Balance: ₹${existingNextMonthBill.old_balance}`,
          );
          console.log(
            `         - Amount Charged: ₹${existingNextMonthBill.amount_charged}`,
          );
          console.log(
            `         - Amount Paid: ₹${existingNextMonthBill.amount_paid}`,
          );
          console.log(
            `         - Total Amount: ₹${existingNextMonthBill.total_amount}`,
          );
          console.log(`         - Balance: ₹${existingNextMonthBill.balance}`);
          console.log(
            `         - Created At: ${new Date(existingNextMonthBill.createdAt).toLocaleString("en-US", { timeZone: "Asia/Dubai" })} Dubai`,
          );

          // 🔍 CHECK: Did cron already add this balance?
          // If next month bill's old_balance already equals the balance we're trying to carry forward,
          // then cron already captured it when it ran. Don't add again!
          console.log(
            `\n      🔍 [DUPLICATE CHECK] Checking if cron already added this balance...`,
          );
          console.log(`         Balance to add: ₹${closedBalance}`);
          console.log(
            `         Next month's old_balance: ₹${existingNextMonthBill.old_balance}`,
          );

          if (existingNextMonthBill.old_balance >= closedBalance) {
            // Cron already captured the balance
            console.log(
              `\n      ✅ [SKIP] Cron already included this balance (${existingNextMonthBill.old_balance} >= ${closedBalance})`,
            );
            console.log(
              `         ⚠️  NOT adding balance again to prevent duplicate`,
            );
            console.log(
              `         ✅ Only marking current month bill as completed`,
            );
          } else {
            // Cron didn't capture full balance (maybe customer paid after cron ran)
            // Add the difference
            const balanceDifference =
              closedBalance - existingNextMonthBill.old_balance;
            console.log(
              `\n      ⚠️  [ADD DIFFERENCE] Cron captured ₹${existingNextMonthBill.old_balance} but actual balance is ₹${closedBalance}`,
            );
            console.log(`         💰 Adding difference: ₹${balanceDifference}`);

            const updatedOldBalance =
              existingNextMonthBill.old_balance + balanceDifference;
            const updatedTotalAmount =
              existingNextMonthBill.amount_charged + updatedOldBalance;
            const updatedBalance =
              updatedTotalAmount - existingNextMonthBill.amount_paid;

            console.log(`         Updating next month bill...`);
            await PaymentsModel.updateOne(
              { _id: existingNextMonthBill._id },
              {
                $set: {
                  old_balance: updatedOldBalance,
                  total_amount: updatedTotalAmount,
                  balance: updatedBalance,
                  updatedBy: userInfo._id,
                  updatedAt: new Date(),
                },
              },
            );

            console.log(`\n      ✅ [UPDATED] Next month bill updated:`);
            console.log(
              `         Old Balance: ₹${existingNextMonthBill.old_balance} → ₹${updatedOldBalance}`,
            );
            console.log(
              `         Total Amount: ₹${existingNextMonthBill.total_amount} → ₹${updatedTotalAmount}`,
            );
            console.log(
              `         Balance: ₹${existingNextMonthBill.balance} → ₹${updatedBalance}`,
            );
            newBillsCount++;
          }
        } else {
          console.log(
            `\n      ⚠️  [NOT FOUND] No bill exists for next month yet`,
          );
          console.log(
            `      💡 Cron will create next month's bill on ${nextMonthDate.toLocaleDateString()}`,
          );
          console.log(
            `      💡 When cron runs, it will pick up the balance from this closed bill`,
          );
          console.log(
            `      ✅ Current bill closed, cron will handle balance carry-forward`,
          );
        }
      } catch (err) {
        console.error(
          `❌ [SERVICE] Error processing bill ${bill._id}:`,
          err.message,
        );
      }
    }

    console.log("\n✅ ========== MONTH-END CLOSE SUMMARY ==========");
    console.log(`   📊 Bills Closed: ${closedCount}`);
    console.log(`   📊 New Bills Created: ${newBillsCount}`);
    console.log(
      `   ⏱️  Completed at: ${new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" })} IST`,
    );
    console.log(
      "🔵 ========== [BACKEND] MONTH-END CLOSE SERVICE COMPLETE ==========\n",
    );

    return {
      closedBills: closedCount,
      newBills: newBillsCount,
    };
  } catch (error) {
    console.error("❌ [SERVICE] Month-End Close Failed:", error);
    throw error;
  }
};

// ✅ Revert Month-End Closing Service - REMOVED (Not needed)

// ✅ Get Months with Pending Bills
service.getMonthsWithPending = async () => {
  console.log("🔵 [SERVICE] Getting months with bills (pending AND completed)");

  try {
    // Count ALL bills (pending + completed with balance)
    const totalCount = await PaymentsModel.countDocuments({
      isDeleted: false,
      onewash: false,
      status: { $in: ["pending", "completed"] },
    });
    console.log(`📊 [SERVICE] Total bills: ${totalCount}`);

    if (totalCount === 0) {
      console.log("ℹ️ [SERVICE] No bills found");
      return [];
    }

    // Aggregate ALL bills (pending + completed) by month/year/status
    console.log("🔄 [SERVICE] Running aggregate query...");
    const result = await PaymentsModel.aggregate([
      {
        $match: {
          isDeleted: false,
          onewash: false,
          status: { $in: ["pending", "completed"] },
        },
      },
      {
        $addFields: {
          // Add 5.5 hours to UTC to get IST, then extract year/month
          istDate: { $add: ["$createdAt", 5.5 * 60 * 60 * 1000] },
        },
      },
      {
        $group: {
          _id: {
            year: { $year: "$istDate" },
            month: { $month: "$istDate" },
            status: "$status",
          },
          count: { $sum: 1 },
          totalBalance: { $sum: "$balance" },
        },
      },
      {
        $group: {
          _id: {
            year: "$_id.year",
            month: "$_id.month",
          },
          statuses: {
            $push: {
              status: "$_id.status",
              count: "$count",
              balance: "$totalBalance",
            },
          },
          totalCount: { $sum: "$count" },
          totalBalance: { $sum: "$totalBalance" },
        },
      },
      {
        $sort: { "_id.year": -1, "_id.month": -1 },
      },
    ]);

    console.log(`📦 [SERVICE] Aggregate returned ${result.length} groups`);

    // Convert to more readable format
    const months = result.map((item) => {
      const pendingGroup = item.statuses.find((s) => s.status === "pending");
      const completedGroup = item.statuses.find(
        (s) => s.status === "completed",
      );

      const pendingCount = pendingGroup?.count || 0;
      const completedCount = completedGroup?.count || 0;

      return {
        month: item._id.month - 1, // Convert to 0-indexed (0 = Jan, 11 = Dec)
        year: item._id.year,
        pending: pendingCount,
        completed: completedCount,
        count: item.totalCount,
        totalBalance: Math.round(item.totalBalance),
        isClosed: pendingCount === 0 && completedCount > 0,
      };
    });

    console.log(`📅 [SERVICE] Found ${months.length} months`);
    months.forEach((m) => {
      const monthName = new Date(m.year, m.month, 1).toLocaleDateString(
        "en-US",
        { month: "long", year: "numeric" },
      );
      const status = m.isClosed ? "✅ CLOSED" : "⏳ OPEN";
      console.log(
        `   ${status} ${monthName}: ${m.pending} pending, ${m.completed} completed, ₹${m.totalBalance} balance`,
      );
    });

    return months;
  } catch (error) {
    console.error("❌ [SERVICE] Get Months Failed:");
    console.error("Error name:", error.name);
    console.error("Error message:", error.message);
    console.error("Error stack:", error.stack);
    throw new Error(
      `Failed to get months with bills: ${error.message || error}`,
    );
  }
};

// ✅ UPDATED MONTHLY STATEMENT (View + Excel + PDF Support)
service.monthlyStatement = async (userInfo, query) => {
  console.log("🔵 [BACKEND] monthlyStatement started");
  console.log("👉 Filters Received:", JSON.stringify(query, null, 2));

  // 1. Setup Date Range
  const startOfMonth = moment
    .utc([query.year, query.month, 1])
    .startOf("month")
    .format();
  const endOfMonth = moment
    .utc([query.year, query.month, 1])
    .endOf("month")
    .format();

  const findQuery = {
    isDeleted: false,
    onewash: query.service_type === "onewash",
    createdAt: { $gte: startOfMonth, $lte: endOfMonth },
  };

  // 2. Apply Filters (Strict)
  if (isValidId(query.worker)) {
    findQuery.worker = query.worker;
  }

  if (isValidId(query.building)) {
    // Direct filtering if Payment has building field (Preferred)
    findQuery.building = query.building;
  }

  console.log("🔍 [BACKEND] Mongo Query:", JSON.stringify(findQuery, null, 2));

  // 3. Fetch Data
  let data = await PaymentsModel.find(findQuery)
    .sort({ "vehicle.parking_no": 1 })
    .lean();

  console.log(`📦 [BACKEND] Records Found: ${data.length}`);

  // 4. Populate References
  try {
    data = await PaymentsModel.populate(data, [
      { path: "job", model: "jobs" },
      { path: "worker", model: "workers", select: "name" },
      { path: "building", model: "buildings", select: "name" },
      { path: "customer", model: "customers" },
    ]);
  } catch (err) {
    console.error("⚠️ [BACKEND] Populate Warning:", err.message);
  }

  // 5. Helper to Format Data (17 Fields)
  const formatRecord = (item, index) => {
    let vehicle = null;
    if (item.customer && item.customer.vehicles) {
      const regNo = item.vehicle?.registration_no || item.vehicle;
      vehicle = item.customer.vehicles.find((v) => v.registration_no === regNo);
    }

    const subscriptionAmount = item.amount_charged || 0;
    const prevDue = item.old_balance || 0;
    const totalDue = item.total_amount || 0;
    const paid = item.amount_paid || 0;
    const balance = totalDue - paid;

    return {
      slNo: index + 1,
      parkingNo: item.vehicle?.parking_no || "-",
      carNo: item.vehicle?.registration_no || "-",
      mobile: item.customer?.mobile || "No Mobile",
      flatNo: item.customer?.flat_no || "-",
      startDate: vehicle
        ? moment(vehicle.start_date).format("DD-MM-YYYY")
        : "-",
      schedule: vehicle
        ? vehicle.schedule_type === "daily"
          ? "Daily"
          : (() => {
              console.log("🔍 Vehicle Schedule Debug:", {
                schedule_type: vehicle.schedule_type,
                schedule_days: vehicle.schedule_days,
                schedule_days_type: typeof vehicle.schedule_days,
                schedule_days_length: vehicle.schedule_days
                  ? vehicle.schedule_days.length
                  : "N/A",
                is_array: Array.isArray(vehicle.schedule_days),
              });

              let dayCount = 1;
              let daysList = "";

              if (
                vehicle.schedule_days &&
                Array.isArray(vehicle.schedule_days)
              ) {
                if (
                  vehicle.schedule_days.length === 1 &&
                  typeof vehicle.schedule_days[0] === "string"
                ) {
                  // Handle case where schedule_days is ["Mon,Wed,Fri"] - array with one comma-separated string
                  const days = vehicle.schedule_days[0]
                    .split(",")
                    .filter((day) => day.trim());
                  dayCount = days.length;
                  daysList = days.map((day) => day.trim()).join(",");
                } else {
                  // Handle case where schedule_days is ["Mon", "Wed", "Fri"] - array of individual days
                  dayCount = vehicle.schedule_days.length;
                  daysList = vehicle.schedule_days.join(",");
                }
              } else if (typeof vehicle.schedule_days === "string") {
                // Handle case where schedule_days is "Mon,Wed,Fri" - direct string
                const days = vehicle.schedule_days
                  .split(",")
                  .filter((day) => day.trim());
                dayCount = days.length;
                daysList = days.map((day) => day.trim()).join(",");
              }

              return `Weekly ${dayCount} times`;
            })()
        : "-",
      advance: vehicle?.advance_amount || 0,
      subAmount: subscriptionAmount,
      prevDue: prevDue,
      totalDue: totalDue,
      paid: paid,
      balance: balance,
      payDate: item.collectedDate
        ? moment(item.collectedDate).format("DD-MM-YYYY")
        : "-",
      receipt:
        item.status === "completed"
          ? item.receipt_no || `RCP${String(item.id).padStart(6, "0")}`
          : "-", // Only for completed payments
      dueDate: item.billing_month
        ? moment(item.billing_month, "YYYY-MM")
            .endOf("month")
            .format("DD-MM-YYYY")
        : moment(item.createdAt)
            .subtract(1, "day")
            .endOf("month")
            .format("DD-MM-YYYY"),
      remarks: item.notes || "-",
      customerNotes: item.customer?.notes || "-",

      // Metadata
      buildingName: item.building?.name || "Unknown Building",
      workerName: item.worker?.name || "Unassigned",
    };
  };

  // --- A. JSON RESPONSE (View & PDF) ---
  if (query.format === "json") {
    const result = [];
    const grouped = {};

    data.forEach((item, index) => {
      const formatted = formatRecord(item, index);
      const bKey = formatted.buildingName;
      const wKey = formatted.workerName;

      if (!grouped[bKey]) grouped[bKey] = {};
      if (!grouped[bKey][wKey]) grouped[bKey][wKey] = [];

      grouped[bKey][wKey].push(formatted);
    });

    Object.keys(grouped).forEach((bName) => {
      const workers = [];
      Object.keys(grouped[bName]).forEach((wName) => {
        workers.push({
          workerName: wName,
          payments: grouped[bName][wName],
        });
      });
      result.push({ buildingName: bName, workers: workers });
    });

    console.log("✅ [BACKEND] Sending JSON Response");
    return result;
  }

  // --- B. EXCEL RESPONSE (Download) ---
  console.log("✅ [BACKEND] Generating Excel Workbook");
  const workbook = new exceljs.Workbook();
  const sheet = workbook.addWorksheet("Collection Sheet");

  sheet.columns = [
    { header: "Serial Number", key: "slNo", width: 8 },
    { header: "Parking Number", key: "parkingNo", width: 15 },
    { header: "Car Number", key: "carNo", width: 15 },
    { header: "Mobile Number", key: "mobile", width: 15 },
    { header: "Flat Number", key: "flatNo", width: 12 },
    { header: "Cust. Start Date", key: "startDate", width: 15 },
    { header: "Weekly Schedule", key: "schedule", width: 15 },
    { header: "Adv. Pay Option", key: "advance", width: 12 },
    { header: "Subscript. Amount", key: "subAmount", width: 15 },
    { header: "Prev. Payment Due", key: "prevDue", width: 15 },
    { header: "Total Amount Due", key: "totalDue", width: 15 },
    { header: "Paid Amount", key: "paid", width: 15 },
    { header: "Balance Amount", key: "balance", width: 13 },
    { header: "Payment Date", key: "payDate", width: 15 },
    { header: "Receipt Number", key: "receipt", width: 15 },
    { header: "Payment Due Date", key: "dueDate", width: 15 },
    { header: "Payment Remarks", key: "remarks", width: 20 },
    { header: "Customer Notes", key: "customerNotes", width: 25 },
  ];

  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF1F4E78" },
  };
  headerRow.alignment = {
    horizontal: "center",
    vertical: "middle",
    wrapText: true,
  };
  sheet.getRow(1).height = 30;

  data.forEach((item, index) => {
    sheet.addRow(formatRecord(item, index));
  });

  return workbook;
};

service.generatePDF = async (userInfo, filters) => {
  console.log("📄 Generating PDF with filters:", filters);

  const PDFDocument = require("pdfkit-table");
  const moment = require("moment-timezone");
  const path = require("path");
  const fs = require("fs");

  // Fetch ALL records (no pagination limit)
  const allFilters = {
    ...filters,
    page: 1,
    limit: 100000, // Get all records
  };

  const result = await service.list(userInfo, allFilters);
  const payments = result.data || [];

  console.log(`📊 Fetched ${payments.length} total records for PDF`);

  const toNumber = (value) => {
    const num = Number(value);
    return Number.isFinite(num) ? num : 0;
  };

  const totals = payments.reduce(
    (acc, payment) => {
      const totalDue = toNumber(payment.total_amount);
      const amountPaid = toNumber(payment.amount_paid);
      acc.totalDue += totalDue;
      acc.totalPaid += amountPaid;

      const mode = String(payment.payment_mode || "")
        .trim()
        .toLowerCase();
      if (!amountPaid) return acc;

      if (mode === "cash") acc.cash += amountPaid;
      else if (mode === "card") acc.card += amountPaid;
      else if (mode === "bank" || mode === "bank transfer") {
        acc.bank += amountPaid;
      }

      return acc;
    },
    { totalDue: 0, totalPaid: 0, cash: 0, card: 0, bank: 0 },
  );

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        layout: "landscape",
        size: "A4",
        margin: 40,
      });

      const chunks = [];
      doc.on("data", (chunk) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      const iconLogoPath = path.join(
        __dirname,
        "../../../../../admin-panel/public/logo-icon.png",
      );
      const textLogoPath = path.join(
        __dirname,
        "../../../../../admin-panel/public/logo-text.png",
      );

      const startDate = filters.startDate
        ? moment(filters.startDate).format("DD/MM/YYYY")
        : "N/A";
      const endDate = filters.endDate
        ? moment(filters.endDate).format("DD/MM/YYYY")
        : "N/A";

      const formatMoney = (value) => `${toNumber(value).toFixed(2)} AED`;

      const tableRows = payments.map((payment) => {
        const mobile = payment.customer?.mobile || "-";
        const vehicleReg = payment.vehicle?.registration_no || "-";
        const parkingNo = payment.vehicle?.parking_no || "-";
        const billDate = moment(payment.createdAt).format("DD/MM/YYYY");
        const customerNotes = payment.customer?.notes || "-";

        let carriedAmount = "-";
        const isMonthEndClosed =
          payment.notes &&
          payment.notes.toLowerCase().includes("closed by month-end");
        if (isMonthEndClosed && payment.notes) {
          const match = payment.notes.match(
            /Carried Forward:\s*([\d.]+)\s*AED/i,
          );
          if (match) {
            carriedAmount = match[1];
          }
        }

        let paidDate = "Not Paid";
        if (payment.collectedDate) {
          paidDate = moment(payment.collectedDate).format("DD/MM/YYYY");
        }

        return [
          String(payment.id || "-"),
          mobile,
          vehicleReg,
          parkingNo,
          billDate,
          String(payment.amount_charged || 0),
          String(payment.old_balance || 0),
          String(payment.total_amount || 0),
          String(payment.amount_paid || 0),
          carriedAmount,
          String(payment.balance || 0),
          paidDate,
          (payment.status || "pending").toUpperCase(),
          customerNotes, // Add customer notes as last column
        ];
      });

      const columns = [
        { key: "id", label: "ID", width: 36, align: "left" },
        { key: "mobile", label: "Mobile", width: 62, align: "left" },
        { key: "vehicle", label: "Vehicle", width: 52, align: "left" },
        { key: "parking", label: "Parking", width: 46, align: "left" },
        { key: "billDate", label: "Bill Date", width: 54, align: "left" },
        {
          key: "subscription",
          label: "Subscription",
          width: 50,
          align: "right",
        },
        { key: "previousDue", label: "Previous", width: 50, align: "right" },
        { key: "totalDue", label: "Total Due", width: 52, align: "right" },
        { key: "paid", label: "Paid", width: 44, align: "right" },
        { key: "carried", label: "Carried", width: 48, align: "right" },
        { key: "balance", label: "Balance", width: 50, align: "right" },
        { key: "paidDate", label: "Paid Date", width: 54, align: "left" },
        { key: "status", label: "Status", width: 50, align: "left" },
        { key: "notes", label: "Notes", width: 62, align: "left" },
      ];

      const left = 40;
      const rowHeight = 16;
      const headerHeight = 18;
      const getLayoutMetrics = () => {
        const maxY = doc.page.height - doc.page.margins.bottom;
        const footerLineY = maxY - 14;
        const footerTextY = maxY - 10;
        const rowMaxY = maxY - 24;
        return { maxY, footerLineY, footerTextY, rowMaxY };
      };
      let pageNumber = 1;

      const truncate = (value, maxChars) => {
        const str = String(value ?? "-");
        if (str.length <= maxChars) return str;
        return `${str.slice(0, Math.max(0, maxChars - 3))}...`;
      };

      const drawPageHeader = (isFirstPage = false) => {
        if (!isFirstPage) {
          return 42;
        }

        if (fs.existsSync(textLogoPath)) {
          doc.image(textLogoPath, left, 26, { width: 180 });
        } else if (fs.existsSync(iconLogoPath)) {
          doc.image(iconLogoPath, left, 22, { width: 42, height: 42 });
        }

        doc
          .fontSize(22)
          .font("Helvetica-Bold")
          .fillColor("#1e40af")
          .text("Residence Payments Report", left + 110, 38, { align: "left" });

        let y = 74;
        doc
          .strokeColor("#3b82f6")
          .lineWidth(2)
          .moveTo(left, y)
          .lineTo(doc.page.width - left, y)
          .stroke();

        y += 12;
        doc.fontSize(10).font("Helvetica").fillColor("#374151");
        doc.text(`Date Range: ${startDate} to ${endDate}`, left, y);
        doc.text(`Total Records: ${payments.length}`, left, y + 14);
        doc.text(
          `Total Revenue: ${formatMoney(totals.totalDue)}`,
          left,
          y + 28,
        );

        if (isFirstPage) {
          doc.text(
            `Collected: ${formatMoney(totals.totalPaid)}`,
            left + 260,
            y + 14,
          );
          doc.text(`Cash: ${formatMoney(totals.cash)}`, left + 260, y + 28);
          doc.text(`Card: ${formatMoney(totals.card)}`, left + 390, y + 28);
          doc.text(`Bank: ${formatMoney(totals.bank)}`, left + 510, y + 28);
          return y + 56;
        }

        return y + 40;
      };

      const drawFooter = (pageNo) => {
        const generatedText = `Generated on ${moment().format("DD/MM/YYYY HH:mm:ss")}`;
        const { footerLineY, footerTextY } = getLayoutMetrics();
        doc
          .strokeColor("#3b82f6")
          .lineWidth(1)
          .moveTo(40, footerLineY)
          .lineTo(doc.page.width - 40, footerLineY)
          .stroke();

        doc.fontSize(8).fillColor("#1e40af").font("Helvetica");
        doc.text(
          `${generatedText} | Page ${pageNo} | BCW Car Wash Services`,
          40,
          footerTextY,
          { align: "center", width: doc.page.width - 80, lineBreak: false },
        );
      };

      const drawTableHeader = (y) => {
        doc
          .rect(left, y, doc.page.width - left * 2, headerHeight)
          .fill("#eaf1ff");

        doc.font("Helvetica-Bold").fontSize(7).fillColor("#1e40af");
        let x = left;
        columns.forEach((col) => {
          doc.text(col.label, x + 2, y + 5, {
            width: col.width - 4,
            align: col.align === "right" ? "right" : "left",
          });
          x += col.width;
        });

        doc
          .moveTo(left, y + headerHeight)
          .lineTo(doc.page.width - left, y + headerHeight)
          .lineWidth(0.8)
          .strokeColor("#9ca3af")
          .stroke();

        return y + headerHeight;
      };

      let y = drawPageHeader(true);
      y = drawTableHeader(y);

      tableRows.forEach((row, index) => {
        const { rowMaxY } = getLayoutMetrics();
        if (y + rowHeight > rowMaxY) {
          drawFooter(pageNumber);
          doc.addPage();
          pageNumber += 1;
          y = drawPageHeader(false);
          y = drawTableHeader(y);
        }

        if (index % 2 === 0) {
          doc
            .rect(left, y, doc.page.width - left * 2, rowHeight)
            .fill("#f9fafb");
        }

        doc.font("Helvetica").fontSize(7).fillColor("#1f2937");
        let x = left;
        row.forEach((cell, idx) => {
          const col = columns[idx];
          const maxChars = Math.max(6, Math.floor(col.width / 5.4));
          doc.text(truncate(cell, maxChars), x + 2, y + 4, {
            width: col.width - 4,
            align: col.align === "right" ? "right" : "left",
          });
          x += col.width;
        });

        doc
          .moveTo(left, y + rowHeight)
          .lineTo(doc.page.width - left, y + rowHeight)
          .lineWidth(0.3)
          .strokeColor("#d1d5db")
          .stroke();

        y += rowHeight;
      });

      drawFooter(pageNumber);

      doc.end();
    } catch (error) {
      console.error("❌ PDF Generation Error:", error);
      reject(error);
    }
  });
};

/**
 * Get all payments that have been edited (have amount_edit_history).
 * Returns flattened list of edits with payment + customer + vehicle info.
 */
service.getEditHistory = async (userInfo, query) => {
  const paginationData = CommonHelper.paginationData(query);

  const findQuery = {
    isDeleted: false,
    amount_edit_history: { $exists: true, $ne: [] },
  };

  // Optional: filter by onewash type
  if (query.type === "onewash") {
    findQuery.onewash = true;
  } else if (query.type === "residence") {
    findQuery.onewash = false;
  }

  const total = await PaymentsModel.countDocuments(findQuery);

  let data = await PaymentsModel.find(findQuery)
    .sort({ updatedAt: -1 })
    .skip(paginationData.skip)
    .limit(paginationData.limit)
    .lean();

  // Clean up empty strings before populating
  data = data.map((payment) => {
    if (payment.worker === "") payment.worker = null;
    if (payment.building === "") payment.building = null;
    return payment;
  });

  // Populate references
  try {
    data = await PaymentsModel.populate(data, [
      {
        path: "customer",
        model: "customers",
        select: "firstName lastName mobile",
      },
      { path: "worker", model: "workers", select: "name" },
      { path: "building", model: "buildings", select: "name" },
    ]);
  } catch (e) {
    console.warn("⚠️ [EDIT HISTORY] Populate warning:", e.message);
  }

  return { total, data };
};

/**
 * Get detailed history of a specific payment.
 * Returns amount edit history + collection transactions.
 */
service.getPaymentHistory = async (userInfo, paymentId) => {
  const payment = await PaymentsModel.findOne({
    _id: paymentId,
    isDeleted: false,
  }).lean();

  if (!payment) {
    throw "Payment not found";
  }

  // Get amount edit history
  const amountEdits = payment.amount_edit_history || [];

  const getBillingMonthKey = (item) => {
    if (item?.billing_month) return item.billing_month;
    // Legacy fallback: invoice date is first day of next month.
    return moment(item?.createdAt).subtract(1, "day").format("YYYY-MM");
  };

  const sameVehicleQuery = payment?.vehicle?._id
    ? { "vehicle._id": payment.vehicle._id }
    : payment?.vehicle?.registration_no
      ? {
          "vehicle.registration_no": payment.vehicle.registration_no,
          ...(payment?.vehicle?.parking_no
            ? { "vehicle.parking_no": payment.vehicle.parking_no }
            : null),
        }
      : null;

  const historyQuery = {
    customer: payment.customer,
    onewash: false,
    isDeleted: { $ne: true },
    ...(sameVehicleQuery || null),
  };

  const relatedBills = await PaymentsModel.find(historyQuery)
    .sort({ createdAt: 1, _id: 1 })
    .select({
      _id: 1,
      createdAt: 1,
      collectedDate: 1,
      billing_month: 1,
      amount_charged: 1,
      old_balance: 1,
      total_amount: 1,
      amount_paid: 1,
      balance: 1,
      status: 1,
      settled: 1,
      receipt_no: 1,
      notes: 1,
    })
    .lean();

  const monthlyBreakdown = relatedBills
    .map((item) => {
      const monthKey = getBillingMonthKey(item);
      const monthlyAmount =
        item.amount_charged !== undefined
          ? Number(item.amount_charged || 0)
          : Math.max(
              0,
              Number(item.total_amount || 0) - Number(item.old_balance || 0),
            );

      return {
        paymentId: item._id,
        monthKey,
        monthLabel: moment(monthKey, "YYYY-MM").format("MMMM YYYY"),
        invoiceDate: item.createdAt || null,
        dueDate: moment(monthKey, "YYYY-MM").endOf("month").toDate(),
        monthlyAmount,
        carriedForward: Number(item.old_balance || 0),
        totalAmount: Number(item.total_amount || 0),
        paidAmount: Number(item.amount_paid || 0),
        balance: Number(item.balance || 0),
        status: item.status,
        settled: item.settled,
        receiptNo: item.receipt_no || null,
        collectedDate: item.collectedDate || null,
        notes: item.notes || null,
      };
    })
    .sort((a, b) => b.monthKey.localeCompare(a.monthKey));

  const currentMonthKey = getBillingMonthKey(payment);
  const currentMonthLabel = moment(currentMonthKey, "YYYY-MM").format(
    "MMMM YYYY",
  );

  const currentIndex = relatedBills.findIndex(
    (item) => String(item._id) === String(payment._id),
  );

  const previousBill =
    currentIndex > 0 && relatedBills[currentIndex - 1]
      ? relatedBills[currentIndex - 1]
      : null;

  const carriedForwardSource =
    Number(payment.old_balance || 0) > 0 && previousBill
      ? {
          fromPaymentId: previousBill._id,
          fromMonthKey: getBillingMonthKey(previousBill),
          fromMonthLabel: moment(
            getBillingMonthKey(previousBill),
            "YYYY-MM",
          ).format("MMMM YYYY"),
          fromBalance: Number(previousBill.balance || 0),
          amountCarried: Number(payment.old_balance || 0),
          toPaymentId: payment._id,
          toMonthKey: currentMonthKey,
          toMonthLabel: currentMonthLabel,
        }
      : null;

  // Get collection transactions
  const transactions = await TransactionsModel.find({
    payment: paymentId,
    isDeleted: false,
  })
    .sort({ payment_date: -1 })
    .lean();

  // Populate transaction creators
  const populatedTransactions = await TransactionsModel.populate(transactions, [
    {
      path: "createdBy",
      model: "users",
      select: "name email",
    },
  ]);

  return {
    paymentId: payment._id,
    currentAmount: payment.total_amount,
    currentBalance: payment.balance,
    currentStatus: payment.status,
    currentPaidAmount: payment.amount_paid || 0,
    currentMonthlyAmount:
      payment.amount_charged !== undefined
        ? Number(payment.amount_charged || 0)
        : Math.max(
            0,
            Number(payment.total_amount || 0) -
              Number(payment.old_balance || 0),
          ),
    currentOldBalance: payment.old_balance || 0,
    currentBillingMonthKey: currentMonthKey,
    currentBillingMonthLabel: currentMonthLabel,
    currentInvoiceDate: payment.createdAt || null,
    currentDueDate: moment(currentMonthKey, "YYYY-MM").endOf("month").toDate(),
    vehicleInfo: {
      registrationNo: payment?.vehicle?.registration_no || null,
      parkingNo: payment?.vehicle?.parking_no || null,
    },
    notes: payment.notes,
    carriedForwardSource,
    monthlyBreakdown,
    amountEdits: amountEdits,
    transactions: populatedTransactions,
  };
};
