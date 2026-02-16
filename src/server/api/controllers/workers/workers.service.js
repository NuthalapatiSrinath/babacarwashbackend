const WorkersModel = require("../../models/workers.model");
const CustomersModel = require("../../models/customers.model");
const JobsModel = require("../../models/jobs.model");
const OnewashModel = require("../../models/onewash.model");
const MallsModel = require("../../models/malls.model");
const BuildingsModel = require("../../models/buildings.model");
const CounterService = require("../../../utils/counters");
const CommonHelper = require("../../../helpers/common.helper");
const AuthHelper = require("../auth/auth.helper");
const oracleService = require("../../../cloud/oracle");
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const moment = require("moment"); // ✅ Required for dates
const InAppNotifications = require("../../../notifications/in-app.notifications");
// ... keep existing imports (WorkersModel, OnewashModel, JobsModel, etc.)
const service = module.exports;

// ==========================================
// 🟢 HELPERS
// ==========================================

const parseExcelDate = (value) => {
  if (!value) return undefined;
  if (typeof value === "number")
    return new Date(Math.round((value - 25569) * 86400 * 1000));
  if (typeof value === "string") {
    const raw = value.trim();
    if (raw.includes("/")) {
      const parts = raw.split("/");
      if (parts.length === 3)
        return new Date(Date.UTC(parts[2], parts[1] - 1, parts[0]));
    }
  }
  const date = new Date(value);
  return isNaN(date.getTime()) ? undefined : date;
};

const getCellText = (cell) => {
  if (!cell || cell.value === null) return "";
  if (typeof cell.value === "object" && cell.value.text)
    return cell.value.text.toString();
  return cell.value.toString();
};

const _uploadFromUrl = async (url, workerId, docType) => {
  try {
    const response = await axios.get(url, { responseType: "arraybuffer" });
    const buffer = Buffer.from(response.data, "binary");
    const tempDir = path.join(__dirname, "../../../../temp");
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
    const ext = path.extname(url).split("?")[0] || ".pdf";
    const tempPath = path.join(tempDir, `${Date.now()}-${docType}${ext}`);
    fs.writeFileSync(tempPath, buffer);
    const oracleFileName = `worker-${workerId}-${docType}-${Date.now()}${ext}`;
    const publicUrl = await oracleService.uploadFile(tempPath, oracleFileName);
    fs.unlinkSync(tempPath);
    return {
      url: publicUrl,
      publicId: oracleFileName,
      filename: oracleFileName,
      uploadedAt: new Date(),
    };
  } catch (error) {
    return null;
  }
};

// ==========================================
// 🟢 WORKER LOGIC
// ==========================================

service.list = async (userInfo, query) => {
  const paginationData = CommonHelper.paginationData(query);
  const findQuery = {
    isDeleted: false,
    status: query.status !== undefined ? Number(query.status) : 1,
    ...(query.search
      ? {
          $or: [
            { name: { $regex: query.search, $options: "i" } },
            { mobile: { $regex: query.search, $options: "i" } },
            { employeeCode: { $regex: query.search, $options: "i" } },
          ],
        }
      : null),

    // --- Supervisor Logic ---
    ...(userInfo.role == "supervisor" && userInfo.service_type == "mall"
      ? { malls: { $in: [userInfo.mall] } }
      : null),
    ...(userInfo.role == "supervisor" && userInfo.service_type == "residence"
      ? {
          buildings: {
            $in: (userInfo.buildings || []).filter((b) => b && b.trim()),
          },
        }
      : null),

    // --- Filters ---
    ...(query.mall ? { malls: { $in: [query.mall] } } : null),
    ...(query.building ? { buildings: { $in: [query.building] } } : null),
    ...(query.site ? { sites: { $in: [query.site] } } : null),
    ...(query.service_type ? { service_type: query.service_type } : null),
  };

  if (Number(query.search)) {
    findQuery.$or.push({ mobile: { $regex: Number(query.search) } });
  }

  const total = await WorkersModel.countDocuments(findQuery);
  const data = await WorkersModel.find(findQuery)
    .sort({ _id: -1 })
    .skip(paginationData.skip)
    .limit(paginationData.limit)
    .populate([
      {
        path: "buildings",
        model: "buildings",
        populate: [{ path: "location_id", model: "locations" }],
      },
      { path: "malls", model: "malls" },
      { path: "sites", model: "sites" },
    ])
    .lean();

  return { total, data };
};

