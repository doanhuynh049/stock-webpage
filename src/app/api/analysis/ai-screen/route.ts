import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isPersistenceEnabled } from "@/lib/persistence";
import { getVN100Universe, getVN30Universe } from "@/lib/analysis/index-universe";
import {
  screenUniverse,
  type ScreeningWeights,
} from "@/lib/analysis/ai-screening";
import { explainCandidates } from "@/lib/analysis/ai-screening-llm";
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

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    universe?: "vn30" | "vn100";
    weights?: Partial<ScreeningWeights>;
    limit?: number;
  };

  const universeId = body.universe === "vn30" ? "vn30" : "vn100";
  const universe = universeId === "vn30" ? getVN30Universe() : getVN100Universe();
  const limit = body.limit && body.limit > 0 ? Math.min(body.limit, 50) : 20;

  try {
    const screening = await screenUniverse(universe, { weights: body.weights, limit });
    const apiKeys = await loadUserApiKeys(session.user.id);
    const { results, provider } = await explainCandidates(
      screening.candidates,
      screening.weights,
      { apiKeys },
    );

    const resultByTicker = new Map(results.map((r) => [r.ticker, r]));
    const rows = screening.candidates.map((c) => ({
      ...c,
      ai: resultByTicker.get(c.symbol) ?? null,
    }));

    return NextResponse.json({
      universe: universeId,
      totalScreened: screening.totalScreened,
      passedHardFilter: screening.passedHardFilter,
      weights: screening.weights,
      thresholds: screening.thresholds,
      rows,
      provider,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    return apiError("ai-screen-api", "POST failed", error, { meta: { universe: universeId } });
  }
}
