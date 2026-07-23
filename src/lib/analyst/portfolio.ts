// Portfolio-level multi-agent analyst. Runs the per-stock orchestrator across
// every holding (deterministic, LLM skipped for speed), then does ONE
// portfolio-level LLM synthesis for the overview — keeping cost/latency bounded
// regardless of how many positions the user holds.

import { getPortfolioWithStocks } from "@/lib/db/advisory-portfolio";
import { enrichHoldings } from "@/lib/portfolio/holdings-enrichment";
import { runAnalyst } from "@/lib/analyst/orchestrator";
import type { AgentReport, InvestmentReport, Verdict } from "@/lib/analyst/types";
import { callLlm, type LlmApiKeys } from "@/lib/providers/llm";

export type HoldingAction = "ACCUMULATE" | "HOLD" | "TRIM" | "REVIEW";

export type HoldingAnalysis = {
  symbol: string;
  name: string;
  sector: string;
  weightPct: number | null; // share of portfolio market value
  gainPct: number | null; // unrealized P/L %
  price: number;
  overallScore: number;
  stars: number;
  verdict: Verdict;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  action: HoldingAction;
  topReason: string;
  topRisk: string;
  agents: AgentReport[];
};

export type PortfolioAnalystResult = {
  generatedAt: string;
  holdingsCount: number;
  healthScore: number; // 0–100, value-weighted average conviction
  verdictCounts: Record<string, number>;
  summary: string;
  actions: string[];
  risks: string[];
  holdings: HoldingAnalysis[];
  provider: string;
};

function actionFromVerdict(verdict: Verdict, gainPct: number | null): HoldingAction {
  if (verdict === "STRONG BUY" || verdict === "BUY" || verdict === "ACCUMULATE") return "ACCUMULATE";
  if (verdict === "AVOID") return "REVIEW";
  if (verdict === "TRIM") return "TRIM";
  // HOLD — but flag deep losers for review.
  if (gainPct != null && gainPct <= -20) return "REVIEW";
  return "HOLD";
}

