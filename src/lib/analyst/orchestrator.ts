// AI Orchestrator — runs the specialized agents, blends their scores in a
// decision engine, then synthesizes a narrative thesis (LLM with rule fallback).

import { gatherAnalystContext, type AnalystContext } from "@/lib/analyst/context";
import {
  financialAgent,
  macroAgent,
  newsAgent,
  riskAgent,
  technicalAgent,
  valuationAgent,
} from "@/lib/analyst/specialized";
import { TECHNICAL_TIMING_THRESHOLD } from "@/lib/analysis/technical-scoring";
import type {
  AgentId,
  AgentReport,
  InvestmentReport,
  Verdict,
} from "@/lib/analyst/types";
import { callLlm, type LlmApiKeys } from "@/lib/providers/llm";

// Decision-engine weights (sum = 1). Emphasis: Risk • Valuation • Growth.
const WEIGHTS: Record<AgentId, number> = {
  financial: 0.26,
  valuation: 0.24,
  technical: 0.18,
  risk: 0.14,
  macro: 0.08,
  news: 0.10,
};

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function verdictFromScore(score: number, marginOfSafety: number | null): Verdict {
  if (score >= 78) return "STRONG BUY";
  if (score >= 66) return "BUY";
  if (score >= 56) return "ACCUMULATE";
  if (score >= 45) return "HOLD";
  // Below 45: overvalued vs fair value pushes toward AVOID, else TRIM.
  if (marginOfSafety != null && marginOfSafety < -10) return "AVOID";
  return score >= 38 ? "TRIM" : "AVOID";
}

function confidenceFrom(agents: AgentReport[], hasFundamentals: boolean): "HIGH" | "MEDIUM" | "LOW" {
  // Confidence = agreement among agents + data completeness.
  const scores = agents.map((a) => a.score);
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  const variance = scores.reduce((a, b) => a + (b - mean) ** 2, 0) / scores.length;
  const std = Math.sqrt(variance);
  if (hasFundamentals && std < 14) return "HIGH";
  if (std < 22) return "MEDIUM";
  return "LOW";
}

function priceLevels(ctx: AnalystContext, fair: number | null, verdict: Verdict) {
  const price = ctx.stock.price;
  const bullish = verdict === "STRONG BUY" || verdict === "BUY" || verdict === "ACCUMULATE";

  // Anchor the entry band on the cheaper of price / fair value.
  const anchor = fair != null ? Math.min(price, fair) : price;
  const buyZoneHigh = Math.round(Math.min(price, anchor * 1.01));
  const buyZoneLow = Math.round(anchor * 0.94);
  const stopLoss = Math.round(buyZoneLow * 0.93);

  // Target: fair value for bullish calls, else modest resistance-based target.
  let targetPrice: number | null = null;
  if (fair != null && fair > price) targetPrice = Math.round(fair);
  else if (bullish) targetPrice = Math.round(price * 1.12);

  return bullish
    ? { buyZoneLow, buyZoneHigh, targetPrice, stopLoss }
    : { buyZoneLow: null, buyZoneHigh: null, targetPrice, stopLoss: null };
}

// ─── LLM narrative synthesis ─────────────────────────────────────────────────

type Synthesis = { thesis: string; reasons: string[]; risks: string[] };

const bullishVerdict = (v: Verdict) => v === "STRONG BUY" || v === "BUY" || v === "ACCUMULATE";

function ruleSynthesis(
  ctx: AnalystContext,
  agents: AgentReport[],
  verdict: Verdict,
  timingConfirmed: boolean,
): Synthesis {
  const bullish = agents.filter((a) => a.stance === "Bullish").sort((a, b) => b.score - a.score);
  const bearish = agents.filter((a) => a.stance === "Bearish").sort((a, b) => a.score - b.score);
  const risk = agents.find((a) => a.id === "risk");
  const technical = agents.find((a) => a.id === "technical");
  const timingWarning = bullishVerdict(verdict) && !timingConfirmed;

  const reasons = bullish.slice(0, 4).map((a) => `${a.title}: ${a.headline}`);
  if (!reasons.length) reasons.push(...agents.sort((a, b) => b.score - a.score).slice(0, 2).map((a) => `${a.title}: ${a.headline}`));

  const risks = [
    ...(risk?.bullets.slice(0, 2) ?? []),
    ...bearish.slice(0, 2).map((a) => `${a.title}: ${a.headline}`),
  ].slice(0, 4);
  if (timingWarning) {
    risks.unshift(
      `Technical setup is weak (score ${technical?.score ?? "?"}/100) despite the ${verdict} conviction — the chart hasn't confirmed a turn yet, so a value trap is possible.`,
    );
  }
  if (!risks.length) risks.push("No major red flags detected, but all equity investments carry market risk.");

  const thesis =
    `${ctx.stock.name} (${ctx.stock.symbol}) rates ${verdict} on a blended multi-agent read. ` +
    `Strongest support comes from ${bullish[0]?.title ?? "the overall balance of factors"}; ` +
    `the main watch-out is ${bearish[0]?.title ?? risk?.title ?? "general market risk"}.` +
    (timingWarning
      ? ` Fundamentals/valuation support the case, but technicals haven't confirmed — consider phasing in or waiting for the chart to turn before adding.`
      : "");

  return { thesis, reasons, risks: risks.slice(0, 4) };
}

