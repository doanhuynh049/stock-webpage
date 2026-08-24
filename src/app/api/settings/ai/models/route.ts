import { NextResponse } from "next/server";

export type ModelInfo = {
  id: string;
  name: string;
  contextLength?: number;
  free?: boolean;
};

// Fetch live model list from a provider; falls back to well-known defaults
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const provider = searchParams.get("provider") ?? "";

  try {
    const models = await fetchModels(provider);
    return NextResponse.json({ models });
  } catch (e) {
    console.error(`[models] ${provider} fetch failed:`, e);
    return NextResponse.json({ models: getFallbackModels(provider) });
  }
}

export async function fetchModels(provider: string): Promise<ModelInfo[]> {
  switch (provider) {
    case "cerebras": {
      const key = process.env.CEREBRAS_API_KEY;
      if (!key) return getFallbackModels("cerebras");
      const res = await fetch("https://api.cerebras.ai/v1/models", {
        headers: { Authorization: `Bearer ${key}` },
        next: { revalidate: 3600 },
      });
      if (!res.ok) return getFallbackModels("cerebras");
      const data = await res.json();
      return (data.data ?? []).map((m: { id: string }) => ({ id: m.id, name: m.id }));
    }

    case "groq": {
      const key = process.env.GROQ_API_KEY;
      if (!key) return getFallbackModels("groq");
      const res = await fetch("https://api.groq.com/openai/v1/models", {
        headers: { Authorization: `Bearer ${key}` },
        next: { revalidate: 3600 },
      });
      if (!res.ok) return getFallbackModels("groq");
      const data = await res.json();
      return (data.data ?? [])
        .filter((m: { id: string; owned_by?: string }) =>
          !m.id.includes("whisper") && !m.id.includes("guard")
        )
        .map((m: { id: string; context_window?: number }) => ({
          id: m.id,
          name: m.id,
          contextLength: m.context_window,
        }));
    }

    case "gemini":
      return getFallbackModels("gemini");

    case "mistral": {
      const key = process.env.MISTRAL_API_KEY;
      if (!key) return getFallbackModels("mistral");
      const res = await fetch("https://api.mistral.ai/v1/models", {
        headers: { Authorization: `Bearer ${key}` },
        next: { revalidate: 3600 },
      });
      if (!res.ok) return getFallbackModels("mistral");
      const data = await res.json();
      return (data.data ?? [])
        .filter((m: { id: string; type?: string }) => m.type !== "embedding")
        .map((m: { id: string }) => ({ id: m.id, name: m.id }));
    }

    case "openrouter": {
      // OpenRouter models list is public (no auth needed)
      const res = await fetch("https://openrouter.ai/api/v1/models", {
        next: { revalidate: 3600 },
      });
      if (!res.ok) return getFallbackModels("openrouter");
      const data = await res.json();
      return (data.data ?? [])
        .slice(0, 100)
        .map((m: { id: string; name?: string; context_length?: number; pricing?: { prompt: string } }) => ({
          id: m.id,
          name: m.name ?? m.id,
          contextLength: m.context_length,
          free: m.pricing?.prompt === "0",
        }));
    }

    case "sambanova": {
      const key = process.env.SAMBANOVA_API_KEY;
      if (!key) return getFallbackModels("sambanova");
      const res = await fetch("https://api.sambanova.ai/v1/models", {
        headers: { Authorization: `Bearer ${key}` },
        next: { revalidate: 3600 },
      });
      if (!res.ok) return getFallbackModels("sambanova");
      const data = await res.json();
      return (data.data ?? []).map((m: { id: string }) => ({ id: m.id, name: m.id }));
    }

    case "cohere":
    case "huggingface":
    case "cloudflare":
    case "ollama":
      // No public/stable /models list for these (or it needs a local host /
      // account id we don't have server-side) — static hints only.
      return getFallbackModels(provider);

    case "llm7": {
      const res = await fetch("https://api.llm7.io/v1/models", { next: { revalidate: 3600 } });
      if (!res.ok) return getFallbackModels("llm7");
      const data = await res.json();
      return (data.data ?? []).map((m: { id: string }) => ({ id: m.id, name: m.id }));
    }

    default:
      return [];
  }
}

