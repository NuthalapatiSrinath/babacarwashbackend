"use strict";

const mongoose = require("mongoose");
const aiScripts = require("../../../../../AI");
const PaymentsModel = require("../../models/payments.model");
const CustomersModel = require("../../models/customers.model");
const JobsModel = require("../../models/jobs.model");
const OneWashModel = require("../../models/onewash.model");
const WorkersModel = require("../../models/workers.model");
const StaffModel = require("../../models/staff.model");
const SitesModel = require("../../models/sites.model");
const BuildingsModel = require("../../models/buildings.model");
const MallsModel = require("../../models/malls.model");
const LocationsModel = require("../locations/locations.model");
const paymentsListService = require("../payments/payments.service");
const onewashListService = require("../onewash/onewash.service");
const {
  analyzePromptWithGemini,
  isGeminiConfigured,
} = require("./gemini.intent");

const service = module.exports;

const isPlainObject = (value) =>
  Object.prototype.toString.call(value) === "[object Object]";

const normalizeDomain = (value = "") => String(value).trim().toLowerCase();

const DEFAULT_DOMAIN_LIMIT = 25;
const DEFAULT_PROMPT_LIMIT = 8;
const PROMPT_MAX_LIMIT = 20;
const PERSON_SUGGESTION_LIMIT = 8;
const PAYMENT_RESULT_LIMIT = 1000;
const GEMINI_INTENT_MIN_CONFIDENCE = 0.5;

const PAYMENT_INTENT_PATTERN =
  /(payment|payments|apyment|apyments|due|dues|receipt|rcp|settlement|collection|onewash|one wash|residence|vehicle|vehilce|parking|plate|invoice|bill)/i;

const PERSON_SEARCH_DOMAINS = ["customers", "workers", "staff"];

const PERIOD_OPTIONS = [
  { key: "current_month", label: "This Month" },
  { key: "last_25_days", label: "Last 25 Days" },
  { key: "last_30_days", label: "Last 30 Days" },
  { key: "previous_month", label: "Last Month" },
];

const PROMPT_PRIORITY_DOMAINS = ["customers", "workers", "staff"];
const PROMPT_FALLBACK_DOMAINS = [
  "customers",
  "workers",
  "staff",
  "payments",
  "jobs",
  "buildings",
  "malls",
  "locations",
  "sites",
];

const DOMAIN_HINTS = {
  customers: ["customer", "customers", "client", "vehicle", "flat"],
  workers: ["worker", "workers", "supervisor", "washman"],
  staff: ["staff", "employee", "office staff", "admin staff"],
  payments: [
    "payment",
    "payments",
    "receipt",
    "rcp",
    "due",
    "balance",
    "vehicle",
    "vehilce",
    "parking",
    "invoice",
    "bill",
  ],
  jobs: ["job", "jobs", "task", "assignment", "wash"],
  buildings: [
    "building",
    "buildings",
    "builing",
    "bulding",
    "buildinging",
    "tower",
    "block",
  ],
  malls: ["mall", "malls", "shopping mall"],
  locations: ["location", "locations", "address", "area"],
  sites: ["site", "sites"],
};

const PAYMENT_COLUMN_KEYWORDS = new Set([
  "payment",
  "payments",
  "apyment",
  "apyments",
  "receipt",
  "receipts",
  "rcp",
  "vehicle",
  "vehilce",
  "parking",
  "plate",
  "invoice",
  "bill",
  "pending",
  "completed",
  "cancelled",
  "settled",
  "cash",
  "card",
  "bank",
  "transfer",
  "residence",
  "onewash",
  "one",
  "wash",
  "outside",
  "inside",
  "total",
  "due",
  "dues",
  "balance",
  "status",
  "mode",
  "paid",
  "unpaid",
]);

const STOP_WORDS = new Set([
  "account",
  "a",
  "aed",
  "all",
  "an",
  "and",
  "anyone",
  "any",
  "are",
  "ask",
  "at",
  "above",
  "below",
  "can",
  "count",
  "change",
  "changes",
  "by",
  "current",
  "days",
  "dirham",
  "dirhams",
  "dues",
  "details",
  "detail",
  "do",
  "each",
  "entire",
  "every",
  "everyone",
  "for",
  "fetch",
  "find",
  "from",
  "greater",
  "get",
  "give",
  "hello",
  "hey",
  "hi",
  "how",
  "his",
  "her",
  "info",
  "information",
  "in",
  "is",
  "least",
  "less",
  "last",
  "list",
  "man",
  "me",
  "more",
  "most",
  "bro",
  "buddy",
  "dude",
  "mobile",
  "month",
  "months",
  "mall",
  "malls",
  "name",
  "names",
  "need",
  "next",
  "no",
  "now",
  "number",
  "of",
  "on",
  "or",
  "our",
  "out",
  "over",
  "past",
  "place",
  "payment",
  "payments",
  "apyment",
  "apyments",
  "person",
  "people",
  "pls",
  "please",
  "phone",
  "previous",
  "records",
  "record",
  "regarding",
  "summary",
  "send",
  "search",
  "show",
  "specific",
  "status",
  "switch",
  "site",
  "sites",
  "than",
  "them",
  "those",
  "these",
  "tell",
  "that",
  "the",
  "then",
  "this",
  "today",
  "to",
  "tower",
  "under",
  "u",
  "us",
  "want",
  "what",
  "which",
  "who",
  "whose",
  "week",
  "weeks",
  "with",
  "within",
  "worker",
  "workers",
  "customer",
  "customers",
  "staff",
  "building",
  "buildings",
  "builing",
  "buildinging",
  "bulding",
  "location",
  "locations",
  "address",
  "area",
  "yesterday",
]);

const ALL_HINT_WORDS = new Set(
  Object.values(DOMAIN_HINTS)
    .flat()
    .filter((word) => !word.includes(" ")),
);

const escapeRegExp = (value = "") =>
  String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const normalizeLimit = (value, fallback = DEFAULT_DOMAIN_LIMIT, max = 200) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.min(Math.floor(parsed), max);
};

const tokenizePrompt = (prompt = "") =>
  String(prompt)
    .toLowerCase()
    .replace(/[^a-z0-9+]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);

const collectHintedDomains = (prompt = "", tokens = []) => {
  const promptLower = String(prompt || "").toLowerCase();
  const tokenSet = new Set(tokens);
  const matchedDomains = [];

  for (const [domainKey, hints] of Object.entries(DOMAIN_HINTS)) {
    const isMatched = hints.some((hint) => {
      const normalizedHint = String(hint).toLowerCase();
      if (normalizedHint.includes(" ")) {
        return promptLower.includes(normalizedHint);
      }

      return tokenSet.has(normalizedHint);
    });

    if (isMatched) {
      matchedDomains.push(domainKey);
    }
  }

  return matchedDomains;
};

const extractPhoneNumber = (prompt = "") => {
  const candidates = String(prompt).match(/\+?\d[\d\s-]{5,}\d/g) || [];
  if (!candidates.length) {
    return "";
  }

  const normalized = candidates[0].replace(/[^\d]/g, "");
  return normalized.length >= 7 ? normalized : "";
};

const extractObjectId = (prompt = "") => {
  const match = String(prompt).match(/\b[a-fA-F0-9]{24}\b/);
  return match ? match[0] : "";
};

const extractQuotedPhrase = (prompt = "") => {
  const doubleQuoted = String(prompt).match(/"([^"]{2,})"/);
  if (doubleQuoted && doubleQuoted[1]) {
    return doubleQuoted[1].trim();
  }

  const singleQuoted = String(prompt).match(/'([^']{2,})'/);
  if (singleQuoted && singleQuoted[1]) {
    return singleQuoted[1].trim();
  }

  return "";
};

const extractNameLikeText = (prompt = "", tokens = []) => {
  const quoted = extractQuotedPhrase(prompt);
  if (quoted) {
    return quoted;
  }

  const candidates = tokens.filter((token) => {
    if (!token || token.length <= 1) return false;
    if (STOP_WORDS.has(token)) return false;
    if (ALL_HINT_WORDS.has(token)) return false;
    if (/\d/.test(token)) return false;
    return true;
  });

  if (!candidates.length) {
    return "";
  }

  return candidates.slice(0, 3).join(" ");
};

const extractGeneralSearchKeyword = (prompt = "", tokens = []) => {
  const quoted = extractQuotedPhrase(prompt);
  if (quoted) {
    return quoted;
  }

  const candidates = tokens.filter((token) => {
    if (!token || token.length <= 1) return false;
    if (STOP_WORDS.has(token)) return false;
    if (ALL_HINT_WORDS.has(token)) return false;
    return true;
  });

  if (!candidates.length) {
    return "";
  }

  return candidates.slice(0, 4).join(" ");
};

const LIST_STYLE_WORDS = new Set([
  "name",
  "names",
  "list",
  "lists",
  "detail",
  "details",
  "record",
  "records",
]);

const isListStyleKeyword = (value = "") => {
  const tokens = tokenizePrompt(value);
  if (!tokens.length) {
    return false;
  }

  return tokens.every((token) => LIST_STYLE_WORDS.has(token));
};

