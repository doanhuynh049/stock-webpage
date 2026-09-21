import {
  countFundamentalInputs,
  TOTAL_FUNDAMENTAL_INPUTS,
  type FundamentalInputs,
} from "@/lib/analysis/fundamental-scoring";
import { calculateSectorFundamentalScore } from "@/lib/analysis/sector-fundamental-scoring";
import {
  calculateTechnicalScore,
  combinedScore,
  getRecommendationFromScore,
  NO_DATA_SIGNAL,
  scoreRating,
  type TechnicalIndicators,
} from "@/lib/analysis/technical-scoring";
import {
  loadAnalysisSnapshotStore,
  type AnalysisSnapshotStore,
} from "@/lib/db/analysis-snapshots";
import type { Stock } from "@/types/stock";

/**
 * How much real data a score was actually built from.
 *
 * `source` already told us where data came from, but nothing rendered it, so a
 * snapshot-less stock scored 50/"Fair"/HOLD and looked identical to a genuinely
 * average one. This makes the distinction explicit and renderable.
 */
export type DataCoverage = {
  /** A technical snapshot exists. Without it the technical score is a flat 50. */
  hasTechnical: boolean;
  /** Non-null fundamental inputs, out of `TOTAL_FUNDAMENTAL_INPUTS`. */
  fundamentalFields: number;
  totalFundamentalFields: number;
  /**
   * `full`    — technical snapshot + most fundamentals; scores are meaningful.
   * `partial` — enough to score, but at least one side is thin; treat as a hint.
   * `none`    — no technical snapshot; no signal is emitted at all.
   */
  level: "full" | "partial" | "none";
};

export type StockAnalysisResult = {
  symbol: string;
  currentPrice: number;
  technicalScore: number;
  fundamentalScore: number;
  combinedScore: number;
  recommendation: string;
  technicalRating: string;
  fundamentalRating: string;
  maTrend: string;
  momentum: string;
  supportResistance: string;
  source: "neon" | "cache" | "computed";
  coverage: DataCoverage;
};

/** Below this many fundamental inputs, the fundamental score is too thin to lean on. */
const MIN_FUNDAMENTAL_FIELDS = 5;

function assessCoverage(
  tech: TechnicalIndicators | null,
  fundamentalInputs: FundamentalInputs,
): DataCoverage {
  const fundamentalFields = countFundamentalInputs(fundamentalInputs);
  const hasTechnical = tech != null;

  // Technical is 60% of the combined score AND gates every context check in
  // getRecommendationFromScore, so its absence alone drops us to "none".
  const level: DataCoverage["level"] = !hasTechnical
    ? "none"
    : fundamentalFields >= MIN_FUNDAMENTAL_FIELDS
      ? "full"
      : "partial";

  return {
    hasTechnical,
    fundamentalFields,
    totalFundamentalFields: TOTAL_FUNDAMENTAL_INPUTS,
    level,
  };
}

/**
 * Year-over-year growth from the most recent two entries of a financials
 * series, as a percentage. Returns null unless both points are usable.
 *
 * `Financials.years` is chronological, so the last two entries are the most
 * recent pair. A non-positive base makes the ratio meaningless (and a negative
 * base inverts its sign), so those are rejected rather than reported.
 */
function yoyGrowthPct(series: number[] | undefined): number | null {
  if (!series || series.length < 2) return null;
  const prev = series[series.length - 2];
  const latest = series[series.length - 1];
  if (prev == null || latest == null || prev <= 0) return null;
  return ((latest - prev) / prev) * 100;
}

/**
 * Fallback inputs when no `fundamental_snapshot` exists for a symbol.
 *
 * This used to hardcode six of the ten inputs to null, which capped the
 * reachable fundamental score near 52 no matter how good the company was —
 * quality lost ROA and margins, growth lost profit and EPS, and stability
 * (needing debtToEquity) scored a flat zero. `stock.financials` carries
 * multi-year revenue, netProfit and totalDebt series that were simply never
 * read, so profit growth at least can be derived rather than dropped.
 *
 * Still genuinely unavailable here: ROA, margins and debt/equity, all of which
 * need balance-sheet totals (assets, equity) that `Financials` does not carry.
 * `totalDebt` alone cannot produce a debt/equity ratio. Coverage stays partial,
 * and `assessCoverage` still reports it as such.
 */
