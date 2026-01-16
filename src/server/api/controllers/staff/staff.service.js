const StaffModel = require("../../models/staff.model");
const SiteModel = require("../../models/sites.model"); // ✅ Import Site Model
const CounterService = require("../../../utils/counters");
const CommonHelper = require("../../../helpers/common.helper");
const oracleService = require("../../../cloud/oracle");
const fs = require("fs");
const path = require("path");
const axios = require("axios");

const service = module.exports;

// --- LIST (Fixed 500 Error) ---
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
            { emiratesId: { $regex: query.search, $options: "i" } },
          ],
        }
      : null),
  };

  const total = await StaffModel.countDocuments(findQuery);
  const data = await StaffModel.find(findQuery)
    .sort({ visaExpiry: 1, _id: -1 })
    .skip(paginationData.skip)
    .limit(paginationData.limit)
    // .populate("site") // ❌ REMOVED to fix CastError (Downtown Dubai is not an ID)
    .lean();

  // Manual population if needed, or send as is
  // (Frontend handles strings gracefully)
  return { total, data };
};

service.info = async (userInfo, id) => {
  return StaffModel.findOne({ _id: id, isDeleted: false }).lean();
};

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

service.delete = async (userInfo, id, reason) => {
  return await StaffModel.updateOne(
    { _id: id },
    { isDeleted: true, deletedBy: userInfo._id, deleteReason: reason }
  );
};

service.undoDelete = async (userInfo, id) => {
  return await StaffModel.updateOne(
    { _id: id },
    { isDeleted: false, updatedBy: userInfo._id }
  );
};

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
    await oracleService.deleteFile(staff[fieldName].filename);
  }

  const filePath = fileData.path;
  const ext = path.extname(fileData.filename) || ".pdf";
  const oracleFileName = `staff-${id}-${documentType.replace(
    /\s+/g,
    ""
  )}-${Date.now()}${ext}`;
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
    { $set: { [fieldName]: documentData, updatedBy: userInfo._id } }
  );
  return documentData;
};

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
    { $unset: { [fieldName]: 1 }, $set: { updatedBy: userInfo._id } }
  );
};

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

service.generateTemplate = async () => {
  const ExcelJS = require("exceljs");
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Staff Template");

  worksheet.columns = [
    { header: "Employee Code", key: "employeeCode", width: 15 },
    { header: "Name", key: "name", width: 25 },
    { header: "Company", key: "companyName", width: 20 },
    { header: "Site", key: "site", width: 20 },
    { header: "Joining Date (YYYY-MM-DD)", key: "joiningDate", width: 20 },
    { header: "Passport Number", key: "passportNumber", width: 15 },
    {
      header: "Passport Expiry (YYYY-MM-DD)",
      key: "passportExpiry",
      width: 20,
    },
    { header: "Passport Document URL", key: "passportDocumentUrl", width: 50 },
    { header: "Visa Expiry (YYYY-MM-DD)", key: "visaExpiry", width: 20 },
    { header: "Visa Document URL", key: "visaDocumentUrl", width: 50 },
    { header: "Emirates ID", key: "emiratesId", width: 20 },
    {
      header: "Emirates ID Expiry (YYYY-MM-DD)",
      key: "emiratesIdExpiry",
      width: 20,
    },
    {
      header: "Emirates ID Document URL",
      key: "emiratesIdDocumentUrl",
      width: 50,
    },
  ];
  return await workbook.xlsx.writeBuffer();
};

service.exportData = async (userInfo, query) => {
  const ExcelJS = require("exceljs");
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Staff");
  const staffData = await StaffModel.find({ isDeleted: false })
    .sort({ visaExpiry: 1 })
    .lean();

  worksheet.columns = [
    { header: "Employee Code", key: "employeeCode", width: 15 },
    { header: "Name", key: "name", width: 25 },
    { header: "Company", key: "companyName", width: 20 },
    { header: "Site", key: "site", width: 20 },
    { header: "Joining Date", key: "joiningDate", width: 20 },
    { header: "Passport Number", key: "passportNumber", width: 15 },
    { header: "Passport Expiry", key: "passportExpiry", width: 20 },
  ];

  staffData.forEach((staff) => {
    worksheet.addRow({
      employeeCode: staff.employeeCode,
      name: staff.name,
      companyName: staff.companyName,
      site: staff.site?.name || staff.site || "",
      joiningDate: staff.joiningDate,
      passportNumber: staff.passportNumber,
      passportExpiry: staff.passportExpiry,
    });
  });
  return await workbook.xlsx.writeBuffer();
};

service.importDataFromExcel = async (userInfo, fileBuffer) => {
  const ExcelJS = require("exceljs");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(fileBuffer);
  const worksheet = workbook.getWorksheet(1);
  const excelData = [];

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const rowData = {
      employeeCode: row.getCell(1).value?.toString() || "",
      name: row.getCell(2).value?.toString() || "",
      companyName: row.getCell(3).value?.toString() || "",
      site: row.getCell(4).value?.toString() || "", // Column D
      joiningDate: row.getCell(5).value,
      passportNumber: row.getCell(6).value?.toString() || "",
      passportExpiry: row.getCell(7).value,
      passportDocumentUrl: row.getCell(8).value?.toString() || "",
      visaExpiry: row.getCell(9).value,
      visaDocumentUrl: row.getCell(10).value?.toString() || "",
      emiratesId: row.getCell(11).value?.toString() || "",
      emiratesIdExpiry: row.getCell(12).value,
      emiratesIdDocumentUrl: row.getCell(13).value?.toString() || "",
    };
    excelData.push(rowData);
  });

  return await service.importDataWithOracle(userInfo, excelData);
};

service.importDataWithOracle = async (userInfo, csvData) => {
  const results = { success: 0, errors: [] };

  for (const row of csvData) {
    try {
      let staff = null;

      // Smart Deduplication
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
      if (!staff && row.name && row.companyName) {
        staff = await StaffModel.findOne({
          name: new RegExp(`^${row.name.trim()}$`, "i"),
          companyName: new RegExp(`^${row.companyName.trim()}$`, "i"),
          isDeleted: false,
        });
      }

      // ✅ SITE LOOKUP (Fixes CastError)
      let siteId = null;
      if (row.site) {
        // Try to find site ID by name
        const siteDoc = await SiteModel.findOne({
          name: { $regex: new RegExp(`^${row.site.trim()}$`, "i") },
        });
        if (siteDoc) {
          siteId = siteDoc._id; // Use valid ObjectId
        } else {
          siteId = row.site; // Fallback to string (Frontend handles it)
        }
      }

      const staffData = {
        name: row.name,
        companyName: row.companyName,
        site: siteId,
        joiningDate: row.joiningDate ? new Date(row.joiningDate) : undefined,
        passportNumber: row.passportNumber,
        passportExpiry: row.passportExpiry
          ? new Date(row.passportExpiry)
          : undefined,
        visaExpiry: row.visaExpiry ? new Date(row.visaExpiry) : undefined,
        emiratesId: row.emiratesId,
        emiratesIdExpiry: row.emiratesIdExpiry
          ? new Date(row.emiratesIdExpiry)
          : undefined,
        updatedBy: userInfo._id,
      };

      if (row.passportDocumentUrl?.startsWith("http")) {
        staffData.passportDocument = await service._uploadFromUrl(
          row.passportDocumentUrl,
          staff?._id || "temp",
          "passport"
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
