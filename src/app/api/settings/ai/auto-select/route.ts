import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { LLM_PROVIDERS, testProvider, type LlmProvider } from "@/lib/providers/llm";
import { fetchModels, getFallbackModels, type ModelInfo } from "../models/route";
import { autoSelectRequestSchema } from "@/lib/validation/schemas";
import { parseJsonBody } from "@/lib/validation/validate";

// Auto-select can try several candidates per provider; keep the ceiling low
// enough that ~11 providers running in parallel still finish in one request.
export const maxDuration = 60;

export type AutoSelectRequestRow = {
  id: string;
  apiKey?: string;
  enabled?: boolean;
};

export type AutoSelectRequest = {
  providers: AutoSelectRequestRow[];
};

export type AutoSelectResult = {
  ok: boolean;
  model?: string;
  message: string;
  latencyMs: number;
  candidatesTried: number;
};

export type AutoSelectResponse = {
  results: Record<string, AutoSelectResult>;
};

const MAX_CANDIDATES = 3;

// Nudges the ranking toward flagship / higher-capacity models and away from
// tiny or non-chat ones, without needing a real quality benchmark per model.
const FLAGSHIP_HINT = /70b|72b|120b|405b|large|plus|opus|command-a|command-r-plus|4o(?!-mini)/i;
const WEAK_HINT = /whisper|guard|moderation|embed|tts|vision|mini|nano|lite|1b|3b|7b|8b|small/i;

function rankModels(models: ModelInfo[]): ModelInfo[] {
  const scored = models.map((m, idx) => {
    const haystack = `${m.id} ${m.name ?? ""}`;
    let score = 0;
    if (FLAGSHIP_HINT.test(haystack)) score += 2;
    if (WEAK_HINT.test(haystack)) score -= 1;
    if (m.free) score += 0.5;
    if (m.contextLength) score += Math.min(1, m.contextLength / 200_000);
    score -= idx * 0.001; // stable tie-break: keep provider's own ordering
    return { m, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.map((s) => s.m);
}

async function findBestModel(id: LlmProvider, apiKeyOverride?: string): Promise<AutoSelectResult> {
  const start = Date.now();

  let pool: ModelInfo[];
  try {
    pool = await fetchModels(id);
    if (!pool.length) pool = getFallbackModels(id);
  } catch {
    pool = getFallbackModels(id);
  }
  if (!pool.length) {
    return { ok: false, message: "No known models for this provider.", latencyMs: Date.now() - start, candidatesTried: 0 };
  }

  const candidates = rankModels(pool).slice(0, MAX_CANDIDATES);
  let tried = 0;
  let lastMessage = "No candidate model responded.";

  for (const candidate of candidates) {
    tried++;
    const result = await testProvider(id, candidate.id, apiKeyOverride);
    if (result.ok) {
      return {
        ok: true,
        model: candidate.id,
        message: `Selected ${candidate.id} (${result.message})`,
        latencyMs: Date.now() - start,
        candidatesTried: tried,
      };
    }
    lastMessage = `${candidate.id} — ${result.message}`;
  }

  return {
    ok: false,
    message: `Tried ${tried} model(s), none responded. Last: ${lastMessage}`,
    latencyMs: Date.now() - start,
    candidatesTried: tried,
  };
}

// For each enabled provider, ranks its known models (live list, falling back
// to static hints) and tests candidates in order until one actually responds
// — surfacing the best model that is *currently* reachable, not just the
// hardcoded default that may have been deprecated/renamed upstream.
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = await parseJsonBody(request, autoSelectRequestSchema);
  if (parsed.response) return parsed.response;
  const rows = parsed.data.providers;

  const targets = rows.filter(
    (r) => r.enabled !== false && LLM_PROVIDERS.some((p) => p.id === r.id),
  );

  const results: Record<string, AutoSelectResult> = {};
  await Promise.all(
    targets.map(async (row) => {
      results[row.id] = await findBestModel(row.id as LlmProvider, row.apiKey);
    }),
  );

  return NextResponse.json({ results } satisfies AutoSelectResponse);
}
