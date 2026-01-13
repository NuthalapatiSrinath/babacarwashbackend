const StaffModel = require("../../models/staff.model");
const CounterService = require("../../../utils/counters");
const CommonHelper = require("../../../helpers/common.helper");
// ✅ CHANGE 1: Import Oracle instead of Cloudinary
const oracleService = require("../../../cloud/oracle");
const fs = require("fs");
const path = require("path");
const axios = require("axios");

const service = module.exports;

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
    .populate("site")
    .lean();

  return { total, data };
};

service.info = async (userInfo, id) => {
  return StaffModel.findOne({ _id: id, isDeleted: false }).lean();
};

service.create = async (userInfo, payload) => {
  const userExists = await StaffModel.countDocuments({
    isDeleted: false,
    employeeCode: payload.employeeCode,
  });
  if (userExists) {
    throw "USER-EXISTS";
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
  const isExists = await StaffModel.countDocuments({
    _id: { $ne: id },
    isDeleted: false,
    employeeCode: payload.employeeCode,
  });
  if (isExists) {
    throw "Oops! Employee already exists";
  }
  const data = { updatedBy: userInfo._id, ...payload };
  await StaffModel.updateOne({ _id: id }, { $set: data });
};

service.delete = async (userInfo, id, payload) => {
  return await StaffModel.updateOne(
    { _id: id },
    { isDeleted: true, deletedBy: userInfo._id }
  );
};

service.undoDelete = async (userInfo, id) => {
  return await StaffModel.updateOne(
    { _id: id },
    { isDeleted: false, updatedBy: userInfo._id }
  );
};

service.uploadDocument = async (userInfo, id, documentType, fileData) => {
  // ✅ CHANGE 2: Removed "require(cloudinary)" inside function

  const fieldMap = {
    Passport: "passportDocument",
    Visa: "visaDocument",
    "Emirates ID": "emiratesIdDocument",
  };

  const fieldName = fieldMap[documentType];
  if (!fieldName) throw new Error("Invalid document type");

  const staff = await StaffModel.findById(id);
  if (!staff) throw new Error("Staff not found");

  // ✅ CHANGE 3: Use Oracle to delete old file
  if (staff[fieldName]?.filename) {
    await oracleService.deleteFile(staff[fieldName].filename);
  }

  const filePath = fileData.path;
  if (!filePath || !fs.existsSync(filePath)) {
    throw new Error("File not found on disk");
  }

  // Generate Oracle Filename
  const ext = path.extname(fileData.filename) || ".pdf";
  const oracleFileName = `staff-${id}-${documentType.replace(
    /\s+/g,
    ""
  )}-${Date.now()}${ext}`;

  // ✅ CHANGE 4: Upload to Oracle
  const publicUrl = await oracleService.uploadFile(filePath, oracleFileName);

  // Clean up local file
  try {
    fs.unlinkSync(filePath);
  } catch (e) {}

  const documentData = {
    url: publicUrl,
    publicId: oracleFileName,
    filename: oracleFileName, // We use this to delete later
    uploadedAt: new Date(),
  };

  await StaffModel.updateOne(
    { _id: id },
    {
      $set: {
        [fieldName]: documentData,
        updatedBy: userInfo._id,
      },
    }
  );

  return documentData;
};

service.deleteDocument = async (userInfo, id, documentType) => {
  // ✅ CHANGE 5: Removed "require(cloudinary)" inside function
  try {
    const staff = await StaffModel.findById(id);
    if (!staff) throw new Error("Staff not found");

    const fieldMap = {
      Passport: "passportDocument",
      Visa: "visaDocument",
      "Emirates ID": "emiratesIdDocument",
    };
    const fieldName = fieldMap[documentType];

    // ✅ CHANGE 6: Use Oracle to delete
    if (staff[fieldName]?.filename) {
      await oracleService.deleteFile(staff[fieldName].filename);
    }

    // Remove from database
    return await StaffModel.updateOne(
      { _id: id },
      { $unset: { [fieldName]: 1 }, $set: { updatedBy: userInfo._id } }
    );
  } catch (error) {
    console.error("Delete document error:", error);
    throw error;
  }
};

// ... (Keep existing export/import/template functions below) ...
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
    passportExpiry: s.passportExpiry,
    visaExpiry: s.visaExpiry,
    emiratesIdExpiry: s.emiratesIdExpiry,
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
  const findQuery = { isDeleted: false };
  const staffData = await StaffModel.find(findQuery)
    .sort({ visaExpiry: 1 })
    .populate("site", "name")
    .lean();

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Staff");

  worksheet.columns = [
    { header: "Employee Code", key: "employeeCode", width: 15 },
    { header: "Name", key: "name", width: 25 },
    { header: "Company", key: "companyName", width: 20 },
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

  const formatDate = (date) => {
    if (!date) return "";
    const d = new Date(date);
    if (isNaN(d.getTime())) return "";
    return d.toISOString().split("T")[0];
  };

  staffData.forEach((staff) => {
    worksheet.addRow({
      employeeCode: staff.employeeCode,
      name: staff.name,
      companyName: staff.companyName,
      joiningDate: formatDate(staff.joiningDate),
      passportNumber: staff.passportNumber,
      passportExpiry: formatDate(staff.passportExpiry),
      passportDocumentUrl: staff.passportDocument?.url || "",
      visaExpiry: formatDate(staff.visaExpiry),
      visaDocumentUrl: staff.visaDocument?.url || "",
      emiratesId: staff.emiratesId,
      emiratesIdExpiry: formatDate(staff.emiratesIdExpiry),
      emiratesIdDocumentUrl: staff.emiratesIdDocument?.url || "",
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
      joiningDate: row.getCell(4).value,
      passportNumber: row.getCell(5).value?.toString() || "",
      passportExpiry: row.getCell(6).value,
      passportDocumentUrl: row.getCell(7).value?.toString() || "",
      visaExpiry: row.getCell(8).value,
      visaDocumentUrl: row.getCell(9).value?.toString() || "",
      emiratesId: row.getCell(10).value?.toString() || "",
      emiratesIdExpiry: row.getCell(11).value,
      emiratesIdDocumentUrl: row.getCell(12).value?.toString() || "",
    };
    excelData.push(rowData);
  });

  return await service.importDataWithOracle(userInfo, excelData);
};

service.importDataWithOracle = async (userInfo, csvData) => {
  const results = { success: 0, errors: [] };

  for (const row of csvData) {
    try {
      let staff = await StaffModel.findOne({ employeeCode: row.employeeCode });

      const staffData = {
        name: row.name,
        companyName: row.companyName,
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

      if (
        row.passportDocumentUrl &&
        row.passportDocumentUrl.startsWith("http")
      ) {
        staffData.passportDocument = await service._uploadFromUrl(
          row.passportDocumentUrl,
          staff?._id || "temp",
          "passport"
        );
      }
      if (row.visaDocumentUrl && row.visaDocumentUrl.startsWith("http")) {
        staffData.visaDocument = await service._uploadFromUrl(
          row.visaDocumentUrl,
          staff?._id || "temp",
          "visa"
        );
      }
      if (
        row.emiratesIdDocumentUrl &&
        row.emiratesIdDocumentUrl.startsWith("http")
      ) {
        staffData.emiratesIdDocument = await service._uploadFromUrl(
          row.emiratesIdDocumentUrl,
          staff?._id || "temp",
          "emiratesId"
        );
      }

      if (staff) {
        await StaffModel.updateOne({ _id: staff._id }, { $set: staffData });
      } else {
        const id = await CounterService.id("staff");
        staffData.id = id;
        staffData.createdBy = userInfo._id;
        await new StaffModel(staffData).save();
      }
      results.success++;
    } catch (error) {
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
    console.error("Upload from URL error:", error);
    return null;
  }
};
