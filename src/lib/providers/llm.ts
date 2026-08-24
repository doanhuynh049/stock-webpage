export type LlmMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type LlmProvider =
  | "cerebras" | "groq" | "gemini" | "mistral" | "openrouter"
  | "sambanova" | "cohere" | "huggingface" | "cloudflare" | "ollama" | "llm7"
  | "fallback";

export type LlmResult = {
  content: string;
  provider: LlmProvider;
  model: string;
};

// Provider metadata — single source of truth for UI + routing
export const LLM_PROVIDERS = [
  {
    id:        "cerebras" as const,
    name:      "Cerebras",
    url:       "https://cloud.cerebras.ai",
    envKey:    "CEREBRAS_API_KEY",
    envModel:  "CEREBRAS_MODEL",
    default:   "gpt-oss-120b",
    tier:      "Free 1M TPM",
    speed:     "~2100 tok/s",
    modelsUrl: "https://api.cerebras.ai/v1/models",
    chatUrl:   "https://api.cerebras.ai/v1/chat/completions",
  },
  {
    id:        "groq" as const,
    name:      "Groq",
    url:       "https://console.groq.com",
    envKey:    "GROQ_API_KEY",
    envModel:  "GROQ_MODEL",
    default:   "openai/gpt-oss-120b",
    tier:      "Free 12k TPM",
    speed:     "~600 tok/s",
    modelsUrl: "https://api.groq.com/openai/v1/models",
    chatUrl:   "https://api.groq.com/openai/v1/chat/completions",
  },
  {
    id:        "gemini" as const,
    name:      "Google Gemini",
    url:       "https://aistudio.google.com",
    envKey:    "GEMINI_API_KEY",
    envModel:  "GEMINI_MODEL",
    default:   "gemini-2.0-flash",
    tier:      "Free 1500 req/day",
    speed:     "medium",
    modelsUrl: null,
    chatUrl:   null, // Gemini uses its own non-OpenAI-compatible endpoint, see callGemini()
  },
  {
    id:        "mistral" as const,
    name:      "Mistral AI",
    url:       "https://console.mistral.ai",
    envKey:    "MISTRAL_API_KEY",
    envModel:  "MISTRAL_MODEL",
    default:   "mistral-small-latest",
    tier:      "Free trial",
    speed:     "medium",
    modelsUrl: "https://api.mistral.ai/v1/models",
    chatUrl:   "https://api.mistral.ai/v1/chat/completions",
  },
  {
    id:        "openrouter" as const,
    name:      "OpenRouter",
    url:       "https://openrouter.ai",
    envKey:    "OPENROUTER_API_KEY",
    envModel:  "OPENROUTER_MODEL",
    default:   "meta-llama/llama-3.3-70b-instruct:free",
    tier:      "Free models available",
    speed:     "varies",
    modelsUrl: "https://openrouter.ai/api/v1/models",
    chatUrl:   "https://openrouter.ai/api/v1/chat/completions",
  },
  {
    id:        "sambanova" as const,
    name:      "SambaNova",
    url:       "https://cloud.sambanova.ai",
    envKey:    "SAMBANOVA_API_KEY",
    envModel:  "SAMBANOVA_MODEL",
    default:   "Meta-Llama-3.3-70B-Instruct",
    tier:      "Free tier",
    speed:     "fast",
    modelsUrl: "https://api.sambanova.ai/v1/models",
    chatUrl:   "https://api.sambanova.ai/v1/chat/completions",
  },
  {
    id:        "cohere" as const,
    name:      "Cohere",
    url:       "https://dashboard.cohere.com",
    envKey:    "COHERE_API_KEY",
    envModel:  "COHERE_MODEL",
    default:   "command-r-plus-08-2024",
    tier:      "Free trial ~1k calls/mo",
    speed:     "medium",
    modelsUrl: null, // Cohere's OpenAI-compat shim has no /models endpoint
    chatUrl:   "https://api.cohere.ai/compatibility/v1/chat/completions",
  },
  {
    id:        "huggingface" as const,
    name:      "Hugging Face",
    url:       "https://huggingface.co/settings/tokens",
    envKey:    "HUGGINGFACE_API_KEY",
    envModel:  "HUGGINGFACE_MODEL",
    default:   "meta-llama/Llama-3.3-70B-Instruct",
    tier:      "Free inference credits",
    speed:     "varies",
    modelsUrl: null,
    chatUrl:   "https://router.huggingface.co/v1/chat/completions",
  },
  {
    id:        "cloudflare" as const,
    name:      "Cloudflare Workers AI",
    url:       "https://dash.cloudflare.com",
    envKey:    "CLOUDFLARE_API_TOKEN",
    envModel:  "CLOUDFLARE_MODEL",
    default:   "@cf/meta/llama-3.1-8b-instruct",
    tier:      "Free 10k neurons/day",
    speed:     "fast",
    modelsUrl: null,
    chatUrl:   null, // Needs CLOUDFLARE_ACCOUNT_ID + native /ai/run/{model} schema, see callCloudflare()
  },
  {
    id:        "ollama" as const,
    name:      "Ollama (local)",
    url:       "https://ollama.com",
    envKey:    "OLLAMA_BASE_URL",
    envModel:  "OLLAMA_MODEL",
    default:   "llama3.2",
    tier:      "Free — local, unlimited",
    speed:     "hardware-dependent",
    modelsUrl: null,
    chatUrl:   null, // Base URL comes from OLLAMA_BASE_URL, not a fixed host; see callOllama()
    noAuth:    true, // no API key — needs a reachable OLLAMA_BASE_URL instead (won't work on Vercel)
  },
  {
    id:        "llm7" as const,
    name:      "LLM7 (anonymous)",
    url:       "https://llm7.io",
    envKey:    "LLM7_API_KEY",
    envModel:  "LLM7_MODEL",
    default:   "gpt-4o-mini",
    tier:      "Free, no key required",
    speed:     "varies",
    modelsUrl: "https://api.llm7.io/v1/models",
    chatUrl:   "https://api.llm7.io/v1/chat/completions",
    noAuth:    true, // works anonymously; an API key (if set) just raises the rate limit
  },
] as const;