export function getFallbackModels(provider: string): ModelInfo[] {
  const fallbacks: Record<string, ModelInfo[]> = {
    cerebras: [
      { id: "gpt-oss-120b",  name: "GPT-OSS 120B (reasoning)" },
      { id: "zai-glm-4.7",   name: "GLM 4.7 (reasoning)" },
      { id: "gemma-4-31b",   name: "Gemma 4 31B" },
      { id: "llama-3.3-70b", name: "Llama 3.3 70B (if enabled)" },
    ],
    groq: [
      // Groq retired its Llama chat models (Aug 2026) — verified via GET /openai/v1/models.
      { id: "openai/gpt-oss-120b",        name: "GPT-OSS 120B (reasoning)" },
      { id: "openai/gpt-oss-20b",         name: "GPT-OSS 20B (reasoning)" },
      { id: "qwen/qwen3.6-27b",           name: "Qwen 3.6 27B" },
    ],
    gemini: [
      { id: "gemini-2.0-flash",           name: "Gemini 2.0 Flash" },
      { id: "gemini-1.5-flash",           name: "Gemini 1.5 Flash" },
      { id: "gemini-1.5-pro",             name: "Gemini 1.5 Pro" },
    ],
    mistral: [
      { id: "mistral-small-latest",       name: "Mistral Small" },
      { id: "mistral-medium-latest",      name: "Mistral Medium" },
      { id: "open-mistral-7b",            name: "Mistral 7B (open)" },
    ],
    openrouter: [
      { id: "meta-llama/llama-3.3-70b-instruct:free", name: "Llama 3.3 70B (free)", free: true },
      { id: "mistralai/mistral-7b-instruct:free",     name: "Mistral 7B (free)",    free: true },
      { id: "google/gemma-2-9b-it:free",              name: "Gemma 2 9B (free)",    free: true },
    ],
    sambanova: [
      { id: "Meta-Llama-3.3-70B-Instruct", name: "Llama 3.3 70B" },
      { id: "Meta-Llama-3.1-8B-Instruct",  name: "Llama 3.1 8B" },
      { id: "Qwen2.5-72B-Instruct",        name: "Qwen 2.5 72B" },
    ],
    cohere: [
      { id: "command-r-plus-08-2024", name: "Command R+ (08-2024)" },
      { id: "command-r-08-2024",      name: "Command R (08-2024)" },
      { id: "command-a-03-2025",      name: "Command A (03-2025)" },
    ],
    huggingface: [
      { id: "meta-llama/Llama-3.3-70B-Instruct", name: "Llama 3.3 70B Instruct" },
      { id: "Qwen/Qwen2.5-72B-Instruct",         name: "Qwen 2.5 72B Instruct" },
      { id: "mistralai/Mistral-7B-Instruct-v0.3", name: "Mistral 7B Instruct" },
    ],
    cloudflare: [
      { id: "@cf/meta/llama-3.1-8b-instruct",  name: "Llama 3.1 8B Instruct" },
      { id: "@cf/meta/llama-3.3-70b-instruct", name: "Llama 3.3 70B Instruct" },
      { id: "@cf/mistral/mistral-7b-instruct-v0.2", name: "Mistral 7B Instruct" },
    ],
    ollama: [
      { id: "llama3.2",  name: "Llama 3.2" },
      { id: "qwen2.5",   name: "Qwen 2.5" },
      { id: "mistral",   name: "Mistral" },
    ],
    llm7: [
      { id: "gpt-4o-mini", name: "GPT-4o mini" },
      { id: "gpt-4o",      name: "GPT-4o" },
    ],
  };
  return fallbacks[provider] ?? [];
}