async function portfolioSynthesis(
  holdings: HoldingAnalysis[],
  healthScore: number,
  apiKeys?: LlmApiKeys,
): Promise<{ summary: string; actions: string[]; risks: string[]; provider: string }> {
  const lines = holdings
    .map(
      (h) =>
        `- ${h.symbol} (${h.sector}, ${h.weightPct != null ? h.weightPct.toFixed(0) : "?"}% weight, P/L ${h.gainPct != null ? h.gainPct.toFixed(0) + "%" : "n/a"}): ${h.verdict} ${h.overallScore}/100 → ${h.action}. Risk: ${h.topRisk}`,
    )
    .join("\n");

  const ruleFallback = () => {
    const trims = holdings.filter((h) => h.action === "TRIM").map((h) => h.symbol);
    const reviews = holdings.filter((h) => h.action === "REVIEW").map((h) => h.symbol);
    const adds = holdings.filter((h) => h.action === "ACCUMULATE").map((h) => h.symbol);
    const actions: string[] = [];
    if (trims.length) actions.push(`Consider trimming overvalued/extended names: ${trims.join(", ")}.`);
    if (reviews.length) actions.push(`Review weak positions for a possible exit: ${reviews.join(", ")}.`);
    if (adds.length) actions.push(`Highest-conviction adds on weakness: ${adds.slice(0, 5).join(", ")}.`);
    if (!actions.length) actions.push("Portfolio is broadly balanced — hold and monitor.");

    const risks = holdings
      .slice()
      .sort((a, b) => a.overallScore - b.overallScore)
      .slice(0, 3)
      .map((h) => `${h.symbol}: ${h.topRisk}`);

    const summary = `Portfolio health scores ${healthScore}/100 across ${holdings.length} positions. ` +
      `${adds.length} accumulate · ${holdings.filter((h) => h.action === "HOLD").length} hold · ${trims.length} trim · ${reviews.length} review.`;
    return { summary, actions, risks, provider: "rule-based" };
  };

  if (!holdings.length) return { summary: "No holdings to analyze.", actions: [], risks: [], provider: "rule-based" };

  const system = `You are a portfolio manager reviewing a Vietnamese-equity portfolio. Each position already has a verdict and conviction score from a multi-agent analyst.
Write a concise, actionable portfolio review. Do NOT contradict the per-position verdicts — prioritize and connect them.
Return ONLY valid JSON (no markdown fences):
{"summary":"2-3 sentence portfolio health overview","actions":["3-5 concrete, prioritized actions (trim/add/review specific tickers)"],"risks":["3-4 portfolio-level risks: concentration, sector, valuation"]}`;

  const user = `Portfolio health score: ${healthScore}/100. Positions:\n${lines}\n\nReturn JSON only.`;

  try {
    const res = await callLlm(
      [{ role: "system", content: system }, { role: "user", content: user }],
      "",
      { maxTokens: 1000, apiKeys },
    );
    if (res.content && res.provider !== "fallback") {
      const raw = res.content
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/\s*```\s*$/, "")
        .trim();
      const parsed = JSON.parse(raw) as { summary?: string; actions?: string[]; risks?: string[] };
      if (parsed.summary) {
        const fb = ruleFallback();
        return {
          summary: parsed.summary,
          actions: parsed.actions?.length ? parsed.actions : fb.actions,
          risks: parsed.risks?.length ? parsed.risks : fb.risks,
          provider: res.provider,
        };
      }
    }
  } catch {
    // fall through
  }
  return ruleFallback();
}

export async function runPortfolioAnalyst(
  userId: string,
  opts?: { apiKeys?: LlmApiKeys },
): Promise<PortfolioAnalystResult> {
  const portfolio = await getPortfolioWithStocks(userId);
  const enriched = await enrichHoldings(portfolio.holdings);

  const totalValueK = enriched.reduce((sum, h) => sum + (h.currentValueK ?? 0), 0);

  // Run the per-stock analyst for each holding in parallel (LLM skipped).
  const reports = await Promise.all(
    enriched.map(async (h) => {
      const report = await runAnalyst(h.symbol, { skipLlm: true }).catch(() => null);
      return { h, report };
    }),
  );

  const holdings: HoldingAnalysis[] = reports
    .filter((r): r is { h: (typeof enriched)[number]; report: InvestmentReport } => r.report != null)
    .map(({ h, report }) => {
      const weightPct =
        totalValueK > 0 && h.currentValueK != null ? (h.currentValueK / totalValueK) * 100 : null;
      return {
        symbol: report.symbol,
        name: report.name,
        sector: report.sector,
        weightPct,
        gainPct: h.gainPct,
        price: report.price,
        overallScore: report.overallScore,
        stars: report.stars,
        verdict: report.verdict,
        confidence: report.confidence,
        action: actionFromVerdict(report.verdict, h.gainPct),
        topReason: report.reasons[0] ?? report.thesis,
        topRisk: report.risks[0] ?? "General market risk.",
        agents: report.agents,
      };
    })
    .sort((a, b) => (b.weightPct ?? 0) - (a.weightPct ?? 0));

  // Value-weighted health score (equal-weight fallback when values missing).
  const totalWeight = holdings.reduce((s, h) => s + (h.weightPct ?? 0), 0);
  const healthScore = holdings.length
    ? Math.round(
        totalWeight > 0
          ? holdings.reduce((s, h) => s + h.overallScore * (h.weightPct ?? 0), 0) / totalWeight
          : holdings.reduce((s, h) => s + h.overallScore, 0) / holdings.length,
      )
    : 0;

  const verdictCounts: Record<string, number> = {};
  for (const h of holdings) verdictCounts[h.verdict] = (verdictCounts[h.verdict] ?? 0) + 1;

  const { summary, actions, risks, provider } = await portfolioSynthesis(
    holdings,
    healthScore,
    opts?.apiKeys,
  );

  return {
    generatedAt: new Date().toISOString(),
    holdingsCount: holdings.length,
    healthScore,
    verdictCounts,
    summary,
    actions,
    risks,
    holdings,
    provider,
  };
}
