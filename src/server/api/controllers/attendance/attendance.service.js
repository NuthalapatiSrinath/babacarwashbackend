const exceljs = require("exceljs");
const moment = require("moment");

const WorkersModel = require("../../models/workers.model");
const StaffModel = require("../../models/staff.model");
const AttendanceModel = require("../../models/attendance.model");
const InAppNotifications = require("../../../notifications/in-app.notifications");

const service = module.exports;

const ATTENDANCE_STATUS_CODES = new Set([
  "AB",
  "ND",
  "SL",
  "WO",
  "EL",
  "PL",
  "UL",
]);

const EXPORT_COUNT_CODES = [
  "P",
  "AB",
  "ND",
  "SL",
  "WO",
  "EL",
  "PL",
  "UL",
  "OFF",
];

const normalizeStatusCode = (value) => {
  const code = String(value || "")
    .trim()
    .toUpperCase();
  return ATTENDANCE_STATUS_CODES.has(code) ? code : "";
};

const buildSiteScopeFilter = async (query) => {
  const staffQuery = {
    isDeleted: false,
    ...(query.site ? { site: query.site } : null),
  };
  const workerQuery = {
    isDeleted: false,
    service_type: "site",
    ...(query.site
      ? {
          sites: {
            $in: Array.isArray(query.site) ? query.site : [query.site],
          },
        }
      : null),
  };

  const [staffData, workerData] = await Promise.all([
    StaffModel.find(staffQuery, { _id: 1 }).lean(),
    WorkersModel.find(workerQuery, { _id: 1 }).lean(),
  ]);

  const scope = [];

  if (workerData.length > 0) {
    scope.push({
      worker: { $in: workerData.map((item) => item._id.toString()) },
    });
  }

  if (staffData.length > 0) {
    scope.push({
      staff: { $in: staffData.map((item) => item._id.toString()) },
    });
  }

  return scope;
};

service.orgList = async (userInfo, query) => {
  const WorkersData = await WorkersModel.find({ isDeleted: false }).lean();
  const StaffData = await StaffModel.find({ isDeleted: false }).lean();
  return [...WorkersData, ...StaffData];
};

service.list = async (userInfo, query) => {
  const findQuery = {
    ...(query.startDate
      ? {
          date: {
            $gte: new Date(query.startDate),
            $lte: new Date(query.endDate),
          },
        }
      : null),
    ...(query.search
      ? { $or: [{ name: { $regex: query.search, $options: "i" } }] }
      : null),
    ...(query.workers
      ? {
          worker: {
            $in: Array.isArray(query.workers) ? query.workers : [query.workers],
          },
        }
      : null),
  };

  if (query.worker && !query.workers) {
    findQuery.$or = [{ worker: query.worker }, { staff: query.worker }];
  }

  if (!query.workers) {
    if (query.premise == "site") {
      const siteScope = await buildSiteScopeFilter(query);

      if (siteScope.length === 0) {
        return { data: [] };
      }

      if (findQuery.$or) {
        findQuery.$and = [{ $or: findQuery.$or }, { $or: siteScope }];
        delete findQuery.$or;
      } else if (siteScope.length === 1) {
        Object.assign(findQuery, siteScope[0]);
      } else {
        findQuery.$or = siteScope;
      }
    }

    if (["mall", "residence"].includes(query.premise)) {
      const workerQuery = {
        isDeleted: false,
        service_type: query.premise,
        ...(query.mall ? { malls: { $in: query.mall } } : null),
        ...(query.building
          ? {
              buildings: {
                $in: (Array.isArray(query.building)
                  ? query.building
                  : [query.building]
                ).filter((b) => b && (typeof b === "string" ? b.trim() : true)),
              },
            }
          : null),
      };
      const staffData = await WorkersModel.find(workerQuery, { _id: 1 }).lean();
      findQuery.worker = { $in: staffData.map((e) => e._id.toString()) };
    }
  }

  const data = await AttendanceModel.find(findQuery)
    .sort({ _id: -1 })
    .populate("worker staff")
    .lean();

  return { data };
};

