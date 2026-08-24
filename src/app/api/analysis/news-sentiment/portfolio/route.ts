import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isPersistenceEnabled } from "@/lib/persistence";
import { buildPortfolioNewsOverview } from "@/lib/analysis/news-sentiment-portfolio";
import { apiError } from "@/lib/api-error";
import type { LlmApiKeys, LlmProvider } from "@/lib/providers/llm";

/** Load per-user provider API-key overrides from ai_response_cache (same pattern as /api/analyst). */
async function loadUserApiKeys(userId: string): Promise<LlmApiKeys> {
  if (!isPersistenceEnabled()) return {};
  try {
    const row = await prisma.aiResponseCache.findFirst({
      where: { symbol: "_ai_cfg_", analysisType: "ai_config", modelName: userId },
    });
    if (!row?.payload) return {};
    const cfg = row.payload as {
      providers?: Array<{ id: string; apiKey?: string; enabled?: boolean }>;
    };
    const keys: LlmApiKeys = {};
    for (const p of cfg.providers ?? []) {
      if (p.apiKey && p.enabled !== false) keys[p.id as LlmProvider] = p.apiKey;
    }
    return keys;
  } catch {
    return {};
  }
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const apiKeys = await loadUserApiKeys(session.user.id);
    const overview = await buildPortfolioNewsOverview(session.user.id, { apiKeys });
    return NextResponse.json(overview);
  } catch (error) {
    return apiError("news-sentiment-portfolio-api", "GET failed", error);
  }
}
