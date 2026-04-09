const moment = require("moment");
const OTPModel = require("../../models/otps.model");
const CustomersModel = require("../../models/customers.model");
const AuthHelper = require("./auth.helper");
const smsService = require("./sms.service");
const CounterService = require("../../../utils/counters");

const service = module.exports;

/**
 * Country code prefixes for flexible phone number matching
 */
const COUNTRY_CODES = [
  "971",
  "91",
  "966",
  "974",
  "965",
  "973",
  "968",
  "92",
  "880",
  "63",
];
const DEFAULT_COUNTRY_CODE = "971";

// Testing mode controls SMS sending and OTP visibility in API response.
// OTP validation is always enforced during verifyOTP.
const OTP_TEST_MODE = process.env.OTP_TEST_MODE !== "false";

const uniq = (arr) => [...new Set(arr.filter(Boolean))];

const toSafeCustomerObject = (customer) => {
  if (!customer) return null;

  const customerData =
    typeof customer.toObject === "function"
      ? customer.toObject()
      : { ...customer };

  delete customerData.hPassword;
  delete customerData.password;

  return customerData;
};

const isDeletedCustomer = (customer) => {
  const value = customer?.isDeleted;
  if (typeof value === "string") {
    return value.toLowerCase() === "true";
  }
  return value === true;
};

const isInactiveCustomer = (customer) => {
  const status = Number(customer?.status);
  return status === 0 || status === 2;
};

service.normalizeMobile = (mobile) =>
  (mobile || "").toString().replace(/[\s+\-]/g, "");

service.canonicalizeMobile = (mobile) => {
  let normalized = service.normalizeMobile(mobile);

  // Convert international 00-prefix to plain country prefix (e.g. 00971... -> 971...)
  if (normalized.startsWith("00")) {
    normalized = normalized.slice(2);
  }

  // UAE local formats -> UAE international format
  if (/^05\d{8}$/.test(normalized)) {
    // 05XXXXXXXX -> 9715XXXXXXXX
    return `${DEFAULT_COUNTRY_CODE}${normalized.slice(1)}`;
  }

  if (/^5\d{8}$/.test(normalized)) {
    // 5XXXXXXXX -> 9715XXXXXXXX
    return `${DEFAULT_COUNTRY_CODE}${normalized}`;
  }

  // Legacy auto-generated UAE numbers with one extra zero: 2000000xxx -> 971200000xxx
  if (/^2000000\d{3}$/.test(normalized)) {
    return `${DEFAULT_COUNTRY_CODE}200000${normalized.slice(7)}`;
  }

  if (/^9712000000\d{3}$/.test(normalized)) {
    return `${DEFAULT_COUNTRY_CODE}200000${normalized.slice(10)}`;
  }

  // New shorter auto-generated local format: 200000xxx -> 971200000xxx
  if (/^2\d{8}$/.test(normalized)) {
    return `${DEFAULT_COUNTRY_CODE}${normalized}`;
  }

  if (/^9712\d{8}$/.test(normalized)) {
    return normalized;
  }

  // Backward-compatible handling for 10-digit local values starting with 2.
  // Keep all local digits by prefixing UAE code, do not drop the leading 2.
  if (/^2\d{9}$/.test(normalized)) {
    return `${DEFAULT_COUNTRY_CODE}${normalized}`;
  }

  if (/^9712\d{9}$/.test(normalized)) {
    return normalized;
  }

  // Generic fallback for local-style numbers: default to UAE country code.
  if (/^0\d{8,10}$/.test(normalized)) {
    return `${DEFAULT_COUNTRY_CODE}${normalized.replace(/^0+/, "")}`;
  }

  if (
    /^\d{8,10}$/.test(normalized) &&
    !COUNTRY_CODES.some((c) => normalized.startsWith(c))
  ) {
    return `${DEFAULT_COUNTRY_CODE}${normalized}`;
  }

  for (const code of COUNTRY_CODES) {
    if (normalized.startsWith(`${code}0`)) {
      // e.g. 9710525... -> 971525...
      return `${code}${normalized.slice(code.length + 1)}`;
    }
  }

  return normalized;
};

