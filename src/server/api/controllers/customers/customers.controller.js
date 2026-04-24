const service = require("./customers.service");
const controller = module.exports;
const ExcelJS = require("exceljs");
const moment = require("moment");

// ✅ UPDATED: Export Data (Now Generates an Excel File)
controller.exportData = async (req, res) => {
  try {
    const { user, query } = req;
    // Service returns an array of flattened customer objects
    const data = await service.exportData(user, query);

    // Create Excel Workbook
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Customers");

    // Define Columns
    worksheet.columns = [
      { header: "Customer Name", key: "fullName", width: 25 },
      { header: "Mobile", key: "mobile", width: 15 },
      { header: "Email", key: "email", width: 25 },
      { header: "Vehicle No", key: "registration_no", width: 15 },
      { header: "Parking No", key: "parking_no", width: 15 },
      { header: "Building", key: "building", width: 20 },
      { header: "Flat No", key: "flat_no", width: 10 },
      { header: "Amount", key: "amount", width: 10 },
      { header: "Advance", key: "advance_amount", width: 10 },
      { header: "Cleaner", key: "worker", width: 20 },
      { header: "Schedule", key: "schedule_type", width: 15 },
      { header: "Days", key: "schedule_days", width: 20 },
      { header: "Start Date", key: "start_date", width: 15 },
    ];

    // Add Rows
    data.forEach((row) => {
      worksheet.addRow({
        fullName: `${row.firstName || ""} ${row.lastName || ""}`.trim(),
        mobile: row.mobile,
        email: row.email,
        registration_no: row.registration_no,
        parking_no: row.parking_no,
        building: row.building,
        flat_no: row.flat_no,
        amount: row.amount,
        advance_amount: row.advance_amount,
        worker: row.worker,
        schedule_type: row.schedule_type,
        schedule_days: row.schedule_days,
        start_date: row.start_date,
      });
    });

    // Send File Response
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=customers_${moment().format("YYYY-MM-DD")}.xlsx`,
    );

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error("❌ [EXPORT CONTROLLER] Error:", error);
    return res
      .status(500)
      .json({ message: "Internal server error", error: error.message });
  }
};

// ✅ UPDATED: Import Datad
controller.importData = async (req, res) => {
  try {
    console.log("🔵 [IMPORT CONTROLLER] Starting import...");

    const file = req.files?.file || req.file;
    if (!file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    // We pass the raw file info to the service, or parse here.
    // To match your previous structure where service handled parsing logic,
    // we'll parse here to normalize data structure before service call.

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(file.filepath || file.path);
    const worksheet = workbook.getWorksheet(1); // First sheet

    if (!worksheet) {
      return res.status(400).json({ message: "No worksheet found" });
    }

    const customers = [];

    // Iterate rows (skip header row 1)
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;

      // Map Columns A-M (1-13) based on Template
      const fullName = row.getCell(1).text || "";
      const nameParts = fullName.trim().split(" ");
      const firstName = nameParts[0] || "";
      const lastName = nameParts.slice(1).join(" ") || "";

      const rowData = {
        firstName,
        lastName,
        mobile: row.getCell(2).text?.toString(),
        email: row.getCell(3).text?.toString(),
        registration_no: row.getCell(4).text?.toString(),
        parking_no: row.getCell(5).text?.toString(),
        building: row.getCell(6).text?.toString(),
        flat_no: row.getCell(7).text?.toString(),
        amount: parseFloat(row.getCell(8).value) || 0,
        advance_amount: parseFloat(row.getCell(9).value) || 0,
        worker: row.getCell(10).text?.toString(),
        schedule_type:
          row.getCell(11).text?.toString()?.toLowerCase() || "daily",
        schedule_days: row.getCell(12).text?.toString(),
        start_date: row.getCell(13).value
          ? new Date(row.getCell(13).value)
          : new Date(),
      };

      // Simple validation: must have mobile & vehicle
      if (rowData.mobile && rowData.registration_no) {
        customers.push(rowData);
      }
    });

    if (customers.length === 0) {
      return res.status(400).json({ message: "No valid data found in file" });
    }

    // Send parsed data to service
    const result = await service.importData(req.user, customers);

    return res.status(200).json({
      statusCode: 200,
      success: result.success > 0,
      message: `Import processed: ${result.success} success, ${result.errors?.length} errors`,
      data: result,
    });
  } catch (error) {
    console.error("💥 [IMPORT CONTROLLER] Error:", error);
    res.status(500).json({ message: "Import failed", error: String(error) });
  }
};

// ... Standard CRUD methods remain largely the same ...

controller.list = async (req, res) => {
  try {
    const { user, query } = req;
    const data = await service.list(user, query);
    return res
      .status(200)
      .json({ statusCode: 200, message: "success", ...data });
  } catch (error) {
    return res.status(500).json({ message: "Internal server error", error });
  }
};

controller.create = async (req, res) => {
  try {
    const { user, body } = req;
    const data = await service.create(user, body);
    return res.status(200).json({ statusCode: 200, message: "success", data });
  } catch (error) {
    if (error == "USER-EXISTS")
      return res
        .status(409)
        .json({ statusCode: 409, message: "User exists", error });
    return res.status(500).json({ message: "Internal server error", error });
  }
};

controller.update = async (req, res) => {
  try {
    const { user, params, body } = req;
    const data = await service.update(user, params.id, body);
    return res.status(200).json({ statusCode: 200, message: "success", data });
  } catch (error) {
    console.error("Customer Update Error:", error);

    // Handle pending dues error
    if (error.code === "PENDING_DUES") {
      return res.status(400).json({
        statusCode: 400,
        message: error.message,
        code: "PENDING_DUES",
        totalDue: error.totalDue,
        pendingCount: error.pendingCount,
        payments: error.payments || [],
      });
    }

    return res.status(500).json({
      message: "Internal server error",
      error: error.message || error,
    });
  }
};

controller.delete = async (req, res) => {
  try {
    const { user, params, body } = req;
    const data = await service.delete(user, params.id, body?.reason);
    return res.status(200).json({ statusCode: 200, message: "success", data });
  } catch (error) {
    return res.status(500).json({ message: "Internal server error", error });
  }
};

controller.undoDelete = async (req, res) => {
  try {
    const { user, params } = req;
    const data = await service.undoDelete(user, params.id);
    return res.status(200).json({ statusCode: 200, message: "success", data });
  } catch (error) {
    return res.status(500).json({ message: "Internal server error", error });
  }
};

controller.info = async (req, res) => {
  try {
    const { user, params } = req;
    const data = await service.info(user, params.id);
    return res.status(200).json({ statusCode: 200, message: "success", data });
  } catch (error) {
    return res.status(500).json({ message: "Internal server error", error });
  }
};

controller.vehicleDeactivate = async (req, res) => {
  try {
    const { user, params, body } = req;
    const data = await service.vehicleDeactivate(user, params.id, body);
    return res.status(200).json({ statusCode: 200, message: "success", data });
  } catch (error) {
    console.error("Vehicle Deactivate Error:", error);

    // Handle pending dues error
    if (error.code === "PENDING_DUES") {
      return res.status(400).json({
        statusCode: 400,
        message: error.message,
        code: "PENDING_DUES",
        totalDue: error.totalDue,
        pendingCount: error.pendingCount,
        payments: error.payments || [],
      });
    }

    return res
      .status(500)
      .json({ message: "Internal server error", error: error.message });
  }
};

controller.vehicleActivate = async (req, res) => {
  try {
    const { user, params, body } = req;
    const data = await service.vehicleActivate(user, params.id, body);
    return res.status(200).json({ statusCode: 200, message: "success", data });
  } catch (error) {
    return res.status(500).json({ message: "Internal server error", error });
  }
};

controller.checkVehiclePendingDues = async (req, res) => {
  try {
    const { params } = req;
    const vehicleId = params.id;

    // Find customer with this vehicle
    const customer = await require("../../models/customers.model")
      .findOne({ "vehicles._id": vehicleId })
      .lean();
    if (!customer) {
      return res.status(404).json({ message: "Vehicle not found" });
    }

    const duesCheck = await service.checkVehiclePendingDues(
      customer._id,
      vehicleId,
    );

    return res.status(200).json({
      statusCode: 200,
      message: "success",
      data: duesCheck,
    });
  } catch (error) {
    console.error("Check Vehicle Pending Dues Error:", error);
    return res
      .status(500)
      .json({ message: "Internal server error", error: error.message });
  }
};

controller.deactivate = async (req, res) => {
  try {
    const { user, params, body } = req;
    const data = await service.deactivate(user, params.id, body);
    return res.status(200).json({ statusCode: 200, message: "success", data });
  } catch (error) {
    console.error("Customer Deactivate Error:", error);

    // Handle pending dues error
    if (error.code === "PENDING_DUES") {
      return res.status(400).json({
        statusCode: 400,
        message: error.message,
        code: "PENDING_DUES",
        totalDue: error.totalDue,
        pendingCount: error.pendingCount,
        payments: error.payments || [],
      });
    }

    return res
      .status(500)
      .json({ message: "Internal server error", error: error.message });
  }
};

controller.activate = async (req, res) => {
  try {
    const { user, params, body } = req;
    const data = await service.activate(user, params.id, body);
    return res.status(200).json({ statusCode: 200, message: "success", data });
  } catch (error) {
    console.error("Customer Activate Error:", error);
    return res
      .status(500)
      .json({ message: "Internal server error", error: error.message });
  }
};

controller.archive = async (req, res) => {
  try {
    const { user, params, body } = req;
    const data = await service.archive(user, params.id, body);
    return res.status(200).json({ statusCode: 200, message: "success", data });
  } catch (error) {
    return res.status(500).json({ message: "Internal server error", error });
  }
};

controller.washesList = async (req, res) => {
  try {
    const { user, query, params } = req;
    const data = await service.washesList(user, query, params.id);
    return res
      .status(200)
      .json({ statusCode: 200, message: "success", ...data });
  } catch (error) {
    return res.status(500).json({ message: "Internal server error", error });
  }
};

controller.getSOA = async (req, res) => {
  try {
    const { user, query, params } = req;
    const data = await service.getSOA(user, query, params.id);
    return res.status(200).json({ statusCode: 200, message: "success", data });
  } catch (error) {
    if (error === "INVALID-CUSTOMER-ID") {
      return res.status(400).json({
        statusCode: 400,
        message: "Invalid customer id",
      });
    }

    if (error === "CUSTOMER-NOT-FOUND") {
      return res.status(404).json({
        statusCode: 404,
        message: "Customer not found",
      });
    }

    return res
      .status(500)
      .json({
        message: "Internal server error",
        error: error.message || error,
      });
  }
};

controller.exportWashesList = async (req, res) => {
  try {
    const { user, query, params } = req;
    const data = await service.exportWashesList(user, query, params.id);
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Washes Report");
    worksheet.columns = [
      { header: "ID", key: "scheduleId", width: 10 },
      { header: "Date", key: "assignedDate", width: 20 },
      { header: "Status", key: "status", width: 12 },
      { header: "Vehicle No", key: "vehicleNo", width: 15 },
      { header: "Parking No", key: "parkingNo", width: 15 },
      { header: "Building", key: "building", width: 30 },
      { header: "Location", key: "location", width: 30 },
      { header: "Customer Mobile", key: "customerMobile", width: 15 },
      { header: "Customer Name", key: "customerName", width: 20 },
    ];
    data.forEach((row) => worksheet.addRow(row));

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=washes_report_${moment().format("YYYY-MM-DD")}.xlsx`,
    );
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    return res.status(500).json({ message: "Internal server error", error });
  }
};

