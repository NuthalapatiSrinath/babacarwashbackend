const moment = require("moment");

const helper = module.exports;

helper.paginationData = (queryParams = {}) => {
  const page = queryParams.pageNo ? Number(queryParams.pageNo) : 0;
  const size = queryParams.pageSize ? Number(queryParams.pageSize) || 10 : 0;
  const skip = page * size;
  return { skip, limit: size };
};

helper.RandomNumber = (length) => {
  return Math.floor(
    Math.pow(10, length - 1) +
      Math.random() * (Math.pow(10, length) - Math.pow(10, length - 1) - 1),
  );
};

helper.JSONFlatten = (data) => {
  const result = {};
  function recurse(cur, prop) {
    if (Object(cur) !== cur) {
      result[prop] = cur;
    } else if (Array.isArray(cur)) {
      for (var i = 0, l = cur.length; i < l; i++)
        recurse(cur[i], prop + "." + i);
      if (l == 0) result[prop] = [];
    } else {
      var isEmpty = true;
      for (var p in cur) {
        isEmpty = false;
        recurse(cur[p], prop ? prop + "." + p : p);
      }
      if (isEmpty && prop) result[prop] = {};
    }
  }
  recurse(data, "");
  return result;
};

helper.getDayNumber = (day) => {
  const dayLower = day.toLowerCase();

  // Map both short and full day names to day numbers (0=Sunday, 6=Saturday)
  const dayMap = {
    sun: 0,
    sunday: 0,
    mon: 1,
    monday: 1,
    tue: 2,
    tuesday: 2,
    wed: 3,
    wednesday: 3,
    thu: 4,
    thursday: 4,
    fri: 5,
    friday: 5,
    sat: 6,
    saturday: 6,
  };

  return dayMap[dayLower] !== undefined ? dayMap[dayLower] : -1;
};

helper.detectDateFormat = (dateString) => {
  let dateFormats = [
    "YYYY-MM-DD",
    "MM-DD-YYYY",
    "DD-MM-YYYY",
    "YYYY/MM/DD",
    "MM/DD/YYYY",
    "DD/MM/YYY",
  ];
  let detectedFormat = null;
  for (const format of dateFormats) {
    const parsedDate = moment(dateString, format, true);
    if (parsedDate.isValid()) {
      detectedFormat = format;
      break;
    }
  }
  return detectedFormat || "YYYY-MM-DD";
};
