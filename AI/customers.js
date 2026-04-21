"use strict";

const { runModelSearch } = require("./_baseSearch");

const DOMAIN = "customers";
const SEARCHABLE_FIELDS = [
  "firstName",
  "lastName",
  "mobile",
  "flat_no",
  "notes",
  "vehicles.registration_no",
  "vehicles.parking_no",
  "vehicles.worker",
];

const searchCustomers = async ({
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
    projection: {
      password: 0,
      hPassword: 0,
    },
    limit,
    page,
    sort: sort || { createdAt: -1 },
  });
};

module.exports = {
  DOMAIN,
  SEARCHABLE_FIELDS,
  searchCustomers,
};