const extractPaymentLookupText = (prompt = "", tokens = []) => {
  const rawPrompt = String(prompt || "");
  if (!rawPrompt.trim()) {
    return "";
  }

  const receiptMatch = rawPrompt.match(/\bRCP\d+\b/i);
  if (receiptMatch && receiptMatch[0]) {
    return receiptMatch[0].toUpperCase();
  }

  const contextualMatch = rawPrompt.match(
    /\b(?:vehicle|vehilce|parking|plate|receipt|rcp|invoice|bill)\s*(?:no|number|id|#)?\s*[:\-]?\s*([a-z0-9-]{2,})\b/i,
  );
  if (contextualMatch && contextualMatch[1]) {
    return contextualMatch[1].trim();
  }

  const quoted = extractQuotedPhrase(rawPrompt);
  if (quoted && /\d/.test(quoted)) {
    return quoted;
  }

  const numericToken = [...tokens]
    .reverse()
    .find((token) => /^\d{3,}$/.test(String(token || "")));
  if (numericToken) {
    return numericToken;
  }

  const alphaNumericToken = [...tokens]
    .reverse()
    .find((token) => /^(?=.*\d)[a-z0-9-]{3,}$/i.test(String(token || "")));
  if (alphaNumericToken) {
    return alphaNumericToken;
  }

  return "";
};

const isPaymentColumnLikeText = (text = "") => {
  const tokens = tokenizePrompt(text);
  if (!tokens.length) {
    return false;
  }

  return tokens.every((token) => PAYMENT_COLUMN_KEYWORDS.has(token));
};

const extractPaymentNumericId = ({ lookupText = "", rawPrompt = "" } = {}) => {
  const text = String(lookupText || "").trim();
  const promptText = String(rawPrompt || "").toLowerCase();
  if (!text) {
    return 0;
  }

  const receiptMatch = text.match(/^RCP(\d+)$/i);
  if (receiptMatch && receiptMatch[1]) {
    const parsed = Number(receiptMatch[1]);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  }

  const hasExplicitPaymentIdContext =
    /\b(payment|receipt|invoice|bill)\b/.test(promptText) &&
    /\b(id|number|no)\b/.test(promptText);

  const numberMatch = hasExplicitPaymentIdContext
    ? text.match(/^\d{3,}$/)
    : null;
  if (numberMatch) {
    const parsed = Number(numberMatch[0]);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  }

  return 0;
};

const isVehicleLookupPrompt = ({ rawPrompt = "", lookupText = "" } = {}) => {
  const promptText = String(rawPrompt || "").toLowerCase();
  const keyword = String(lookupText || "").trim();

  if (!keyword) {
    return false;
  }

  if (/\b(vehicle|vehilce|parking|plate)\b/.test(promptText)) {
    return true;
  }

  // Bare numeric queries in payment intent are commonly vehicle/parking lookups.
  return /^\d{3,}$/.test(keyword);
};

const parsePrompt = (prompt = "") => {
  const rawPrompt = String(prompt || "").trim();
  if (!rawPrompt) {
    throw new Error("prompt is required");
  }

  const tokens = tokenizePrompt(rawPrompt);
  const phone = extractPhoneNumber(rawPrompt);
  const objectId = extractObjectId(rawPrompt);
  const nameLike = extractNameLikeText(rawPrompt, tokens);
  const genericKeyword = extractGeneralSearchKeyword(rawPrompt, tokens);
  const paymentLookup = extractPaymentLookupText(rawPrompt, tokens);
  const hintedDomains = collectHintedDomains(rawPrompt, tokens);
  const wantsEverything = /\b(all|everything|entire|complete|full)\b/i.test(
    rawPrompt,
  );
  const hasDomainHints = hintedDomains.length > 0;

  const explicitLookupKeyword = objectId || phone || paymentLookup;

  let keyword = "";
  if (explicitLookupKeyword) {
    keyword = explicitLookupKeyword;
  } else if (wantsEverything && hasDomainHints) {
    const bestListKeyword = nameLike || genericKeyword;
    keyword = isListStyleKeyword(bestListKeyword) ? "" : bestListKeyword;
  } else {
    keyword = nameLike || genericKeyword || rawPrompt;
  }

  keyword = String(keyword || "").trim();

  let domains = hintedDomains;
  if (!domains.length) {
    if (phone || objectId) {
      domains = [...PROMPT_PRIORITY_DOMAINS];
    } else if (wantsEverything) {
      domains = [...PROMPT_FALLBACK_DOMAINS];
    } else if (nameLike) {
      domains = [...PROMPT_PRIORITY_DOMAINS];
    } else {
      domains = [...PROMPT_FALLBACK_DOMAINS];
    }
  }

  if (paymentLookup && !domains.includes("payments")) {
    domains = ["payments", ...domains];
  }

  const uniqueDomains = Array.from(new Set(domains)).filter(
    (domainKey) => DOMAIN_REGISTRY[domainKey],
  );

  return {
    rawPrompt,
    keyword,
    phone,
    objectId,
    nameLike,
    paymentLookup,
    domains: uniqueDomains,
  };
};

const isPaymentIntentPrompt = (prompt = "") =>
  PAYMENT_INTENT_PATTERN.test(String(prompt || ""));

const isValidObjectId = (value) =>
  mongoose.Types.ObjectId.isValid(String(value || ""));

const getPersonName = (domain, record = {}) => {
  if (domain === "customers") {
    const name = [record.firstName, record.lastName]
      .map((item) => String(item || "").trim())
      .filter(Boolean)
      .join(" ");

    return name || String(record.name || "").trim();
  }

  return String(record.name || "").trim();
};

const getPersonMobile = (record = {}) =>
  String(record.mobile || record.number || "").trim();

const buildPersonSearchTerms = (parsedPrompt = {}) => {
  const hasExplicitIdentity = Boolean(
    parsedPrompt.phone || parsedPrompt.objectId || parsedPrompt.nameLike,
  );

  if (!hasExplicitIdentity) {
    return [];
  }

  const primary = String(
    parsedPrompt.phone || parsedPrompt.nameLike || parsedPrompt.keyword || "",
  ).trim();

  if (!primary) {
    return [];
  }

  const terms = [primary];
  const firstToken = primary.split(/\s+/)[0];

  if (firstToken && firstToken !== primary) {
    terms.push(firstToken);
  }

  if (primary.length >= 4) {
    terms.push(primary.slice(0, 3));
  }

  if (primary.length >= 3) {
    terms.push(primary.slice(0, 2));
  }

  return Array.from(
    new Set(terms.map((item) => String(item || "").trim()).filter(Boolean)),
  );
};

const calculateSuggestionScore = ({ query = "", name = "", mobile = "" }) => {
  const normalizedQuery = String(query || "")
    .trim()
    .toLowerCase();
  const normalizedName = String(name || "")
    .trim()
    .toLowerCase();
  const queryDigits = normalizedQuery.replace(/\D/g, "");
  const mobileDigits = String(mobile || "").replace(/\D/g, "");

  let score = 0;

  if (normalizedName && normalizedQuery) {
    if (normalizedName === normalizedQuery) score += 120;
    if (normalizedName.startsWith(normalizedQuery)) score += 95;
    if (normalizedName.includes(normalizedQuery)) score += 70;

    if (normalizedQuery.length >= 3) {
      const queryPrefix3 = normalizedQuery.slice(0, 3);
      if (queryPrefix3 && normalizedName.includes(queryPrefix3)) {
        score += 30;
      }
    }

    if (normalizedQuery.length >= 2) {
      const queryPrefix2 = normalizedQuery.slice(0, 2);
      if (queryPrefix2 && normalizedName.includes(queryPrefix2)) {
        score += 15;
      }
    }
  }

  if (queryDigits && mobileDigits) {
    if (mobileDigits === queryDigits) score += 120;
    if (mobileDigits.includes(queryDigits)) score += 90;

    if (queryDigits.length >= 4) {
      const suffix = queryDigits.slice(-4);
      if (suffix && mobileDigits.includes(suffix)) {
        score += 20;
      }
    }
  }

  return score;
};

const buildPersonSuggestions = async (
  parsedPrompt,
  limit = PERSON_SUGGESTION_LIMIT,
) => {
  const searchTerms = buildPersonSearchTerms(parsedPrompt);
  if (!searchTerms.length) {
    return [];
  }

  const queryText = String(
    parsedPrompt.phone || parsedPrompt.nameLike || parsedPrompt.keyword || "",
  ).trim();

  const searchTasks = [];

  for (const domainKey of PERSON_SEARCH_DOMAINS) {
    const domain = DOMAIN_REGISTRY[domainKey];
    if (!domain) continue;

    for (const term of searchTerms) {
      searchTasks.push(
        executeDomainSearch({
          domain,
          keyword: term,
          filters: parsedPrompt.phone
            ? buildPromptFilters(domainKey, parsedPrompt)
            : {},
          page: 1,
          limit: 5,
          sort: { createdAt: -1 },
        })
          .then((result) => ({ domainKey, result }))
          .catch(() => null),
      );
    }
  }

  const resolved = (await Promise.all(searchTasks)).filter(Boolean);
  const suggestionMap = new Map();

  for (const item of resolved) {
    const domainKey = item.domainKey;
    const domain = DOMAIN_REGISTRY[domainKey];
    const dataRows = Array.isArray(item.result?.data) ? item.result.data : [];

    for (const row of dataRows) {
      const personId = String(row?._id || row?.id || "").trim();
      if (!personId) continue;

      const personName = getPersonName(domainKey, row);
      const personMobile = getPersonMobile(row);

      if (!personName && !personMobile) {
        continue;
      }

      const score = calculateSuggestionScore({
        query: queryText,
        name: personName,
        mobile: personMobile,
      });

      const suggestionKey = `${domainKey}:${personId}`;
      const current = suggestionMap.get(suggestionKey);

      if (!current || score > current.score) {
        suggestionMap.set(suggestionKey, {
          id: personId,
          domain: domainKey,
          label: domain?.label || domainKey,
          name: personName || "Unnamed",
          mobile: personMobile,
          score,
        });
      }
    }
  }

  return Array.from(suggestionMap.values())
    .sort((left, right) => right.score - left.score)
    .slice(0, limit)
    .map(({ score, ...rest }) => rest);
};

const normalizePersonSelection = (person = {}) => {
  const domain = normalizeDomain(person.domain);
  const id = String(person.id || person._id || "").trim();

  if (!domain || !id) {
    throw new Error("person selection is required");
  }

  if (!PERSON_SEARCH_DOMAINS.includes(domain)) {
    throw new Error("person domain is not supported");
  }

  return {
    domain,
    id,
    name: String(person.name || "").trim(),
    mobile: String(person.mobile || "").trim(),
  };
};

const PERSON_MODEL_REGISTRY = {
  customers: CustomersModel,
  workers: WorkersModel,
  staff: StaffModel,
};

const fetchSelectedPersonRecord = async (selection) => {
  const model = PERSON_MODEL_REGISTRY[selection.domain];
  if (!model) return null;

  if (!isValidObjectId(selection.id)) {
    return null;
  }

  return model.findOne({ _id: selection.id }).lean();
};

const buildSelectedPerson = (selection, record = null) => {
  const resolvedRecord = record && typeof record === "object" ? record : {};

  const name =
    getPersonName(selection.domain, resolvedRecord) ||
    selection.name ||
    "Unknown";
  const mobile = getPersonMobile(resolvedRecord) || selection.mobile || "";

  return {
    domain: selection.domain,
    id: selection.id,
    label: DOMAIN_REGISTRY[selection.domain]?.label || selection.domain,
    name,
    mobile,
  };
};

const resolvePeriod = (periodKey = "") => {
  const normalized = String(periodKey || "")
    .trim()
    .toLowerCase();
  const now = new Date();
  let start = null;
  let end = new Date(now);
  let label = "";

  if (normalized === "current_month") {
    start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    label = "This Month";
  } else if (normalized === "previous_month") {
    start = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
    end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
    label = "Last Month";
  } else if (normalized === "last_25_days") {
    start = new Date(now);
    start.setDate(start.getDate() - 25);
    label = "Last 25 Days";
  } else if (normalized === "last_30_days") {
    start = new Date(now);
    start.setDate(start.getDate() - 30);
    label = "Last 30 Days";
  } else {
    throw new Error("period is not supported");
  }

  return {
    key: normalized,
    label,
    start,
    end,
  };
};

const extractPromptPeriodKey = (prompt = "") => {
  const text = String(prompt || "").toLowerCase();
  if (!text) {
    return "";
  }

  if (/\b(this|current)\s+month\b/.test(text)) {
    return "current_month";
  }

  if (/\b(last|previous)\s+month\b/.test(text)) {
    return "previous_month";
  }

  if (/\blast\s*25\s*days?\b/.test(text)) {
    return "last_25_days";
  }

  if (/\blast\s*30\s*days?\b/.test(text)) {
    return "last_30_days";
  }

  return "";
};

const extractPaymentAmountCriteria = (prompt = "") => {
  const text = String(prompt || "").toLowerCase();
  if (!text) {
    return null;
  }

  const toNumberValue = (value) => {
    const parsed = Number(String(value || "").replace(/,/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  };

  const betweenMatch = text.match(
    /\bbetween\s*(?:aed|dirham|dirhams|inr|rs|rupees?|usd|dollars?)?\s*(\d+(?:\.\d+)?)\s*(?:aed|dirham|dirhams|inr|rs|rupees?|usd|dollars?)?\s*(?:and|to|-)\s*(?:aed|dirham|dirhams|inr|rs|rupees?|usd|dollars?)?\s*(\d+(?:\.\d+)?)\s*(?:aed|dirham|dirhams|inr|rs|rupees?|usd|dollars?)?\b/i,
  );
  if (betweenMatch) {
    const first = toNumberValue(betweenMatch[1]);
    const second = toNumberValue(betweenMatch[2]);
    if (first !== null && second !== null) {
      return {
        min: Math.min(first, second),
        max: Math.max(first, second),
        minInclusive: true,
        maxInclusive: true,
      };
    }
  }

  const greaterEqualMatch = text.match(
    /\b(?:at\s+least|minimum|min|not\s+less\s+than)\s*(?:aed|dirham|dirhams|inr|rs|rupees?|usd|dollars?)?\s*(\d+(?:\.\d+)?)\s*(?:aed|dirham|dirhams|inr|rs|rupees?|usd|dollars?)?\b/i,
  );
  if (greaterEqualMatch) {
    const min = toNumberValue(greaterEqualMatch[1]);
    if (min !== null) {
      return {
        min,
        max: null,
        minInclusive: true,
        maxInclusive: true,
      };
    }
  }

  const greaterThanMatch = text.match(
    /\b(?:more\s+than|more\s+then|greater\s+than|above|over)\s*(?:aed|dirham|dirhams|inr|rs|rupees?|usd|dollars?)?\s*(\d+(?:\.\d+)?)\s*(?:aed|dirham|dirhams|inr|rs|rupees?|usd|dollars?)?\b/i,
  );
  if (greaterThanMatch) {
    const min = toNumberValue(greaterThanMatch[1]);
    if (min !== null) {
      return {
        min,
        max: null,
        minInclusive: false,
        maxInclusive: true,
      };
    }
  }

  const lowerEqualMatch = text.match(
    /\b(?:at\s+most|maximum|max|not\s+more\s+than)\s*(?:aed|dirham|dirhams|inr|rs|rupees?|usd|dollars?)?\s*(\d+(?:\.\d+)?)\s*(?:aed|dirham|dirhams|inr|rs|rupees?|usd|dollars?)?\b/i,
  );
  if (lowerEqualMatch) {
    const max = toNumberValue(lowerEqualMatch[1]);
    if (max !== null) {
      return {
        min: null,
        max,
        minInclusive: true,
        maxInclusive: true,
      };
    }
  }

  const lowerThanMatch = text.match(
    /\b(?:less\s+than|below|under)\s*(?:aed|dirham|dirhams|inr|rs|rupees?|usd|dollars?)?\s*(\d+(?:\.\d+)?)\s*(?:aed|dirham|dirhams|inr|rs|rupees?|usd|dollars?)?\b/i,
  );
  if (lowerThanMatch) {
    const max = toNumberValue(lowerThanMatch[1]);
    if (max !== null) {
      return {
        min: null,
        max,
        minInclusive: true,
        maxInclusive: false,
      };
    }
  }

  return null;
};

const matchesAmountCriteria = (value, criteria = null) => {
  if (!criteria) {
    return true;
  }

  const amount = Number(value);
  if (!Number.isFinite(amount)) {
    return false;
  }

  if (Number.isFinite(criteria.min)) {
    if (criteria.minInclusive) {
      if (amount < criteria.min) {
        return false;
      }
    } else if (amount <= criteria.min) {
      return false;
    }
  }

  if (Number.isFinite(criteria.max)) {
    if (criteria.maxInclusive) {
      if (amount > criteria.max) {
        return false;
      }
    } else if (amount >= criteria.max) {
      return false;
    }
  }

  return true;
};

const formatAmountCriteriaText = (criteria = null) => {
  if (!criteria) {
    return "";
  }

  const formatNumber = (value) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      return "";
    }

    return parsed % 1 === 0 ? String(parsed) : parsed.toFixed(2);
  };

  if (Number.isFinite(criteria.min) && Number.isFinite(criteria.max)) {
    return `between AED ${formatNumber(criteria.min)} and AED ${formatNumber(criteria.max)}`;
  }

  if (Number.isFinite(criteria.min)) {
    return `${criteria.minInclusive ? "at least" : "more than"} AED ${formatNumber(criteria.min)}`;
  }

  if (Number.isFinite(criteria.max)) {
    return `${criteria.maxInclusive ? "at most" : "less than"} AED ${formatNumber(criteria.max)}`;
  }

  return "";
};

const getComparablePaymentAmount = (row = {}, serviceCategory = "") => {
  const normalizedCategory = String(serviceCategory || "").toLowerCase();

  const pickAmount = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  if (normalizedCategory === "onewash") {
    if (row.amount !== undefined && row.amount !== null) {
      return pickAmount(row.amount);
    }

    if (row.total_amount !== undefined && row.total_amount !== null) {
      return pickAmount(row.total_amount);
    }

    return pickAmount(row.amount_paid);
  }

  if (row.amount_paid !== undefined && row.amount_paid !== null) {
    return pickAmount(row.amount_paid);
  }

  if (row.total_amount !== undefined && row.total_amount !== null) {
    return pickAmount(row.total_amount);
  }

  return pickAmount(row.amount);
};

const hasFetchAllIntent = (prompt = "") =>
  /\b(all|everything|entire|complete|full)\b/i.test(String(prompt || ""));

const ENTITY_CAPTURE_STOP_WORDS = new Set([
  "payment",
  "payments",
  "apyment",
  "apyments",
  "status",
  "mode",
  "cash",
  "card",
  "bank",
  "transfer",
  "completed",
  "pending",
  "cancelled",
  "canceled",
  "this",
  "last",
  "month",
  "months",
  "today",
  "yesterday",
  "from",
  "to",
  "between",
  "more",
  "less",
  "than",
  "over",
  "under",
  "above",
  "below",
  "aed",
  "with",
  "and",
  "or",
  "show",
  "give",
  "only",
  "ones",
  "record",
  "records",
  "for",
  "in",
  "on",
  "at",
  "by",
]);

const ENTITY_CAPTURE_PREFIX_SKIP_WORDS = new Set([
  "for",
  "in",
  "on",
  "at",
  "by",
  "name",
  "is",
  "the",
  "of",
]);

const toUniqueStringIds = (values = []) =>
  Array.from(
    new Set(
      (Array.isArray(values) ? values : [])
        .map((item) => String(item || "").trim())
        .filter(Boolean),
    ),
  );

const buildRegexFromText = (value = "") => {
  const text = String(value || "").trim();
  if (!text) {
    return null;
  }

  return new RegExp(escapeRegExp(text), "i");
};

const cleanCapturedEntityValue = (value = "") => {
  const normalized = String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) {
    return "";
  }

  const tokens = normalized
    .split(" ")
    .filter((token) => !ENTITY_CAPTURE_PREFIX_SKIP_WORDS.has(token));

  if (!tokens.length) {
    return "";
  }

  const compact = tokens.join(" ").trim();
  if (!compact || ENTITY_CAPTURE_STOP_WORDS.has(compact)) {
    return "";
  }

  return compact;
};

