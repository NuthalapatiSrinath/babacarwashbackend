const moment = require("moment")

const helper = module.exports

helper.paginationData = (queryParams = {}) => {
    const page = queryParams.pageNo ? Number(queryParams.pageNo) : 0
    const size = queryParams.pageSize ? Number(queryParams.pageSize) || 10 : 0
    const skip = page * size
    return { skip, limit: size }
}

helper.RandomNumber = (length) => {
    return Math.floor(Math.pow(10, length - 1) + Math.random() * (Math.pow(10, length) - Math.pow(10, length - 1) - 1));
}

helper.JSONFlatten = (data) => {
    const result = {};
    function recurse(cur, prop) {
        if (Object(cur) !== cur) {
            result[prop] = cur;
        } else if (Array.isArray(cur)) {
            for (var i = 0, l = cur.length; i < l; i++)
                recurse(cur[i], prop + "." + i);
            if (l == 0)
                result[prop] = [];
        } else {
            var isEmpty = true;
            for (var p in cur) {
                isEmpty = false;
                recurse(cur[p], prop ? prop + "." + p : p);
            }
            if (isEmpty && prop)
                result[prop] = {};
        }
    }
    recurse(data, "");
    return result;
}

helper.getDayNumber = (day) => {
    const daysOfWeek = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    return daysOfWeek.indexOf(day.toLowerCase())
}

helper.detectDateFormat = (dateString) => {
    let dateFormats = [
        'YYYY-MM-DD',
        'MM-DD-YYYY',
        'DD-MM-YYYY',
        'YYYY/MM/DD',
        'MM/DD/YYYY',
        'DD/MM/YYY',

    ];
    let detectedFormat = null;
    for (const format of dateFormats) {
        const parsedDate = moment(dateString, format, true);
        if (parsedDate.isValid()) {
            detectedFormat = format;
            break
        }
    }
    return detectedFormat || 'YYYY-MM-DD';
}