service.info = async (userInfo, id) => {
  return WorkersModel.findOne({ _id: id, isDeleted: false })
    .populate([
      { path: "buildings", model: "buildings" },
      { path: "malls", model: "malls" },
      { path: "sites", model: "sites" },
    ])
    .lean();
};

service.create = async (userInfo, payload) => {
  const query = { isDeleted: false, $or: [{ mobile: payload.mobile }] };
  if (payload.employeeCode && payload.employeeCode.trim())
    query.$or.push({ employeeCode: payload.employeeCode });

  const userExists = await WorkersModel.countDocuments(query);
  if (userExists) {
    throw "USER-EXISTS";
  }

  // Remove employeeCode if it's empty to avoid duplicate key error
  if (!payload.employeeCode || payload.employeeCode.trim() === "") {
    delete payload.employeeCode;
  }

  const id = await CounterService.id("workers");
  const data = {
    createdBy: userInfo._id,
    updatedBy: userInfo._id,
    id,
    ...payload,
    password: payload.password,
    hPassword: payload.password
      ? AuthHelper.getPasswordHash(payload.password)
      : undefined,
  };
  const worker = await new WorkersModel(data).save();

  // Send notification to admins/managers about new worker creation
  try {
    await InAppNotifications.send({
      worker: userInfo._id,
      message: `New worker "${payload.name}" has been created successfully`,
      createdBy: userInfo._id,
    });
  } catch (error) {
    console.error("Failed to send notification:", error);
  }

  return worker;
};

service.update = async (userInfo, id, payload) => {
  const { password, ...updateData } = payload;

  // Remove employeeCode if it's empty to avoid duplicate key error
  if (
    updateData.employeeCode === "" ||
    updateData.employeeCode === null ||
    updateData.employeeCode === undefined
  ) {
    delete updateData.employeeCode;
  }

  const data = {
    updatedBy: userInfo._id,
    ...updateData,
    ...(password
      ? {
          password: password,
          hPassword: AuthHelper.getPasswordHash(password),
        }
      : {}),
  };
  await WorkersModel.updateOne({ _id: id }, { $set: data });

  // Send notification about worker update
  try {
    const worker = await WorkersModel.findOne({ _id: id });
    await InAppNotifications.send({
      worker: userInfo._id,
      message: `Worker "${worker?.name || "Unknown"}" details have been updated`,
      createdBy: userInfo._id,
    });
  } catch (error) {
    console.error("Failed to send notification:", error);
  }
};

service.delete = async (userInfo, id, payload) => {
  const isExists = await CustomersModel.countDocuments({
    isDeleted: false,
    "vehicles.worker": id,
  });
  if (isExists) {
    throw "This worker is currently assigned to customers and cannot be deleted";
  }

  // Get worker details before deletion
  const worker = await WorkersModel.findOne({ _id: id });

  const result = await WorkersModel.updateOne(
    { _id: id },
    { isDeleted: true, deletedBy: userInfo._id },
  );

  // Send notification about worker deletion
  try {
    await InAppNotifications.send({
      worker: userInfo._id,
      message: `Worker "${worker?.name || "Unknown"}" has been deleted`,
      createdBy: userInfo._id,
    });
  } catch (error) {
    console.error("Failed to send notification:", error);
  }

  return result;
};

service.undoDelete = async (userInfo, id) => {
  return await WorkersModel.updateOne(
    { _id: id },
    { isDeleted: false, updatedBy: userInfo._id },
  );
};