const captureEntityAfterKeywords = (prompt = "", keywords = []) => {
  const tokens = tokenizePrompt(prompt);
  if (!tokens.length || !Array.isArray(keywords) || !keywords.length) {
    return "";
  }

  const keywordSet = new Set(
    keywords.map((item) => normalizeDomain(item)).filter(Boolean),
  );

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!keywordSet.has(token)) {
      continue;
    }

    let cursor = index + 1;
    while (
      cursor < tokens.length &&
      ENTITY_CAPTURE_PREFIX_SKIP_WORDS.has(tokens[cursor])
    ) {
      cursor += 1;
    }

    const captured = [];
    while (cursor < tokens.length) {
      const candidate = tokens[cursor];
      if (
        !candidate ||
        keywordSet.has(candidate) ||
        ENTITY_CAPTURE_STOP_WORDS.has(candidate)
      ) {
        break;
      }

      captured.push(candidate);
      if (captured.length >= 6) {
        break;
      }

      cursor += 1;
    }

    const cleaned = cleanCapturedEntityValue(captured.join(" "));
    if (cleaned) {
      return cleaned;
    }
  }

  return "";
};

const captureEntityBeforeKeywords = (prompt = "", keywords = []) => {
  const tokens = tokenizePrompt(prompt);
  if (!tokens.length || !Array.isArray(keywords) || !keywords.length) {
    return "";
  }

  const keywordSet = new Set(
    keywords.map((item) => normalizeDomain(item)).filter(Boolean),
  );

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!keywordSet.has(token)) {
      continue;
    }

    const captured = [];
    let cursor = index - 1;

    while (cursor >= 0) {
      const candidate = tokens[cursor];
      if (
        !candidate ||
        keywordSet.has(candidate) ||
        ENTITY_CAPTURE_STOP_WORDS.has(candidate) ||
        ENTITY_CAPTURE_PREFIX_SKIP_WORDS.has(candidate)
      ) {
        break;
      }

      captured.unshift(candidate);
      if (captured.length >= 4) {
        break;
      }

      cursor -= 1;
    }

    const cleaned = cleanCapturedEntityValue(captured.join(" "));
    if (cleaned) {
      return cleaned;
    }
  }

  return "";
};

const extractEntityTermFromPrompt = (prompt = "", keywords = []) => {
  const after = captureEntityAfterKeywords(prompt, keywords);
  if (after) {
    return after;
  }

  return captureEntityBeforeKeywords(prompt, keywords);
};

const extractPromptPaymentStatus = (prompt = "") => {
  const text = String(prompt || "").toLowerCase();
  if (!text) {
    return "";
  }

  const candidates = [
    {
      value: "completed",
      regex: /\b(completed|complete|settled|paid)\b/g,
    },
    {
      value: "pending",
      regex: /\b(pending|due|unpaid)\b/g,
    },
    {
      value: "cancelled",
      regex: /\b(cancelled|canceled)\b/g,
    },
  ];

  const matches = candidates
    .map((item) => {
      const match = item.regex.exec(text);
      return match && match.index >= 0
        ? { value: item.value, index: match.index }
        : null;
    })
    .filter(Boolean)
    .sort((left, right) => left.index - right.index);

  return matches.length ? matches[0].value : "";
};

const extractPromptPaymentMode = (prompt = "") => {
  const text = String(prompt || "").toLowerCase();
  if (!text) {
    return "";
  }

  const candidates = [
    {
      value: "bank transfer",
      regex: /\b(bank\s*transfer|online\s*transfer|bank)\b/g,
    },
    {
      value: "card",
      regex: /\b(card|credit\s*card|debit\s*card)\b/g,
    },
    {
      value: "cash",
      regex: /\b(cash)\b/g,
    },
  ];

  const matches = candidates
    .map((item) => {
      const match = item.regex.exec(text);
      return match && match.index >= 0
        ? { value: item.value, index: match.index }
        : null;
    })
    .filter(Boolean)
    .sort((left, right) => left.index - right.index);

  return matches.length ? matches[0].value : "";
};

const extractPromptServiceCategory = (prompt = "") => {
  const text = String(prompt || "").toLowerCase();
  if (!text) {
    return "";
  }

  if (/\b(residence|residential)\b/.test(text)) {
    return "residence";
  }

  if (/\b(onewash|one\s*wash|mall\s*wash|mobile\s*wash|mall)\b/.test(text)) {
    return "onewash";
  }

  return "";
};

const extractPromptRelativeDaysCount = (prompt = "") => {
  const match = String(prompt || "").match(/\blast\s*(\d{1,3})\s*days?\b/i);
  if (!match || !match[1]) {
    return 0;
  }

  const parsed = Number(match[1]);
  if (!Number.isFinite(parsed)) {
    return 0;
  }

  const safe = Math.floor(parsed);
  if (safe <= 0 || safe > 120) {
    return 0;
  }

  return safe;
};

const resolveRelativeDaysPeriod = (days = 0) => {
  const safeDays = Number(days);
  if (!Number.isFinite(safeDays) || safeDays <= 0) {
    return null;
  }

  const now = new Date();
  const start = new Date(now);
  start.setDate(start.getDate() - Math.floor(safeDays));

  return {
    key: `last_${Math.floor(safeDays)}_days`,
    label: `Last ${Math.floor(safeDays)} Days`,
    start,
    end: now,
  };
};

const extractStructuredPaymentFiltersFromPrompt = (prompt = "") => {
  const text = String(prompt || "").trim();

  return {
    status: extractPromptPaymentStatus(text),
    payment_mode: extractPromptPaymentMode(text),
    serviceCategory: extractPromptServiceCategory(text),
    customerTerm: extractEntityTermFromPrompt(text, [
      "customer",
      "customers",
      "client",
    ]),
    workerTerm: extractEntityTermFromPrompt(text, [
      "worker",
      "workers",
      "washman",
      "supervisor",
      "employee",
    ]),
    staffTerm: extractEntityTermFromPrompt(text, ["staff", "admin"]),
    buildingTerm: extractEntityTermFromPrompt(text, [
      "building",
      "buildings",
      "buildinging",
      "bulding",
      "tower",
    ]),
    mallTerm: extractEntityTermFromPrompt(text, ["mall", "malls"]),
    locationTerm: extractEntityTermFromPrompt(text, [
      "location",
      "locations",
      "area",
      "address",
    ]),
  };
};

