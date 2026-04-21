"use strict";

const { runModelSearch } = require("./_baseSearch");

const DOMAIN = "jobs";
const SEARCHABLE_FIELDS = [
  "status",
  "registration_no",
  "parking_no",
  "customer",
  "worker",
  "location",
  "building",
  "rejectionReason",
];

const searchJobs = async ({
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
  searchJobs,
};
