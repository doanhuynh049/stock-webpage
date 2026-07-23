// Specialized analyst agents. Each is a pure, deterministic function over the
// gathered context — fast, free, and always available (no LLM required). The
// orchestrator blends their scores; an optional LLM pass writes the narrative.

import type { AnalystContext } from "@/lib/analyst/context";
import { findSignal } from "@/lib/analyst/context";
import type { AgentReport, Stance, ValuationDetail } from "@/lib/analyst/types";

// ─── helpers ───────────────────────────────────────────────────────────────

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function stanceFromScore(score: number): Stance {
  if (score >= 60) return "Bullish";
  if (score <= 40) return "Bearish";
  return "Neutral";
}

/** VN prices are stored full VND; show in thousands for readability. */
function k(v: number): string {
  return `${(v / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 })}K`;
}

// ─── 1. Financial / Company agent ────────────────────────────────────────────
// Revenue growth, ROE, profit trend, debt, margins → quality & growth score.

export function financialAgent(ctx: AnalystContext): AgentReport {
  const { stock, analysis } = ctx;
  const bullets: string[] = [];
  const metrics: AgentReport["metrics"] = [];

  const growth = stock.revenueGrowth;
  const roe = stock.roe;

  // Net profit trend from the last 2 reported years.
  const np = stock.financials?.netProfit ?? [];
  let profitTrend: number | null = null;
  if (np.length >= 2 && np[np.length - 2] > 0) {
    profitTrend = ((np[np.length - 1] - np[np.length - 2]) / np[np.length - 2]) * 100;
  }

  // Debt trend (rising debt is a caution flag).
  const debt = stock.financials?.totalDebt ?? [];
  const debtRising = debt.length >= 2 && debt[debt.length - 1] > debt[debt.length - 2] * 1.15;

  // Base off the computed fundamental score when available.
  let score = analysis?.fundamentalScore ?? 50;

  if (growth >= 20) { bullets.push(`Revenue growing fast at ${growth.toFixed(1)}% YoY.`); score += 6; }
  else if (growth >= 10) { bullets.push(`Healthy revenue growth of ${growth.toFixed(1)}% YoY.`); score += 2; }
  else if (growth < 0) { bullets.push(`Revenue contracting (${growth.toFixed(1)}% YoY).`); score -= 8; }

  if (roe >= 20) { bullets.push(`Excellent capital efficiency (ROE ${roe.toFixed(1)}%).`); score += 6; }
  else if (roe >= 15) { bullets.push(`Solid ROE of ${roe.toFixed(1)}%.`); score += 3; }
  else if (roe > 0 && roe < 8) { bullets.push(`Low ROE of ${roe.toFixed(1)}% — weak returns on equity.`); score -= 5; }

  if (profitTrend != null) {
    if (profitTrend >= 15) { bullets.push(`Net profit up ${profitTrend.toFixed(0)}% in the latest year.`); score += 4; }
    else if (profitTrend < -10) { bullets.push(`Net profit fell ${Math.abs(profitTrend).toFixed(0)}% last year.`); score -= 6; }
  }

  if (debtRising) { bullets.push("Total debt rising materially — watch leverage."); score -= 4; }

  if (!bullets.length) bullets.push("Fundamentals are broadly average with no standout signal.");

  metrics.push(
    { label: "Revenue Growth", value: growth ? `${growth.toFixed(1)}%` : "N/A", tone: growth >= 10 ? "good" : growth < 0 ? "bad" : "neutral" },
    { label: "ROE", value: roe > 0 ? `${roe.toFixed(1)}%` : "N/A", tone: roe >= 15 ? "good" : roe > 0 && roe < 8 ? "bad" : "neutral" },
    { label: "Net Profit Δ", value: profitTrend != null ? `${profitTrend >= 0 ? "+" : ""}${profitTrend.toFixed(0)}%` : "N/A", tone: profitTrend != null ? (profitTrend >= 0 ? "good" : "bad") : "neutral" },
    { label: "Fund. Score", value: `${Math.round(analysis?.fundamentalScore ?? 50)}/100` },
  );

  score = Math.round(clamp(score, 0, 100));
  return {
    id: "financial",
    title: "Company / Financials",
    score,
    stance: stanceFromScore(score),
    headline:
      score >= 60 ? "Strong, growing business with sound returns"
      : score <= 40 ? "Financial profile shows meaningful weakness"
      : "Mixed financial profile",
    bullets,
    metrics,
    source: "rule",
  };
}

