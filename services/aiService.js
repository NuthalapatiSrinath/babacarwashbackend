import { AI_SYSTEM_PROMPT } from "./aiContext.js";

const normalizeBaseUrl = (value) =>
  String(value || "")
    .trim()
    .replace(/\/+$/, "");

const resolveOllamaUrl = () => {
  const explicit = String(process.env.OLLAMA_URL || "").trim();
  if (explicit) return explicit;

  const base = normalizeBaseUrl(
    process.env.OLLAMA_BASE_URL || "http://localhost:11434",
  );
  return `${base}/api/chat`;
};

const OLLAMA_URL = resolveOllamaUrl();
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "llama3";
const OLLAMA_TIMEOUT_MS = Number(process.env.OLLAMA_TIMEOUT_MS || 120000);
const OLLAMA_API_KEY = String(process.env.OLLAMA_API_KEY || "").trim();
const OLLAMA_AUTH_HEADER =
  String(process.env.OLLAMA_AUTH_HEADER || "Authorization").trim() ||
  "Authorization";
const OLLAMA_AUTH_SCHEME = String(
  process.env.OLLAMA_AUTH_SCHEME || "Bearer",
).trim();

const buildHeaders = () => {
  const headers = {
    "Content-Type": "application/json",
  };

  if (!OLLAMA_API_KEY) {
    return headers;
  }

  if (OLLAMA_AUTH_HEADER.toLowerCase() === "authorization") {
    headers.Authorization = OLLAMA_AUTH_SCHEME
      ? `${OLLAMA_AUTH_SCHEME} ${OLLAMA_API_KEY}`
      : OLLAMA_API_KEY;

    return headers;
  }

  headers[OLLAMA_AUTH_HEADER] = OLLAMA_API_KEY;
  return headers;
};

const requestOllama = async ({
  url,
  method = "GET",
  body,
  timeoutMs = OLLAMA_TIMEOUT_MS,
}) => {
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      method,
      headers: buildHeaders(),
      body,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutHandle);
  }
};

const isModelMissingError = (statusCode, responseText = "") => {
  const text = String(responseText || "").toLowerCase();

  if (statusCode === 404 && text.includes("model")) {
    return true;
  }

  return (
    text.includes("model") &&
    (text.includes("not found") ||
      text.includes("not installed") ||
      text.includes("pull"))
  );
};

const buildRequestBody = (prompt) => {
  const isChatApi = OLLAMA_URL.includes("/api/chat");

  if (isChatApi) {
    return {
      model: OLLAMA_MODEL,
      stream: false,
      options: {
        temperature: 0.1,
      },
      messages: [
        { role: "system", content: AI_SYSTEM_PROMPT.trim() },
        { role: "user", content: prompt },
      ],
    };
  }

  return {
    model: OLLAMA_MODEL,
    prompt: `${AI_SYSTEM_PROMPT.trim()}\n\nUser Query: ${prompt}`,
    stream: false,
  };
};

const extractReplyText = (payload) => {
  if (typeof payload?.message?.content === "string") {
    return payload.message.content.trim();
  }

  if (typeof payload?.response === "string") {
    return payload.response.trim();
  }

  return "";
};

export async function askAI(prompt) {
  if (typeof prompt !== "string" || prompt.trim().length === 0) {
    throw new TypeError("Prompt must be a non-empty string.");
  }

  const normalizedPrompt = prompt.trim();

  try {
    const response = await requestOllama({
      url: OLLAMA_URL,
      method: "POST",
      body: JSON.stringify(buildRequestBody(normalizedPrompt)),
    });

    if (!response.ok) {
      const errorBody = await safeReadText(response);

      if (isModelMissingError(response.status, errorBody)) {
        throw new Error(
          `Ollama model "${OLLAMA_MODEL}" is not installed. Pull it manually on the Ollama server: ollama pull ${OLLAMA_MODEL}`,
        );
      }

      throw new Error(
        `Ollama request failed with status ${response.status}${errorBody ? `: ${errorBody}` : ""}`,
      );
    }

    const data = await response.json();
    const reply = extractReplyText(data);

    if (!reply) {
      throw new Error("Ollama returned an empty response.");
    }

    return reply;
  } catch (error) {
    if (error && error.name === "AbortError") {
      throw new Error(`Ollama request timed out after ${OLLAMA_TIMEOUT_MS}ms.`);
    }

    const causeCode = error?.cause?.code;
    if (
      error instanceof TypeError ||
      ["ECONNREFUSED", "ENOTFOUND", "EHOSTUNREACH", "ETIMEDOUT"].includes(
        causeCode,
      )
    ) {
      throw new Error(
        `Unable to reach Ollama at ${OLLAMA_URL}. Verify backend env (OLLAMA_URL/OLLAMA_BASE_URL) and that the Coolify Ollama app is running.`,
      );
    }

    throw error;
  }
}

async function safeReadText(response) {
  try {
    return await response.text();
  } catch (_) {
    return "";
  }
}