const toLabelList = (rows = [], labelFn) => {
  if (!Array.isArray(rows) || typeof labelFn !== "function") {
    return [];
  }

  return rows
    .map((row) => String(labelFn(row) || "").trim())
    .filter(Boolean);
};

const intersectIds = (left = [], right = []) => {
  const leftIds = toUniqueStringIds(left);
  const rightIds = toUniqueStringIds(right);

  if (!leftIds.length) {
    return rightIds;
  }

  if (!rightIds.length) {
    return leftIds;
  }

  const rightSet = new Set(rightIds);
  return leftIds.filter((item) => rightSet.has(item));
};

const resolvePromptEntityFilters = async (structuredFilters = {}) => {
  const resolved = {
    labels: {
      customer: "",
      worker: "",
      staff: "",
      building: "",
      mall: "",
      location: "",
    },
    entityFilters: {
      customerIds: [],
      workerIds: [],
      createdByIds: [],
      buildingIds: [],
      mallIds: [],
    },
    unresolved: [],
  };

  const customerTerm = String(structuredFilters.customerTerm || "").trim();
  const workerTerm = String(structuredFilters.workerTerm || "").trim();
  const staffTerm = String(structuredFilters.staffTerm || "").trim();
  const buildingTerm = String(structuredFilters.buildingTerm || "").trim();
  const mallTerm = String(structuredFilters.mallTerm || "").trim();
  const locationTerm = String(structuredFilters.locationTerm || "").trim();

  if (customerTerm) {
    if (isValidObjectId(customerTerm)) {
      resolved.entityFilters.customerIds = [customerTerm];
      resolved.labels.customer = customerTerm;
    } else {
      const regex = buildRegexFromText(customerTerm);
      const tokens = customerTerm.split(/\s+/).filter(Boolean);
      const tokenClauses = tokens
        .slice(0, 3)
        .map((token) => {
          const tokenRegex = buildRegexFromText(token);
          return tokenRegex
            ? { $or: [{ firstName: tokenRegex }, { lastName: tokenRegex }] }
            : null;
        })
        .filter(Boolean);

      const customers = await CustomersModel.find({
        isDeleted: false,
        $or: [
          ...(regex
            ? [
                { mobile: regex },
                { firstName: regex },
                { lastName: regex },
                { "vehicles.registration_no": regex },
                { "vehicles.parking_no": regex },
              ]
            : []),
          ...(tokenClauses.length ? [{ $and: tokenClauses }] : []),
        ],
      })
        .select("_id firstName lastName mobile")
        .limit(PERSON_SUGGESTION_LIMIT)
        .lean();

      const ids = toUniqueStringIds(customers.map((item) => item._id));
      const labels = toLabelList(customers, (item) => {
        const fullName = [item.firstName, item.lastName]
          .map((part) => String(part || "").trim())
          .filter(Boolean)
          .join(" ");

        return fullName || item.mobile;
      });

      if (!ids.length) {
        resolved.unresolved.push({ key: "customer", value: customerTerm });
      } else {
        resolved.entityFilters.customerIds = ids;
        resolved.labels.customer = labels[0] || customerTerm;
      }
    }
  }

  if (workerTerm) {
    if (isValidObjectId(workerTerm)) {
      resolved.entityFilters.workerIds = [workerTerm];
      resolved.labels.worker = workerTerm;
    } else {
      const regex = buildRegexFromText(workerTerm);
      const workers = regex
        ? await WorkersModel.find({
            isDeleted: false,
            $or: [{ name: regex }, { mobile: regex }],
          })
            .select("_id name mobile")
            .limit(PERSON_SUGGESTION_LIMIT)
            .lean()
        : [];

      const ids = toUniqueStringIds(workers.map((item) => item._id));
      const labels = toLabelList(workers, (item) => item.name || item.mobile);

      if (!ids.length) {
        resolved.unresolved.push({ key: "worker", value: workerTerm });
      } else {
        resolved.entityFilters.workerIds = ids;
        resolved.labels.worker = labels[0] || workerTerm;
      }
    }
  }

  if (staffTerm) {
    if (isValidObjectId(staffTerm)) {
      resolved.entityFilters.createdByIds = [staffTerm];
      resolved.labels.staff = staffTerm;
    } else {
      const regex = buildRegexFromText(staffTerm);
      const staffRows = regex
        ? await StaffModel.find({
            isDeleted: false,
            $or: [{ name: regex }, { mobile: regex }, { email: regex }],
          })
            .select("_id name mobile email")
            .limit(PERSON_SUGGESTION_LIMIT)
            .lean()
        : [];

      const ids = toUniqueStringIds(staffRows.map((item) => item._id));
      const labels = toLabelList(
        staffRows,
        (item) => item.name || item.mobile || item.email,
      );

      if (!ids.length) {
        resolved.unresolved.push({ key: "staff", value: staffTerm });
      } else {
        resolved.entityFilters.createdByIds = ids;
        resolved.labels.staff = labels[0] || staffTerm;
      }
    }
  }

  let explicitBuildingIds = [];
  let locationDerivedBuildingIds = [];

  if (buildingTerm) {
    if (isValidObjectId(buildingTerm)) {
      explicitBuildingIds = [buildingTerm];
      resolved.labels.building = buildingTerm;
    } else {
      const regex = buildRegexFromText(buildingTerm);
      const buildings = regex
        ? await BuildingsModel.find({
            isDeleted: false,
            name: regex,
          })
            .select("_id name")
            .limit(PERSON_SUGGESTION_LIMIT)
            .lean()
        : [];

      explicitBuildingIds = toUniqueStringIds(buildings.map((item) => item._id));
      const labels = toLabelList(buildings, (item) => item.name);

      if (!explicitBuildingIds.length) {
        resolved.unresolved.push({ key: "building", value: buildingTerm });
      } else {
        resolved.labels.building = labels[0] || buildingTerm;
      }
    }
  }

  if (locationTerm) {
    const regex = buildRegexFromText(locationTerm);
    const locations = regex
      ? await LocationsModel.find({
          isDeleted: false,
          address: regex,
        })
          .select("_id address")
          .limit(PERSON_SUGGESTION_LIMIT)
          .lean()
      : [];

    const locationIds = toUniqueStringIds(locations.map((item) => item._id));
    const locationLabels = toLabelList(locations, (item) => item.address);

    if (!locationIds.length) {
      resolved.unresolved.push({ key: "location", value: locationTerm });
    } else {
      resolved.labels.location = locationLabels[0] || locationTerm;

      const locationBuildings = await BuildingsModel.find({
        isDeleted: false,
        location_id: {
          $in: locationIds,
        },
      })
        .select("_id name")
        .limit(PAYMENT_RESULT_LIMIT)
        .lean();

      locationDerivedBuildingIds = toUniqueStringIds(
        locationBuildings.map((item) => item._id),
      );
    }
  }

  if (mallTerm) {
    if (isValidObjectId(mallTerm)) {
      resolved.entityFilters.mallIds = [mallTerm];
      resolved.labels.mall = mallTerm;
    } else {
      const regex = buildRegexFromText(mallTerm);
      const malls = regex
        ? await MallsModel.find({
            isDeleted: false,
            name: regex,
          })
            .select("_id name")
            .limit(PERSON_SUGGESTION_LIMIT)
            .lean()
        : [];

      const ids = toUniqueStringIds(malls.map((item) => item._id));
      const labels = toLabelList(malls, (item) => item.name);

      if (!ids.length) {
        resolved.unresolved.push({ key: "mall", value: mallTerm });
      } else {
        resolved.entityFilters.mallIds = ids;
        resolved.labels.mall = labels[0] || mallTerm;
      }
    }
  }

  const effectiveBuildingIds = intersectIds(
    explicitBuildingIds,
    locationDerivedBuildingIds,
  );

  if (
    buildingTerm &&
    locationTerm &&
    explicitBuildingIds.length &&
    locationDerivedBuildingIds.length &&
    !effectiveBuildingIds.length
  ) {
    resolved.unresolved.push({
      key: "building-location",
      value: `${buildingTerm} / ${locationTerm}`,
    });
  }

  if (buildingTerm || locationTerm) {
    if (!effectiveBuildingIds.length) {
      if (buildingTerm && !explicitBuildingIds.length) {
        // Unresolved case already recorded above.
      } else if (locationTerm && !locationDerivedBuildingIds.length) {
        // Unresolved case already recorded above.
      }
    } else {
      resolved.entityFilters.buildingIds = effectiveBuildingIds;
    }
  }

  return resolved;
};

const getEntityIdFromRow = (row = {}, field = "") => {
  const rawValue = row?.[field];
  if (!rawValue) {
    return "";
  }

  if (typeof rawValue === "object") {
    return String(rawValue._id || rawValue.id || "").trim();
  }

  return String(rawValue).trim();
};

const filterRowsByEntityIds = (rows = [], field = "", ids = []) => {
  const safeRows = Array.isArray(rows) ? rows : [];
  const safeIds = toUniqueStringIds(ids);
  if (!safeIds.length) {
    return safeRows;
  }

  const idSet = new Set(safeIds);
  return safeRows.filter((row) => idSet.has(getEntityIdFromRow(row, field)));
};

const applyResolvedEntityFiltersToRows = ({
  rows = [],
  entityFilters = {},
} = {}) => {
  let scopedRows = Array.isArray(rows) ? rows : [];

  scopedRows = filterRowsByEntityIds(
    scopedRows,
    "worker",
    entityFilters.workerIds,
  );
  scopedRows = filterRowsByEntityIds(
    scopedRows,
    "customer",
    entityFilters.customerIds,
  );
  scopedRows = filterRowsByEntityIds(
    scopedRows,
    "building",
    entityFilters.buildingIds,
  );
  scopedRows = filterRowsByEntityIds(scopedRows, "mall", entityFilters.mallIds);
  scopedRows = filterRowsByEntityIds(
    scopedRows,
    "createdBy",
    entityFilters.createdByIds,
  );

  return scopedRows;
};

const toPeriodPromptText = (period = null) => {
  const key = String(period?.key || "").toLowerCase();
  if (!key) {
    return "";
  }

  if (key === "current_month") {
    return "this month";
  }

  if (key === "previous_month") {
    return "last month";
  }

  return String(period?.label || "").trim().toLowerCase();
};

const buildStructuredFilterSummary = ({
  amountText = "",
  period = null,
  structuredFilters = {},
  resolvedEntities = {},
} = {}) => {
  const parts = [];

  const status = String(structuredFilters.status || "").trim();
  if (status) {
    parts.push(`${status} status`);
  }

  const paymentMode = String(structuredFilters.payment_mode || "").trim();
  if (paymentMode) {
    parts.push(`${paymentMode} mode`);
  }

  const serviceCategory = String(structuredFilters.serviceCategory || "").trim();
  if (serviceCategory) {
    parts.push(`${serviceCategory} payments`);
  }

  if (resolvedEntities?.labels?.customer) {
    parts.push(`customer ${resolvedEntities.labels.customer}`);
  }

  if (resolvedEntities?.labels?.worker) {
    parts.push(`worker ${resolvedEntities.labels.worker}`);
  }

  if (resolvedEntities?.labels?.staff) {
    parts.push(`staff ${resolvedEntities.labels.staff}`);
  }

  if (resolvedEntities?.labels?.building) {
    parts.push(`building ${resolvedEntities.labels.building}`);
  }

  if (resolvedEntities?.labels?.mall) {
    parts.push(`mall ${resolvedEntities.labels.mall}`);
  }

  if (resolvedEntities?.labels?.location) {
    parts.push(`location ${resolvedEntities.labels.location}`);
  }

  if (amountText) {
    parts.push(amountText);
  }

  if (period?.label) {
    parts.push(`during ${period.label}`);
  }

  return parts.join(", ");
};