// ─── 2. Valuation agent ──────────────────────────────────────────────────────
// Intrinsic value via P/E & P/B fair value, PEG, margin of safety.

export function valuationAgent(
  ctx: AnalystContext,
): { report: AgentReport; detail: ValuationDetail } {
  const { stock } = ctx;
  const price = stock.price;
  const pe = stock.pe > 0 ? stock.pe : null;
  const pb = stock.pb > 0 ? stock.pb : null;
  const growth = stock.revenueGrowth;
  const roe = stock.roe;
  const peg = pe && growth > 0 ? Math.round((pe / growth) * 100) / 100 : null;

  let fair: number | null = null;
  let method = "Insufficient data for a fair-value estimate";

  if (pe) {
    const targetPe = clamp(14 + growth * 0.4, 10, 25);
    const peFair = price * (targetPe / pe);
    if (pb) {
      const targetPb = clamp(1.2 + roe * 0.05, 1, 3);
      const pbFair = price * (targetPb / pb);
      fair = peFair * 0.65 + pbFair * 0.35;
      method = `Blended: P/E (target ${targetPe.toFixed(1)}× vs ${pe.toFixed(1)}×) 65% + P/B (target ${targetPb.toFixed(1)}× vs ${pb.toFixed(1)}×) 35%`;
    } else {
      fair = peFair;
      method = `P/E fair value — target ${targetPe.toFixed(1)}× vs current ${pe.toFixed(1)}×`;
    }
  } else if (pb) {
    const targetPb = clamp(1.2 + roe * 0.05, 1, 3);
    fair = price * (targetPb / pb);
    method = `P/B fair value — target ${targetPb.toFixed(1)}× vs current ${pb.toFixed(1)}×`;
  }

  // Cap for realism (±60% of price).
  if (fair != null) fair = clamp(fair, price * 0.4, price * 1.6);
  const mos = fair != null ? Math.round(((fair - price) / price) * 1000) / 10 : null;

  let score = 50;
  const bullets: string[] = [];
  if (mos != null) {
    score = clamp(50 + mos * 1.4, 0, 100);
    if (mos >= 15) bullets.push(`Trades ~${mos.toFixed(0)}% below estimated fair value — attractive margin of safety.`);
    else if (mos <= -15) bullets.push(`Trades ~${Math.abs(mos).toFixed(0)}% above fair value — priced for perfection.`);
    else bullets.push(`Roughly fairly valued (margin of safety ${mos.toFixed(0)}%).`);
  } else {
    bullets.push("No P/E or P/B available to anchor a valuation.");
  }

  if (peg != null) {
    if (peg < 1) { bullets.push(`PEG of ${peg} suggests growth is cheap relative to earnings.`); score += 8; }
    else if (peg > 2) { bullets.push(`PEG of ${peg} — paying a premium for growth.`); score -= 8; }
    else bullets.push(`PEG of ${peg} is reasonable.`);
  }
  if (pe != null && pe > 25) { bullets.push(`Elevated P/E of ${pe.toFixed(1)}×.`); score -= 6; }

  score = Math.round(clamp(score, 0, 100));

  const detail: ValuationDetail = {
    currentPrice: price,
    intrinsicValue: fair != null ? Math.round(fair) : null,
    marginOfSafety: mos,
    method,
    pe,
    pb,
    peg,
  };

  const report: AgentReport = {
    id: "valuation",
    title: "Valuation",
    score,
    stance: stanceFromScore(score),
    headline:
      mos == null ? "Valuation indeterminate — limited fundamentals"
      : mos >= 12 ? "Undervalued versus intrinsic estimate"
      : mos <= -12 ? "Overvalued versus intrinsic estimate"
      : "Fairly valued",
    bullets,
    metrics: [
      { label: "Fair Value", value: detail.intrinsicValue ? k(detail.intrinsicValue) : "N/A" },
      { label: "Price", value: k(price) },
      { label: "Margin of Safety", value: mos != null ? `${mos >= 0 ? "+" : ""}${mos.toFixed(0)}%` : "N/A", tone: mos != null ? (mos >= 0 ? "good" : "bad") : "neutral" },
      { label: "P/E · PEG", value: `${pe ? pe.toFixed(1) : "—"} · ${peg ?? "—"}` },
    ],
    source: "rule",
  };

  return { report, detail };
}