async function llmSynthesis(
  ctx: AnalystContext,
  agents: AgentReport[],
  verdict: Verdict,
  overallScore: number,
  timingConfirmed: boolean,
  apiKeys?: LlmApiKeys,
): Promise<{ synthesis: Synthesis; provider: string }> {
  const agentSummary = agents
    .map((a) => `- ${a.title} [${a.stance}, ${a.score}/100]: ${a.headline}. ${a.bullets.slice(0, 3).join(" ")}`)
    .join("\n");
  const timingWarning = bullishVerdict(verdict) && !timingConfirmed;

  const system = `You are the lead portfolio manager synthesizing reports from six specialist analysts (Company, Valuation, Technical, News, Risk, Macro) into one investment view for a Vietnamese-market investor.
The decision engine has already computed an overall score of ${overallScore}/100 and a verdict of "${verdict}". Do NOT contradict the verdict; explain it.
${timingWarning ? `IMPORTANT: the verdict is bullish but the Technical agent is weak (timing NOT confirmed). Do not recommend buying/adding immediately — say the fundamentals/valuation case is good but the chart hasn't turned yet, and to wait for technical confirmation (or phase in) rather than adding in size now. Include this explicitly as the top risk.` : ""}
Use ONLY the analyst findings provided. Be concise, specific, and honest about risk.
Return ONLY valid JSON (no markdown fences):
{"thesis":"2-3 sentence investment thesis","reasons":["3-5 concise bullish/support points"],"risks":["3-5 concise risks or watch-outs"]}`;

  const user = `Stock: ${ctx.stock.symbol} — ${ctx.stock.name} (${ctx.stock.sector}), price ${ctx.stock.price.toLocaleString()} VND (${ctx.stock.changePercent >= 0 ? "+" : ""}${ctx.stock.changePercent.toFixed(2)}%).

Analyst findings:
${agentSummary}

Return JSON only.`;

  const res = await callLlm(
    [{ role: "system", content: system }, { role: "user", content: user }],
    "",
    { maxTokens: 900, apiKeys },
  );

  if (res.content && res.provider !== "fallback") {
    try {
      const raw = res.content
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/\s*```\s*$/, "")
        .trim();
      const parsed = JSON.parse(raw) as Partial<Synthesis>;
      if (parsed.thesis) {
        const fb = ruleSynthesis(ctx, agents, verdict, timingConfirmed);
        return {
          synthesis: {
            thesis: parsed.thesis,
            reasons: parsed.reasons?.length ? parsed.reasons : fb.reasons,
            risks: parsed.risks?.length ? parsed.risks : fb.risks,
          },
          provider: res.provider,
        };
      }
    } catch {
      // fall through to rule-based
    }
  }

  return { synthesis: ruleSynthesis(ctx, agents, verdict, timingConfirmed), provider: "rule-based" };
}

// ─── main entry ──────────────────────────────────────────────────────────────

export async function runAnalyst(
  symbol: string,
  opts?: { apiKeys?: LlmApiKeys; skipLlm?: boolean },
): Promise<InvestmentReport | null> {
  const ctx = await gatherAnalystContext(symbol);
  if (!ctx) return null;

  // Run agents (all deterministic; valuation also returns pricing detail).
  const financial = financialAgent(ctx);
  const { report: valuation, detail: valuationDetail } = valuationAgent(ctx);
  const technical = technicalAgent(ctx);
  const news = newsAgent(ctx);
  const risk = riskAgent(ctx);
  const macro = macroAgent(ctx);

  const agents: AgentReport[] = [financial, valuation, technical, news, risk, macro];

  // Decision engine: weighted blend.
  const byId = Object.fromEntries(agents.map((a) => [a.id, a])) as Record<AgentId, AgentReport>;
  const overallScore = Math.round(
    clamp(
      (Object.keys(WEIGHTS) as AgentId[]).reduce((sum, id) => sum + byId[id].score * WEIGHTS[id], 0),
      0,
      100,
    ),
  );
  const stars = clamp(Math.round(overallScore / 20), 1, 5);
  const verdict = verdictFromScore(overallScore, valuationDetail.marginOfSafety);

  const hasFundamentals = ctx.stock.pe > 0 || ctx.stock.roe > 0 || ctx.stock.revenueGrowth !== 0;
  const confidence = confidenceFrom(agents, hasFundamentals);

  const levels = priceLevels(ctx, valuationDetail.intrinsicValue, verdict);

  // Reconcile conviction (fundamentals/valuation-heavy) with near-term timing
  // (technical-only) — same threshold the Combined tab uses to veto AVOID/SELL.
  const timingConfirmed = technical.score >= TECHNICAL_TIMING_THRESHOLD;

  const { synthesis, provider } = opts?.skipLlm
    ? { synthesis: ruleSynthesis(ctx, agents, verdict, timingConfirmed), provider: "rule-based" }
    : await llmSynthesis(ctx, agents, verdict, overallScore, timingConfirmed, opts?.apiKeys);

  return {
    symbol: ctx.stock.symbol,
    name: ctx.stock.name,
    sector: ctx.stock.sector ?? "N/A",
    price: ctx.stock.price,
    changePercent: ctx.stock.changePercent,
    generatedAt: new Date().toISOString(),
    overallScore,
    stars,
    verdict,
    confidence,
    timingConfirmed,
    thesis: synthesis.thesis,
    reasons: synthesis.reasons,
    risks: synthesis.risks,
    buyZoneLow: levels.buyZoneLow,
    buyZoneHigh: levels.buyZoneHigh,
    targetPrice: levels.targetPrice,
    stopLoss: levels.stopLoss,
    valuation: valuationDetail,
    agents,
    provider,
  };
}
