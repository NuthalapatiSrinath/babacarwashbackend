const errorHelper = require("./error.helper"); // ✅ Added .helper
const STATUS_CODES = {
  error: {
    400: "Bad Request",
    401: "Unauthorized",
    404: "Not Found",
    500: "Internal Server Error",
  },
  success: {
    200: "Success",
  },
};

const successResponse = (res, data = {}) => {
  const code = data.statusCode ? data.statusCode : 200;
  return res.status(code).json({
    statusCode: code,
    message: STATUS_CODES[code],
    data,
  });
};

const errorResonse = (res, type = {}) => {
  const data = ErrorMessages(type);
  const { statusCode, error, message } = data;
  const code = statusCode || 500;
  return res.status(code).json({
    statusCode: code,
    error: STATUS_CODES[code],
    message: error ? error : message ? message : "",
  });
};

module.exports = { successResponse, errorResonse };
