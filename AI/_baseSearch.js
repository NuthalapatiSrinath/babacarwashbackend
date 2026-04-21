"use strict";

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 200;
const DEFAULT_PAGE = 1;

const isPlainObject = (value) =>
  Object.prototype.toString.call(value) === "[object Object]";

const escapeRegExp = (value = "") =>
  String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const normalizeLimit = (limit) => {
  const parsed = Number(limit);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_LIMIT;
  }

  return Math.min(Math.floor(parsed), MAX_LIMIT);
};

const normalizePage = (page) => {
  const parsed = Number(page);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_PAGE;
  }

  return Math.floor(parsed);
};

const getSchemaPathInstance = (model, field = "") => {
  if (!model || !model.schema || typeof model.schema.path !== "function") {
    return "";
  }

  const schemaPath = model.schema.path(String(field || "").trim());
  if (!schemaPath || !schemaPath.instance) {
    return "";
  }

  return String(schemaPath.instance).toLowerCase();
};

const isRegexSearchableField = (model, field = "") => {
  const instance = getSchemaPathInstance(model, field);
  if (!instance) {
    // Unknown paths (strict:false or dynamic fields) are treated as text-searchable.
    return true;
  }

  return instance === "string" || instance === "mixed";
};

const sanitizeObject = (input) => {
  if (Array.isArray(input)) {
    return input.map((item) => sanitizeObject(item));
  }

  if (!isPlainObject(input)) {
    return input;
  }

  const safe = {};
  for (const [key, value] of Object.entries(input)) {
    if (key.startsWith("$")) {
      continue;
    }

    safe[key] = sanitizeObject(value);
  }

  return safe;
};

const normalizeSort = (sort, fallback = { createdAt: -1 }) => {
  if (!isPlainObject(sort)) {
    return fallback;
  }

  const normalized = {};
  for (const [key, value] of Object.entries(sort)) {
    if (key.startsWith("$")) {
      continue;
    }

    const direction = Number(value);
    if (direction === 1 || direction === -1) {
      normalized[key] = direction;
    }
  }

  return Object.keys(normalized).length ? normalized : fallback;
};

const buildKeywordClause = (keyword, fields = [], model = null) => {
  const normalizedKeyword = String(keyword || "").trim();
  if (!normalizedKeyword || !Array.isArray(fields) || !fields.length) {
    return {};
  }

  const safeRegex = new RegExp(escapeRegExp(normalizedKeyword), "i");
  const clauses = fields
    .map((field) => String(field || "").trim())
    .filter(Boolean)
    .filter((field) => isRegexSearchableField(model, field))
    .map((field) => ({ [field]: safeRegex }));

  if (!clauses.length) {
    return {};
  }

  return { $or: clauses };
};

const mergeClauses = (...clauses) => {
  const nonEmpty = clauses.filter(
    (clause) => isPlainObject(clause) && Object.keys(clause).length > 0,
  );

  if (!nonEmpty.length) {
    return {};
  }

  if (nonEmpty.length === 1) {
    return nonEmpty[0];
  }

  return { $and: nonEmpty };
};

const runModelSearch = async ({
  model,
  keyword = "",
  fields = [],
  filters = {},
  baseFilters = {},
  projection = null,
  limit = DEFAULT_LIMIT,
  page = DEFAULT_PAGE,
  sort = { createdAt: -1 },
} = {}) => {
  if (!model || typeof model.find !== "function") {
    throw new Error("A valid mongoose model is required");
  }

  const safeFilters = sanitizeObject(filters);
  const safeBaseFilters = sanitizeObject(baseFilters);
  const safeSort = normalizeSort(sort);
  const safeLimit = normalizeLimit(limit);
  const safePage = normalizePage(page);

  const query = mergeClauses(
    safeBaseFilters,
    safeFilters,
    buildKeywordClause(keyword, fields, model),
  );

  const skip = (safePage - 1) * safeLimit;

  const [total, data] = await Promise.all([
    model.countDocuments(query),
    model
      .find(query, projection)
      .sort(safeSort)
      .skip(skip)
      .limit(safeLimit)
      .lean(),
  ]);

  const totalPages = total > 0 ? Math.ceil(total / safeLimit) : 1;

  return {
    total,
    data,
    pagination: {
      page: safePage,
      limit: safeLimit,
      totalPages,
      hasNextPage: safePage < totalPages,
      hasPrevPage: safePage > 1,
    },
  };
};

module.exports = {
  DEFAULT_LIMIT,
  MAX_LIMIT,
  normalizeLimit,
  normalizePage,
  runModelSearch,
};
