export type LlmMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type LlmResult = {
  content: string;
  provider: "cerebras" | "groq" | "gemini" | "fallback";
  model: string;
};

const SYSTEM_PROMPT = `You are a Vietnam stock market analyst AI. Answer in clear English with optional Vietnamese terms for local context.
Use ONLY the market data provided in context. Be concise, structured, and honest about risks.
Format with markdown: **Strengths**, **Risks**, **Conclusion** when analyzing stocks.
Never invent prices or metrics not in the context.
Maintain conversation context: if the user asks a follow-up (e.g. "should I buy it?", "what about risks?") without naming a ticker, answer about the stock already discussed in the chat and include its data from context.`;

export async function callLlm(
  messages: LlmMessage[],
  context: string,
  opts?: { maxTokens?: number; skipDefaultSystem?: boolean },
): Promise<LlmResult> {
  // If caller already includes a system message (skipDefaultSystem), don't prepend default
  const hasSystemMsg = messages.some((m) => m.role === "system");
  const skipDefault = opts?.skipDefaultSystem ?? hasSystemMsg;

  const fullMessages: LlmMessage[] = skipDefault
    ? messages
    : [
        { role: "system", content: `${SYSTEM_PROMPT}\n\n--- MARKET DATA ---\n${context}` },
        ...messages,
      ];

  const maxTokens = opts?.maxTokens ?? 1200;

  // 1. Cerebras — ~800 tok/s, 1M TPM free tier (highest priority)
  const cerebrasKey = process.env.CEREBRAS_API_KEY;
  if (cerebrasKey) {
    try {
      const result = await callCerebras(fullMessages, cerebrasKey, maxTokens);
      if (result) return result;
    } catch (e) {
      console.error("[LLM] Cerebras error:", e);
    }
  }

  // 2. Groq — 600 tok/s, 12k TPM free tier
  const groqKey = process.env.GROQ_API_KEY;
  if (groqKey) {
    try {
      const result = await callGroq(fullMessages, groqKey, maxTokens);
      if (result) return result;
    } catch (e) {
      console.error("[LLM] Groq error:", e);
    }
  }

  // 3. Gemini — unlimited input, 15 RPM free
  const geminiKey = process.env.GEMINI_API_KEY;
  if (geminiKey) {
    try {
      const result = await callGemini(fullMessages, geminiKey, maxTokens);
      if (result) return result;
    } catch (e) {
      console.error("[LLM] Gemini error:", e);
    }
  }

  return {
    content: "",
    provider: "fallback",
    model: "rule-based",
  };
}

// ─── Cerebras (OpenAI-compatible, ~800 tok/s, 1M TPM free) ───────────────────

async function callCerebras(
  messages: LlmMessage[],
  apiKey: string,
  maxTokens = 1200,
): Promise<LlmResult | null> {
  const model = process.env.CEREBRAS_MODEL ?? "llama-3.3-70b";

  const res = await fetch("https://api.cerebras.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.6,
      max_tokens: maxTokens,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Cerebras ${res.status}: ${err}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) return null;

  return { content, provider: "cerebras", model };
}

// ─── Groq ─────────────────────────────────────────────────────────────────────

async function callGroq(
  messages: LlmMessage[],
  apiKey: string,
  maxTokens = 1200,
): Promise<LlmResult | null> {
  const model =
    process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile";

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.6,
      max_tokens: maxTokens,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Groq ${res.status}: ${err}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) return null;

  return { content, provider: "groq", model };
}

async function callGemini(
  messages: LlmMessage[],
  apiKey: string,
  maxTokens = 1200,
): Promise<LlmResult | null> {
  const model = process.env.GEMINI_MODEL ?? "gemini-2.0-flash";
  const prompt = messages
    .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
    .join("\n\n");

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.6,
          maxOutputTokens: maxTokens,
        },
      }),
    },
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini ${res.status}: ${err}`);
  }

  const data = await res.json();
  const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!content) return null;

  return { content, provider: "gemini", model };
}

export function getLlmStatus() {
  const cerebras = !!process.env.CEREBRAS_API_KEY;
  const groq     = !!process.env.GROQ_API_KEY;
  const gemini   = !!process.env.GEMINI_API_KEY;
  return {
    cerebras,
    groq,
    gemini,
    cerebrasModel: process.env.CEREBRAS_MODEL ?? "llama-3.3-70b",
    groqModel:     process.env.GROQ_MODEL    ?? "llama-3.3-70b-versatile",
    geminiModel:   process.env.GEMINI_MODEL  ?? "gemini-2.0-flash",
    // Active provider in priority order
    activeProvider: cerebras ? "cerebras" : groq ? "groq" : gemini ? "gemini" : "fallback",
    active: cerebras || groq || gemini,
  };
}
