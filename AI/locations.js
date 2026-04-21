"use strict";

const { runModelSearch } = require("./_baseSearch");

const DOMAIN = "locations";
const SEARCHABLE_FIELDS = ["address"];

const searchLocations = async ({
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
  searchLocations,
};
