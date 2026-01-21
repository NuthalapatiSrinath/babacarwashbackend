const mongoose = require("mongoose"); // ✅ Required for ID check
const StaffModel = require("../../models/staff.model");
const SiteModel = require("../../models/sites.model");
const MallModel = require("../../models/malls.model");
const CounterService = require("../../../utils/counters");
const CommonHelper = require("../../../helpers/common.helper");
const oracleService = require("../../../cloud/oracle");
const fs = require("fs");
const path = require("path");
const axios = require("axios");

const service = module.exports;

// ✅ HELPER: Extract Text from Excel Cell (Fixes [object Object] for emails)
const getCellText = (cell) => {
  if (!cell || cell.value === null || cell.value === undefined) return "";
  // ExcelJS returns objects for hyperlinks { text: '...', hyperlink: '...' }
  if (typeof cell.value === "object" && cell.value.text) {
    return cell.value.text.toString();
  }
  return cell.value.toString();
};

// ✅ HELPER: Safely parse dates (Supports Excel Serial & DD/MM/YYYY)
const parseExcelDate = (value) => {
  if (!value) return undefined;

  // 1. Handle Excel Serial Numbers
  if (typeof value === "number") {
    return new Date(Math.round((value - 25569) * 86400 * 1000));
  }

  // 2. Handle "DD/MM/YYYY" String
  if (typeof value === "string") {
    const raw = value.trim();
    if (raw.includes("/")) {
      const parts = raw.split("/");
      if (parts.length === 3) {
        const day = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1; // Month is 0-indexed
        const year = parseInt(parts[2], 10);
        const date = new Date(Date.UTC(year, month, day));
        return isNaN(date.getTime()) ? undefined : date;
      }
    }
  }

  // 3. Fallback
  const date = new Date(value);
  return isNaN(date.getTime()) ? undefined : date;
};

// --- LIST (Manual Population to Fix Crash) ---
service.list = async (userInfo, query) => {
  const paginationData = CommonHelper.paginationData(query);

  const findQuery = {
    isDeleted: false,
    ...(query.search
      ? {
          $or: [
            { name: { $regex: query.search, $options: "i" } },
            { employeeCode: { $regex: query.search, $options: "i" } },
            { companyName: { $regex: query.search, $options: "i" } },
            { passportNumber: { $regex: query.search, $options: "i" } },
            { visaNumber: { $regex: query.search, $options: "i" } },
            { emiratesId: { $regex: query.search, $options: "i" } },
            { mobile: { $regex: query.search, $options: "i" } },
            { email: { $regex: query.search, $options: "i" } },
          ],
        }
      : null),
  };

  const total = await StaffModel.countDocuments(findQuery);

  // 1. Fetch RAW data (no populate yet) to avoid crash
  const staffList = await StaffModel.find(findQuery)
    .sort({ visaExpiry: 1, _id: -1 })
    .skip(paginationData.skip)
    .limit(paginationData.limit)
    .lean();

  // 2. Collect Valid IDs
  const siteIds = new Set();
  const mallIds = new Set();

  staffList.forEach((s) => {
    if (s.site && mongoose.Types.ObjectId.isValid(s.site)) siteIds.add(s.site);
    if (s.mall && mongoose.Types.ObjectId.isValid(s.mall)) mallIds.add(s.mall);
  });

  // 3. Fetch Lookup Data
  const sites = await SiteModel.find({ _id: { $in: Array.from(siteIds) } })
    .select("name")
    .lean();
  const malls = await MallModel.find({ _id: { $in: Array.from(mallIds) } })
    .select("name")
    .lean();

  // 4. Create Maps
  const siteMap = {};
  sites.forEach((s) => (siteMap[s._id.toString()] = s));

  const mallMap = {};
  malls.forEach((m) => (mallMap[m._id.toString()] = m));

  // 5. Attach Data (If ID, swap with Object. If string "Dubai", keep string)
  const data = staffList.map((s) => ({
    ...s,
    site:
      s.site && siteMap[s.site.toString()]
        ? siteMap[s.site.toString()]
        : s.site,
    mall:
      s.mall && mallMap[s.mall.toString()]
        ? mallMap[s.mall.toString()]
        : s.mall,
  }));

  return { total, data };
};

// --- INFO (Manual Population) ---
service.info = async (userInfo, id) => {
  const staff = await StaffModel.findOne({ _id: id, isDeleted: false }).lean();
  if (!staff) return null;

  // Manual Populate Site
  if (staff.site && mongoose.Types.ObjectId.isValid(staff.site)) {
    const site = await SiteModel.findById(staff.site).select("name").lean();
    if (site) staff.site = site;
  }

  // Manual Populate Mall
  if (staff.mall && mongoose.Types.ObjectId.isValid(staff.mall)) {
    const mall = await MallModel.findById(staff.mall).select("name").lean();
    if (mall) staff.mall = mall;
  }

  return staff;
};