const SYSTEM_PROMPT = `You are a Vietnam stock market analyst AI. Answer in clear English with optional Vietnamese terms for local context.
Use ONLY the market data provided in context. Be concise, structured, and honest about risks.
Format with markdown: **Strengths**, **Risks**, **Conclusion** when analyzing stocks.
Never invent prices or metrics not in the context.
Maintain conversation context: if the user asks a follow-up (e.g. "should I buy it?", "what about risks?") without naming a ticker, answer about the stock already discussed in the chat and include its data from context.`;

export type LlmApiKeys = Partial<Record<LlmProvider, string>>;

export async function callLlm(
  messages: LlmMessage[],
  context: string,
  opts?: { maxTokens?: number; skipDefaultSystem?: boolean; apiKeys?: LlmApiKeys },
): Promise<LlmResult> {
  const hasSystemMsg = messages.some((m) => m.role === "system");
  const skipDefault = opts?.skipDefaultSystem ?? hasSystemMsg;

  const fullMessages: LlmMessage[] = skipDefault
    ? messages
    : [
        { role: "system", content: `${SYSTEM_PROMPT}\n\n--- MARKET DATA ---\n${context}` },
        ...messages,
      ];

  const maxTokens = opts?.maxTokens ?? 1200;
  // User-supplied key overrides env var (personal use)
  const uk = opts?.apiKeys ?? {};
  const k  = (envVar: string | undefined, id: LlmProvider) => uk[id] || envVar || "";

  // 1. Cerebras — ~2100 tok/s, 1M TPM free.
  // NOTE: model availability is account-specific. This account serves reasoning
  // models (gpt-oss-120b, zai-glm-4.7) + gemma-4-31b — NOT Llama. For reasoning
  // models we pin reasoning_effort=low so the token budget is spent on the
  // answer (JSON) rather than hidden reasoning.
  const cerebrasKey = k(process.env.CEREBRAS_API_KEY, "cerebras");
  if (cerebrasKey) {
    const cerebrasModel = process.env.CEREBRAS_MODEL ?? "gpt-oss-120b";
    const cerebrasBody = isReasoningModel(cerebrasModel)
      ? { reasoning_effort: "low" as const }
      : undefined;
    try {
      const r = await callOpenAICompat("https://api.cerebras.ai/v1/chat/completions",
        cerebrasKey, cerebrasModel, fullMessages, maxTokens, undefined, cerebrasBody);
      if (r) { console.log("[LLM] Using Cerebras"); return { ...r, provider: "cerebras" }; }
    } catch (e) {
      console.warn("[LLM] Cerebras failed (falling through):", e instanceof Error ? e.message : e);
    }
  }

  // 2. Groq — 600 tok/s, 12k TPM free.
  // NOTE (Aug 2026): Groq retired its Llama chat models — /v1/models now only
  // lists openai/gpt-oss-* + qwen/qwen3.6-27b (verified via GET /openai/v1/models).
  // Same reasoning-model family as Cerebras, so it needs the same
  // reasoning_effort=low treatment (see isReasoningModel below).
  const groqKey = k(process.env.GROQ_API_KEY, "groq");
  if (groqKey) {
    const groqModel = process.env.GROQ_MODEL ?? "openai/gpt-oss-120b";
    const groqBody = isReasoningModel(groqModel) ? { reasoning_effort: "low" as const } : undefined;
    try {
      const r = await callOpenAICompat("https://api.groq.com/openai/v1/chat/completions",
        groqKey, groqModel, fullMessages, maxTokens, undefined, groqBody);
      if (r) { console.log("[LLM] Using Groq"); return { ...r, provider: "groq" }; }
    } catch (e) { console.error("[LLM] Groq error (falling through):", e); }
  }

  // 3. Gemini — 1M input TPM, 1500 req/day free
  const geminiKey = k(process.env.GEMINI_API_KEY, "gemini");
  if (geminiKey) {
    try {
      const r = await callGemini(fullMessages, geminiKey, maxTokens);
      if (r) { console.log("[LLM] Using Gemini"); return r; }
    } catch (e) { console.error("[LLM] Gemini error (falling through):", e); }
  }

  // 4. Mistral — free trial tier
  const mistralKey = k(process.env.MISTRAL_API_KEY, "mistral");
  if (mistralKey) {
    try {
      const r = await callOpenAICompat("https://api.mistral.ai/v1/chat/completions",
        mistralKey, process.env.MISTRAL_MODEL ?? "mistral-small-latest", fullMessages, maxTokens);
      if (r) { console.log("[LLM] Using Mistral"); return { ...r, provider: "mistral" }; }
    } catch (e) { console.error("[LLM] Mistral error (falling through):", e); }
  }

  // 5. OpenRouter — aggregates many free ":free" models
  const orKey = k(process.env.OPENROUTER_API_KEY, "openrouter");
  if (orKey) {
    try {
      const r = await callOpenAICompat("https://openrouter.ai/api/v1/chat/completions",
        orKey, process.env.OPENROUTER_MODEL ?? "meta-llama/llama-3.3-70b-instruct:free",
        fullMessages, maxTokens,
        { "HTTP-Referer": "https://vn-stocks.app", "X-Title": "VN Stocks" });
      if (r) { console.log("[LLM] Using OpenRouter"); return { ...r, provider: "openrouter" }; }
    } catch (e) { console.error("[LLM] OpenRouter error (falling through):", e); }
  }

  // 6. SambaNova — Llama 3.3 70B, free tier
  const sambaKey = k(process.env.SAMBANOVA_API_KEY, "sambanova");
  if (sambaKey) {
    try {
      const r = await callOpenAICompat("https://api.sambanova.ai/v1/chat/completions",
        sambaKey, process.env.SAMBANOVA_MODEL ?? "Meta-Llama-3.3-70B-Instruct", fullMessages, maxTokens);
      if (r) { console.log("[LLM] Using SambaNova"); return { ...r, provider: "sambanova" }; }
    } catch (e) { console.error("[LLM] SambaNova error (falling through):", e); }
  }

  // 7. Cohere — OpenAI-compatible shim, ~1k free calls/mo
  const cohereKey = k(process.env.COHERE_API_KEY, "cohere");
  if (cohereKey) {
    try {
      const r = await callOpenAICompat("https://api.cohere.ai/compatibility/v1/chat/completions",
        cohereKey, process.env.COHERE_MODEL ?? "command-r-plus-08-2024", fullMessages, maxTokens);
      if (r) { console.log("[LLM] Using Cohere"); return { ...r, provider: "cohere" }; }
    } catch (e) { console.error("[LLM] Cohere error (falling through):", e); }
  }

  // 8. Hugging Face — router.huggingface.co OpenAI-compatible endpoint
  const hfKey = k(process.env.HUGGINGFACE_API_KEY, "huggingface");
  if (hfKey) {
    try {
      const r = await callOpenAICompat("https://router.huggingface.co/v1/chat/completions",
        hfKey, process.env.HUGGINGFACE_MODEL ?? "meta-llama/Llama-3.3-70B-Instruct", fullMessages, maxTokens);
      if (r) { console.log("[LLM] Using Hugging Face"); return { ...r, provider: "huggingface" }; }
    } catch (e) { console.error("[LLM] Hugging Face error (falling through):", e); }
  }

  // 9. Cloudflare Workers AI — needs account id, native (non-OpenAI) response shape
  const cfToken = k(process.env.CLOUDFLARE_API_TOKEN, "cloudflare");
  const cfAccount = process.env.CLOUDFLARE_ACCOUNT_ID;
  if (cfToken && cfAccount) {
    try {
      const r = await callCloudflare(cfAccount, cfToken, process.env.CLOUDFLARE_MODEL ?? "@cf/meta/llama-3.1-8b-instruct", fullMessages, maxTokens);
      if (r) { console.log("[LLM] Using Cloudflare"); return { ...r, provider: "cloudflare" }; }
    } catch (e) { console.error("[LLM] Cloudflare error (falling through):", e); }
  }

  // 10. Ollama — local-only, no key; base URL must be reachable from the server
  const ollamaBase = process.env.OLLAMA_BASE_URL;
  if (ollamaBase) {
    try {
      const r = await callOpenAICompat(`${ollamaBase.replace(/\/+$/, "")}/v1/chat/completions`,
        "", process.env.OLLAMA_MODEL ?? "llama3.2", fullMessages, maxTokens);
      if (r) { console.log("[LLM] Using Ollama"); return { ...r, provider: "ollama" }; }
    } catch (e) { console.error("[LLM] Ollama error (falling through):", e); }
  }

  // 11. LLM7 — anonymous fallback, works even with no key at all
  try {
    const llm7Key = k(process.env.LLM7_API_KEY, "llm7");
    const r = await callOpenAICompat("https://api.llm7.io/v1/chat/completions",
      llm7Key, process.env.LLM7_MODEL ?? "gpt-4o-mini", fullMessages, maxTokens);
    if (r) { console.log("[LLM] Using LLM7"); return { ...r, provider: "llm7" }; }
  } catch (e) { console.error("[LLM] LLM7 error (falling through):", e); }

  console.warn("[LLM] All providers failed or unconfigured — using rule-based fallback.");
  return { content: "", provider: "fallback", model: "rule-based" };
}