const buildStructuredConversationActions = ({
  structuredFilters = {},
  resolvedEntities = {},
  period = null,
  total = 0,
} = {}) => {
  const contextParts = [];
  if (resolvedEntities?.labels?.customer) {
    contextParts.push(`for customer ${resolvedEntities.labels.customer}`);
  }
  if (resolvedEntities?.labels?.worker) {
    contextParts.push(`for worker ${resolvedEntities.labels.worker}`);
  }
  if (resolvedEntities?.labels?.staff) {
    contextParts.push(`for staff ${resolvedEntities.labels.staff}`);
  }
  if (resolvedEntities?.labels?.building) {
    contextParts.push(`in building ${resolvedEntities.labels.building}`);
  }
  if (resolvedEntities?.labels?.mall) {
    contextParts.push(`in mall ${resolvedEntities.labels.mall}`);
  }
  if (resolvedEntities?.labels?.location) {
    contextParts.push(`in location ${resolvedEntities.labels.location}`);
  }

  const periodText = toPeriodPromptText(period);
  const contextTail = [contextParts.join(" "), periodText]
    .filter(Boolean)
    .join(" ")
    .trim();

  const entries = [];
  const existingPrompts = new Set();

  const addAction = (label, promptText) => {
    const prompt = String(promptText || "").replace(/\s+/g, " ").trim();
    if (!label || !prompt || existingPrompts.has(prompt.toLowerCase())) {
      return;
    }

    existingPrompts.add(prompt.toLowerCase());
    entries.push({
      label,
      action: {
        type: "ask-prompt",
        prompt,
      },
    });
  };

  const withContext = (prefix) =>
    [String(prefix || "").trim(), contextTail].filter(Boolean).join(" ").trim();

  if (structuredFilters.status !== "completed") {
    addAction("Show completed only", withContext("Show completed payments"));
  }

  if (structuredFilters.status !== "pending") {
    addAction("Show pending only", withContext("Show pending payments"));
  }

  if (structuredFilters.payment_mode !== "bank transfer") {
    addAction(
      "Show bank transfer only",
      withContext("Show bank transfer payments"),
    );
  }

  if (structuredFilters.payment_mode !== "cash") {
    addAction("Show cash only", withContext("Show cash payments"));
  }

  if (String(period?.key || "") !== "current_month") {
    addAction("Show this month", withContext("Show payments this month"));
  }

  if (String(period?.key || "") !== "last_30_days") {
    addAction("Show last 30 days", withContext("Show payments last 30 days"));
  }

  if (!total) {
    addAction("Relax filters", withContext("Show payments"));
  }

  return entries.slice(0, 4);
};

const parseRangeBoundary = (input, isEndDate = false) => {
  const text = String(input || "").trim();
  if (!text) return null;

  const date = new Date(text);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    if (isEndDate) {
      date.setHours(23, 59, 59, 999);
    } else {
      date.setHours(0, 0, 0, 0);
    }
  }

  return date;
};

const resolveRequestedPeriod = (payload = {}) => {
  if (payload.startDate || payload.endDate) {
    const start = parseRangeBoundary(payload.startDate, false);
    const end =
      parseRangeBoundary(payload.endDate, true) ||
      parseRangeBoundary(payload.startDate, true);

    if (!start || !end || end.getTime() < start.getTime()) {
      throw new Error("period is not supported");
    }

    return {
      key: "custom",
      label: "Custom Range",
      start,
      end,
    };
  }

  if (!payload.period) {
    return null;
  }

  return resolvePeriod(payload.period);
};

const toDateParam = (dateInput) => {
  const date = new Date(dateInput);
  if (Number.isNaN(date.getTime())) return "";

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
};

const getOneWashDisplayServiceType = (row = {}) => {
  const serviceType = String(row.service_type || "").toLowerCase();
  const washType = String(row.wash_type || "").toLowerCase();

  if (serviceType === "residence" || row.building) {
    return "Residence";
  }

  if (washType === "outside") return "Outside";
  if (washType === "total") return "Inside + Outside";
  if (washType === "inside") return "Inside";

  if (row.mall) {
    return "Mall";
  }

  return "One Wash";
};

const enrichPaymentRowsForDisplay = async (rows = []) => {
  const safeRows = Array.isArray(rows) ? rows : [];
  if (!safeRows.length) {
    return [];
  }

  let populatedRows = safeRows;

  try {
    populatedRows = await PaymentsModel.populate(safeRows, [
      { path: "worker", model: "workers", select: "name" },
      { path: "customer", model: "customers" },
      { path: "building", model: "buildings", select: "name" },
    ]);
  } catch (_) {
    populatedRows = safeRows;
  }

  const onewashJobIds = Array.from(
    new Set(
      populatedRows
        .filter((row) => row?.onewash && row?.job)
        .map((row) => String(row.job || "").trim())
        .filter(Boolean),
    ),
  );

  if (!onewashJobIds.length) {
    return populatedRows;
  }

  const onewashDocs = await OneWashModel.find({
    _id: { $in: onewashJobIds },
    isDeleted: false,
  })
    .select("_id registration_no parking_no service_type wash_type amount")
    .lean();

  const onewashById = new Map(
    onewashDocs.map((item) => [String(item._id), item]),
  );

  return populatedRows.map((row) => {
    if (!row?.onewash || !row?.job) {
      return row;
    }

    const onewash = onewashById.get(String(row.job));
    if (!onewash) {
      return {
        ...row,
        display_service_type: row.display_service_type || getOneWashDisplayServiceType(row),
      };
    }

    return {
      ...row,
      registration_no: row.registration_no || onewash.registration_no,
      parking_no: row.parking_no || onewash.parking_no,
      service_type: row.service_type || onewash.service_type,
      wash_type: row.wash_type || onewash.wash_type,
      amount:
        row.amount !== undefined && row.amount !== null ? row.amount : onewash.amount,
      display_service_type:
        row.display_service_type || getOneWashDisplayServiceType({ ...row, ...onewash }),
    };
  });
};

const normalizeFilterValue = (value = "") => String(value || "").trim();

const normalizePaymentModeValue = (value = "") => {
  const normalized = normalizeDomain(value);
  if (!normalized) {
    return "";
  }

  if (["bank", "banktransfer", "bank-transfer", "bank transfer"].includes(normalized)) {
    return "bank transfer";
  }

  if (["cash", "card"].includes(normalized)) {
    return normalized;
  }

  return normalizeFilterValue(value);
};

const normalizeServiceCategoryValue = (value = "") => {
  const normalized = normalizeDomain(value);
  if (!normalized) {
    return "";
  }

  if (["onewash", "one wash", "mall"].includes(normalized)) {
    return "onewash";
  }

  if (["residence", "residential"].includes(normalized)) {
    return "residence";
  }

  return "";
};

const compactFilters = (filters = {}) => {
  if (!isPlainObject(filters)) {
    return {};
  }

  return Object.entries(filters).reduce((accumulator, [key, value]) => {
    if (value === undefined || value === null) {
      return accumulator;
    }

    const text = String(value).trim();
    if (!text) {
      return accumulator;
    }

    accumulator[key] = text;
    return accumulator;
  }, {});
};

const resolveLookupDateRange = (payload = {}) => {
  const start = parseRangeBoundary(payload.startDate, false);
  const end =
    parseRangeBoundary(payload.endDate, true) ||
    parseRangeBoundary(payload.startDate, true);

  if (!start || !end || end.getTime() < start.getTime()) {
    return null;
  }

  return {
    startDateIso: start.toISOString(),
    endDateIso: end.toISOString(),
    startDateParam: toDateParam(start),
    endDateParam: toDateParam(end),
  };
};

const buildLookupFiltersFromPayload = ({
  payload = {},
  keyword = "",
  limit = DEFAULT_PROMPT_LIMIT,
} = {}) => {
  const normalizedKeyword = normalizeFilterValue(
    payload.search || payload.query || keyword,
  );
  const normalizedStatus = normalizeFilterValue(payload.status);
  const normalizedPaymentMode = normalizePaymentModeValue(
    payload.payment_mode || payload.paymentMode,
  );
  const normalizedWashType = normalizeFilterValue(
    payload.wash_type || payload.washType,
  );
  const normalizedWorker = normalizeFilterValue(payload.worker);
  const normalizedCustomer = normalizeFilterValue(payload.customer);
  const normalizedCreatedBy = normalizeFilterValue(payload.createdBy);
  const normalizedBuilding = normalizeFilterValue(payload.building);
  const normalizedMall = normalizeFilterValue(payload.mall);
  const normalizedServiceType = normalizeFilterValue(
    payload.service_type || payload.serviceType,
  );
  const normalizedServiceCategory = normalizeServiceCategoryValue(
    payload.serviceCategory || payload.service_type || payload.serviceType,
  );

  const dateRange = resolveLookupDateRange(payload);

  const commonFilters = {
    pageNo: 0,
    pageSize: normalizeLimit(limit, DEFAULT_PROMPT_LIMIT, PAYMENT_RESULT_LIMIT),
    ...(normalizedKeyword ? { search: normalizedKeyword } : {}),
    ...(dateRange
      ? {
          startDate: dateRange.startDateIso,
          endDate: dateRange.endDateIso,
        }
      : {}),
    ...(normalizedStatus ? { status: normalizedStatus } : {}),
    ...(normalizedPaymentMode ? { payment_mode: normalizedPaymentMode } : {}),
    ...(normalizedWashType ? { wash_type: normalizedWashType } : {}),
    ...(normalizedWorker ? { worker: normalizedWorker } : {}),
    ...(normalizedCustomer ? { customer: normalizedCustomer } : {}),
    ...(normalizedCreatedBy ? { createdBy: normalizedCreatedBy } : {}),
    ...(normalizedBuilding ? { building: normalizedBuilding } : {}),
    ...(normalizedMall ? { mall: normalizedMall } : {}),
    ...(normalizedServiceType ? { service_type: normalizedServiceType } : {}),
  };

  return {
    commonFilters,
    normalizedFilters: compactFilters({
      status: normalizedStatus,
      payment_mode: normalizedPaymentMode,
      wash_type: normalizedWashType,
      worker: normalizedWorker,
      customer: normalizedCustomer,
      createdBy: normalizedCreatedBy,
      building: normalizedBuilding,
      mall: normalizedMall,
      service_type: normalizedServiceType,
      serviceCategory: normalizedServiceCategory,
      ...(dateRange
        ? {
            startDate: dateRange.startDateParam,
            endDate: dateRange.endDateParam,
          }
        : {}),
      ...(normalizedKeyword ? { search: normalizedKeyword } : {}),
    }),
    serviceCategory: normalizedServiceCategory,
    dateRange,
  };
};

const buildPaymentLookupText = ({ keyword = "", total = 0 } = {}) => {
  if (!total) {
    return `I could not find payment records for \"${keyword}\". Try receipt no, vehicle no, or parking no.`;
  }

  return `I found ${total} payment record(s) for \"${keyword}\".`;
};