service.deactivate = async (userInfo, id, payload) => {
  await CustomersModel.updateMany(
    { "vehicles.worker": id },
    { $set: { "vehicles.$.worker": payload.worker } },
  );
  await JobsModel.updateMany(
    { worker: id },
    { $set: { worker: payload.worker } },
  );
  const updateData = {
    status: 2,
    deactivateReason: payload.deactivateReason,
    ...(payload.otherReason ? { otherReason: payload.otherReason } : null),
    transferredTo: payload.worker,
  };
  await WorkersModel.updateOne({ _id: id }, { $set: updateData });
};

service.customersList = async (userInfo, query, workerId) => {
  return await CustomersModel.find({ "vehicles.worker": workerId })
    .populate([
      { path: "building", model: "buildings" },
      { path: "location", model: "locations" },
    ])
    .lean();
};

service.washesList = async (userInfo, query, workerId) => {
  const paginationData = CommonHelper.paginationData(query);
  const findQuery = { isDeleted: false, worker: workerId };

  if (query.startDate && query.endDate) {
    findQuery.createdAt = {
      $gte: new Date(query.startDate),
      $lte: new Date(query.endDate),
    };
  }

  if (query.customer && query.customer.trim())
    findQuery.customer = query.customer;
  if (query.building && query.building.trim())
    findQuery.building = query.building;
  if (query.mall && query.mall.trim()) findQuery.mall = query.mall;

  if (query.search) {
    const customers = await CustomersModel.find({
      isDeleted: false,
      $or: [
        { "vehicles.registration_no": { $regex: query.search, $options: "i" } },
        { "vehicles.parking_no": { $regex: query.search, $options: "i" } },
      ],
    })
      .select("_id vehicles")
      .lean();

    if (customers.length) {
      let vehicleIds = [];
      for (const customer of customers) {
        if (customer.vehicles) {
          for (const vehicle of customer.vehicles) {
            vehicleIds.push(vehicle._id);
          }
        }
      }
      if (vehicleIds.length > 0) {
        findQuery.$or = [{ vehicle: { $in: vehicleIds } }];
      } else {
        return { total: 0, data: [] };
      }
    } else {
      return { total: 0, data: [] };
    }
  }

  let total = 0;
  let data = [];

  // Logic to switch collections based on service type
  if (query.service_type && query.service_type == "residence") {
    await JobsModel.updateMany(
      {
        $or: [
          { building: "" },
          { location: "" },
          { mall: "" },
          { customer: "" },
        ],
      },
      { $unset: { building: "", location: "", mall: "", customer: "" } },
    );
    total = await JobsModel.countDocuments(findQuery);
    data = await JobsModel.find(findQuery)
      .sort({ completedDate: -1 })
      .skip(paginationData.skip)
      .limit(paginationData.limit)
      .populate([
        { path: "building", model: "buildings" },
        { path: "location", model: "locations" },
        { path: "mall", model: "malls" },
        {
          path: "customer",
          model: "customers",
          select: "firstName lastName mobile vehicles",
          populate: [
            { path: "building", model: "buildings" },
            { path: "location", model: "locations" },
          ],
        },
      ])
      .lean();
    data.forEach((iterator) => {
      if (iterator.customer && iterator.customer.vehicles) {
        iterator.vehicle = iterator.customer.vehicles.find(
          (e) => e._id.toString() == iterator.vehicle.toString(),
        );
      }
    });
  }

  let onewashData = [];
  let onewashTotal = 0;

  if (query.service_type !== "residence") {
    await OnewashModel.updateMany(
      {
        $or: [
          { building: "" },
          { location: "" },
          { mall: "" },
          { customer: "" },
        ],
      },
      { $unset: { building: "", location: "", mall: "", customer: "" } },
    );
    onewashTotal = await OnewashModel.countDocuments(findQuery);
    onewashData = await OnewashModel.find(findQuery)
      .sort({ completedDate: -1 })
      .skip(paginationData.skip)
      .limit(paginationData.limit)
      .populate([
        { path: "building", model: "buildings" },
        { path: "location", model: "locations" },
        { path: "mall", model: "malls" },
        {
          path: "customer",
          model: "customers",
          select: "firstName lastName mobile",
          populate: [
            { path: "building", model: "buildings" },
            { path: "location", model: "locations" },
          ],
        },
      ])
      .lean();
    onewashData = onewashData.map((e) => {
      return {
        ...e,
        vehicle: {
          registration_no: e.registration_no,
          parking_no: e.parking_no,
        },
      };
    });
  }

  return { total: total + onewashTotal, data: [...data, ...onewashData] };
};