// ─── Generic OpenAI-compatible POST ──────────────────────────────────────────

async function callOpenAICompat(
  url: string,
  apiKey: string,
  model: string,
  messages: LlmMessage[],
  maxTokens: number,
  extraHeaders?: Record<string, string>,
  extraBody?: Record<string, unknown>,
): Promise<{ content: string; model: string } | null> {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      "Content-Type": "application/json",
      ...extraHeaders,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.6,
      max_tokens: maxTokens,
      ...extraBody,
    }),
    signal: AbortSignal.timeout(20_000),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new HttpError(res.status, `${url} ${res.status}: ${err}`, res.headers.get("retry-after"));
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  return content ? { content, model } : null;
}

// ─── Gemini (non-OpenAI format) ──────────────────────────────────────────────

async function callGemini(
  messages: LlmMessage[],
  apiKey: string,
  maxTokens = 1200,
  modelOverride?: string,
): Promise<LlmResult | null> {
  const model = modelOverride ?? process.env.GEMINI_MODEL ?? "gemini-2.0-flash";
  const prompt = messages.map((m) => `${m.role.toUpperCase()}: ${m.content}`).join("\n\n");

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.6, maxOutputTokens: maxTokens },
      }),
      signal: AbortSignal.timeout(20_000),
    },
  );

  if (!res.ok) {
    const err = await res.text();
    throw new HttpError(res.status, `Gemini ${res.status}: ${err}`, res.headers.get("retry-after"));
  }

  const data = await res.json();
  const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
  return content ? { content, provider: "gemini", model } : null;
}