const executeGroupedPaymentLookup = async ({
  keyword = "",
  payload = {},
  userInfo = {},
  limit = DEFAULT_PROMPT_LIMIT,
  amountCriteria = null,
  entityFilters = null,
} = {}) => {
  const normalizedKeyword = normalizeFilterValue(
    keyword || payload.search || payload.query,
  );

  const { commonFilters, normalizedFilters, serviceCategory } =
    buildLookupFiltersFromPayload({
      payload,
      keyword: normalizedKeyword,
      limit,
    });

  const includeResidence = serviceCategory !== "onewash";
  const includeOneWash = serviceCategory !== "residence";

  const [residenceResult, onewashResult] = await Promise.all([
    includeResidence
      ? paymentsListService.list(userInfo || {}, {
          ...commonFilters,
          onewash: "false",
        })
      : Promise.resolve({ total: 0, data: [] }),
    includeOneWash
      ? onewashListService.list(userInfo || {}, commonFilters)
      : Promise.resolve({ total: 0, data: [] }),
  ]);

  const residenceRows = Array.isArray(residenceResult?.data)
    ? residenceResult.data
    : [];
  const onewashRows = Array.isArray(onewashResult?.data)
    ? onewashResult.data
    : [];

  const residenceSourceTotal = Number(residenceResult?.total || 0);
  const onewashSourceTotal = Number(onewashResult?.total || 0);

  const residencePayments = residenceRows.map((row) => ({
    ...row,
    onewash: false,
    serviceCategory: "residence",
    serviceTypeLabel: "Residence",
  }));

  const onewashPayments = onewashRows.map((row) => ({
    ...row,
    onewash: true,
    serviceCategory: "onewash",
    display_service_type:
      row.display_service_type || getOneWashDisplayServiceType(row),
  }));

  const scopedResidencePayments = entityFilters
    ? applyResolvedEntityFiltersToRows({
        rows: residencePayments,
        entityFilters,
      })
    : residencePayments;

  const scopedOneWashPayments = entityFilters
    ? applyResolvedEntityFiltersToRows({
        rows: onewashPayments,
        entityFilters,
      })
    : onewashPayments;

  const filteredResidencePayments = amountCriteria
    ? scopedResidencePayments.filter((row) =>
        matchesAmountCriteria(
          getComparablePaymentAmount(row, "residence"),
          amountCriteria,
        ),
      )
    : scopedResidencePayments;

  const filteredOneWashPayments = amountCriteria
    ? scopedOneWashPayments.filter((row) =>
        matchesAmountCriteria(
          getComparablePaymentAmount(row, "onewash"),
          amountCriteria,
        ),
      )
    : scopedOneWashPayments;

  const residenceTotal = amountCriteria || entityFilters
    ? filteredResidencePayments.length
    : residenceSourceTotal;
  const onewashTotal = amountCriteria || entityFilters
    ? filteredOneWashPayments.length
    : onewashSourceTotal;

  const results = [];
  if (filteredResidencePayments.length) {
    results.push({
      domain: "payments",
      label: "Residence Payments",
      total: residenceTotal,
      data: filteredResidencePayments,
    });
  }

  if (filteredOneWashPayments.length) {
    results.push({
      domain: "payments",
      label: "One Wash Payments",
      total: onewashTotal,
      data: filteredOneWashPayments,
    });
  }

  const total = Number(residenceTotal || 0) + Number(onewashTotal || 0);

  const navigationFilters = {
    ai: "1",
    ...(normalizedKeyword ? { q: normalizedKeyword } : {}),
    ...normalizedFilters,
    ...(amountCriteria && Number.isFinite(amountCriteria.min)
      ? { minAmount: String(amountCriteria.min) }
      : {}),
    ...(amountCriteria && Number.isFinite(amountCriteria.max)
      ? { maxAmount: String(amountCriteria.max) }
      : {}),
  };

  return {
    keyword: normalizedKeyword,
    total,
    summary: {
      residenceCount: residenceTotal,
      onewashCount: onewashTotal,
    },
    navigation: {
      residence: {
        path: "/payments/residence",
        filters: navigationFilters,
      },
      onewash: {
        path: "/payments/onewash",
        filters: navigationFilters,
      },
    },
    results,
    queryContext: {
      type: "payment-lookup",
      keyword: normalizedKeyword || null,
      filters: normalizedFilters,
      amountCriteria: amountCriteria || null,
    },
  };
};

const buildPaymentsQueryForPerson = ({ domain, id, period }) => {
  const query = {
    isDeleted: false,
    onewash: false,
  };

  if (domain === "customers") {
    query.customer = id;
  } else if (domain === "workers") {
    query.worker = id;
  } else if (domain === "staff") {
    query.createdBy = id;
  }

  if (period && period.start && period.end) {
    query.createdAt = {
      $gte: period.start,
      $lte: period.end,
    };
  }

  return query;
};

const buildOneWashQueryForPerson = ({ domain, id, period }) => {
  const query = {
    isDeleted: false,
  };

  if (domain === "customers") {
    query.customer = id;
  } else if (domain === "workers") {
    query.worker = id;
  } else if (domain === "staff") {
    query.createdBy = id;
  }

  if (period && period.start && period.end) {
    query.createdAt = {
      $gte: period.start,
      $lte: period.end,
    };
  }

  return query;
};

const buildPromptFilters = (domainKey, parsedPrompt) => {
  if (parsedPrompt.objectId) {
    return { _id: parsedPrompt.objectId };
  }

  if (!parsedPrompt.phone) {
    return {};
  }

  const phoneRegex = new RegExp(escapeRegExp(parsedPrompt.phone), "i");

  if (domainKey === "customers") {
    return { mobile: phoneRegex };
  }

  if (domainKey === "workers") {
    return { mobile: phoneRegex };
  }

  if (domainKey === "staff") {
    return { mobile: phoneRegex };
  }

  return {};
};

const executeDomainSearch = async ({
  domain,
  keyword,
  filters,
  page,
  limit,
  sort,
}) => {
  const result = await domain.search({
    model: domain.model,
    keyword,
    filters,
    page,
    limit,
    sort,
  });

  return {
    domain: domain.key,
    label: domain.label,
    keyword,
    filters,
    ...result,
  };
};

const DOMAIN_REGISTRY = {
  payments: {
    key: "payments",
    label: "Payments",
    hint: "Search by receipt, status, customer, worker, or vehicle.",
    model: PaymentsModel,
    search: aiScripts.payments.searchPayments,
    searchableFields: aiScripts.payments.SEARCHABLE_FIELDS,
  },
  customers: {
    key: "customers",
    label: "Customers",
    hint: "Search by customer name, mobile, vehicle, or flat.",
    model: CustomersModel,
    search: aiScripts.customers.searchCustomers,
    searchableFields: aiScripts.customers.SEARCHABLE_FIELDS,
  },
  jobs: {
    key: "jobs",
    label: "Jobs",
    hint: "Search by status, location, assigned worker, or vehicle.",
    model: JobsModel,
    search: aiScripts.jobs.searchJobs,
    searchableFields: aiScripts.jobs.SEARCHABLE_FIELDS,
  },
  buildings: {
    key: "buildings",
    label: "Buildings",
    hint: "Search by building name, tower, or location.",
    model: BuildingsModel,
    search: aiScripts.buildings.searchBuildings,
    searchableFields: aiScripts.buildings.SEARCHABLE_FIELDS,
  },
  malls: {
    key: "malls",
    label: "Malls",
    hint: "Search by mall name.",
    model: MallsModel,
    search: aiScripts.malls.searchMalls,
    searchableFields: aiScripts.malls.SEARCHABLE_FIELDS,
  },
  workers: {
    key: "workers",
    label: "Workers",
    hint: "Search by worker name, mobile, role, or service type.",
    model: WorkersModel,
    search: aiScripts.workers.searchWorkers,
    searchableFields: aiScripts.workers.SEARCHABLE_FIELDS,
  },
  staff: {
    key: "staff",
    label: "Staff",
    hint: "Search by staff name, mobile, employee code, or email.",
    model: StaffModel,
    search: aiScripts.staff.searchStaff,
    searchableFields: aiScripts.staff.SEARCHABLE_FIELDS,
  },
  locations: {
    key: "locations",
    label: "Locations",
    hint: "Search by location address.",
    model: LocationsModel,
    search: aiScripts.locations.searchLocations,
    searchableFields: aiScripts.locations.SEARCHABLE_FIELDS,
  },
  sites: {
    key: "sites",
    label: "Sites",
    hint: "Search by site name.",
    model: SitesModel,
    search: aiScripts.sites.searchSites,
    searchableFields: aiScripts.sites.SEARCHABLE_FIELDS,
  },
};

service.listDomains = () => {
  return Object.values(DOMAIN_REGISTRY).map((domain) => ({
    key: domain.key,
    label: domain.label,
    hint: domain.hint,
    searchableFields: domain.searchableFields,
  }));
};

service.searchByDomain = async (payload = {}) => {
  const domainKey = normalizeDomain(payload.domain);
  if (!domainKey) {
    throw new Error("A search domain is required");
  }

  const domain = DOMAIN_REGISTRY[domainKey];
  if (!domain) {
    throw new Error(`Unsupported domain: ${domainKey}`);
  }

  if (!isPlainObject(payload.filters) && payload.filters !== undefined) {
    throw new Error("filters must be a plain object");
  }

  return executeDomainSearch({
    domain,
    keyword: String(payload.query || payload.search || "").trim(),
    filters: isPlainObject(payload.filters) ? payload.filters : {},
    page: payload.page,
    limit: normalizeLimit(payload.limit, DEFAULT_DOMAIN_LIMIT, 200),
    sort: payload.sort,
  });
};

const runGeminiAssistedPromptSearch = async (payload = {}, userInfo = {}) => {
  if (payload?._skipGemini || !isGeminiConfigured()) {
    return null;
  }

  const prompt = String(payload?.prompt || "").trim();
  if (!prompt) {
    return null;
  }

  const geminiIntent = await analyzePromptWithGemini({
    prompt,
    domainCatalog: service.listDomains(),
  });

  if (!geminiIntent) {
    return null;
  }

  const confidence = Number(geminiIntent.confidence || 0);
  if (!Number.isFinite(confidence) || confidence < GEMINI_INTENT_MIN_CONFIDENCE) {
    return null;
  }

  const intent = normalizeDomain(geminiIntent.intent || "");
  const rewrittenQuery = String(geminiIntent.query || "").trim();
  const rewrittenKeyword = String(geminiIntent.keyword || "").trim();
  const requestedDomains = Array.from(
    new Set(
      (Array.isArray(geminiIntent.domains) ? geminiIntent.domains : [])
        .map((item) => normalizeDomain(item))
        .filter((item) => DOMAIN_REGISTRY[item]),
    ),
  );

  const hasRewrittenPrompt =
    rewrittenQuery && rewrittenQuery.toLowerCase() !== prompt.toLowerCase();

  if (intent === "payments" || intent === "personpayments") {
    if (!hasRewrittenPrompt) {
      return null;
    }

    return service.searchByPrompt(
      {
        ...payload,
        prompt: rewrittenQuery,
        _skipGemini: true,
      },
      userInfo,
    );
  }

  if (intent !== "search" || !requestedDomains.length) {
    if (!hasRewrittenPrompt) {
      return null;
    }

    return service.searchByPrompt(
      {
        ...payload,
        prompt: rewrittenQuery,
        _skipGemini: true,
      },
      userInfo,
    );
  }

  const fetchAll = Boolean(geminiIntent.fetchAll);
  const domainLimit = fetchAll
    ? normalizeLimit(payload.limit, DEFAULT_DOMAIN_LIMIT, 200)
    : normalizeLimit(payload.limit, DEFAULT_PROMPT_LIMIT, PROMPT_MAX_LIMIT);

  const keyword = fetchAll
    ? ""
    : String(rewrittenKeyword || rewrittenQuery || "").trim();

  const safeFilters = isPlainObject(geminiIntent.filters)
    ? geminiIntent.filters
    : {};

  const searchTasks = requestedDomains.map(async (domainKey) => {
    const domain = DOMAIN_REGISTRY[domainKey];
    if (!domain) {
      return null;
    }

    try {
      return await executeDomainSearch({
        domain,
        keyword,
        filters: safeFilters,
        page: 1,
        limit: domainLimit,
        sort: { createdAt: -1 },
      });
    } catch (_) {
      return null;
    }
  });

  const resolved = (await Promise.all(searchTasks)).filter(Boolean);
  const matched = resolved.filter(
    (item) => Array.isArray(item.data) && item.data.length > 0,
  );

  if (!matched.length) {
    if (!hasRewrittenPrompt) {
      return null;
    }

    return service.searchByPrompt(
      {
        ...payload,
        prompt: rewrittenQuery,
        _skipGemini: true,
      },
      userInfo,
    );
  }

  const total = matched.reduce((sum, item) => sum + Number(item.total || 0), 0);

  return {
    mode: "prompt",
    prompt,
    keyword: keyword || rewrittenQuery || prompt,
    parsed: {
      phone: null,
      objectId: null,
      nameLike: null,
      paymentLookup: null,
      domainsSearched: requestedDomains,
      llm: {
        provider: "gemini",
        confidence,
      },
    },
    text: `I found ${total} matching record(s) across ${matched.length} categor${matched.length === 1 ? "y" : "ies"}.`,
    total,
    matchedDomains: matched.length,
    results: matched,
    primaryResult:
      matched.length && matched[0].data.length ? matched[0].data[0] : null,
  };
};