// ─── 3. Technical agent ──────────────────────────────────────────────────────

export function technicalAgent(ctx: AnalystContext): AgentReport {
  const { stock, technicals, analysis } = ctx;
  const bullets: string[] = [];

  const rsiSig = findSignal(technicals, "rsi");
  const macdSig = findSignal(technicals, "macd");
  const ma50 = findSignal(technicals, "ma 50");
  const volSig = findSignal(technicals, "volume");
  const rsi = rsiSig?.value ?? stock.rsi;

  let score = analysis?.technicalScore ?? 50;

  if (rsi > 0) {
    if (rsi < 30) { bullets.push(`RSI ${rsi.toFixed(0)} — oversold, potential bounce zone.`); score += 5; }
    else if (rsi > 70) { bullets.push(`RSI ${rsi.toFixed(0)} — overbought, extended.`); score -= 6; }
    else if (rsi >= 45 && rsi <= 65) { bullets.push(`RSI ${rsi.toFixed(0)} — healthy momentum.`); score += 3; }
    else bullets.push(`RSI ${rsi.toFixed(0)} — neutral momentum.`);
  }
  if (macdSig) bullets.push(`MACD is ${macdSig.signal.toLowerCase()}.`);
  if (ma50) { bullets.push(`Price is ${ma50.signal === "Bullish" ? "above" : "below"} the 50-day MA.`); score += ma50.signal === "Bullish" ? 3 : -3; }
  if (volSig && volSig.value >= 1.5) { bullets.push(`Volume ${volSig.value.toFixed(1)}× the 20-day average — accumulation interest.`); score += 3; }

  if (analysis?.maTrend && analysis.maTrend !== "N/A") bullets.push(`Trend: ${analysis.maTrend}.`);
  if (!bullets.length) bullets.push("No strong technical signal in either direction.");

  score = Math.round(clamp(score, 0, 100));
  return {
    id: "technical",
    title: "Technical",
    score,
    stance: stanceFromScore(score),
    headline:
      score >= 60 ? "Constructive chart / momentum"
      : score <= 40 ? "Weak technical setup"
      : "Neutral technical setup",
    bullets,
    metrics: [
      { label: "RSI (14)", value: rsi > 0 ? rsi.toFixed(0) : "N/A", tone: rsi > 70 ? "bad" : rsi > 0 && rsi < 30 ? "good" : "neutral" },
      { label: "MACD", value: macdSig?.signal ?? "N/A" },
      { label: "vs MA50", value: ma50?.signal ?? "N/A", tone: ma50?.signal === "Bullish" ? "good" : ma50?.signal === "Bearish" ? "bad" : "neutral" },
      { label: "Tech Score", value: `${Math.round(analysis?.technicalScore ?? 50)}/100` },
    ],
    source: "rule",
  };
}

// ─── 4. News agent ───────────────────────────────────────────────────────────
// Keyword sentiment over recent symbol-tagged headlines.

const BULLISH_KW = [
  "surge", "jump", "rally", "record", "beat", "profit", "growth", "expand", "win",
  "upgrade", "raise", "acquire", "dividend", "buyback", "approve", "positive",
  "tăng", "lãi", "kỷ lục", "vượt", "khả quan", "mua",
];
const BEARISH_KW = [
  "plunge", "fall", "drop", "loss", "miss", "cut", "downgrade", "lawsuit", "probe",
  "fraud", "warning", "decline", "delay", "recall", "fine", "negative",
  "giảm", "lỗ", "cảnh báo", "điều tra", "phạt", "bán tháo",
];