// ─── Cloudflare Workers AI (native, non-OpenAI schema) ───────────────────────

async function callCloudflare(
  accountId: string,
  token: string,
  model: string,
  messages: LlmMessage[],
  maxTokens: number,
): Promise<{ content: string; model: string } | null> {
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messages, max_tokens: maxTokens }),
    signal: AbortSignal.timeout(20_000),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new HttpError(res.status, `Cloudflare ${res.status}: ${err}`, res.headers.get("retry-after"));
  }

  const data = await res.json();
  const content = data?.result?.response;
  return content ? { content, model } : null;
}

// ─── Quota-aware error classification ────────────────────────────────────────

/**
 * Cerebras' `gpt-oss-120b` / `*-glm-*` models are REASONING models — they
 * spend hidden `<think>…</think>` tokens before emitting the visible answer.
 * `callLlm()` already pins `reasoning_effort: "low"` for these; `testProvider()`'s
 * tiny 20-token ping still needs a raised floor or the hidden reasoning eats
 * the whole budget and the Settings "Run test" button falsely reports an
 * empty response.
 */
const REASONING_MODEL_TEST_TOKEN_FLOOR = 2000;
/** gpt-oss / glm-family models spend tokens on hidden reasoning by default — pin reasoning_effort=low so the token budget goes to the answer instead. */
function isReasoningModel(model: string): boolean {
  return /oss|glm/i.test(model);
}

