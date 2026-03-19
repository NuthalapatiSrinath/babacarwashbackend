const utils = require("./src/server/utils");
const database = require("./src/server/database");
const JobsModel = require("./src/server/api/models/jobs.model");
const OneWashModel = require("./src/server/api/models/onewash.model");
const PaymentsModel = require("./src/server/api/models/payments.model");
const CounterService = require("./src/server/utils/counters");

const repairCustomerMallRouting = async () => {
  try {
    const utilsData = utils.initialize();
    await database.initialize(utilsData);
    console.log("✅ MongoDB Connected\n");

    const legacyOneWash = await OneWashModel.find({
      isDeleted: false,
      createdBy: "Customer Booking",
      service_type: "mall",
      status: "pending",
      booking: { $exists: true, $ne: null },
    }).lean();

    if (!legacyOneWash.length) {
      console.log("ℹ️ No legacy customer-mall onewash records found.");
      process.exit(0);
    }

    let movedCount = 0;
    let deletedPaymentCount = 0;
    let deletedOneWashCount = 0;

    for (const ow of legacyOneWash) {
      const existingJob = await JobsModel.findOne({
        booking: ow.booking,
        createdBy: "Customer Booking",
        service_type: "mall",
        isDeleted: false,
      }).lean();

      if (existingJob?._id) {
        await JobsModel.updateOne(
          { _id: existingJob._id },
          {
            $set: {
              vehicle: ow.vehicle,
              parking_no: ow.parking_no,
              parking_floor: ow.parking_floor,
              registration_no: ow.registration_no,
              worker: ow.worker || null,
              mall: ow.mall,
              customer: ow.customer,
              amount: ow.amount,
              service_type: "mall",
              assignedDate: new Date(),
              booking: ow.booking,
              createdBy: "Customer Booking",
              createdByName: "Customer Booking",
              createdSource: "Customer App",
              onewash: true,
              immediate: true,
              status: existingJob.status || "pending",
            },
          },
        );
      } else {
        const id = await CounterService.id("jobs");
        await new JobsModel({
          id,
          vehicle: ow.vehicle,
          parking_no: ow.parking_no,
          parking_floor: ow.parking_floor,
          registration_no: ow.registration_no,
          worker: ow.worker || null,
          mall: ow.mall,
          customer: ow.customer,
          amount: ow.amount,
          service_type: "mall",
          assignedDate: new Date(),
          booking: ow.booking,
          createdBy: "Customer Booking",
          createdByName: "Customer Booking",
          createdSource: "Customer App",
          onewash: true,
          immediate: true,
          status: "pending",
        }).save();
      }

      movedCount += 1;

      const paymentDeleteResult = await PaymentsModel.deleteMany({
        job: ow._id,
        onewash: true,
        status: "pending",
        isDeleted: false,
      });
      deletedPaymentCount += paymentDeleteResult.deletedCount || 0;

      const onewashDeleteResult = await OneWashModel.deleteOne({ _id: ow._id });
      deletedOneWashCount += onewashDeleteResult.deletedCount || 0;
    }

    console.log("✅ Repair completed");
    console.log(`   - movedToJobs: ${movedCount}`);
    console.log(`   - deletedPendingPayments: ${deletedPaymentCount}`);
    console.log(`   - deletedOneWashRows: ${deletedOneWashCount}`);

    process.exit(0);
  } catch (error) {
    console.error("❌ Repair failed:", error);
    process.exit(1);
  }
};

repairCustomerMallRouting();