service.searchByPrompt = async (payload = {}, userInfo = {}) => {
  const geminiAssistedResult = await runGeminiAssistedPromptSearch(
    payload,
    userInfo,
  );
  if (geminiAssistedResult) {
    return geminiAssistedResult;
  }

  const parsedPrompt = parsePrompt(payload.prompt);
  const perDomainLimit = normalizeLimit(
    payload.limit,
    DEFAULT_PROMPT_LIMIT,
    PROMPT_MAX_LIMIT,
  );

  const isPersonLikeIdentity = Boolean(
    parsedPrompt.nameLike && !isPaymentColumnLikeText(parsedPrompt.nameLike),
  );

  const hasExplicitIdentity = Boolean(
    parsedPrompt.phone || parsedPrompt.objectId || isPersonLikeIdentity,
  );

  const promptPeriodKey = extractPromptPeriodKey(parsedPrompt.rawPrompt);
  const promptRelativeDaysCount = extractPromptRelativeDaysCount(
    parsedPrompt.rawPrompt,
  );
  const promptAmountCriteria = extractPaymentAmountCriteria(parsedPrompt.rawPrompt);
  const promptStructuredFilters = extractStructuredPaymentFiltersFromPrompt(
    parsedPrompt.rawPrompt,
  );
  const hasEntityScopedFilter = Boolean(
    promptStructuredFilters.customerTerm ||
      promptStructuredFilters.workerTerm ||
      promptStructuredFilters.staffTerm ||
      promptStructuredFilters.buildingTerm ||
      promptStructuredFilters.mallTerm ||
      promptStructuredFilters.locationTerm,
  );
  const hasBaseStructuredPaymentFilter = Boolean(
    promptPeriodKey ||
      promptRelativeDaysCount ||
      promptAmountCriteria ||
      promptStructuredFilters.status ||
      promptStructuredFilters.payment_mode ||
      promptStructuredFilters.serviceCategory,
  );
  const shouldRunStructuredPaymentFilter = Boolean(
    hasEntityScopedFilter ||
      (!hasExplicitIdentity && hasBaseStructuredPaymentFilter),
  );
  const wantsAllResults = hasFetchAllIntent(parsedPrompt.rawPrompt);

  const directPaymentKeyword = String(
    parsedPrompt.paymentLookup ||
      (isPersonLikeIdentity ? "" : parsedPrompt.nameLike || ""),
  ).trim();

  if (isPaymentIntentPrompt(parsedPrompt.rawPrompt)) {
    if (shouldRunStructuredPaymentFilter) {
      const resolvedPeriod = promptPeriodKey
        ? resolvePeriod(promptPeriodKey)
        : resolveRelativeDaysPeriod(promptRelativeDaysCount);

      const resolvedEntities = await resolvePromptEntityFilters(
        promptStructuredFilters,
      );

      const unresolvedFilters = Array.isArray(resolvedEntities?.unresolved)
        ? resolvedEntities.unresolved
        : [];

      if (unresolvedFilters.length) {
        const unresolvedText = unresolvedFilters
          .map((entry) => {
            const key = String(entry?.key || "filter").replace(/-/g, " ");
            const value = String(entry?.value || "").trim();
            return value ? `${key} "${value}"` : key;
          })
          .join(", ");

        return {
          mode: "prompt",
          prompt: parsedPrompt.rawPrompt,
          keyword: parsedPrompt.keyword,
          parsed: {
            phone: parsedPrompt.phone || null,
            objectId: parsedPrompt.objectId || null,
            nameLike: parsedPrompt.nameLike || null,
            paymentLookup: parsedPrompt.paymentLookup || null,
            domainsSearched: ["payments"],
          },
          text: `I could not match ${unresolvedText}. Try exact names for building, mall, location, worker, customer, or staff.`,
          summary: {
            residenceCount: 0,
            onewashCount: 0,
          },
          conversationActions: buildStructuredConversationActions({
            structuredFilters: promptStructuredFilters,
            resolvedEntities,
            period: resolvedPeriod,
            total: 0,
          }),
          conversationHint:
            "Try a quick next step below, or type a more exact filter value.",
          total: 0,
          matchedDomains: 0,
          results: [],
          primaryResult: null,
        };
      }

      const lookupPayload = {
        ...payload,
        ...(parsedPrompt.paymentLookup
          ? { search: parsedPrompt.paymentLookup }
          : {}),
        ...(resolvedPeriod
          ? {
              startDate: resolvedPeriod.start.toISOString(),
              endDate: resolvedPeriod.end.toISOString(),
            }
          : {}),
        ...(promptStructuredFilters.status
          ? { status: promptStructuredFilters.status }
          : {}),
        ...(promptStructuredFilters.payment_mode
          ? { payment_mode: promptStructuredFilters.payment_mode }
          : {}),
        ...(promptStructuredFilters.serviceCategory
          ? { serviceCategory: promptStructuredFilters.serviceCategory }
          : {}),
        ...(resolvedEntities.entityFilters.workerIds.length === 1
          ? { worker: resolvedEntities.entityFilters.workerIds[0] }
          : {}),
        ...(resolvedEntities.entityFilters.customerIds.length === 1
          ? { customer: resolvedEntities.entityFilters.customerIds[0] }
          : {}),
        ...(resolvedEntities.entityFilters.createdByIds.length === 1
          ? { createdBy: resolvedEntities.entityFilters.createdByIds[0] }
          : {}),
        ...(resolvedEntities.entityFilters.buildingIds.length === 1
          ? { building: resolvedEntities.entityFilters.buildingIds[0] }
          : {}),
        ...(resolvedEntities.entityFilters.mallIds.length === 1
          ? { mall: resolvedEntities.entityFilters.mallIds[0] }
          : {}),
      };

      const lookupResult = await executeGroupedPaymentLookup({
        keyword: "",
        payload: lookupPayload,
        userInfo,
        limit: wantsAllResults
          ? PAYMENT_RESULT_LIMIT
          : Math.max(perDomainLimit, 250),
        amountCriteria: promptAmountCriteria,
        entityFilters: resolvedEntities.entityFilters,
      });

      const amountText = formatAmountCriteriaText(promptAmountCriteria);
      const filterSummary = buildStructuredFilterSummary({
        amountText,
        period: resolvedPeriod,
        structuredFilters: promptStructuredFilters,
        resolvedEntities,
      });

      const followUpActions = buildStructuredConversationActions({
        structuredFilters: promptStructuredFilters,
        resolvedEntities,
        period: resolvedPeriod,
        total: lookupResult.total,
      });

      return {
        mode: "prompt",
        prompt: parsedPrompt.rawPrompt,
        keyword: lookupResult.keyword || parsedPrompt.keyword,
        parsed: {
          phone: parsedPrompt.phone || null,
          objectId: parsedPrompt.objectId || null,
          nameLike: parsedPrompt.nameLike || null,
          paymentLookup: parsedPrompt.paymentLookup || null,
          domainsSearched: ["payments"],
        },
        text: lookupResult.total
          ? `I found ${lookupResult.total} payment record(s)${filterSummary ? ` for ${filterSummary}` : ""}.`
          : `No payment records found${filterSummary ? ` for ${filterSummary}` : " for this request"}.`,
        summary: lookupResult.summary,
        ...(resolvedPeriod
          ? {
              selectedPeriod: {
                key: resolvedPeriod.key,
                label: resolvedPeriod.label,
                start: resolvedPeriod.start.toISOString(),
                end: resolvedPeriod.end.toISOString(),
              },
            }
          : {}),
        navigation: lookupResult.navigation,
        conversationActions: followUpActions,
        conversationHint:
          "Try the suggested next step, or type another filter (building, mall, location, worker, customer, status, payment mode).",
        total: lookupResult.total,
        matchedDomains: lookupResult.results.length,
        results: lookupResult.results,
        primaryResult:
          lookupResult.results.length && lookupResult.results[0].data.length
            ? lookupResult.results[0].data[0]
            : null,
      };
    }

    const shouldRunDirectPaymentLookup = Boolean(
      directPaymentKeyword &&
        (parsedPrompt.paymentLookup ||
          !isPersonLikeIdentity ||
          /\b(vehicle|vehilce|parking|receipt|rcp|invoice|bill)\b/i.test(
            parsedPrompt.rawPrompt,
          )),
    );

    if (shouldRunDirectPaymentLookup) {
      const paymentsDomain = DOMAIN_REGISTRY.payments;
      const paymentNumericId = extractPaymentNumericId({
        lookupText: directPaymentKeyword,
        rawPrompt: parsedPrompt.rawPrompt,
      });

      const shouldUsePageParityLookup = isVehicleLookupPrompt({
        rawPrompt: parsedPrompt.rawPrompt,
        lookupText: directPaymentKeyword,
      });

      if (shouldUsePageParityLookup && !parsedPrompt.objectId && !paymentNumericId) {
        const commonFilters = {
          pageNo: 0,
          pageSize: perDomainLimit,
          search: directPaymentKeyword,
        };

        const [residenceResult, onewashResult] = await Promise.all([
          paymentsListService.list(userInfo || {}, {
            ...commonFilters,
            onewash: "false",
          }),
          onewashListService.list(userInfo || {}, commonFilters),
        ]);

        const residenceRows = Array.isArray(residenceResult?.data)
          ? residenceResult.data
          : [];
        const onewashRows = Array.isArray(onewashResult?.data)
          ? onewashResult.data
          : [];

        const residenceTotal = Number(residenceResult?.total || 0);
        const onewashTotal = Number(onewashResult?.total || 0);

        const residencePayments = residenceRows.map((row) => ({
          ...row,
          onewash: false,
          serviceCategory: "residence",
          serviceTypeLabel: "Residence",
        }));

        const onewashPayments = onewashRows.map((row) => ({
          ...row,
          onewash: true,
          serviceCategory: "onewash",
          display_service_type:
            row.display_service_type || getOneWashDisplayServiceType(row),
        }));

        const results = [];
        if (residencePayments.length) {
          results.push({
            domain: "payments",
            label: "Residence Payments",
            total: residenceTotal,
            data: residencePayments,
          });
        }

        if (onewashPayments.length) {
          results.push({
            domain: "payments",
            label: "One Wash Payments",
            total: onewashTotal,
            data: onewashPayments,
          });
        }

        const total = Number(residenceTotal || 0) + Number(onewashTotal || 0);
        if (total > 0 || !isPersonLikeIdentity) {
          return {
            mode: "prompt",
            prompt: parsedPrompt.rawPrompt,
            keyword: directPaymentKeyword,
            parsed: {
              phone: parsedPrompt.phone || null,
              objectId: parsedPrompt.objectId || null,
              nameLike: parsedPrompt.nameLike || null,
              paymentLookup: parsedPrompt.paymentLookup || null,
              domainsSearched: ["payments"],
            },
            text:
              total > 0
                ? `I found ${total} payment record(s) for \"${directPaymentKeyword}\".`
                : `I could not find payment records for \"${directPaymentKeyword}\". Try receipt no, vehicle no, or parking no.`,
            summary: {
              residenceCount: residenceTotal,
              onewashCount: onewashTotal,
            },
            navigation: {
              residence: {
                path: "/payments/residence",
                filters: {
                  ai: "1",
                  q: directPaymentKeyword,
                },
              },
              onewash: {
                path: "/payments/onewash",
                filters: {
                  ai: "1",
                  q: directPaymentKeyword,
                },
              },
            },
            total,
            matchedDomains: results.length,
            results,
            primaryResult:
              results.length && results[0].data.length ? results[0].data[0] : null,
          };
        }
      }

      const directFilters = parsedPrompt.objectId
        ? { _id: parsedPrompt.objectId }
        : paymentNumericId
          ? { id: paymentNumericId }
          : {};
      const directKeyword = Object.keys(directFilters).length
        ? ""
        : directPaymentKeyword;

      const paymentLookupResult = await executeDomainSearch({
        domain: paymentsDomain,
        keyword: directKeyword,
        filters: directFilters,
        page: 1,
        limit: perDomainLimit,
        sort: { createdAt: -1 },
      });

      const directRows = Array.isArray(paymentLookupResult?.data)
        ? paymentLookupResult.data
        : [];
      const enrichedDirectRows = await enrichPaymentRowsForDisplay(directRows);

      const directResidenceRows = enrichedDirectRows.filter(
        (row) =>
          !(row?.onewash || String(row?.serviceCategory || "").toLowerCase() === "onewash"),
      );
      const directOneWashRows = enrichedDirectRows.filter(
        (row) =>
          row?.onewash || String(row?.serviceCategory || "").toLowerCase() === "onewash",
      );

      const groupedResults = [];
      if (directResidenceRows.length) {
        groupedResults.push({
          domain: "payments",
          label: "Residence Payments",
          total: directResidenceRows.length,
          data: directResidenceRows.map((row) => ({
            ...row,
            onewash: false,
            serviceCategory: "residence",
          })),
        });
      }

      if (directOneWashRows.length) {
        groupedResults.push({
          domain: "payments",
          label: "One Wash Payments",
          total: directOneWashRows.length,
          data: directOneWashRows.map((row) => ({
            ...row,
            onewash: true,
            serviceCategory: "onewash",
            display_service_type:
              row.display_service_type || getOneWashDisplayServiceType(row),
          })),
        });
      }

      const directTotal = groupedResults.reduce(
        (sum, group) => sum + Number(group.total || 0),
        0,
      );
      if (directTotal > 0 || !isPersonLikeIdentity) {
        return {
          mode: "prompt",
          prompt: parsedPrompt.rawPrompt,
          keyword: directPaymentKeyword,
          parsed: {
            phone: parsedPrompt.phone || null,
            objectId: parsedPrompt.objectId || null,
            nameLike: parsedPrompt.nameLike || null,
            paymentLookup: parsedPrompt.paymentLookup || null,
            domainsSearched: ["payments"],
          },
          text:
            directTotal > 0
              ? `I found ${directTotal} payment record(s) for \"${directPaymentKeyword}\".`
              : `I could not find payment records for \"${directPaymentKeyword}\". Try receipt no, vehicle no, or parking no.`,
          summary: {
            residenceCount: directResidenceRows.length,
            onewashCount: directOneWashRows.length,
          },
          navigation: {
            residence: {
              path: "/payments/residence",
              filters: {
                ai: "1",
                q: directPaymentKeyword,
              },
            },
            onewash: {
              path: "/payments/onewash",
              filters: {
                ai: "1",
                q: directPaymentKeyword,
              },
            },
          },
          total: directTotal,
          matchedDomains: groupedResults.length,
          results: groupedResults,
          primaryResult:
            directTotal > 0 && groupedResults.length && groupedResults[0].data.length
              ? groupedResults[0].data[0]
              : null,
        };
      }
    }

    const suggestions = hasExplicitIdentity
      ? await buildPersonSuggestions(parsedPrompt, PERSON_SUGGESTION_LIMIT)
      : [];

    if (!hasExplicitIdentity) {
      return {
        mode: "prompt",
        prompt: parsedPrompt.rawPrompt,
        keyword: parsedPrompt.keyword,
        parsed: {
          phone: parsedPrompt.phone || null,
          objectId: parsedPrompt.objectId || null,
          nameLike: parsedPrompt.nameLike || null,
          paymentLookup: parsedPrompt.paymentLookup || null,
          domainsSearched: PERSON_SEARCH_DOMAINS,
        },
        requiresSelection: "person",
        selectionType: "person",
        text: "Tell the person name/mobile or select from previous result to continue payment lookup.",
        suggestions: [],
        total: 0,
        matchedDomains: 0,
        results: [],
      };
    }

    if (!suggestions.length) {
      return {
        mode: "prompt",
        prompt: parsedPrompt.rawPrompt,
        keyword: parsedPrompt.keyword,
        parsed: {
          phone: parsedPrompt.phone || null,
          objectId: parsedPrompt.objectId || null,
          nameLike: parsedPrompt.nameLike || null,
          paymentLookup: parsedPrompt.paymentLookup || null,
          domainsSearched: PERSON_SEARCH_DOMAINS,
        },
        requiresSelection: "person",
        selectionType: "person",
        text: "I could not identify the person for payment lookup. Try full name or mobile number.",
        suggestions: [],
        total: 0,
        matchedDomains: 0,
        results: [],
      };
    }

    return {
      mode: "prompt",
      prompt: parsedPrompt.rawPrompt,
      keyword: parsedPrompt.keyword,
      parsed: {
        phone: parsedPrompt.phone || null,
        objectId: parsedPrompt.objectId || null,
        nameLike: parsedPrompt.nameLike || null,
        paymentLookup: parsedPrompt.paymentLookup || null,
        domainsSearched: PERSON_SEARCH_DOMAINS,
      },
      requiresSelection: "person",
      selectionType: "person",
      text:
        suggestions.length === 1
          ? "I found one matching person. Select to continue."
          : `I found ${suggestions.length} similar people. Select the correct person to continue.`,
      suggestions,
      total: 0,
      matchedDomains: 0,
      results: [],
    };
  }

  const searchTasks = parsedPrompt.domains.map(async (domainKey) => {
    const domain = DOMAIN_REGISTRY[domainKey];
    if (!domain) {
      return null;
    }

    const domainLimit = wantsAllResults
      ? Math.max(
          normalizeLimit(payload.limit, DEFAULT_DOMAIN_LIMIT, 200),
          DEFAULT_DOMAIN_LIMIT,
        )
      : perDomainLimit;

    return executeDomainSearch({
      domain,
      keyword: parsedPrompt.objectId ? "" : parsedPrompt.keyword,
      filters: buildPromptFilters(domainKey, parsedPrompt),
      page: 1,
      limit: domainLimit,
      sort: { createdAt: -1 },
    });
  });

  const resolved = (await Promise.all(searchTasks)).filter(Boolean);
  const matched = resolved.filter(
    (item) => Array.isArray(item.data) && item.data.length > 0,
  );

  const total = matched.reduce((sum, item) => sum + Number(item.total || 0), 0);

  return {
    mode: "prompt",
    prompt: parsedPrompt.rawPrompt,
    keyword: parsedPrompt.keyword,
    parsed: {
      phone: parsedPrompt.phone || null,
      objectId: parsedPrompt.objectId || null,
      nameLike: parsedPrompt.nameLike || null,
      paymentLookup: parsedPrompt.paymentLookup || null,
      domainsSearched: parsedPrompt.domains,
    },
    total,
    matchedDomains: matched.length,
    results: matched,
    primaryResult:
      matched.length && matched[0].data.length ? matched[0].data[0] : null,
  };
};

