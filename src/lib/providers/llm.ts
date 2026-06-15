export type LlmMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type LlmProvider = "cerebras" | "groq" | "gemini" | "mistral" | "openrouter" | "fallback";

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
    default:   "llama3.1-70b",
    tier:      "Free 1M TPM",
    speed:     "~800 tok/s",
    modelsUrl: "https://api.cerebras.ai/v1/models",
  },
  {
    id:        "groq" as const,
    name:      "Groq",
    url:       "https://console.groq.com",
    envKey:    "GROQ_API_KEY",
    envModel:  "GROQ_MODEL",
    default:   "llama-3.3-70b-versatile",
    tier:      "Free 12k TPM",
    speed:     "~600 tok/s",
    modelsUrl: "https://api.groq.com/openai/v1/models",
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

  // 1. Cerebras — ~800 tok/s, 1M TPM free
  const cerebrasKey = k(process.env.CEREBRAS_API_KEY, "cerebras");
  if (cerebrasKey) {
    try {
      const r = await callOpenAICompat("https://api.cerebras.ai/v1/chat/completions",
        cerebrasKey, process.env.CEREBRAS_MODEL ?? "llama3.1-70b", fullMessages, maxTokens);
      if (r) return { ...r, provider: "cerebras" };
    } catch (e) { console.error("[LLM] Cerebras error:", e); }
  }

  // 2. Groq — 600 tok/s, 12k TPM free
  const groqKey = k(process.env.GROQ_API_KEY, "groq");
  if (groqKey) {
    try {
      const r = await callOpenAICompat("https://api.groq.com/openai/v1/chat/completions",
        groqKey, process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile", fullMessages, maxTokens);
      if (r) return { ...r, provider: "groq" };
    } catch (e) { console.error("[LLM] Groq error:", e); }
  }

  // 3. Gemini — 1M input TPM, 1500 req/day free
  const geminiKey = k(process.env.GEMINI_API_KEY, "gemini");
  if (geminiKey) {
    try {
      const r = await callGemini(fullMessages, geminiKey, maxTokens);
      if (r) return r;
    } catch (e) { console.error("[LLM] Gemini error:", e); }
  }

  // 4. Mistral — free trial tier
  const mistralKey = k(process.env.MISTRAL_API_KEY, "mistral");
  if (mistralKey) {
    try {
      const r = await callOpenAICompat("https://api.mistral.ai/v1/chat/completions",
        mistralKey, process.env.MISTRAL_MODEL ?? "mistral-small-latest", fullMessages, maxTokens);
      if (r) return { ...r, provider: "mistral" };
    } catch (e) { console.error("[LLM] Mistral error:", e); }
  }

  // 5. OpenRouter — aggregates many free ":free" models
  const orKey = k(process.env.OPENROUTER_API_KEY, "openrouter");
  if (orKey) {
    try {
      const r = await callOpenAICompat("https://openrouter.ai/api/v1/chat/completions",
        orKey, process.env.OPENROUTER_MODEL ?? "meta-llama/llama-3.3-70b-instruct:free",
        fullMessages, maxTokens,
        { "HTTP-Referer": "https://vn-stocks.app", "X-Title": "VN Stocks" });
      if (r) return { ...r, provider: "openrouter" };
    } catch (e) { console.error("[LLM] OpenRouter error:", e); }
  }

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
): Promise<{ content: string; model: string } | null> {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...extraHeaders,
    },
    body: JSON.stringify({ model, messages, temperature: 0.6, max_tokens: maxTokens }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`${url} ${res.status}: ${err}`);
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
): Promise<LlmResult | null> {
  const model = process.env.GEMINI_MODEL ?? "gemini-2.0-flash";
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
    },
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini ${res.status}: ${err}`);
  }

  const data = await res.json();
  const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
  return content ? { content, provider: "gemini", model } : null;
}

// ─── Status helper ────────────────────────────────────────────────────────────

export function getLlmStatus() {
  const cerebras   = !!process.env.CEREBRAS_API_KEY;
  const groq       = !!process.env.GROQ_API_KEY;
  const gemini     = !!process.env.GEMINI_API_KEY;
  const mistral    = !!process.env.MISTRAL_API_KEY;
  const openrouter = !!process.env.OPENROUTER_API_KEY;

  const activeProvider =
    cerebras   ? "cerebras"   :
    groq       ? "groq"       :
    gemini     ? "gemini"     :
    mistral    ? "mistral"    :
    openrouter ? "openrouter" : "fallback";

  return {
    cerebras,   groq,     gemini,   mistral,   openrouter,
    cerebrasModel:   process.env.CEREBRAS_MODEL   ?? "llama3.1-70b",
    groqModel:       process.env.GROQ_MODEL        ?? "llama-3.3-70b-versatile",
    geminiModel:     process.env.GEMINI_MODEL      ?? "gemini-2.0-flash",
    mistralModel:    process.env.MISTRAL_MODEL     ?? "mistral-small-latest",
    openrouterModel: process.env.OPENROUTER_MODEL  ?? "meta-llama/llama-3.3-70b-instruct:free",
    activeProvider,
    active: cerebras || groq || gemini || mistral || openrouter,
  };
}
