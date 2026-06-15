import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { LlmProvider } from "@/lib/providers/llm";
import { getLlmStatus } from "@/lib/providers/llm";

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

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = session.user.id;

  try {
    const row = await prisma.aiResponseCache.findFirst({
      where: { symbol: CACHE_KEY, analysisType: ANALYSIS_TYPE, modelName: userId },
    });

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
  const body = (await request.json()) as AiSettings;

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
      { id: "cerebras",   enabled: status.cerebras,   model: status.cerebrasModel,   priority: 1 },
      { id: "groq",       enabled: status.groq,       model: status.groqModel,       priority: 2 },
      { id: "gemini",     enabled: status.gemini,     model: status.geminiModel,     priority: 3 },
      { id: "mistral",    enabled: status.mistral,    model: status.mistralModel,    priority: 4 },
      { id: "openrouter", enabled: status.openrouter, model: status.openrouterModel, priority: 5 },
    ],
  };
}