service.buildMobileCandidates = (mobile) => {
  const normalized = service.normalizeMobile(mobile);
  const canonical = service.canonicalizeMobile(normalized);

  const candidates = [normalized, canonical];

  for (const seed of [normalized, canonical]) {
    if (!seed) continue;

    const noLeadingZero = seed.replace(/^0+/, "");
    const withLeadingZero = noLeadingZero ? `0${noLeadingZero}` : "";

    candidates.push(noLeadingZero, withLeadingZero);

    for (const code of COUNTRY_CODES) {
      if (seed.startsWith(code)) {
        const local = seed.slice(code.length);
        const localNoZero = local.replace(/^0+/, "");
        const localWithZero = localNoZero ? `0${localNoZero}` : "";

        candidates.push(local, localNoZero, localWithZero);
      } else if (noLeadingZero) {
        // Build international variants from local input.
        candidates.push(`${code}${noLeadingZero}`, `${code}0${noLeadingZero}`);
      }
    }
  }

  return uniq(candidates);
};

const customerScore = (customer) => {
  const vehicles = Array.isArray(customer?.vehicles)
    ? customer.vehicles.length
    : 0;
  const hasName = Boolean(
    (customer?.firstName || "").toString().trim() ||
    (customer?.lastName || "").toString().trim(),
  );
  const hasProfileAddress = Boolean(
    (customer?.location || "").toString().trim() ||
    (customer?.building || "").toString().trim() ||
    (customer?.flat_no || "").toString().trim(),
  );

  // Prefer richer records to avoid selecting newly auto-created empty customer rows.
  return vehicles * 100 + (hasName ? 10 : 0) + (hasProfileAddress ? 5 : 0);
};

const pickBestCustomer = (customers) => {
  if (!Array.isArray(customers) || customers.length === 0) return null;

  const active = customers.filter(
    (c) => !isDeletedCustomer(c) && !isInactiveCustomer(c),
  );
  const nonDeleted = customers.filter((c) => !isDeletedCustomer(c));
  const pool = active.length ? active : nonDeleted;

  if (!pool.length) return null;

  return pool.sort((a, b) => {
    const scoreDiff = customerScore(b) - customerScore(a);
    if (scoreDiff !== 0) return scoreDiff;

    // If scores tie, prefer oldest created record for stability.
    const aTime = new Date(a.createdAt || 0).getTime();
    const bTime = new Date(b.createdAt || 0).getTime();
    return aTime - bTime;
  })[0];
};

service.syncCustomerMobileWithCanonical = async (customer, inputMobile) => {
  if (!customer?._id) return customer;

  const canonical = service.canonicalizeMobile(inputMobile);
  const current = service.canonicalizeMobile(customer.mobile || "");

  if (!canonical || canonical === current) return customer;

  const conflict = await CustomersModel.findOne({
    _id: { $ne: customer._id },
    mobile: canonical,
  })
    .select("_id")
    .lean();

  if (conflict) return customer;

  await CustomersModel.updateOne(
    { _id: customer._id },
    { $set: { mobile: canonical } },
  );

  return {
    ...customer,
    mobile: canonical,
  };
};

/**
 * Find customer by mobile number with flexible matching
 * Tries: exact match, without country code, with different country codes
 */
service.findCustomerByMobile = async (mobile) => {
  const candidates = service.buildMobileCandidates(mobile);

  const matchedCustomers = await CustomersModel.find({
    mobile: { $in: candidates },
  }).lean();

  let customer = pickBestCustomer(matchedCustomers);
  if (customer) {
    return {
      customer,
      matchedMobile: customer.mobile || service.canonicalizeMobile(mobile),
    };
  }

  // Final fallback: try matching by last digits for legacy inconsistent records.
  const canonical = service.canonicalizeMobile(mobile);
  if (canonical.length > 8) {
    const suffixes = uniq([
      canonical.slice(-9),
      canonical.slice(-10),
      canonical.slice(-11),
    ]);

    const regexMatches = await CustomersModel.find({
      $or: suffixes.map((s) => ({ mobile: { $regex: `${s}$` } })),
    }).lean();

    customer = pickBestCustomer(regexMatches);
    if (customer) {
      return {
        customer,
        matchedMobile: customer.mobile || canonical,
      };
    }
  }

  return {
    customer: null,
    matchedMobile: service.canonicalizeMobile(mobile),
  };
};

/**
 * Generate a random 4-digit OTP
 */
service.generateOTP = () => {
  return Math.floor(1000 + Math.random() * 9000);
};

service.createCustomerForMobile = async (mobile) => {
  const normalizedMobile = service.canonicalizeMobile(mobile);
  const id = await CounterService.id("customers");

  const customer = await new CustomersModel({
    id,
    mobile: normalizedMobile,
    firstName: "",
    lastName: "",
    status: 1,
    isDeleted: false,
    createdSource: "Customer OTP Auto Signup",
  }).save();

  return customer;
};

/**
 * Send OTP to customer mobile
 * Supports international format with flexible matching
 */