// --- CREATE ---
service.create = async (userInfo, payload) => {
  const query = { isDeleted: false, $or: [] };
  if (payload.employeeCode)
    query.$or.push({ employeeCode: payload.employeeCode });
  if (payload.passportNumber)
    query.$or.push({ passportNumber: payload.passportNumber });

  if (query.$or.length > 0) {
    const exists = await StaffModel.findOne(query);
    if (exists) throw "USER-EXISTS";
  }

  const id = await CounterService.id("staff");
  const data = {
    createdBy: userInfo._id,
    updatedBy: userInfo._id,
    id,
    ...payload,
  };
  await new StaffModel(data).save();
};

// --- UPDATE ---
service.update = async (userInfo, id, payload) => {
  if (payload.employeeCode) {
    const isExists = await StaffModel.countDocuments({
      _id: { $ne: id },
      isDeleted: false,
      employeeCode: payload.employeeCode,
    });
    if (isExists) throw "Oops! Employee already exists";
  }
  const data = { updatedBy: userInfo._id, ...payload };
  await StaffModel.updateOne({ _id: id }, { $set: data });
};

// --- DELETE ---
service.delete = async (userInfo, id, reason) => {
  return await StaffModel.updateOne(
    { _id: id },
    { isDeleted: true, deletedBy: userInfo._id, deleteReason: reason },
  );
};

// --- UNDO DELETE ---
service.undoDelete = async (userInfo, id) => {
  return await StaffModel.updateOne(
    { _id: id },
    { isDeleted: false, updatedBy: userInfo._id },
  );
};

// --- UPLOAD DOCUMENT ---
service.uploadDocument = async (userInfo, id, documentType, fileData) => {
  const fieldMap = {
    Passport: "passportDocument",
    Visa: "visaDocument",
    "Emirates ID": "emiratesIdDocument",
  };
  const fieldName = fieldMap[documentType];
  if (!fieldName) throw new Error("Invalid document type");

  const staff = await StaffModel.findById(id);
  if (!staff) throw new Error("Staff not found");

  if (staff[fieldName]?.filename) {
    try {
      await oracleService.deleteFile(staff[fieldName].filename);
    } catch (e) {}
  }

  const filePath = fileData.path;
  const ext = path.extname(fileData.filename) || ".pdf";
  const oracleFileName = `staff-${id}-${documentType.replace(/\s+/g, "")}-${Date.now()}${ext}`;
  const publicUrl = await oracleService.uploadFile(filePath, oracleFileName);

  try {
    fs.unlinkSync(filePath);
  } catch (e) {}

  const documentData = {
    url: publicUrl,
    publicId: oracleFileName,
    filename: oracleFileName,
    uploadedAt: new Date(),
  };

  await StaffModel.updateOne(
    { _id: id },
    { $set: { [fieldName]: documentData, updatedBy: userInfo._id } },
  );
  return documentData;
};

// --- UPLOAD PROFILE IMAGE ---
service.uploadProfileImage = async (userInfo, id, fileData) => {
  const staff = await StaffModel.findById(id);
  if (!staff) throw new Error("Staff not found");

  if (staff.profileImage?.filename) {
    try {
      await oracleService.deleteFile(staff.profileImage.filename);
    } catch (e) {}
  }

  const filePath = fileData.path;
  const ext = path.extname(fileData.filename) || ".jpg";
  const oracleFileName = `staff-profile-${id}-${Date.now()}${ext}`;
  const publicUrl = await oracleService.uploadFile(filePath, oracleFileName);

  try {
    fs.unlinkSync(filePath);
  } catch (e) {}

  const imageData = {
    url: publicUrl,
    publicId: oracleFileName,
    filename: oracleFileName,
  };

  await StaffModel.updateOne(
    { _id: id },
    { $set: { profileImage: imageData, updatedBy: userInfo._id } },
  );
  return imageData;
};

// --- DELETE DOCUMENT ---
service.deleteDocument = async (userInfo, id, documentType) => {
  const staff = await StaffModel.findById(id);
  const fieldMap = {
    Passport: "passportDocument",
    Visa: "visaDocument",
    "Emirates ID": "emiratesIdDocument",
  };
  const fieldName = fieldMap[documentType];

  if (staff[fieldName]?.filename) {
    await oracleService.deleteFile(staff[fieldName].filename);
  }
  return await StaffModel.updateOne(
    { _id: id },
    { $unset: { [fieldName]: 1 }, $set: { updatedBy: userInfo._id } },
  );
};

