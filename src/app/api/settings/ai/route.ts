import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { LlmProvider } from "@/lib/providers/llm";
import { getLlmStatus } from "@/lib/providers/llm";
import { aiSettingsSchema } from "@/lib/validation/schemas";
import { parseJsonBody } from "@/lib/validation/validate";

export type ProviderConfig = {
  id: LlmProvider;
  enabled: boolean;
  model: string;
  priority: number;
  /** User-supplied API key (overrides server env var). Stored in DB for personal use. */
  apiKey?: string;
};

export type AiSettings = {
  providers: ProviderConfig[];
  updatedAt?: string;
};

const CACHE_KEY = "_ai_cfg_";      // VARCHAR(16) max — keep ≤ 16 chars
const ANALYSIS_TYPE = "ai_config"; // VARCHAR(64)

// Neon can be slow to wake from cold / occasionally unreachable from this
// process. The Prisma pool's own connect timeout is several seconds — too
// slow for a settings page read whose only fallback is "show code defaults"
// anyway. Fail fast so the page never blocks on a DB hiccup.
const DB_READ_TIMEOUT_MS = 2_500;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = session.user.id;

  try {
    const row = await withTimeout(
      prisma.aiResponseCache.findFirst({
        where: { symbol: CACHE_KEY, analysisType: ANALYSIS_TYPE, modelName: userId },
      }),
      DB_READ_TIMEOUT_MS,
      "[settings/ai] GET",
    );

    if (row?.payload) {
      return NextResponse.json(row.payload as AiSettings);
    }
  } catch (e) {
    console.error("[settings/ai] GET DB error:", e);
  }

  // Return server defaults
  return NextResponse.json(buildDefaultSettings());
}

export async function PUT(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = session.user.id;
  const parsed = await parseJsonBody(request, aiSettingsSchema);
  if (parsed.response) return parsed.response;
  const body = parsed.data;

  const payload: AiSettings = {
    providers: body.providers,
    updatedAt: new Date().toISOString(),
  };

  try {
    await prisma.$executeRaw`
      INSERT INTO ai_response_cache (symbol, analysis_type, model_name, cached_at, ttl_hours, payload)
      VALUES (${CACHE_KEY}, ${ANALYSIS_TYPE}, ${userId}, NOW(), 87600, ${JSON.stringify(payload)}::jsonb)
      ON CONFLICT (symbol, analysis_type, model_name)
      DO UPDATE SET payload = EXCLUDED.payload, cached_at = NOW()
    `;
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[settings/ai] PUT error:", e);
    return NextResponse.json({ error: "Failed to save" }, { status: 500 });
  }
}

function buildDefaultSettings(): AiSettings {
  const status = getLlmStatus();
  return {
    providers: [
      { id: "cerebras",    enabled: status.cerebras,    model: status.cerebrasModel,    priority: 1 },
      { id: "groq",        enabled: status.groq,        model: status.groqModel,        priority: 2 },
      { id: "gemini",      enabled: status.gemini,      model: status.geminiModel,      priority: 3 },
      { id: "mistral",     enabled: status.mistral,     model: status.mistralModel,     priority: 4 },
      { id: "openrouter",  enabled: status.openrouter,  model: status.openrouterModel,  priority: 5 },
      { id: "sambanova",   enabled: status.sambanova,   model: status.sambanovaModel,   priority: 6 },
      { id: "cohere",      enabled: status.cohere,      model: status.cohereModel,      priority: 7 },
      { id: "huggingface", enabled: status.huggingface, model: status.huggingfaceModel, priority: 8 },
      { id: "cloudflare",  enabled: status.cloudflare,  model: status.cloudflareModel,  priority: 9 },
      { id: "ollama",      enabled: status.ollama,      model: status.ollamaModel,      priority: 10 },
      { id: "llm7",        enabled: status.llm7,        model: status.llm7Model,        priority: 11 },
    ],
  };
}
