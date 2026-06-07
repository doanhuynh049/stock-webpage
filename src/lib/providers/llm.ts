export type LlmMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type LlmResult = {
  content: string;
  provider: "groq" | "gemini" | "fallback";
  model: string;
};

const SYSTEM_PROMPT = `You are a Vietnam stock market analyst AI. Answer in clear English with optional Vietnamese terms for local context.
Use ONLY the market data provided in context. Be concise, structured, and honest about risks.
Format with markdown: **Strengths**, **Risks**, **Conclusion** when analyzing stocks.
Never invent prices or metrics not in the context.`;

export async function callLlm(
  messages: LlmMessage[],
  context: string,
): Promise<LlmResult> {
  const fullMessages: LlmMessage[] = [
    { role: "system", content: `${SYSTEM_PROMPT}\n\n--- MARKET DATA ---\n${context}` },
    ...messages,
  ];

  const groqKey = process.env.GROQ_API_KEY;
  if (groqKey) {
    try {
      const result = await callGroq(fullMessages, groqKey);
      if (result) return result;
    } catch (e) {
      console.error("[LLM] Groq error:", e);
    }
  }

  const geminiKey = process.env.GEMINI_API_KEY;
  if (geminiKey) {
    try {
      const result = await callGemini(fullMessages, geminiKey);
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

async function callGroq(
  messages: LlmMessage[],
  apiKey: string,
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
      max_tokens: 1200,
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
          maxOutputTokens: 1200,
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
  return {
    groq: !!process.env.GROQ_API_KEY,
    gemini: !!process.env.GEMINI_API_KEY,
    groqModel: process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile",
    geminiModel: process.env.GEMINI_MODEL ?? "gemini-2.0-flash",
    active: !!(process.env.GROQ_API_KEY || process.env.GEMINI_API_KEY),
  };
}
