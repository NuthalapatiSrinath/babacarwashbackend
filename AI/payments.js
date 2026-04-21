"use strict";

const { runModelSearch } = require("./_baseSearch");

const DOMAIN = "payments";
const SEARCHABLE_FIELDS = [
  "receipt_no",
  "notes",
  "status",
  "settled",
  "payment_mode",
  "service_type",
  "customer",
  "worker",
  "vehicle.registration_no",
  "vehicle.parking_no",
];

const searchPayments = async ({
  model,
  keyword,
  filters,
  limit,
  page,
  sort,
} = {}) => {
  return runModelSearch({
    model,
    keyword,
    fields: SEARCHABLE_FIELDS,
    filters,
    baseFilters: { isDeleted: false },
    limit,
    page,
    sort: sort || { createdAt: -1 },
  });
};

module.exports = {
  DOMAIN,
  SEARCHABLE_FIELDS,
  searchPayments,
};