// --- DOWNLOAD IMPORT TEMPLATE ---
controller.downloadTemplate = async (req, res) => {
  try {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Customers Template");

    worksheet.columns = [
      { header: "First Name", key: "firstName", width: 20 },
      { header: "Last Name", key: "lastName", width: 20 },
      { header: "Mobile (Optional)", key: "mobile", width: 15 },
      { header: "Email", key: "email", width: 25 },
      { header: "Vehicle Registration No*", key: "registration_no", width: 20 },
      { header: "Parking No*", key: "parking_no", width: 15 },
      { header: "Flat No (Optional)", key: "flat_no", width: 18 },
      {
        header: "Schedule Type* (daily/weekly/onetime)",
        key: "schedule_type",
        width: 30,
      },
      { header: "Schedule Days", key: "schedule_days", width: 25 },
      { header: "Amount*", key: "amount", width: 12 },
      { header: "Advance Amount", key: "advance_amount", width: 15 },
      { header: "Start Date (DD/MM/YYYY)", key: "start_date", width: 20 },
      { header: "Onboard Date (DD/MM/YYYY)", key: "onboard_date", width: 22 },
      { header: "Location", key: "location", width: 25 },
      { header: "Building", key: "building", width: 25 },
      { header: "Worker", key: "worker", width: 25 },
    ];

    // EXAMPLE 1: Single customer with MULTIPLE vehicles (same mobile number)
    worksheet.addRow({
      firstName: "Ahmed",
      lastName: "Ali",
      mobile: "971501234567", // Same mobile = same customer
      email: "ahmed@example.com",
      registration_no: "ABC123",
      parking_no: "P-101",
      flat_no: "A-304",
      schedule_type: "daily",
      schedule_days: "Monday,Tuesday,Wednesday,Thursday,Friday",
      amount: "300",
      advance_amount: "100",
      start_date: "01/02/2026",
      onboard_date: "01/02/2026",
      location: "Business Bay",
      building: "U-Bora Tower P1",
      worker: "Enamul Sardar",
    });

    // EXAMPLE 1 continued: Second vehicle for SAME customer (same mobile)
    worksheet.addRow({
      firstName: "Ahmed",
      lastName: "Ali",
      mobile: "971501234567", // ✅ SAME MOBILE = Adds vehicle to above customer
      email: "ahmed@example.com",
      registration_no: "XYZ789", // Different vehicle
      parking_no: "P-102",
      flat_no: "A-304",
      schedule_type: "weekly",
      schedule_days: "Monday,Wednesday,Friday",
      amount: "250",
      advance_amount: "50",
      start_date: "01/02/2026",
      onboard_date: "01/02/2026",
      location: "Business Bay",
      building: "U-Bora Tower P1",
      worker: "Enamul Sardar",
    });

    // EXAMPLE 1 continued: Third vehicle for SAME customer
    worksheet.addRow({
      firstName: "Ahmed",
      lastName: "Ali",
      mobile: "971501234567", // ✅ SAME MOBILE = Adds 3rd vehicle to same customer
      email: "ahmed@example.com",
      registration_no: "DEF456",
      parking_no: "P-103",
      flat_no: "A-304",
      schedule_type: "daily",
      schedule_days: "Monday,Tuesday,Wednesday,Thursday,Friday,Saturday",
      amount: "350",
      advance_amount: "0",
      start_date: "01/02/2026",
      onboard_date: "01/02/2026",
      location: "Business Bay",
      building: "U-Bora Tower P1",
      worker: "Enamul Sardar",
    });

    // EXAMPLE 2: Different customer (different mobile or empty)
    worksheet.addRow({
      firstName: "Sara",
      lastName: "Khan",
      mobile: "971509876543", // ✅ DIFFERENT MOBILE = New customer
      email: "sara@example.com",
      registration_no: "LMN456",
      parking_no: "P-201",
      flat_no: "B-105",
      schedule_type: "onetime",
      schedule_days: "",
      amount: "150",
      advance_amount: "0",
      start_date: "15/02/2026",
      onboard_date: "15/02/2026",
      location: "Dubai Marina",
      building: "Marina Heights",
      worker: "",
    });

    // EXAMPLE 3: Auto-generated mobile (leave empty)
    worksheet.addRow({
      firstName: "John",
      lastName: "Doe",
      mobile: "", // ✅ EMPTY = Auto-generates unique mobile (2000000001, 2000000002, etc)
      email: "john@example.com",
      registration_no: "GHI789",
      parking_no: "P-301",
      flat_no: "C-202",
      schedule_type: "weekly",
      schedule_days: "Sunday,Tuesday,Thursday",
      amount: "200",
      advance_amount: "50",
      start_date: "01/02/2026",
      onboard_date: "01/02/2026",
      location: "",
      building: "",
      worker: "",
    });

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="customers-import-template.xlsx"`,
    );

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error("Template download error:", error);
    return res.status(500).json({ message: "Internal server error", error });
  }
};

// --- IMPORT EXCEL DATA ---
controller.importData = async (req, res) => {
  try {
    const { user } = req;

    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    const fileBuffer = require("fs").readFileSync(
      req.file.filepath || req.file.path,
    );
    const results = await service.importDataFromExcel(user, fileBuffer);

    return res.status(200).json({
      statusCode: 200,
      message: "Import completed",
      data: results,
    });
  } catch (error) {
    console.error("Import error:", error);
    return res
      .status(500)
      .json({ message: "Internal server error", error: error.message });
  }
};
