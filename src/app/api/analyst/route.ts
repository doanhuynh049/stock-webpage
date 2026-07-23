import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isPersistenceEnabled } from "@/lib/persistence";
import { runAnalyst } from "@/lib/analyst/orchestrator";
import type { LlmApiKeys, LlmProvider } from "@/lib/providers/llm";

/** Load per-user provider API-key overrides from ai_response_cache. */
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

  const body = (await request.json().catch(() => ({}))) as { symbol?: string };
  const symbol = body.symbol?.toUpperCase().trim();
  if (!symbol) {
    return NextResponse.json({ error: "symbol required" }, { status: 400 });
  }

  const apiKeys = await loadUserApiKeys(session.user.id);
  const report = await runAnalyst(symbol, { apiKeys });

  if (!report) {
    return NextResponse.json({ error: `Stock "${symbol}" not found` }, { status: 404 });
  }
  return NextResponse.json(report);
}
