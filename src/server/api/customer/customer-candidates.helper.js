const CustomersModel = require("../models/customers.model");
const OtpService = require("./auth/otp.service");

const uniq = (arr) => [...new Set(arr.filter(Boolean))];

const addCustomerId = (set, value) => {
  const text = String(value || "").trim();
  if (!text) return;
  set.add(text);
};

const buildMobileCandidates = (mobile) => {
  if (!mobile) return [];

  if (typeof OtpService?.buildMobileCandidates === "function") {
    return uniq(OtpService.buildMobileCandidates(mobile));
  }

  const normalized = String(mobile).replace(/[\s+\-]/g, "");
  return uniq([String(mobile), normalized]);
};

const getRelatedCustomerCandidates = async (userInfo = {}) => {
  const candidateSet = new Set();
  addCustomerId(candidateSet, userInfo._id);
  addCustomerId(candidateSet, userInfo._id?.toString?.());

  const mobileCandidates = buildMobileCandidates(userInfo.mobile);
  if (mobileCandidates.length) {
    const customers = await CustomersModel.find(
      { mobile: { $in: mobileCandidates } },
      { _id: 1 },
    ).lean();

    for (const customer of customers) {
      addCustomerId(candidateSet, customer?._id);
      addCustomerId(candidateSet, customer?._id?.toString?.());
    }
  }

  return [...candidateSet];
};

module.exports = {
  getRelatedCustomerCandidates,
};
