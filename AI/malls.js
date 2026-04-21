"use strict";

const { runModelSearch } = require("./_baseSearch");

const DOMAIN = "malls";
const SEARCHABLE_FIELDS = ["name"];

const searchMalls = async ({
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
  searchMalls,
};