service.sendOTP = async (mobile) => {
  try {
    // Find customer with flexible matching
    let { customer } = await service.findCustomerByMobile(mobile);
    if (!customer) {
      customer = await service.createCustomerForMobile(mobile);
    } else {
      customer = await service.syncCustomerMobileWithCanonical(
        customer,
        mobile,
      );
    }

    // Check if customer is active
    if (isDeletedCustomer(customer) || isInactiveCustomer(customer)) {
      throw "ACCOUNT_DEACTIVATED";
    }

    // Generate OTP
    const otp = service.generateOTP();
    const expiresAt = moment().add(5, "minutes").toDate();

    // Save OTP under canonical number to avoid format mismatch during verify.
    const normalizedMobile = service.canonicalizeMobile(mobile);
    await new OTPModel({
      mobile: normalizedMobile,
      otp,
      expiresAt,
      verified: false,
    }).save();

    // In test mode, skip external SMS provider.
    if (!OTP_TEST_MODE) {
      try {
        await smsService.sendOTP(normalizedMobile, otp);
      } catch (smsError) {
        console.error("SMS sending error:", smsError);
        // Continue even if SMS fails - OTP is still valid
      }
    }

    return {
      message: "OTP sent successfully",
      otp,
      testMode: OTP_TEST_MODE,
    };
  } catch (error) {
    throw error;
  }
};

/**
 * Verify OTP and return auth token
 * Supports international format with flexible matching
 */
service.verifyOTP = async (mobile, otp) => {
  try {
    // Canonicalize mobile number
    const normalizedMobile = service.canonicalizeMobile(mobile);

    const otpText = String(otp || "").trim();
    const isFourDigit = /^\d{4}$/.test(otpText);

    if (!isFourDigit) {
      throw "INVALID_OTP";
    }

    // Always validate OTP against persisted records.
    // Test mode only controls SMS delivery and OTP visibility in response.
    const otpMobileCandidates = service.buildMobileCandidates(normalizedMobile);
    const otpRecord = await OTPModel.findOne({
      mobile: { $in: otpMobileCandidates },
      otp: parseInt(otpText, 10),
      verified: false,
    }).sort({ createdAt: -1 });

    if (!otpRecord) {
      throw "INVALID_OTP";
    }

    // Check if OTP expired
    if (moment().isAfter(otpRecord.expiresAt)) {
      throw "OTP_EXPIRED";
    }

    // Mark OTP as verified
    otpRecord.verified = true;
    await otpRecord.save();

    // Get customer data using flexible matching
    let { customer } = await service.findCustomerByMobile(normalizedMobile);
    if (!customer) {
      customer = await service.createCustomerForMobile(normalizedMobile);
    } else {
      customer = await service.syncCustomerMobileWithCanonical(
        customer,
        normalizedMobile,
      );
    }

    // Check if customer is active
    if (isDeletedCustomer(customer) || isInactiveCustomer(customer)) {
      throw "ACCOUNT_DEACTIVATED";
    }

    // Generate auth token
    const token = AuthHelper.createToken({
      _id: customer._id,
      pwdChangedAt: AuthHelper.getPasswordVersion(customer.passwordChangedAt),
    });

    const customerData = toSafeCustomerObject(customer);

    return { token, customer: customerData, testMode: OTP_TEST_MODE };
  } catch (error) {
    throw error;
  }
};

/**
 * Login with password "00" for existing customers
 * OR verify actual password if set
 * Supports international format with flexible matching
 */
service.loginWithPassword = async (mobile, password) => {
  try {
    // Find customer with flexible matching
    let { customer } = await service.findCustomerByMobile(mobile);
    if (!customer) {
      throw "UNAUTHORIZED";
    }

    customer = await service.syncCustomerMobileWithCanonical(customer, mobile);

    // Check if customer is active
    if (isDeletedCustomer(customer) || isInactiveCustomer(customer)) {
      throw "ACCOUNT_DEACTIVATED";
    }

    // Allow password "00" for all customers as default
    // OR verify actual hashed password if customer has one
    const isDefaultPassword = password === "00";
    const isValidPassword =
      customer.hPassword &&
      AuthHelper.verifyPasswordHash(password, customer.hPassword);

    if (!isDefaultPassword && !isValidPassword) {
      throw "UNAUTHORIZED";
    }

    // Generate auth token
    const token = AuthHelper.createToken({
      _id: customer._id,
      pwdChangedAt: AuthHelper.getPasswordVersion(customer.passwordChangedAt),
    });

    const customerData = toSafeCustomerObject(customer);

    return { token, ...customerData };
  } catch (error) {
    throw error;
  }
};