function stockToFundamentals(stock: Stock): FundamentalInputs {
  const fin = stock.financials;
  return {
    roe: stock.roe,
    roa: null,
    peRatio: stock.pe > 0 ? stock.pe : null,
    pbRatio: stock.pb,
    // Prefer the live field; fall back to deriving it from the revenue series.
    revenueGrowth: stock.revenueGrowth || yoyGrowthPct(fin?.revenue),
    profitGrowth: yoyGrowthPct(fin?.netProfit),
    epsGrowth: null,
    debtToEquity: null,
    netProfitMargin: null,
    grossProfitMargin: null,
  };
}

function describeMaTrend(tech: TechnicalIndicators, price: number): string {
  const parts: string[] = [];
  if (tech.sma20 != null) {
    parts.push(
      `MA20: ${price > tech.sma20 ? "Above" : "Below"} (${tech.sma20.toFixed(1)})`,
    );
  }
  if (tech.sma50 != null) {
    parts.push(
      `MA50: ${price > tech.sma50 ? "Above" : "Below"} (${tech.sma50.toFixed(1)})`,
    );
  }
  return parts.join(" | ") || "N/A";
}

function describeMomentum(tech: TechnicalIndicators): string {
  const parts: string[] = [];
  if (tech.rsi != null) {
    const cond =
      tech.rsi > 70 ? "Overbought" : tech.rsi < 30 ? "Oversold" : "Neutral";
    parts.push(`RSI: ${tech.rsi.toFixed(1)} (${cond})`);
  }
  if (tech.macd != null && tech.macdSignal != null) {
    parts.push(
      `MACD: ${tech.macd > tech.macdSignal ? "Bullish" : "Bearish"}`,
    );
  }
  return parts.join(" | ") || "N/A";
}

function describeSupportResistance(
  tech: TechnicalIndicators,
  price: number,
): string {
  const parts: string[] = [];
  if (tech.supportLevel != null) {
    const dist = ((price - tech.supportLevel) / price) * 100;
    parts.push(`Support: ${tech.supportLevel.toFixed(0)} (${dist.toFixed(1)}% below)`);
  }
  if (tech.resistanceLevel != null) {
    const dist = ((tech.resistanceLevel - price) / price) * 100;
    parts.push(`Resistance: ${tech.resistanceLevel.toFixed(0)} (${dist.toFixed(1)}% above)`);
  }
  return parts.join(" | ") || "N/A";
}

async function resolveSnapshotStore(
  symbol: string,
  store?: AnalysisSnapshotStore,
): Promise<AnalysisSnapshotStore> {
  if (store) return store;
  return loadAnalysisSnapshotStore([symbol]);
}

/** Snapshots use price in thousands (K); live quotes may be full VND. */
function priceInThousands(stock: Stock, tech: TechnicalIndicators | null): number {
  if (tech?.sma20 != null && tech.sma20 < 500 && stock.price >= 1000) {
    return stock.price / 1000;
  }
  if (stock.price >= 10000) return stock.price / 1000;
  return stock.price;
}

export async function analyzeStock(
  stock: Stock,
  store?: AnalysisSnapshotStore,
): Promise<StockAnalysisResult> {
  const snapshotStore = await resolveSnapshotStore(stock.symbol, store);
  const { tech, fund, source } = snapshotStore.resolve(stock.symbol);
  const currentPriceK = priceInThousands(stock, tech);

  const fundamentalInputs: FundamentalInputs = {
    ...stockToFundamentals(stock),
    ...(fund ?? {}),
  };

  const fundamentalScore = calculateSectorFundamentalScore(
    fundamentalInputs,
    stock.sector,
  );
  const technicalScore = calculateTechnicalScore(tech, currentPriceK);
  const combined = combinedScore(technicalScore, fundamentalScore);
  const coverage = assessCoverage(tech, fundamentalInputs);

  // With no technical snapshot the score bands would still return a verdict
  // (typically HOLD) built entirely on defaults. Say "unknown" instead.
  const recommendation =
    coverage.level === "none"
      ? NO_DATA_SIGNAL
      : getRecommendationFromScore(
          combined,
          technicalScore,
          fundamentalScore,
          tech,
          currentPriceK,
        );

  return {
    symbol: stock.symbol,
    currentPrice: stock.price,
    technicalScore,
    fundamentalScore,
    combinedScore: combined,
    recommendation,
    technicalRating: coverage.hasTechnical ? scoreRating(technicalScore) : "No data",
    fundamentalRating:
      coverage.fundamentalFields > 0 ? scoreRating(fundamentalScore) : "No data",
    coverage,
    maTrend: tech ? describeMaTrend(tech, currentPriceK) : "N/A",
    momentum: tech ? describeMomentum(tech) : "N/A",
    supportResistance: tech
      ? describeSupportResistance(tech, currentPriceK)
      : "N/A",
    source,
  };
}