export function newsAgent(ctx: AnalystContext): AgentReport {
  const { news } = ctx;
  const recent = news.slice(0, 12);
  let pos = 0;
  let neg = 0;
  const highlights: string[] = [];

  for (const item of recent) {
    const text = `${item.title} ${item.summary}`.toLowerCase();
    const p = BULLISH_KW.filter((w) => text.includes(w)).length;
    const n = BEARISH_KW.filter((w) => text.includes(w)).length;
    pos += p;
    neg += n;
    if ((p > 0 || n > 0) && highlights.length < 3) {
      highlights.push(`${p >= n ? "▲" : "▼"} ${item.title.slice(0, 90)}`);
    }
  }

  const total = pos + neg;
  let score = 50;
  const bullets: string[] = [];
  if (recent.length === 0) {
    bullets.push("No recent symbol-specific headlines found.");
  } else if (total === 0) {
    bullets.push(`${recent.length} recent headlines, but tone is broadly neutral.`);
  } else {
    const net = (pos - neg) / total; // −1..1
    score = clamp(50 + net * 45, 5, 95);
    bullets.push(`${recent.length} recent headlines — sentiment ${pos >= neg ? "leans positive" : "leans negative"} (${pos}▲ / ${neg}▼).`);
    bullets.push(...highlights);
  }

  score = Math.round(score);
  return {
    id: "news",
    title: "News & Sentiment",
    score,
    stance: stanceFromScore(score),
    headline:
      recent.length === 0 ? "No fresh news flow"
      : score >= 60 ? "Positive news momentum"
      : score <= 40 ? "Negative news flow"
      : "Neutral news flow",
    bullets,
    metrics: [
      { label: "Headlines", value: String(recent.length) },
      { label: "Positive", value: String(pos), tone: "good" },
      { label: "Negative", value: String(neg), tone: neg > 0 ? "bad" : "neutral" },
    ],
    source: "rule",
  };
}

// ─── 5. Risk agent ───────────────────────────────────────────────────────────
// Favorability score where HIGH = LOW risk (so it blends with the others).

export function riskAgent(ctx: AnalystContext): AgentReport {
  const { stock } = ctx;
  const bullets: string[] = [];
  let risk = 0; // accumulate risk points

  // Valuation risk
  if (stock.pe > 30) { risk += 20; bullets.push(`High P/E (${stock.pe.toFixed(1)}×) — valuation/de-rating risk.`); }
  else if (stock.pe > 22) { risk += 10; bullets.push(`Above-average P/E (${stock.pe.toFixed(1)}×).`); }

  // Leverage / debt risk
  const debt = stock.financials?.totalDebt ?? [];
  if (debt.length >= 2 && debt[debt.length - 1] > debt[debt.length - 2] * 1.2) {
    risk += 15; bullets.push("Total debt rising sharply — balance-sheet risk.");
  }

  // Profitability risk
  if (stock.roe > 0 && stock.roe < 8) { risk += 12; bullets.push(`Weak ROE (${stock.roe.toFixed(1)}%) signals low earnings quality.`); }
  const np = stock.financials?.netProfit ?? [];
  if (np.length && np[np.length - 1] <= 0) { risk += 20; bullets.push("Latest reported net profit is negative — going-concern caution."); }

  // Momentum / volatility risk
  if (stock.rsi > 75) { risk += 12; bullets.push(`RSI ${stock.rsi.toFixed(0)} — overbought, pullback risk.`); }
  if (stock.high52w > 0 && stock.price >= stock.high52w * 0.98) { risk += 6; bullets.push("Trading near 52-week high — limited near-term upside cushion."); }

  // Liquidity / listing risk
  if (stock.exchange === "UPCOM") { risk += 8; bullets.push("UPCOM listing — lower liquidity and disclosure standards."); }

  const score = Math.round(clamp(100 - risk, 0, 100));
  if (!bullets.length) bullets.push("No elevated risk flags detected across valuation, leverage, or momentum.");

  const level = score >= 70 ? "LOW" : score >= 45 ? "MODERATE" : "HIGH";
  return {
    id: "risk",
    title: "Risk",
    score,
    stance: stanceFromScore(score),
    headline: `${level} overall risk`,
    bullets,
    metrics: [
      { label: "Risk Level", value: level, tone: level === "LOW" ? "good" : level === "HIGH" ? "bad" : "neutral" },
      { label: "P/E", value: stock.pe > 0 ? `${stock.pe.toFixed(1)}×` : "N/A" },
      { label: "Safety Score", value: `${score}/100` },
    ],
    source: "rule",
  };
}