class HttpError extends Error {
  constructor(public status: number, message: string, public retryAfter?: string | null) {
    super(message);
  }
}

/**
 * Turns a raw HTTP failure into a message that distinguishes "the model
 * works but you're out of quota / rate-limited" from "auth is wrong" from
 * "the provider is down" — so the Run Test button tells the user what to
 * actually do next instead of dumping a raw error body.
 */
function classifyHttpFailure(status: number, body: string, retryAfter?: string | null): string {
  const lower = body.toLowerCase();
  const retrySuffix = retryAfter ? ` Retry after ~${retryAfter}s.` : "";

  if (status === 401 || status === 403) {
    return `Unauthorized (${status}) — API key is invalid, missing, or lacks permission.`;
  }
  if (status === 429) {
    const dailyExhausted =
      lower.includes("exceeded your current quota") ||
      lower.includes("resource_exhausted") ||
      ((lower.includes("quota") || lower.includes("limit")) &&
        (lower.includes("per day") || lower.includes("perday") || lower.includes("daily")));
    return dailyExhausted
      ? `No tokens available — daily free-tier quota exhausted.${retrySuffix}`
      : `Rate limited — no requests left this minute, try again shortly.${retrySuffix}`;
  }
  if (status === 402) {
    return `Payment required — plan credits/quota exhausted.${retrySuffix}`;
  }
  if (status === 404) {
    return `Model or endpoint not found (404) — check the model id.`;
  }
  if (status >= 500) {
    return `Upstream error (${status}) — provider is having issues, try again shortly.`;
  }
  return `HTTP ${status}: ${body.slice(0, 220)}`;
}

// ─── Run-test helper ──────────────────────────────────────────────────────────

export type ProviderTestResult = {
  ok: boolean;
  message: string;
  latencyMs: number;
};

/**
 * Sends a minimal "ping" message straight to one provider/model — bypasses the
 * failover walk in callLlm() so the settings page can verify a single row
 * (including an unsaved API key / model the user just typed) actually works.
 * Failure messages are quota-aware: 429/402 are reported as "no tokens/quota
 * left" rather than a generic error, so the user knows whether to wait or to
 * fix their key.
 */
export async function testProvider(
  id: LlmProvider,
  model: string,
  apiKeyOverride?: string,
): Promise<ProviderTestResult> {
  const meta = LLM_PROVIDERS.find((p) => p.id === id);
  if (!meta) return { ok: false, message: "Unknown provider", latencyMs: 0 };

  const noAuth = "noAuth" in meta && meta.noAuth;
  const apiKey = apiKeyOverride || process.env[meta.envKey] || "";
  if (!apiKey && !noAuth) {
    return { ok: false, message: "No API key — enter one above or set the env var first.", latencyMs: 0 };
  }
  if (id === "ollama" && !apiKeyOverride && !process.env.OLLAMA_BASE_URL) {
    return { ok: false, message: "No OLLAMA_BASE_URL set — Ollama must be reachable from the server.", latencyMs: 0 };
  }
  if (!model.trim()) {
    return { ok: false, message: "No model selected.", latencyMs: 0 };
  }

  const pingMessage: LlmMessage[] = [
    { role: "user", content: "Reply with exactly one word: OK" },
  ];
  const start = Date.now();

  try {
    let content: string | null = null;

    if (id === "gemini") {
      const r = await callGemini(pingMessage, apiKey, 20, model);
      content = r?.content ?? null;
    } else if (id === "cloudflare") {
      const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
      if (!accountId) {
        return { ok: false, message: "No CLOUDFLARE_ACCOUNT_ID set on the server.", latencyMs: Date.now() - start };
      }
      const r = await callCloudflare(accountId, apiKey, model, pingMessage, 20);
      content = r?.content ?? null;
    } else if (id === "ollama") {
      const base = (apiKeyOverride ? "" : process.env.OLLAMA_BASE_URL) || "http://localhost:11434";
      const r = await callOpenAICompat(`${base.replace(/\/+$/, "")}/v1/chat/completions`, "", model, pingMessage, 20);
      content = r?.content ?? null;
    } else if (meta.chatUrl) {
      const extraHeaders = id === "openrouter"
        ? { "HTTP-Referer": "https://vn-stocks.app", "X-Title": "VN Stocks" }
        : undefined;
      const isReasoning = isReasoningModel(model);
      const testMaxTokens = isReasoning ? REASONING_MODEL_TEST_TOKEN_FLOOR : 20;
      const extraBody = isReasoning ? { reasoning_effort: "low" as const } : undefined;
      const r = await callOpenAICompat(meta.chatUrl, apiKey, model, pingMessage, testMaxTokens, extraHeaders, extraBody);
      content = r?.content ?? null;
    } else {
      return { ok: false, message: "Provider has no test endpoint configured.", latencyMs: 0 };
    }

    const latencyMs = Date.now() - start;
    if (!content) return { ok: false, message: "Model returned an empty response.", latencyMs };
    return { ok: true, message: content.trim().slice(0, 200), latencyMs };
  } catch (e) {
    const latencyMs = Date.now() - start;
    if (e instanceof HttpError) {
      return { ok: false, message: classifyHttpFailure(e.status, e.message, e.retryAfter), latencyMs };
    }
    const raw = e instanceof Error ? e.message : String(e);
    return { ok: false, message: raw.slice(0, 300), latencyMs };
  }
}