// ==========================================
// 🔵 NEW FEATURES (FROM STAFF)
// ==========================================

// --- DOCUMENTS & IMAGES ---
service.uploadProfileImage = async (userInfo, id, fileData) => {
  const worker = await WorkersModel.findById(id);
  if (!worker) throw new Error("Worker not found");
  if (worker.profileImage?.filename) {
    try {
      await oracleService.deleteFile(worker.profileImage.filename);
    } catch (e) {}
  }
  const ext = path.extname(fileData.filename) || ".jpg";
  const oracleFileName = `worker-profile-${id}-${Date.now()}${ext}`;
  const publicUrl = await oracleService.uploadFile(
    fileData.path,
    oracleFileName,
  );
  try {
    fs.unlinkSync(fileData.path);
  } catch (e) {}
  const imageData = {
    url: publicUrl,
    publicId: oracleFileName,
    filename: oracleFileName,
  };
  await WorkersModel.updateOne(
    { _id: id },
    { $set: { profileImage: imageData, updatedBy: userInfo._id } },
  );
  return imageData;
};

service.uploadDocument = async (userInfo, id, documentType, fileData) => {
  const fieldMap = {
    Passport: "passportDocument",
    Visa: "visaDocument",
    "Emirates ID": "emiratesIdDocument",
  };
  const fieldName = fieldMap[documentType];
  if (!fieldName) throw new Error("Invalid document type");

  const worker = await WorkersModel.findById(id);
  if (!worker) throw new Error("Worker not found");
  if (worker[fieldName]?.filename) {
    try {
      await oracleService.deleteFile(worker[fieldName].filename);
    } catch (e) {}
  }
  const ext = path.extname(fileData.filename) || ".pdf";
  const oracleFileName = `worker-${id}-${documentType.replace(/\s+/g, "")}-${Date.now()}${ext}`;
  const publicUrl = await oracleService.uploadFile(
    fileData.path,
    oracleFileName,
  );
  try {
    fs.unlinkSync(fileData.path);
  } catch (e) {}
  const docData = {
    url: publicUrl,
    publicId: oracleFileName,
    filename: oracleFileName,
    uploadedAt: new Date(),
  };
  await WorkersModel.updateOne(
    { _id: id },
    { $set: { [fieldName]: docData, updatedBy: userInfo._id } },
  );
  return docData;
};

service.deleteDocument = async (userInfo, id, documentType) => {
  const worker = await WorkersModel.findById(id);
  const fieldMap = {
    Passport: "passportDocument",
    Visa: "visaDocument",
    "Emirates ID": "emiratesIdDocument",
  };
  const fieldName = fieldMap[documentType];
  if (worker[fieldName]?.filename)
    await oracleService.deleteFile(worker[fieldName].filename);
  await WorkersModel.updateOne(
    { _id: id },
    { $unset: { [fieldName]: 1 }, $set: { updatedBy: userInfo._id } },
  );
};

service.getDocument = async (id, documentType) => {
  const worker = await WorkersModel.findById(id);
  const fieldMap = {
    Passport: "passportDocument",
    Visa: "visaDocument",
    "Emirates ID": "emiratesIdDocument",
  };
  return worker ? worker[fieldMap[documentType]] : null;
};

