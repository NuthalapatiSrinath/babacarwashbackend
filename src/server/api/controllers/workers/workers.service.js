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
// 🟢 EXISTING WORKER LOGIC (PRESERVED)
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
            { employeeCode: { $regex: query.search, $options: "i" } }, // Added Search by Employee Code
          ],
        }
      : null),
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
    ...(query.mall ? { malls: { $in: [query.mall] } } : null),
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
    ])
    .lean();

  return { total, data };
};

service.info = async (userInfo, id) => {
  return WorkersModel.findOne({ _id: id, isDeleted: false })
    .populate([
      { path: "buildings", model: "buildings" },
      { path: "malls", model: "malls" },
    ])
    .lean();
};

service.create = async (userInfo, payload) => {
  // Merged Check: Mobile (Existing) OR Employee Code (New)
  const query = { isDeleted: false, $or: [{ mobile: payload.mobile }] };
  if (payload.employeeCode)
    query.$or.push({ employeeCode: payload.employeeCode });

  const userExists = await WorkersModel.countDocuments(query);
  if (userExists) {
    throw "USER-EXISTS";
  }
  const id = await CounterService.id("workers");
  const data = {
    createdBy: userInfo._id,
    updatedBy: userInfo._id,
    id,
    ...payload,
    hPassword: payload.password
      ? AuthHelper.getPasswordHash(payload.password)
      : undefined,
  };
  await new WorkersModel(data).save();
};

service.update = async (userInfo, id, payload) => {
  const { password, ...updateData } = payload;
  const data = {
    updatedBy: userInfo._id,
    ...updateData,
    ...(password ? { hPassword: AuthHelper.getPasswordHash(password) } : {}),
  };
  await WorkersModel.updateOne({ _id: id }, { $set: data });
};

service.delete = async (userInfo, id, payload) => {
  const isExists = await CustomersModel.countDocuments({
    isDeleted: false,
    "vehicles.worker": id,
  });
  if (isExists) {
    throw "This worker is currently assigned to customers and cannot be deleted";
  }
  return await WorkersModel.updateOne(
    { _id: id },
    { isDeleted: true, deletedBy: userInfo._id },
  );
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
// 🔵 IMPORT / EXPORT / TEMPLATE (UPDATED)
// ==========================================

service.generateTemplate = async () => {
  const ExcelJS = require("exceljs");
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Workers Template");

  // ✅ 1. COLUMNS: Removed "Assignment Type" and "Location"
  worksheet.columns = [
    { header: "Name", key: "name", width: 30 },
    { header: "Mobile", key: "mobile", width: 15 },
    { header: "Employee Code", key: "employeeCode", width: 15 },
    { header: "Company", key: "companyName", width: 25 },
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

  // ✅ 2. SAMPLE ROW: Added dummy data for user reference
  worksheet.addRow({
    name: "John Doe Sample",
    mobile: "971501234567",
    employeeCode: "EMP001",
    companyName: "Best Car Wash",
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

  // ✅ BUILD QUERY BASED ON STATUS
  const findQuery = {
    isDeleted: false,
    // If status is provided in query, use it. Otherwise default to 1 (Active)
    status: query.status ? Number(query.status) : 1,
  };

  // Optional: If you want Supervisors to only export their own workers, keep this logic.
  // If Admin sees all, this is fine.
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
    .lean();

  // ✅ Export also removed assignment columns to match import template
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
// ... (Previous imports and helpers remain the same)

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
    // 1. Skip Header
    if (rowNumber === 1) return;

    // 2. Get Raw Data
    const rawName = getCellText(row.getCell(1));
    const rawMobile = getCellText(row.getCell(2));

    console.log(
      `🔍 Reading Row ${rowNumber}: Name="${rawName}", Mobile="${rawMobile}"`,
    );

    // 3. Skip ONLY if completely empty
    if (!rawName && !rawMobile) {
      console.log(`⚠️ Skipped empty row at ${rowNumber}`);
      return;
    }

    // ✅ REMOVED THE "SAMPLE" CHECK. Now it will accept "John Doe Sample"

    excelData.push({
      name: rawName,
      mobile: rawMobile,
      employeeCode: getCellText(row.getCell(3)),
      companyName: getCellText(row.getCell(4)),
      // Manual Assignment logic means we ignore extra columns if they exist
      joiningDate: row.getCell(5).value,
      passportNumber: getCellText(row.getCell(6)),
      passportExpiry: row.getCell(7).value,
      visaNumber: getCellText(row.getCell(8)),
      visaExpiry: row.getCell(9).value,
      emiratesId: getCellText(row.getCell(10)),
      emiratesIdExpiry: row.getCell(11).value,
    });
  });

  console.log(`✅ [IMPORT INFO] Extracted ${excelData.length} valid rows.`);

  const results = { success: 0, errors: [] };

  for (const row of excelData) {
    try {
      if (!row.mobile) {
        throw new Error("Mobile number is required");
      }

      // Check if exists
      let worker = await WorkersModel.findOne({
        mobile: row.mobile,
        isDeleted: false,
      });

      const workerData = {
        name: row.name,
        mobile: row.mobile,
        employeeCode: row.employeeCode,
        companyName: row.companyName,

        service_type: "residence",
        malls: [],
        buildings: [],

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