// ─── Status helper ────────────────────────────────────────────────────────────

export function getLlmStatus() {
  const cerebras    = !!process.env.CEREBRAS_API_KEY;
  const groq        = !!process.env.GROQ_API_KEY;
  const gemini       = !!process.env.GEMINI_API_KEY;
  const mistral       = !!process.env.MISTRAL_API_KEY;
  const openrouter    = !!process.env.OPENROUTER_API_KEY;
  const sambanova     = !!process.env.SAMBANOVA_API_KEY;
  const cohere        = !!process.env.COHERE_API_KEY;
  const huggingface   = !!process.env.HUGGINGFACE_API_KEY;
  const cloudflare     = !!(process.env.CLOUDFLARE_API_TOKEN && process.env.CLOUDFLARE_ACCOUNT_ID);
  const ollama         = !!process.env.OLLAMA_BASE_URL;
  const llm7           = true; // works anonymously

  const activeProvider =
    cerebras   ? "cerebras"   :
    groq       ? "groq"       :
    gemini     ? "gemini"     :
    mistral    ? "mistral"    :
    openrouter ? "openrouter" :
    sambanova  ? "sambanova"  :
    cohere     ? "cohere"     :
    huggingface ? "huggingface" :
    cloudflare ? "cloudflare" :
    ollama     ? "ollama"     : "llm7";

  return {
    cerebras, groq, gemini, mistral, openrouter,
    sambanova, cohere, huggingface, cloudflare, ollama, llm7,
    cerebrasModel:    process.env.CEREBRAS_MODEL    ?? "gpt-oss-120b",
    groqModel:        process.env.GROQ_MODEL        ?? "openai/gpt-oss-120b",
    geminiModel:      process.env.GEMINI_MODEL      ?? "gemini-2.0-flash",
    mistralModel:     process.env.MISTRAL_MODEL     ?? "mistral-small-latest",
    openrouterModel:  process.env.OPENROUTER_MODEL  ?? "meta-llama/llama-3.3-70b-instruct:free",
    sambanovaModel:   process.env.SAMBANOVA_MODEL   ?? "Meta-Llama-3.3-70B-Instruct",
    cohereModel:      process.env.COHERE_MODEL      ?? "command-r-plus-08-2024",
    huggingfaceModel: process.env.HUGGINGFACE_MODEL ?? "meta-llama/Llama-3.3-70B-Instruct",
    cloudflareModel:  process.env.CLOUDFLARE_MODEL  ?? "@cf/meta/llama-3.1-8b-instruct",
    ollamaModel:      process.env.OLLAMA_MODEL      ?? "llama3.2",
    llm7Model:        process.env.LLM7_MODEL        ?? "gpt-4o-mini",
    activeProvider,
    active: cerebras || groq || gemini || mistral || openrouter || sambanova || cohere || huggingface || cloudflare || ollama || llm7,
  };
}