// --- ALERTS ---
service.getExpiringDocuments = async () => {
  const twoMonths = new Date();
  twoMonths.setMonth(twoMonths.getMonth() + 2);
  const today = new Date();
  const workers = await WorkersModel.find({
    isDeleted: false,
    $or: [
      { passportExpiry: { $gte: today, $lte: twoMonths } },
      { visaExpiry: { $gte: today, $lte: twoMonths } },
      { emiratesIdExpiry: { $gte: today, $lte: twoMonths } },
    ],
  }).lean();
  return workers.map((w) => ({
    _id: w._id,
    name: w.name,
    employeeCode: w.employeeCode,
    expiringDocs: [
      w.passportExpiry && w.passportExpiry <= twoMonths ? "Passport" : null,
      w.visaExpiry && w.visaExpiry <= twoMonths ? "Visa" : null,
      w.emiratesIdExpiry && w.emiratesIdExpiry <= twoMonths
        ? "Emirates ID"
        : null,
    ].filter(Boolean),
  }));
};

// ==========================================
// 🔵 IMPORT / EXPORT / TEMPLATE
// ==========================================

service.generateTemplate = async () => {
  const ExcelJS = require("exceljs");
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Workers Template");

  worksheet.columns = [
    { header: "Name", key: "name", width: 30 },
    { header: "Mobile", key: "mobile", width: 15 },
    { header: "Employee Code", key: "employeeCode", width: 15 },
    // ✅ REMOVED COMPANY (Col 4)
    { header: "Joining Date (DD/MM/YYYY)", key: "joiningDate", width: 20 },
    { header: "Passport No.", key: "passportNumber", width: 15 },
    {
      header: "Passport Expiry (DD/MM/YYYY)",
      key: "passportExpiry",
      width: 20,
    },
    { header: "Visa No.", key: "visaNumber", width: 15 },
    { header: "Visa Expiry (DD/MM/YYYY)", key: "visaExpiry", width: 20 },
    { header: "EID No.", key: "emiratesId", width: 20 },
    { header: "EID Expiry (DD/MM/YYYY)", key: "emiratesIdExpiry", width: 20 },
  ];

  worksheet.addRow({
    name: "John Doe Sample",
    mobile: "971501234567",
    employeeCode: "EMP001",
    // Company was here
    joiningDate: "01/01/2024",
    passportNumber: "N123456",
    passportExpiry: "01/01/2030",
    visaNumber: "V987654",
    visaExpiry: "01/01/2026",
    emiratesId: "784-1234-1234567-1",
    emiratesIdExpiry: "01/01/2026",
  });

  return await workbook.xlsx.writeBuffer();
};

service.exportData = async (userInfo, query) => {
  const ExcelJS = require("exceljs");
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Workers");

  const findQuery = {
    isDeleted: false,
    status: query.status ? Number(query.status) : 1,
  };

  if (userInfo.role == "supervisor" && userInfo.service_type == "mall") {
    findQuery.malls = { $in: [userInfo.mall] };
  }
  if (userInfo.role == "supervisor" && userInfo.service_type == "residence") {
    findQuery.buildings = {
      $in: (userInfo.buildings || []).filter((b) => b && b.trim()),
    };
  }

  const workers = await WorkersModel.find(findQuery)
    .populate("malls")
    .populate("buildings")
    .populate("sites")
    .lean();

  worksheet.columns = [
    { header: "Name", key: "name", width: 25 },
    { header: "Mobile", key: "mobile", width: 15 },
    { header: "Employee Code", key: "employeeCode", width: 15 },
    { header: "Company", key: "companyName", width: 20 },
    { header: "Joining Date", key: "joiningDate", width: 20 },
    { header: "Passport Number", key: "passportNumber", width: 15 },
    { header: "Passport Expiry", key: "passportExpiry", width: 20 },
    { header: "Visa Number", key: "visaNumber", width: 15 },
    { header: "Visa Expiry", key: "visaExpiry", width: 20 },
    { header: "EID Number", key: "emiratesId", width: 15 },
    { header: "EID Expiry", key: "emiratesIdExpiry", width: 20 },
  ];

  workers.forEach((w) => {
    worksheet.addRow({
      name: w.name,
      mobile: w.mobile,
      employeeCode: w.employeeCode,
      companyName: w.companyName,
      joiningDate: w.joiningDate,
      passportNumber: w.passportNumber,
      passportExpiry: w.passportExpiry,
      visaNumber: w.visaNumber,
      visaExpiry: w.visaExpiry,
      emiratesId: w.emiratesId,
      emiratesIdExpiry: w.emiratesIdExpiry,
    });
  });
  return await workbook.xlsx.writeBuffer();
};

