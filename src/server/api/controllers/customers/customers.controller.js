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
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=customers_${moment().format("YYYY-MM-DD")}.xlsx`
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

// ✅ UPDATED: Import Data
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
    return res.status(500).json({ message: "Internal server error", error });
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
    return res.status(500).json({ message: "Internal server error", error });
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

controller.deactivate = async (req, res) => {
  try {
    const { user, params, body } = req;
    const data = await service.deactivate(user, params.id, body);
    return res.status(200).json({ statusCode: 200, message: "success", data });
  } catch (error) {
    return res.status(500).json({ message: "Internal server error", error });
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
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=washes_report_${moment().format("YYYY-MM-DD")}.xlsx`
    );
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    return res.status(500).json({ message: "Internal server error", error });
  }
};
