const csv = require("fast-csv");
const service = require("./customers.service");
const controller = module.exports;
const ExcelJS = require("exceljs");

// ✅ Updated Excel Export
controller.exportData = async (req, res) => {
  try {
    const data = await service.exportData(req.user, req.query);
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Customers");

    // Columns matched to your UI and Service logic
    worksheet.columns = [
      { header: "Customer Name", key: "firstName", width: 20 },
      { header: "Mobile", key: "mobile", width: 15 },
      { header: "Vehicle", key: "registration_no", width: 15 },
      { header: "Schedule", key: "schedule_type", width: 15 },
      { header: "Amount", key: "amount", width: 10 },
      { header: "Advance", key: "advance_amount", width: 10 },
      { header: "Start Date", key: "start_date", width: 15 },
    ];

    worksheet.addRows(data);

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=Customers_${moment().format("YYYY-MM-DD")}.xlsx`
    );

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error("Export Error:", error);
    res.status(500).json({ message: "Export failed" });
  }
};
// ✅ Updated Excel Import
// Expected Excel Format (Columns A-M):
// A: Customer Name | B: Mobile | C: Email | D: Vehicle No | E: Parking No 
// F: Building | G: Flat No | H: Amount | I: Advance | J: Cleaner Name 
// K: Schedule Type | L: Schedule Days | M: Start Date
controller.importData = async (req, res) => {
  try {
    console.log("🔵 [IMPORT] Starting import process...");
    
    // Handling Formidable file structure from UploadHelper
    const file = req.files?.file || req.file; 
    if (!file) {
      console.log("❌ [IMPORT] No file found");
      return res.status(400).json({ message: "No file uploaded" });
    }

    console.log("📁 [IMPORT] File received:", file.name || file.originalFilename);

    const workbook = new ExcelJS.Workbook();
    const filePath = file.filepath || file.path;
    if (!filePath) {
      console.log("❌ [IMPORT] File path missing");
      return res.status(400).json({ message: "File path not found" });
    }
    console.log("📂 [IMPORT] Reading file from:", filePath);
    await workbook.xlsx.readFile(filePath);
    // Debug: List all worksheet names
    console.log("📄 [IMPORT] All worksheet names:", workbook.worksheets.map(ws => ws.name));
    const worksheet = workbook.getWorksheet(1);
    if (!worksheet) {
      console.log("❌ [IMPORT] No worksheet found");
      return res.status(400).json({ message: "No worksheet found in Excel file" });
    }
    console.log("📄 [IMPORT] Using worksheet:", worksheet.name);
    console.log("📄 [IMPORT] Worksheet rowCount:", worksheet.rowCount, "actualRowCount:", worksheet.actualRowCount);
    const customers = [];
    // Use for loop for row iteration
    console.log("🔄 [IMPORT] Starting row iteration...");
    for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber++) {
      const row = worksheet.getRow(rowNumber);
      // Debug: Print each row's values
      console.log(`🔎 [IMPORT] Row ${rowNumber} values:`, row.values);
      if (!row.hasValues) {
        console.log(`⏭️ [IMPORT] Skipping empty row ${rowNumber}`);
        continue;
      }
      // Parse name into firstName and lastName
      const fullName = row.getCell(1).value?.toString() || "";
      const nameParts = fullName.trim().split(" ");
      const firstName = nameParts[0] || "";
      const lastName = nameParts.slice(1).join(" ") || "";
      const customerData = {
        firstName,
        lastName,
        mobile: row.getCell(2).value?.toString(),
        email: row.getCell(3).value?.toString(),
        registration_no: row.getCell(4).value?.toString(),
        parking_no: row.getCell(5).value?.toString(),
        building: row.getCell(6).value?.toString(),
        flat_no: row.getCell(7).value?.toString(),
        amount: parseFloat(row.getCell(8).value) || 0,
        advance_amount: parseFloat(row.getCell(9).value) || 0,
        worker: row.getCell(10).value?.toString(),
        schedule_type: row.getCell(11).value?.toString() || "daily",
        schedule_days: row.getCell(12).value?.toString(),
        start_date: row.getCell(13).value ? new Date(row.getCell(13).value) : new Date(),
      };
      console.log(`👤 [IMPORT] Row ${rowNumber} parsed:`, customerData);
      customers.push(customerData);
    }
    console.log(`📦 [IMPORT] Total customers parsed: ${customers.length}`);

    if (customers.length === 0) {
      console.log("❌ [IMPORT] No customer data found");
      return res.status(400).json({ message: "No data found in Excel file" });
    }

    console.log(`✅ [IMPORT] Parsed ${customers.length} customers, sending to service...`);
    console.log("🔍 [IMPORT] User info:", req.user?._id || req.userInfo?._id);
    console.log("🔍 [IMPORT] Customers array:", JSON.stringify(customers, null, 2));

    const result = await service.importData(req.user || req.userInfo, customers);
    
    console.log("🎉 [IMPORT] Import completed:", result);
    
    res.status(200).json({ 
      statusCode: 200, 
      success: result.success > 0,
      message: `Import completed: ${result.success} success, ${result.errors?.length || 0} errors`, 
      data: result 
    });
  } catch (error) {
    console.error("💥 [IMPORT] Error:", error);
    console.error("💥 [IMPORT] Stack:", error.stack);
    res.status(500).json({ 
      statusCode: 500,
      success: false,
      message: error.message || "Import failed", 
      error: String(error) 
    });
  }
};

controller.list = async (req, res) => {
  try {
    console.log("📋 [CUSTOMERS CONTROLLER] List request received:", req.query);
    const { user, query } = req;
    const data = await service.list(user, query);
    console.log("✅ [CUSTOMERS CONTROLLER] List success, total:", data.total);
    return res
      .status(200)
      .json({ statusCode: 200, message: "success", ...data });
  } catch (error) {
    console.error("❌ [CUSTOMERS CONTROLLER] List error:", error);
    return res.status(500).json({ message: "Internal server error", error });
  }
};

controller.info = async (req, res) => {
  try {
    const { user, params } = req;
    const data = await service.info(user, params.id);
    return res.status(200).json({ statusCode: 200, message: "success", data });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal server error", error });
  }
};

controller.create = async (req, res) => {
  try {
    const { user, body } = req;
    const data = await service.create(user, body);
    return res.status(200).json({ statusCode: 200, message: "success", data });
  } catch (error) {
    if (error == "USER-EXISTS") {
      return res.status(409).json({
        statusCode: 409,
        message: "User email or mobile already registered",
        error,
      });
    }
    console.error(error);
    return res.status(500).json({ message: "Internal server error", error });
  }
};

controller.update = async (req, res) => {
  try {
    const { user, params, body } = req;
    const data = await service.update(user, params.id, body);
    return res.status(200).json({ statusCode: 200, message: "success", data });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal server error", error });
  }
};

controller.delete = async (req, res) => {
  try {
    const { user, params, body } = req;
    const data = await service.delete(user, params.id);
    return res.status(200).json({ statusCode: 200, message: "success", data });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal server error", error });
  }
};

controller.undoDelete = async (req, res) => {
  try {
    const { user, params } = req;
    const data = await service.undoDelete(user, params.id);
    return res.status(200).json({ statusCode: 200, message: "success", data });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal server error", error });
  }
};

controller.vehicleDeactivate = async (req, res) => {
  try {
    const { user, params, body } = req;
    const data = await service.vehicleDeactivate(user, params.id, body);
    return res.status(200).json({ statusCode: 200, message: "success", data });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal server error", error });
  }
};

controller.vehicleActivate = async (req, res) => {
  try {
    const { user, params, body } = req;
    const data = await service.vehicleActivate(user, params.id, body);
    return res.status(200).json({ statusCode: 200, message: "success", data });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal server error", error });
  }
};

controller.deactivate = async (req, res) => {
  try {
    const { user, params, body } = req;
    const data = await service.deactivate(user, params.id, body);
    return res.status(200).json({ statusCode: 200, message: "success", data });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal server error", error });
  }
};

controller.archive = async (req, res) => {
  try {
    const { user, params, body } = req;
    const data = await service.archive(user, params.id, body);
    return res.status(200).json({ statusCode: 200, message: "success", data });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal server error", error });
  }
};

controller.importData = async (req, res) => {
  try {
    const { user, body } = req;
    const data = await service.importData(user, body);
    return res.status(200).json({ statusCode: 200, message: "success", data });
  } catch (error) {
    if (typeof error == "string") {
      return res.status(400).json({ message: error });
    }
    console.error(error);
    return res
      .status(200)
      .json({ status: false, message: "Internal server error", error });
  }
};

controller.exportData = async (req, res) => {
  try {
    const { user, query } = req;
    const data = await service.exportData(user, query);
    res.setHeader("Content-Disposition", 'attachment; filename="output.csv"');
    res.setHeader("Content-Type", "text/csv");
    csv.write(data, { headers: true }).pipe(res);
  } catch (error) {
    console.error(error);
    return res
      .status(200)
      .json({ status: false, message: "Internal server error", error });
  }
};

controller.washesList = async (req, res) => {
  try {
    console.log("📋 [CUSTOMERS CONTROLLER] WashesList request received");
    console.log("   Customer ID:", req.params.id);
    console.log("   Query:", req.query);
    const { user, query, params } = req;
    const data = await service.washesList(user, query, params.id);
    console.log(
      "✅ [CUSTOMERS CONTROLLER] WashesList success, total:",
      data.total
    );
    console.log("   Records returned:", data.data?.length);
    return res
      .status(200)
      .json({ statusCode: 200, message: "success", ...data });
  } catch (error) {
    console.error("❌ [CUSTOMERS CONTROLLER] WashesList error:", error);
    return res.status(500).json({ message: "Internal server error", error });
  }
};

controller.exportWashesList = async (req, res) => {
  try {
    const ExcelJS = require("exceljs");
    const moment = require("moment");
    const { user, query, params } = req;
    const data = await service.exportWashesList(user, query, params.id);

    // Create a new workbook and worksheet
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Washes Report");

    // Define columns
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

    // Style the header row
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF4A90E2" },
    };
    worksheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };

    // Add rows
    data.forEach((row) => {
      worksheet.addRow(row);
    });

    // Set response headers for Excel download
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=washes_report_${moment().format("YYYY-MM-DD")}.xlsx`
    );

    // Write to response
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ status: false, message: "Internal server error", error });
  }
};
