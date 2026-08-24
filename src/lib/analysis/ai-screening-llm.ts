import { callLlm, type LlmApiKeys } from "@/lib/providers/llm";
import type { ScreeningCandidate } from "@/lib/analysis/ai-screening";
import type { ScreeningWeights } from "@/lib/analysis/ai-screening-config";

/**
 * AI Screening Rule — Level 2, Step 3 (LLM explanation only).
 *
 * Hard constraints enforced structurally, not just by prompt wording:
 * - The LLM is never asked for `ai_score` or `sub_scores` — those are always
 *   the Step 2 quant output, copied through verbatim. The model has no
 *   channel to change rank or invent a metric value.
 * - `reason` must be ≤15 words and contain at least one digit (proxy for
 *   "cites an actual metric value it was given"). Any reason failing
 *   validation is discarded in favor of a deterministic rule-based reason
 *   built from the candidate's own dominant sub-score.
 */

export type ScreeningReportRow = ScreeningCandidate & { ai: AiScreeningResult | null };

export type ScreeningReport = {
  universe: "vn30" | "vn100";
  totalScreened: number;
  passedHardFilter: number;
  weights: ScreeningWeights;
  rows: ScreeningReportRow[];
  provider: string;
  generatedAt: string;
};

export type AiScreeningResult = {
  ticker: string;
  ai_score: number;
  sub_scores: {
    roe: number;
    cagr: number;
    eps_growth: number;
    debt: number;
    fcf: number;
    peg: number;
  };
  reason: string;
  flags: string[];
  reasonSource: "llm" | "rule-based";
};

const MAX_REASON_WORDS = 15;

const METRIC_LABELS: Record<keyof ScreeningWeights, (c: ScreeningCandidate) => string | null> = {
  roe: (c) => (c.metrics.roe != null ? `ROE ${c.metrics.roe.toFixed(1)}%` : null),
  revenueCagr: (c) => (c.metrics.revenueCagr != null ? `revenue growth ${c.metrics.revenueCagr.toFixed(1)}%` : null),
  epsGrowth3y: (c) => (c.metrics.epsGrowth3y != null ? `EPS growth ${c.metrics.epsGrowth3y.toFixed(1)}%` : null),
  debtToEquity: (c) => (c.metrics.debtToEquity != null ? `D/E ${c.metrics.debtToEquity.toFixed(2)}` : null),
  fcf: () => null, // never available — excluded from dominant-metric selection
  peg: (c) => (c.metrics.peg != null ? `PEG ${c.metrics.peg.toFixed(2)}` : null),
};

function toSnakeSubScores(c: ScreeningCandidate): AiScreeningResult["sub_scores"] {
  return {
    roe: c.subScores.roe,
    cagr: c.subScores.cagr,
    eps_growth: c.subScores.epsGrowth,
    debt: c.subScores.debt,
    fcf: c.subScores.fcf,
    peg: c.subScores.peg,
  };
}

function truncateWords(text: string, maxWords: number): string {
  const words = text.trim().split(/\s+/);
  return words.length <= maxWords ? text.trim() : words.slice(0, maxWords).join(" ");
}

function citesAMetric(reason: string): boolean {
  return /\d/.test(reason);
}

/** Deterministic reason from the candidate's own dominant weighted sub-score — never invents a number. */
function buildRuleBasedReason(candidate: ScreeningCandidate, weights: ScreeningWeights): string {
  const contributions = (Object.keys(weights) as Array<keyof ScreeningWeights>)
    .filter((k) => k !== "fcf")
    .map((k) => {
      const subKey = k === "revenueCagr" ? "cagr" : k === "epsGrowth3y" ? "epsGrowth" : k === "debtToEquity" ? "debt" : k;
      const subScore = candidate.subScores[subKey as keyof typeof candidate.subScores];
      const label = METRIC_LABELS[k](candidate);
      return { weight: weights[k], subScore, label };
    })
    .filter((c) => c.label != null)
    .sort((a, b) => b.weight * b.subScore - a.weight * a.subScore);

  const top = contributions.slice(0, 2).map((c) => c.label);
  if (!top.length) return `Quant score ${candidate.quantScore}/100 — insufficient metric data to explain further`;
  return truncateWords(`${top.join(", ")} — quant score ${candidate.quantScore}/100`, MAX_REASON_WORDS);
}