// --- GET EXPIRING DOCUMENTS ---
service.getExpiringDocuments = async () => {
  const twoMonthsFromNow = new Date();
  twoMonthsFromNow.setMonth(twoMonthsFromNow.getMonth() + 2);
  const today = new Date();

  const staff = await StaffModel.find({
    isDeleted: false,
    $or: [
      { passportExpiry: { $gte: today, $lte: twoMonthsFromNow } },
      { visaExpiry: { $gte: today, $lte: twoMonthsFromNow } },
      { emiratesIdExpiry: { $gte: today, $lte: twoMonthsFromNow } },
    ],
  }).lean();

  return staff.map((s) => ({
    _id: s._id,
    name: s.name,
    employeeCode: s.employeeCode,
    expiringDocs: [
      s.passportExpiry &&
      s.passportExpiry >= today &&
      s.passportExpiry <= twoMonthsFromNow
        ? "Passport"
        : null,
      s.visaExpiry && s.visaExpiry >= today && s.visaExpiry <= twoMonthsFromNow
        ? "Visa"
        : null,
      s.emiratesIdExpiry &&
      s.emiratesIdExpiry >= today &&
      s.emiratesIdExpiry <= twoMonthsFromNow
        ? "Emirates ID"
        : null,
    ].filter(Boolean),
  }));
};

// --- GENERATE TEMPLATE ---
// ✅ REMOVED: Site & Mall Columns (User will add manually)
service.generateTemplate = async () => {
  const ExcelJS = require("exceljs");
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Staff Template");

  worksheet.columns = [
    { header: "Employee Code", key: "employeeCode", width: 15 },
    { header: "Name", key: "name", width: 25 },
    { header: "Mobile", key: "mobile", width: 15 },
    { header: "Email", key: "email", width: 25 },
    { header: "Company", key: "companyName", width: 20 },
    // ❌ Site & Mall Removed as requested
    { header: "Joining Date (DD/MM/YYYY)", key: "joiningDate", width: 25 },
    { header: "Passport Number", key: "passportNumber", width: 15 },
    {
      header: "Passport Expiry (DD/MM/YYYY)",
      key: "passportExpiry",
      width: 25,
    },
    { header: "Passport Document URL", key: "passportDocumentUrl", width: 50 },
    { header: "Visa Number", key: "visaNumber", width: 15 },
    { header: "Visa Expiry (DD/MM/YYYY)", key: "visaExpiry", width: 25 },
    { header: "Visa Document URL", key: "visaDocumentUrl", width: 50 },
    { header: "Emirates ID", key: "emiratesId", width: 20 },
    {
      header: "Emirates ID Expiry (DD/MM/YYYY)",
      key: "emiratesIdExpiry",
      width: 25,
    },
    {
      header: "Emirates ID Document URL",
      key: "emiratesIdDocumentUrl",
      width: 50,
    },
  ];
  return await workbook.xlsx.writeBuffer();
};

// --- EXPORT DATA ---
// ✅ Manual Population for Export as well
service.exportData = async (userInfo, query) => {
  const ExcelJS = require("exceljs");
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Staff");

  const staffData = await service.list(userInfo, { ...query, limit: 10000 }); // Reuse list logic

  worksheet.columns = [
    { header: "Employee Code", key: "employeeCode", width: 15 },
    { header: "Name", key: "name", width: 25 },
    { header: "Mobile", key: "mobile", width: 15 },
    { header: "Email", key: "email", width: 25 },
    { header: "Company", key: "companyName", width: 20 },
    { header: "Site", key: "site", width: 20 },
    { header: "Mall", key: "mall", width: 20 },
    { header: "Joining Date", key: "joiningDate", width: 20 },
    { header: "Passport Number", key: "passportNumber", width: 15 },
    { header: "Passport Expiry", key: "passportExpiry", width: 20 },
    { header: "Visa Number", key: "visaNumber", width: 15 },
    { header: "Visa Expiry", key: "visaExpiry", width: 20 },
    { header: "Emirates ID", key: "emiratesId", width: 20 },
    { header: "Emirates ID Expiry", key: "emiratesIdExpiry", width: 20 },
  ];

  staffData.data.forEach((staff) => {
    worksheet.addRow({
      employeeCode: staff.employeeCode,
      name: staff.name,
      mobile: staff.mobile,
      email: staff.email,
      companyName: staff.companyName,
      site: staff.site?.name || staff.site || "",
      mall: staff.mall?.name || staff.mall || "",
      joiningDate: staff.joiningDate,
      passportNumber: staff.passportNumber,
      passportExpiry: staff.passportExpiry,
      visaNumber: staff.visaNumber,
      visaExpiry: staff.visaExpiry,
      emiratesId: staff.emiratesId,
      emiratesIdExpiry: staff.emiratesIdExpiry,
    });
  });
  return await workbook.xlsx.writeBuffer();
};