service.searchPersonPayments = async (payload = {}, userInfo = {}) => {
  const selected = normalizePersonSelection(payload.person);
  const personRecord = await fetchSelectedPersonRecord(selected);
  const selectedPerson = buildSelectedPerson(selected, personRecord);

  const selectedPeriod = resolveRequestedPeriod(payload);

  if (!selectedPeriod) {
    return {
      mode: "person-payments",
      action: "personPayments",
      requiresSelection: "period",
      selectionType: "period",
      selectedPerson,
      periodOptions: PERIOD_OPTIONS,
      text: `Select duration to view ${selectedPerson.name} payment details.`,
      total: 0,
      matchedDomains: 0,
      results: [],
    };
  }

  const limit = normalizeLimit(payload.limit, 500, PAYMENT_RESULT_LIMIT);

  const startDate = toDateParam(selectedPeriod.start);
  const endDate = toDateParam(selectedPeriod.end);
  const workerId =
    selectedPerson.domain === "workers"
      ? String(selectedPerson.id || "").trim()
      : "";
  const customerId =
    selectedPerson.domain === "customers"
      ? String(selectedPerson.id || "").trim()
      : "";
  const createdBy =
    selectedPerson.domain === "staff"
      ? String(selectedPerson.id || "").trim()
      : "";

  const commonFilters = {
    pageNo: 0,
    pageSize: limit,
    search: "",
    startDate,
    endDate,
    ...(workerId ? { worker: workerId } : {}),
    ...(customerId ? { customer: customerId } : {}),
    ...(createdBy ? { createdBy } : {}),
  };

  const [residenceResult, onewashResult] = await Promise.all([
    paymentsListService.list(userInfo || {}, {
      ...commonFilters,
      onewash: "false",
    }),
    onewashListService.list(userInfo || {}, commonFilters),
  ]);

  const residenceTotal = Number(residenceResult?.total || 0);
  const onewashTotal = Number(onewashResult?.total || 0);
  const residenceRows = Array.isArray(residenceResult?.data)
    ? residenceResult.data
    : [];
  const onewashRows = Array.isArray(onewashResult?.data)
    ? onewashResult.data
    : [];

  const residencePayments = residenceRows.map((row) => ({
    ...row,
    serviceCategory: "residence",
    serviceTypeLabel: "Residence",
  }));

  const onewashPayments = onewashRows.map((row) => ({
    ...row,
    onewash: true,
    serviceCategory: "onewash",
    display_service_type:
      row.display_service_type || getOneWashDisplayServiceType(row),
  }));

  const results = [];
  if (residencePayments.length) {
    results.push({
      domain: "payments",
      label: "Residence Payments",
      total: residenceTotal,
      data: residencePayments,
    });
  }

  if (onewashPayments.length) {
    results.push({
      domain: "payments",
      label: "One Wash Payments",
      total: onewashTotal,
      data: onewashPayments,
    });
  }

  const total = Number(residenceTotal || 0) + Number(onewashTotal || 0);

  const baseFilters = {
    ai: "1",
    startDate,
    endDate,
  };

  const residenceFilters = {
    ...baseFilters,
    ...(workerId ? { worker: workerId } : {}),
    ...(customerId ? { customer: customerId } : {}),
    ...(createdBy ? { createdBy } : {}),
  };

  const onewashFilters = {
    ...baseFilters,
    ...(workerId ? { worker: workerId } : {}),
    ...(customerId ? { customer: customerId } : {}),
    ...(createdBy ? { createdBy } : {}),
  };

  return {
    mode: "person-payments",
    action: "personPayments",
    selectedPerson,
    selectedPeriod: {
      key: selectedPeriod.key,
      label: selectedPeriod.label,
      start: selectedPeriod.start.toISOString(),
      end: selectedPeriod.end.toISOString(),
    },
    text: total
      ? `${selectedPerson.name} has ${total} payment record(s) in ${selectedPeriod.label}.`
      : `No payment records found for ${selectedPerson.name} in ${selectedPeriod.label}.`,
    summary: {
      residenceCount: residenceTotal,
      onewashCount: onewashTotal,
    },
    navigation: {
      residence: {
        path: "/payments/residence",
        filters: residenceFilters,
      },
      onewash: {
        path: "/payments/onewash",
        filters: onewashFilters,
      },
    },
    total,
    matchedDomains: results.length,
    results,
    primaryResult:
      results.length && results[0].data.length ? results[0].data[0] : null,
  };
};

service.search = async (payload = {}, userInfo = {}) => {
  if (normalizeDomain(payload.action) === "personpayments") {
    return service.searchPersonPayments(payload, userInfo);
  }

  if (Object.prototype.hasOwnProperty.call(payload, "prompt")) {
    return service.searchByPrompt(payload, userInfo);
  }

  return service.searchByDomain(payload);
};
