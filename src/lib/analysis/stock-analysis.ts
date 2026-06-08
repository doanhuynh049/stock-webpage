import type { FundamentalInputs } from "@/lib/analysis/fundamental-scoring";
import { calculateSectorFundamentalScore } from "@/lib/analysis/sector-fundamental-scoring";
import {
  calculateTechnicalScore,
  combinedScore,
  getRecommendationFromScore,
  scoreRating,
  type TechnicalIndicators,
} from "@/lib/analysis/technical-scoring";
import {
  loadAnalysisSnapshotStore,
  type AnalysisSnapshotStore,
} from "@/lib/db/analysis-snapshots";
import type { Stock } from "@/types/stock";

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
};

function stockToFundamentals(stock: Stock): FundamentalInputs {
  return {
    roe: stock.roe,
    roa: null,
    peRatio: stock.pe > 0 ? stock.pe : null,
    pbRatio: stock.pb,
    revenueGrowth: stock.revenueGrowth,
    profitGrowth: null,
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
  const recommendation = getRecommendationFromScore(
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
    technicalRating: scoreRating(technicalScore),
    fundamentalRating: scoreRating(fundamentalScore),
    maTrend: tech ? describeMaTrend(tech, currentPriceK) : "N/A",
    momentum: tech ? describeMomentum(tech) : "N/A",
    supportResistance: tech
      ? describeSupportResistance(tech, currentPriceK)
      : "N/A",
    source,
  };
}
