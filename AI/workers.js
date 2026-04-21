"use strict";

const { runModelSearch } = require("./_baseSearch");

const DOMAIN = "workers";
const SEARCHABLE_FIELDS = [
  "name",
  "mobile",
  "employeeCode",
  "email",
  "service_type",
  "role",
];

const searchWorkers = async ({
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
  searchWorkers,
};