service.update = async (userInfo, payload) => {
  const updateData = {
    present: payload.present,
    type: payload.type,
    ...(payload.notes ? { notes: payload.notes } : null),
  };
  await AttendanceModel.updateMany(
    { _id: { $in: payload.ids } },
    { $set: updateData },
  );

  // Send notification about attendance update
  try {
    const count = payload.ids?.length || 0;
    const status = payload.present ? "present" : "absent";
    await InAppNotifications.send({
      worker: userInfo._id,
      message: `Attendance updated: ${count} worker(s) marked as ${status}`,
      createdBy: userInfo._id,
    });
  } catch (error) {
    console.error("Failed to send notification:", error);
  }
};

service.exportData = async (userInfo, query) => {
  const findQuery = {
    ...(query.startDate
      ? {
          date: {
            $gte: new Date(query.startDate),
            $lte: new Date(query.endDate),
          },
        }
      : null),
    ...(query.search
      ? { $or: [{ name: { $regex: query.search, $options: "i" } }] }
      : null),
  };

  if (query.worker) {
    findQuery.$or = [{ worker: query.worker }, { staff: query.worker }];
  }

  if (query.premise == "site") {
    const siteScope = await buildSiteScopeFilter(query);

    if (siteScope.length === 0) {
      findQuery.$or = [{ worker: { $in: [] } }, { staff: { $in: [] } }];
    } else if (findQuery.$or) {
      findQuery.$and = [{ $or: findQuery.$or }, { $or: siteScope }];
      delete findQuery.$or;
    } else if (siteScope.length === 1) {
      Object.assign(findQuery, siteScope[0]);
    } else {
      findQuery.$or = siteScope;
    }
  }

  if (["mall", "residence"].includes(query.premise)) {
    const workerQuery = {
      isDeleted: false,
      service_type: query.premise,
      ...(query.mall ? { malls: { $in: query.mall } } : null),
      ...(query.building
        ? {
            buildings: {
              $in: (Array.isArray(query.building)
                ? query.building
                : [query.building]
              ).filter((b) => b && (typeof b === "string" ? b.trim() : true)),
            },
          }
        : null),
    };
    const staffData = await WorkersModel.find(workerQuery, { _id: 1 }).lean();
    findQuery.worker = { $in: staffData.map((e) => e._id.toString()) };
  }

  const data = await AttendanceModel.find(findQuery)
    .sort({ _id: -1 })
    .populate("worker staff")
    .lean();

  const selectedCompanyName = String(query.companyName || "").trim();
  const normalizedCompanyName = selectedCompanyName.toLowerCase();
  const filteredData = selectedCompanyName
    ? data.filter((record) => {
        const companyName = String(
          record.worker?.companyName ||
            record.staff?.companyName ||
            "Unassigned Company",
        ).trim();
        return companyName.toLowerCase() === normalizedCompanyName;
      })
    : data;

  const workbook = new exceljs.Workbook();
  const worksheet = workbook.addWorksheet("Attendance Report");

  // Determine date range
  const startDate = query.startDate
    ? moment.utc(query.startDate).startOf("day")
    : moment.utc().startOf("month");
  const endDate = query.endDate
    ? moment.utc(query.endDate).endOf("day")
    : moment.utc().endOf("month");

  // Get building/location name for header
  let locationName = "ATTENDANCE REPORT";
  if (query.building && query.building.length > 0) {
    const BuildingModel = require("../../models/buildings.model");
    const building = await BuildingModel.findById(query.building[0]).lean();
    if (building) locationName = building.name.toUpperCase();
  } else if (query.mall && query.mall.length > 0) {
    const MallModel = require("../../models/malls.model");
    const mall = await MallModel.findById(query.mall[0]).lean();
    if (mall) locationName = mall.name.toUpperCase();
  } else if (query.site) {
    const SiteModel = require("../../models/sites.model");
    const site = await SiteModel.findById(query.site).lean();
    if (site) locationName = site.name.toUpperCase();
  }

  const monthYear = startDate.format("MMMM-YYYY").toUpperCase();

  // Generate all dates in range
  const dates = [];
  const current = startDate.clone();
  while (current.isSameOrBefore(endDate)) {
    dates.push(current.clone());
    current.add(1, "day");
  }

  // Group attendance data by employee
  const employeeMap = new Map();

  filteredData.forEach((record) => {
    const empId =
      record.worker?._id?.toString() || record.staff?._id?.toString();
    const empName = record.worker?.name || record.staff?.name || "Unknown";
    const empCode =
      record.worker?.employeeCode || record.staff?.employeeCode || "";
    const empMobile = record.worker?.mobile || record.staff?.mobile || "";

    if (!employeeMap.has(empId)) {
      employeeMap.set(empId, {
        name: empName,
        code: empCode,
        mobile: empMobile,
        attendance: {},
      });
    }

    const dateKey = moment(record.date).format("YYYY-MM-DD");
    const employeeEntry = employeeMap.get(empId);

    // Keep first record only because data is already sorted newest first.
    if (employeeEntry.attendance[dateKey]) {
      return;
    }

    employeeEntry.attendance[dateKey] = {
      present: record.present,
      type: record.type,
      notes: record.notes,
      statusCode:
        normalizeStatusCode(record.type) || normalizeStatusCode(record.notes),
    };
  });

  // Header row with location and month-year
  const totalCols = 4 + dates.length + 4; // SL.NO, NAME, CODE, MOBILE + dates + ABSENTS, PRESENT, TOTAL, ATTENDANCE%
  const companyHeading = selectedCompanyName
    ? ` - ${selectedCompanyName.toUpperCase()}`
    : "";
  worksheet.addRow([`${locationName} ${monthYear}${companyHeading}`]);
  worksheet.mergeCells(1, 1, 1, totalCols);
  worksheet.getCell(1, 1).font = {
    bold: true,
    size: 14,
    color: { argb: "FFFFFFFF" },
  };
  worksheet.getCell(1, 1).alignment = {
    vertical: "middle",
    horizontal: "center",
  };
  worksheet.getCell(1, 1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF4472C4" },
  };

  // Column headers row 1 (Date numbers)
  const headerRow1 = [
    "SL.NO",
    "NAME OF THE EMPLOYEE",
    "EMPLOYEE CODE",
    "MOBILE NUMBER",
  ];
  dates.forEach((date) => {
    headerRow1.push(date.format("D"));
  });
  headerRow1.push("ABSENTS", "PRESENT DAYS", "TOTAL DAYS", "ATTENDANCE %");
  worksheet.addRow(headerRow1);

  // Column headers row 2 (Day names)
  const headerRow2 = ["", "", "", ""];
  dates.forEach((date) => {
    headerRow2.push(date.format("dd").toUpperCase());
  });
  headerRow2.push("", "", "", "");
  worksheet.addRow(headerRow2);

  // Style header rows
  [2, 3].forEach((rowNum) => {
    const row = worksheet.getRow(rowNum);
    row.font = { bold: true, size: 10 };
    row.alignment = { vertical: "middle", horizontal: "center" };
    row.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFD9E1F2" },
    };
  });

  // Add employee rows
  let slNo = 1;
  const dailyStatusTotals = Object.fromEntries(
    EXPORT_COUNT_CODES.map((code) => [code, new Array(dates.length).fill(0)]),
  );

  employeeMap.forEach((employee, empId) => {
    const rowData = [slNo++, employee.name, employee.code, employee.mobile];

    let absents = 0;
    let presents = 0;
    let totalDays = 0;

    dates.forEach((date, index) => {
      const dateKey = date.format("YYYY-MM-DD");
      const dayName = date.format("dd").toUpperCase();
      const attendance = employee.attendance[dateKey];

      let cellValue = "";

      if (attendance) {
        const resolvedCode = attendance.statusCode;

        // If a known status code is selected (from dropdown/type), prefer it over P.
        if (resolvedCode) {
          cellValue = resolvedCode;

          if (resolvedCode === "WO") {
            // Week Off should not count as absent/working day.
          } else {
            absents++;
            totalDays++;
          }
        } else if (attendance.present) {
          cellValue = "P";
          presents++;
          dailyTotals[index]++;
          totalDays++;
        } else {
          // Use type field first (for attendance codes like WO, AB, ND, SL),
          // then fall back to "AB" if no type is set
          cellValue = attendance.type?.toUpperCase() || "AB";
          if (cellValue !== "WO") {
            absents++;
            totalDays++;
          }
        }
      } else {
        // No attendance record - check if it's a regular OFF day (Friday or Sunday)
        if (dayName === "FR" || dayName === "SU") {
          cellValue = "OFF";
          // OFF days don't count toward working days
        } else {
          // Working day with no record - count as working day but absent
          totalDays++;
        }
      }

      if (dailyStatusTotals[cellValue]) {
        dailyStatusTotals[cellValue][index] += 1;
      }

      rowData.push(cellValue);
    });

    const attendancePercentage =
      totalDays > 0 ? Math.round((presents / totalDays) * 100) : 0;

    rowData.push(absents, presents, totalDays, `${attendancePercentage}%`);

    const row = worksheet.addRow(rowData);

    // Style data cells
    row.eachCell((cell, colNumber) => {
      cell.border = {
        top: { style: "thin" },
        left: { style: "thin" },
        bottom: { style: "thin" },
        right: { style: "thin" },
      };
      cell.alignment = { vertical: "middle", horizontal: "center" };

      // Color code cells
      if (colNumber > 4 && colNumber <= 4 + dates.length) {
        const value = cell.value;
        if (value === "OFF") {
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FFFFC7CE" },
          };
        } else if (value === "WO") {
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FFD9F2E6" },
          };
        } else if (value === "P") {
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FFC6EFCE" },
          };
        }
      }

      // Color attendance percentage
      if (colNumber === 4 + dates.length + 4) {
        if (attendancePercentage < 70) {
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FFFFC7CE" },
          };
        }
      }
    });
  });

  // Add date-wise totals rows for each status code
  const countRowConfigs = [
    { code: "P", label: "COUNT - PRESENT (P)", color: "FF1E7E34" },
    { code: "AB", label: "COUNT - ABSENT (AB)", color: "FFC62828" },
    { code: "ND", label: "COUNT - NO DUTY (ND)", color: "FF455A64" },
    { code: "SL", label: "COUNT - SICK LEAVE (SL)", color: "FFEF6C00" },
    { code: "WO", label: "COUNT - WEEK OFF (WO)", color: "FF2E7D32" },
    { code: "EL", label: "COUNT - EMERGENCY LEAVE (EL)", color: "FF9C6B00" },
    { code: "PL", label: "COUNT - PAID LEAVE (PL)", color: "FF1565C0" },
    { code: "UL", label: "COUNT - UNPAID LEAVE (UL)", color: "FF6A1B9A" },
    { code: "OFF", label: "COUNT - OFF", color: "FF6D4C41" },
  ];

  countRowConfigs.forEach(({ code, label, color }) => {
    const totalsRow = ["", label, "", ""];
    dates.forEach((_, idx) => {
      totalsRow.push(dailyStatusTotals[code][idx] || 0);
    });
    totalsRow.push("", "", "", "");

    const addedRow = worksheet.addRow(totalsRow);
    addedRow.font = { bold: true, color: { argb: color } };
    addedRow.alignment = { vertical: "middle", horizontal: "center" };
  });

  // Set column widths
  worksheet.getColumn(1).width = 8; // SL.NO
  worksheet.getColumn(2).width = 25; // NAME
  worksheet.getColumn(3).width = 15; // CODE
  worksheet.getColumn(4).width = 15; // MOBILE

  // Day columns
  for (let i = 5; i <= 4 + dates.length; i++) {
    worksheet.getColumn(i).width = 4;
  }

  // Summary columns
  worksheet.getColumn(5 + dates.length).width = 10; // ABSENTS
  worksheet.getColumn(6 + dates.length).width = 12; // PRESENT
  worksheet.getColumn(7 + dates.length).width = 12; // TOTAL
  worksheet.getColumn(8 + dates.length).width = 12; // ATTENDANCE%

  return workbook;
};
