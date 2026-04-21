"use strict";

const DEFAULT_TIMEOUT_MS = Number(process.env.GEMINI_TIMEOUT_MS || 12000);

const isPlainObject = (value) =>
  Object.prototype.toString.call(value) === "[object Object]";

const normalizeDomain = (value = "") => String(value).trim().toLowerCase();

const sanitizeFilters = (filters = {}) => {
  if (!isPlainObject(filters)) {
    return {};
  }

  const safe = {};
  for (const [key, value] of Object.entries(filters)) {
    const safeKey = String(key || "").trim();
    if (!safeKey || safeKey.startsWith("$")) {
      continue;
    }

    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      safe[safeKey] = value;
      continue;
    }

    if (Array.isArray(value)) {
      const primitiveItems = value
        .filter(
          (item) =>
            typeof item === "string" ||
            typeof item === "number" ||
            typeof item === "boolean",
        )
        .slice(0, 20);

      if (primitiveItems.length) {
        safe[safeKey] = primitiveItems;
      }
    }
  }

  return safe;
};

const parseJsonFromText = (text = "") => {
  const raw = String(text || "").trim();
  if (!raw) {
    return null;
  }

  const candidates = [raw];

  const withoutFence = raw
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();
  if (withoutFence && withoutFence !== raw) {
    candidates.push(withoutFence);
  }

  const firstBrace = raw.indexOf("{");
  const lastBrace = raw.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    candidates.push(raw.slice(firstBrace, lastBrace + 1));
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (isPlainObject(parsed)) {
        return parsed;
      }
    } catch (_) {
      // Try next candidate.
    }
  }

  return null;
};

const extractReplyText = (payload = {}) => {
  const parts = payload?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) {
    return "";
  }

  return parts
    .map((part) => (typeof part?.text === "string" ? part.text : ""))
    .join("")
    .trim();
};

const isGeminiConfigured = () => Boolean(String(process.env.GEMINI_API_KEY || "").trim());

const toModelAndUrl = () => {
  const model = String(process.env.GEMINI_MODEL || "gemini-2.0-flash").trim();
  const fallbackUrl =
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const url = String(process.env.GEMINI_URL || "").trim() || fallbackUrl;

  return { model, url };
};

const toSystemInstruction = (domainCatalog = []) => {
  const domainSummary = domainCatalog
    .map((item) => `- ${item.key}: ${item.hint || ""}`)
    .join("\n");

  return [
    "You classify user prompt intent for BCW admin database search.",
    "Return ONLY valid JSON, no markdown.",
    "Schema:",
    '{"intent":"search|payments|personPayments|unknown","query":"string","domains":["customers","workers","staff","payments","jobs","buildings","malls","locations","sites"],"keyword":"string","fetchAll":true,"filters":{},"confidence":0.0}',
    "Rules:",
    "1) Use intent=payments for payment-focused requests.",
    "2) Use intent=search for generic list/search requests.",
    "3) Set fetchAll=true for prompts like all/everything/list all.",
    "4) domains must be from allowed list only.",
    "5) query should be a cleaned natural-language rewrite.",
    "Allowed domains:",
    domainSummary,
  ]
    .filter(Boolean)
    .join("\n");
};

const normalizeGeminiIntent = (parsed = {}, prompt = "", allowedDomains = []) => {
  const allowedDomainSet = new Set(
    (Array.isArray(allowedDomains) ? allowedDomains : [])
      .map((item) => normalizeDomain(item))
      .filter(Boolean),
  );

  const intent = normalizeDomain(parsed.intent || "unknown");
  const query = String(parsed.query || prompt || "").trim();
  const keyword = String(parsed.keyword || "").trim();

  const domains = Array.from(
    new Set(
      (Array.isArray(parsed.domains) ? parsed.domains : [])
        .map((item) => normalizeDomain(item))
        .filter((item) => allowedDomainSet.has(item)),
    ),
  );

  const fetchAll =
    Boolean(parsed.fetchAll) ||
    /\b(all|everything|entire|full|list)\b/i.test(query || prompt);

  const parsedConfidence = Number(parsed.confidence);
  const confidence = Number.isFinite(parsedConfidence)
    ? Math.min(Math.max(parsedConfidence, 0), 1)
    : 0.5;

  return {
    intent,
    query,
    keyword,
    domains,
    fetchAll,
    confidence,
    filters: sanitizeFilters(parsed.filters),
  };
};

const analyzePromptWithGemini = async ({ prompt = "", domainCatalog = [] } = {}) => {
  const trimmedPrompt = String(prompt || "").trim();
  if (!trimmedPrompt || !isGeminiConfigured()) {
    return null;
  }

  const { url } = toModelAndUrl();
  const apiKey = String(process.env.GEMINI_API_KEY || "").trim();
  const timeoutMs = Number(process.env.GEMINI_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);

  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: toSystemInstruction(domainCatalog) }],
        },
        contents: [
          {
            role: "user",
            parts: [{ text: trimmedPrompt }],
          },
        ],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: "application/json",
        },
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      return null;
    }

    const payload = await response.json();
    const replyText = extractReplyText(payload);
    const parsed = parseJsonFromText(replyText);
    if (!parsed) {
      return null;
    }

    return normalizeGeminiIntent(parsed, trimmedPrompt, domainCatalog.map((item) => item.key));
  } catch (_) {
    return null;
  } finally {
    clearTimeout(timeoutHandle);
  }
};

module.exports = {
  analyzePromptWithGemini,
  isGeminiConfigured,
};