// --- IMPORT EXCEL ---
service.importDataFromExcel = async (userInfo, fileBuffer) => {
  const ExcelJS = require("exceljs");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(fileBuffer);
  const worksheet = workbook.getWorksheet(1);
  const excelData = [];

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;

    // ✅ Uses getCellText to fix email issue
    const rowData = {
      employeeCode: getCellText(row.getCell(1)),
      name: getCellText(row.getCell(2)),
      mobile: getCellText(row.getCell(3)),
      email: getCellText(row.getCell(4)),
      companyName: getCellText(row.getCell(5)),
      // NO SITE/MALL
      joiningDate: row.getCell(6).value,
      passportNumber: getCellText(row.getCell(7)),
      passportExpiry: row.getCell(8).value,
      passportDocumentUrl: getCellText(row.getCell(9)),
      visaNumber: getCellText(row.getCell(10)),
      visaExpiry: row.getCell(11).value,
      visaDocumentUrl: getCellText(row.getCell(12)),
      emiratesId: getCellText(row.getCell(13)),
      emiratesIdExpiry: row.getCell(14).value,
      emiratesIdDocumentUrl: getCellText(row.getCell(15)),
    };
    excelData.push(rowData);
  });

  return await service.importDataWithOracle(userInfo, excelData);
};

// --- IMPORT LOGIC ---
service.importDataWithOracle = async (userInfo, csvData) => {
  const results = { success: 0, errors: [] };

  for (const row of csvData) {
    try {
      let staff = null;

      if (row.employeeCode?.trim()) {
        staff = await StaffModel.findOne({
          employeeCode: new RegExp(`^${row.employeeCode.trim()}$`, "i"),
          isDeleted: false,
        });
      }
      if (!staff && row.passportNumber?.trim()) {
        staff = await StaffModel.findOne({
          passportNumber: new RegExp(`^${row.passportNumber.trim()}$`, "i"),
          isDeleted: false,
        });
      }

      const staffData = {
        name: row.name,
        mobile: row.mobile,
        email: row.email,
        companyName: row.companyName,
        joiningDate: parseExcelDate(row.joiningDate),
        passportNumber: row.passportNumber,
        passportExpiry: parseExcelDate(row.passportExpiry),
        visaNumber: row.visaNumber,
        visaExpiry: parseExcelDate(row.visaExpiry),
        emiratesId: row.emiratesId,
        emiratesIdExpiry: parseExcelDate(row.emiratesIdExpiry),
        updatedBy: userInfo._id,
      };

      if (row.passportDocumentUrl?.startsWith("http")) {
        staffData.passportDocument = await service._uploadFromUrl(
          row.passportDocumentUrl,
          staff?._id || "temp",
          "passport",
        );
      }
      if (row.visaDocumentUrl?.startsWith("http")) {
        staffData.visaDocument = await service._uploadFromUrl(
          row.visaDocumentUrl,
          staff?._id || "temp",
          "Visa",
        );
      }
      if (row.emiratesIdDocumentUrl?.startsWith("http")) {
        staffData.emiratesIdDocument = await service._uploadFromUrl(
          row.emiratesIdDocumentUrl,
          staff?._id || "temp",
          "Emirates ID",
        );
      }

      if (staff) {
        await StaffModel.updateOne({ _id: staff._id }, { $set: staffData });
      } else {
        const id = await CounterService.id("staff");
        staffData.id = id;
        staffData.createdBy = userInfo._id;
        if (row.employeeCode) staffData.employeeCode = row.employeeCode;
        await new StaffModel(staffData).save();
      }
      results.success++;
    } catch (error) {
      console.error("Import row failed:", error);
      results.errors.push({ row, error: error.message });
    }
  }
  return results;
};

// ... _uploadFromUrl remains the same ...
service._uploadFromUrl = async (url, staffId, docType) => {
  try {
    const response = await axios.get(url, { responseType: "arraybuffer" });
    const buffer = Buffer.from(response.data, "binary");
    const tempDir = path.join(__dirname, "../../../../temp");
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
    const ext = path.extname(url).split("?")[0] || ".pdf";
    const tempPath = path.join(tempDir, `${Date.now()}-${docType}${ext}`);
    fs.writeFileSync(tempPath, buffer);
    const oracleFileName = `staff-${staffId}-${docType}-${Date.now()}${ext}`;
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