// ─── 6. Macro agent ──────────────────────────────────────────────────────────

export function macroAgent(ctx: AnalystContext): AgentReport {
  const { stock, market } = ctx;
  const bullets: string[] = [];
  let score = 50;

  if (!market) {
    return {
      id: "macro",
      title: "Macro / Market",
      score,
      stance: "Neutral",
      headline: "Market context unavailable",
      bullets: ["Market snapshot could not be loaded."],
      metrics: [],
      source: "rule",
    };
  }

  const vnindex = market.indices.find((i) => i.symbol === "VNINDEX") ?? market.indices[0];
  if (market.sentiment === "Bullish") { score += 12; bullets.push(`Market sentiment is bullish (${market.sentimentScore}%).`); }
  else if (market.sentiment === "Bearish") { score -= 12; bullets.push(`Market sentiment is bearish (${market.sentimentScore}%).`); }
  else bullets.push(`Market sentiment is neutral (${market.sentimentScore}%).`);

  if (vnindex) {
    if (vnindex.changePercent > 0.5) score += 4;
    else if (vnindex.changePercent < -0.5) score -= 4;
    bullets.push(`${vnindex.symbol} ${vnindex.changePercent >= 0 ? "+" : ""}${vnindex.changePercent.toFixed(2)}% today.`);
  }

  const sectorPerf = market.sectors.find(
    (s) => s.sector.toLowerCase() === (stock.sector ?? "").toLowerCase(),
  );
  if (sectorPerf) {
    if (sectorPerf.changePercent > 0) { score += 4; bullets.push(`${stock.sector} sector is leading (${sectorPerf.changePercent >= 0 ? "+" : ""}${sectorPerf.changePercent.toFixed(1)}%).`); }
    else { score -= 3; bullets.push(`${stock.sector} sector is lagging (${sectorPerf.changePercent.toFixed(1)}%).`); }
  }

  const foreign = market.stats.foreignNetBuy;
  if (foreign > 0) { score += 3; bullets.push(`Foreign investors are net buyers (${foreign} tỷ VND).`); }
  else if (foreign < 0) { score -= 3; bullets.push(`Foreign investors are net sellers (${foreign} tỷ VND).`); }

  score = Math.round(clamp(score, 0, 100));
  return {
    id: "macro",
    title: "Macro / Market",
    score,
    stance: stanceFromScore(score),
    headline:
      score >= 60 ? "Supportive market backdrop"
      : score <= 40 ? "Challenging market backdrop"
      : "Mixed market backdrop",
    bullets,
    metrics: [
      { label: "VN Sentiment", value: `${market.sentiment} ${market.sentimentScore}%`, tone: market.sentiment === "Bullish" ? "good" : market.sentiment === "Bearish" ? "bad" : "neutral" },
      { label: vnindex?.symbol ?? "Index", value: vnindex ? `${vnindex.changePercent >= 0 ? "+" : ""}${vnindex.changePercent.toFixed(2)}%` : "N/A", tone: vnindex ? (vnindex.changePercent >= 0 ? "good" : "bad") : "neutral" },
      { label: "Foreign Flow", value: `${foreign} tỷ`, tone: foreign > 0 ? "good" : foreign < 0 ? "bad" : "neutral" },
    ],
    source: "rule",
  };
}