// ==========================================
// 🔵 DEBUGGED IMPORT FUNCTION
// ==========================================

service.importDataFromExcel = async (userInfo, fileBuffer) => {
  console.log("🚀 [IMPORT START] Processing Excel file...");

  const ExcelJS = require("exceljs");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(fileBuffer);
  const worksheet = workbook.getWorksheet(1);

  if (!worksheet) {
    console.error("❌ [IMPORT ERROR] No worksheet found");
    return { success: 0, errors: [{ error: "No worksheet found" }] };
  }

  console.log(`📊 [IMPORT INFO] Total rows in file: ${worksheet.rowCount}`);

  const excelData = [];

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;

    const rawName = getCellText(row.getCell(1));
    const rawMobile = getCellText(row.getCell(2));

    console.log(
      `🔍 Reading Row ${rowNumber}: Name="${rawName}", Mobile="${rawMobile}"`,
    );

    if (!rawName && !rawMobile) {
      console.log(`⚠️ Skipped empty row at ${rowNumber}`);
      return;
    }

    excelData.push({
      name: rawName,
      mobile: rawMobile,
      employeeCode: getCellText(row.getCell(3)),

      // ✅ COLUMN MAPPING FIX:
      // Col 1: Name, Col 2: Mobile, Col 3: Code
      // Col 4: Joining Date (This was previously mapped to companyName)
      joiningDate: row.getCell(4).value,
      passportNumber: getCellText(row.getCell(5)),
      passportExpiry: row.getCell(6).value,
      visaNumber: getCellText(row.getCell(7)),
      visaExpiry: row.getCell(8).value,
      emiratesId: getCellText(row.getCell(9)),
      emiratesIdExpiry: row.getCell(10).value,
    });
  });

  console.log(`✅ [IMPORT INFO] Extracted ${excelData.length} valid rows.`);

  const results = { success: 0, errors: [] };

  for (const row of excelData) {
    try {
      if (!row.mobile) {
        throw new Error("Mobile number is required");
      }

      // Find match by Mobile OR Emp Code (including deleted)
      const searchCriteria = [{ mobile: row.mobile }];
      if (row.employeeCode)
        searchCriteria.push({ employeeCode: row.employeeCode });

      let worker = await WorkersModel.findOne({ $or: searchCriteria });

      const workerData = {
        name: row.name,
        mobile: row.mobile,
        employeeCode: row.employeeCode,

        // ✅ EXPLICITLY RESET COMPANY NAME TO EMPTY
        companyName: "",

        service_type: "residence",
        malls: [],
        buildings: [],
        sites: [],

        joiningDate: parseExcelDate(row.joiningDate),
        passportNumber: row.passportNumber,
        passportExpiry: parseExcelDate(row.passportExpiry),
        visaNumber: row.visaNumber,
        visaExpiry: parseExcelDate(row.visaExpiry),
        emiratesId: row.emiratesId,
        emiratesIdExpiry: parseExcelDate(row.emiratesIdExpiry),

        updatedBy: userInfo._id,
      };

      if (worker) {
        console.log(`🔄 Updating: ${row.name}`);

        // If reactivating a deleted worker, clear sensitive fields too
        if (worker.isDeleted) {
          console.log(`♻️ Reactivating and Wiping Old Data for: ${row.name}`);
          workerData.isDeleted = false;
          workerData.status = 1;
          workerData.email = "";
          workerData.password = "";
          workerData.hPassword = "";
          workerData.profileImage = null;
          workerData.passportDocument = null;
          workerData.visaDocument = null;
          workerData.emiratesIdDocument = null;
        }

        await WorkersModel.updateOne({ _id: worker._id }, { $set: workerData });
      } else {
        console.log(`➕ Creating: ${row.name}`);
        const id = await CounterService.id("workers");
        workerData.id = id;
        workerData.createdBy = userInfo._id;
        await new WorkersModel(workerData).save();
      }
      results.success++;
    } catch (err) {
      console.error(`❌ Row Error (${row.name}):`, err.message);
      results.errors.push({ row, error: err.message });
    }
  }

  console.log("🏁 [IMPORT COMPLETE]", results);
  return results;
};
service.monthlyRecords = async (userInfo, query) => {
  const year = parseInt(query.year);
  const month = parseInt(query.month); // 0 = Jan
  const targetWorkerId = query.workerId; // ✅ NEW: Filter by specific worker

  if (isNaN(year) || isNaN(month)) {
    throw new Error("Invalid Year or Month");
  }

  // Date Range
  const startDate = moment(new Date(year, month, 1)).startOf("month");
  const endDate = moment(new Date(year, month, 1)).endOf("month");
  const daysInMonth = startDate.daysInMonth();

  // 1. Build Queries
  const onewashQuery = {
    isDeleted: false,
    createdAt: { $gte: startDate.toDate(), $lte: endDate.toDate() },
    worker: { $exists: true, $ne: null },
  };

  const jobsQuery = {
    isDeleted: false,
    status: "completed",
    assignedDate: { $gte: startDate.toDate(), $lte: endDate.toDate() },
    worker: { $exists: true, $ne: null },
  };

  // ✅ Apply Single Worker Filter
  if (targetWorkerId) {
    onewashQuery.worker = targetWorkerId;
    jobsQuery.worker = targetWorkerId;
  }

  // Supervisor Limits
  if (userInfo.role === "supervisor") {
    if (userInfo.service_type === "mall") onewashQuery.mall = userInfo.mall;
    if (userInfo.service_type === "residence")
      onewashQuery.building = { $in: userInfo.buildings };
    if (userInfo.service_type === "residence")
      jobsQuery.building = { $in: userInfo.buildings };
  }

  // 2. Fetch Data
  const [onewashData, jobsData] = await Promise.all([
    OnewashModel.find(onewashQuery)
      .populate("worker", "name employeeCode mobile service_type")
      .lean(),
    JobsModel.find(jobsQuery)
      .populate("worker", "name employeeCode mobile service_type")
      .lean(),
  ]);

  // 3. Aggregate
  const workerMap = {};

  const processJob = (job, dateField) => {
    if (!job.worker || !job.worker._id) return;

    const wId = job.worker._id.toString();
    const dateVal = job[dateField];
    if (!dateVal) return;

    const day = moment(dateVal).date(); // 1-31

    if (!workerMap[wId]) {
      workerMap[wId] = {
        id: wId,
        name: job.worker.name || "Unknown",
        code: job.worker.employeeCode || "N/A",
        mobile: job.worker.mobile || "-",
        serviceType: job.worker.service_type || "N/A",
        days: {},
        totalCars: 0,
        totalTip: 0,
      };
    }

    // Counts
    workerMap[wId].days[day] = (workerMap[wId].days[day] || 0) + 1;
    workerMap[wId].totalCars++;

    // Tips
    if (job.tip_amount) {
      const tip = Number(job.tip_amount);
      if (!isNaN(tip)) workerMap[wId].totalTip += tip;
    }
  };

  onewashData.forEach((job) => processJob(job, "createdAt"));
  jobsData.forEach((job) => processJob(job, "completedDate"));

  // 4. Format
  const gridData = Object.values(workerMap).map((w) => {
    const dayData = {};
    for (let d = 1; d <= daysInMonth; d++) {
      dayData[`day_${d}`] = w.days[d] || 0;
    }
    return {
      ...w, // includes id, name, mobile, serviceType
      ...dayData,
      total: w.totalCars,
      tips: w.totalTip,
    };
  });

  return {
    meta: { year, month, daysInMonth },
    data: gridData,
  };
};
// ... existing imports