function buildContextLine(c: ScreeningCandidate): string {
  const m = c.metrics;
  const parts = [
    `${c.symbol} (${c.sector})`,
    `quant_score=${c.quantScore}`,
    `roe=${m.roe != null ? m.roe.toFixed(1) + "%" : "unavailable"}`,
    `revenue_growth=${m.revenueCagr != null ? m.revenueCagr.toFixed(1) + "%" : "unavailable"}`,
    `eps_growth=${m.epsGrowth3y != null ? m.epsGrowth3y.toFixed(1) + "%" : "unavailable"}`,
    `debt_to_equity=${m.debtToEquity != null ? m.debtToEquity.toFixed(2) : "unavailable"}`,
    `peg=${m.peg != null ? m.peg.toFixed(2) : "unavailable"}`,
    `fcf=unavailable (not tracked)`,
  ];
  if (c.hardFilter.dataUnavailable.length) {
    parts.push(`data_unavailable=[${c.hardFilter.dataUnavailable.join(",")}]`);
  }
  return parts.join(" | ");
}

function buildSystemInstruction(): string {
  return `You are a Vietnam equity screening assistant. You receive PRE-COMPUTED quantitative scores and metric values for a shortlist of stocks — never raw filings.

HARD CONSTRAINTS (violating any of these makes your output unusable):
1. Never invent, estimate, or "fill in" a financial metric. Use only the exact numbers given per ticker.
2. Never change or re-rank the score. You are not asked for a score — do not include one.
3. "reason" must be ${MAX_REASON_WORDS} words or fewer, in plain English, and must explicitly reference at least one of the given metric values (state the number).
4. If you want to reference a metric marked "unavailable", say "data unavailable" for it — never guess a number.
5. Do not use vague filler ("looks good", "strong potential") unless tied directly to a cited number or a concrete event.
6. "flags" is an optional array of up to 2 short qualitative notes (sector momentum, catalysts, news context) from your general knowledge — not new financial metrics, no invented numbers.

Return ONLY a valid JSON array (no markdown fences, no extra text), one object per ticker, in the same order given:
[{"ticker": "FPT", "reason": "High ROE 28.4%, AI backlog growing", "flags": ["positive IT sector momentum"]}]`;
}

/** Step 3 — LLM explanation for an already-ranked, already-scored shortlist. Score/sub_scores are always the Step 2 output, never LLM-generated. */
export async function explainCandidates(
  candidates: ScreeningCandidate[],
  weights: ScreeningWeights,
  opts?: { apiKeys?: LlmApiKeys },
): Promise<{ results: AiScreeningResult[]; provider: string }> {
  if (!candidates.length) return { results: [], provider: "rule-based" };

  const contextLines = candidates.map(buildContextLine).join("\n");
  const userPrompt = `Shortlist (${candidates.length} tickers), one line each:\n${contextLines}\n\nReturn the JSON array now.`;

  const llmResult = await callLlm(
    [
      { role: "system", content: buildSystemInstruction() },
      { role: "user", content: userPrompt },
    ],
    "",
    { maxTokens: Math.min(3000, 200 + candidates.length * 60), apiKeys: opts?.apiKeys },
  );

  const byTicker = new Map<string, { reason?: string; flags?: string[] }>();
  if (llmResult.content && llmResult.provider !== "fallback") {
    try {
      const raw = llmResult.content
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/\s*```\s*$/, "")
        .trim();
      const parsed = JSON.parse(raw) as Array<{ ticker?: string; reason?: string; flags?: string[] }>;
      for (const item of parsed) {
        if (item.ticker) byTicker.set(item.ticker.toUpperCase(), { reason: item.reason, flags: item.flags });
      }
    } catch {
      // parse failed — every candidate falls back to rule-based reason below
    }
  }

  const provider = byTicker.size > 0 ? llmResult.provider : "rule-based";

  const results: AiScreeningResult[] = candidates.map((c) => {
    const llmEntry = byTicker.get(c.symbol);
    const candidateReason = llmEntry?.reason?.trim();
    const truncated = candidateReason ? truncateWords(candidateReason, MAX_REASON_WORDS) : "";
    const valid = truncated.length > 0 && citesAMetric(truncated);

    return {
      ticker: c.symbol,
      ai_score: c.quantScore,
      sub_scores: toSnakeSubScores(c),
      reason: valid ? truncated : buildRuleBasedReason(c, weights),
      flags: valid ? (llmEntry?.flags ?? []).slice(0, 2) : [],
      reasonSource: valid ? "llm" : "rule-based",
    };
  });

  return { results, provider };
}
