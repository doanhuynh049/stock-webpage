// Multi-agent investment analyst — shared types.
//
// The orchestrator runs several specialized agents in parallel. Each agent is a
// deterministic function that turns the gathered market data into a structured
// `AgentReport` (a favorability score + findings). A decision engine then blends
// the agent scores into a single `InvestmentReport`, and an optional LLM pass
// writes the narrative thesis (with a rule-based fallback).

export type AgentId =
  | "financial"
  | "valuation"
  | "technical"
  | "news"
  | "risk"
  | "macro";

export type Stance = "Bullish" | "Neutral" | "Bearish";

export type MetricTone = "good" | "bad" | "neutral";

export type AgentMetric = {
  label: string;
  value: string;
  tone?: MetricTone;
};

export type AgentReport = {
  id: AgentId;
  title: string;
  /** 0–100 favorability (higher = more supportive of buying). */
  score: number;
  stance: Stance;
  /** One-line takeaway. */
  headline: string;
  /** Key findings, 2–5 bullets. */
  bullets: string[];
  /** Compact numeric facts for the UI. */
  metrics: AgentMetric[];
  source: "rule" | "llm";
};

export type ValuationDetail = {
  currentPrice: number;
  intrinsicValue: number | null;
  /** (intrinsic − price) / price × 100. Positive = undervalued. */
  marginOfSafety: number | null;
  method: string;
  pe: number | null;
  pb: number | null;
  peg: number | null;
};

export type Verdict =
  | "STRONG BUY"
  | "BUY"
  | "ACCUMULATE"
  | "HOLD"
  | "TRIM"
  | "AVOID";

export type InvestmentReport = {
  symbol: string;
  name: string;
  sector: string;
  price: number;
  changePercent: number;
  generatedAt: string;

  /** Blended 0–100 conviction score. */
  overallScore: number;
  /** 1–5 star rendering of the score. */
  stars: number;
  verdict: Verdict;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  /**
   * True when the Technical agent's own score clears TECHNICAL_TIMING_THRESHOLD.
   * A bullish verdict with `timingConfirmed: false` means the fundamentals /
   * valuation story is good but the chart hasn't turned yet — reconciles the
   * conviction score (long-term view) with near-term entry timing.
   */
  timingConfirmed: boolean;

  thesis: string;
  reasons: string[];
  risks: string[];

  buyZoneLow: number | null;
  buyZoneHigh: number | null;
  targetPrice: number | null;
  stopLoss: number | null;

  valuation: ValuationDetail;
  agents: AgentReport[];
  /** LLM provider used for the thesis synthesis, or "rule-based". */
  provider: string;
};