// ==========================================
// 🔵 YEARLY / MULTI-MONTH RECORD BREAKDOWN
// ==========================================
service.yearlyRecords = async (userInfo, query) => {
  const workerId = query.workerId;
  const mode = query.mode; // 'year' or 'last6'
  const year = parseInt(query.year) || new Date().getFullYear();

  if (!workerId) throw new Error("Worker ID is required");

  let startDate, endDate;

  // 1. Calculate Date Range
  if (mode === "last6") {
    // Last 6 months including current
    startDate = moment().subtract(5, "months").startOf("month");
    endDate = moment().endOf("month");
  } else {
    // Specific Year (Jan 1 - Dec 31)
    startDate = moment(new Date(year, 0, 1)).startOf("day");
    endDate = moment(new Date(year, 11, 31)).endOf("day");
  }

  console.log(
    `📊 Multi-Month Report: ${startDate.format("YYYY-MM-DD")} to ${endDate.format("YYYY-MM-DD")}`,
  );

  // 2. Fetch Data
  const onewashQuery = {
    isDeleted: false,
    createdAt: { $gte: startDate.toDate(), $lte: endDate.toDate() },
    worker: workerId,
  };

  const jobsQuery = {
    isDeleted: false,
    status: "completed",
    completedDate: { $gte: startDate.toDate(), $lte: endDate.toDate() },
    worker: workerId,
  };

  const [onewashData, jobsData] = await Promise.all([
    OnewashModel.find(onewashQuery).select("createdAt tip_amount").lean(),
    JobsModel.find(jobsQuery).select("completedDate").lean(),
  ]);

  // 3. Generate Month Buckets
  // We need to create an array of months based on the range
  const monthsData = [];
  let current = startDate.clone();

  while (current.isSameOrBefore(endDate, "month")) {
    monthsData.push({
      key: current.format("YYYY-MM"), // Unique key for mapping
      label: current.format("MMMM YYYY"), // Display Label
      daysInMonth: current.daysInMonth(),
      days: {}, // Will hold 1:5, 2:3, etc.
      totalCars: 0,
      totalTips: 0,
    });
    current.add(1, "month");
  }

  // 4. Processing Helper
  const processJob = (job, dateField, type) => {
    const dateVal = job[dateField];
    if (!dateVal) return;

    const m = moment(dateVal);
    const monthKey = m.format("YYYY-MM");
    const day = m.date(); // 1-31

    const monthObj = monthsData.find((md) => md.key === monthKey);
    if (monthObj) {
      // Increment Day
      monthObj.days[day] = (monthObj.days[day] || 0) + 1;

      // Increment Totals
      monthObj.totalCars++;
      if (type === "onewash" && job.tip_amount) {
        monthObj.totalTips += Number(job.tip_amount) || 0;
      }
    }
  };

  // Process
  onewashData.forEach((job) => processJob(job, "createdAt", "onewash"));
  jobsData.forEach((job) => processJob(job, "completedDate", "residence"));

  // 5. Final Formatting for Grid
  // Convert sparse 'days' object to full day_1...day_31 properties
  const gridData = monthsData.map((m) => {
    const dayProps = {};
    for (let d = 1; d <= 31; d++) {
      dayProps[`day_${d}`] = d <= m.daysInMonth ? m.days[d] || 0 : null; // null for invalid days (e.g. Feb 30)
    }
    return {
      month: m.label,
      ...dayProps,
      total: m.totalCars,
      tips: m.totalTips,
    };
  });

  // Calculate Grand Total for the whole period
  const grandTotal = gridData.reduce(
    (acc, curr) => ({
      cars: acc.cars + curr.total,
      tips: acc.tips + curr.tips,
    }),
    { cars: 0, tips: 0 },
  );

  return {
    period: mode === "last6" ? "Last 6 Months" : `Year ${year}`,
    data: gridData,
    grandTotal,
  };
};
