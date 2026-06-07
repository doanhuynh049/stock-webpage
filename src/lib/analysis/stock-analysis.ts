import {
  calculateFundamentalScore,
  type FundamentalInputs,
} from "@/lib/analysis/fundamental-scoring";
import {
  calculateTechnicalScore,
  combinedScore,
  getRecommendationFromScore,
  scoreRating,
  type TechnicalIndicators,
} from "@/lib/analysis/technical-scoring";
import {
  readCachedFundamentalSnapshot,
  readCachedTechnicalSnapshot,
} from "@/lib/db/neon-cache";
import { shouldSkipDbReads } from "@/lib/db/cache-first";
import { isPersistenceEnabled } from "@/lib/persistence";
import { prisma } from "@/lib/prisma";
import { withDbRetry } from "@/lib/prisma-query";
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

function mapTechnicalSnapshot(row: {
  price?: number | null;
  rsi?: number | null;
  sma_20?: number | null;
  sma_50?: number | null;
  sma_200?: number | null;
  macd?: number | null;
  macd_signal?: number | null;
  support_level?: number | null;
  resistance_level?: number | null;
  volume?: number | null;
  volume_ma?: number | null;
}): TechnicalIndicators {
  return {
    rsi: row.rsi,
    sma20: row.sma_20,
    sma50: row.sma_50,
    sma200: row.sma_200,
    macd: row.macd,
    macdSignal: row.macd_signal,
    supportLevel: row.support_level,
    resistanceLevel: row.resistance_level,
    volume: row.volume,
    volumeMa: row.volume_ma,
  };
}

function mapFundamentalSnapshot(row: {
  pe_ratio?: number | null;
  pb_ratio?: number | null;
  roe?: number | null;
  roa?: number | null;
  revenue_growth?: number | null;
  profit_growth?: number | null;
  eps_growth?: number | null;
  debt_to_equity?: number | null;
  net_profit_margin?: number | null;
  gross_profit_margin?: number | null;
}): FundamentalInputs {
  return {
    peRatio: row.pe_ratio,
    pbRatio: row.pb_ratio,
    roe: row.roe != null ? row.roe * 100 : null,
    roa: row.roa != null ? row.roa * 100 : null,
    revenueGrowth: row.revenue_growth != null ? row.revenue_growth * 100 : null,
    profitGrowth: row.profit_growth != null ? row.profit_growth * 100 : null,
    epsGrowth: row.eps_growth != null ? row.eps_growth * 100 : null,
    debtToEquity: row.debt_to_equity,
    netProfitMargin: row.net_profit_margin,
    grossProfitMargin: row.gross_profit_margin,
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

async function loadSnapshots(symbol: string): Promise<{
  tech: TechnicalIndicators | null;
  fund: FundamentalInputs | null;
  source: "neon" | "cache" | "computed";
}> {
  const sym = symbol.toUpperCase();

  if (shouldSkipDbReads()) {
    const techRow = readCachedTechnicalSnapshot(sym);
    const fundRow = readCachedFundamentalSnapshot(sym);
    if (techRow || fundRow) {
      return {
        tech: techRow ? mapTechnicalSnapshot(techRow) : null,
        fund: fundRow ? mapFundamentalSnapshot(fundRow) : null,
        source: "cache",
      };
    }
  }

  if (!isPersistenceEnabled()) {
    return { tech: null, fund: null, source: "computed" };
  }

  try {
    const [techRow, fundRow] = await withDbRetry(
      () =>
        Promise.all([
          prisma.technicalSnapshot.findFirst({
            where: { symbol: sym },
            orderBy: { capturedAt: "desc" },
          }),
          prisma.fundamentalSnapshot.findFirst({
            where: { symbol: sym },
            orderBy: { capturedAt: "desc" },
          }),
        ]),
      "stock-analysis",
      0,
    );

    return {
      tech: techRow
        ? mapTechnicalSnapshot({
            price: techRow.price,
            rsi: techRow.rsi,
            sma_20: techRow.sma20,
            sma_50: techRow.sma50,
            sma_200: techRow.sma200,
            macd: techRow.macd,
            macd_signal: techRow.macdSignal,
            support_level: techRow.supportLevel,
            resistance_level: techRow.resistanceLevel,
            volume: techRow.volume,
            volume_ma: techRow.volumeMa,
          })
        : null,
      fund: fundRow
        ? mapFundamentalSnapshot({
            pe_ratio: fundRow.peRatio,
            pb_ratio: fundRow.pbRatio,
            roe: fundRow.roe,
            roa: fundRow.roa,
            revenue_growth: fundRow.revenueGrowth,
            profit_growth: fundRow.profitGrowth,
            eps_growth: fundRow.epsGrowth,
            debt_to_equity: fundRow.debtToEquity,
            net_profit_margin: fundRow.netProfitMargin,
            gross_profit_margin: fundRow.grossProfitMargin,
          })
        : null,
      source: "neon",
    };
  } catch {
    const techRow = readCachedTechnicalSnapshot(sym);
    const fundRow = readCachedFundamentalSnapshot(sym);
    return {
      tech: techRow ? mapTechnicalSnapshot(techRow) : null,
      fund: fundRow ? mapFundamentalSnapshot(fundRow) : null,
      source: techRow || fundRow ? "cache" : "computed",
    };
  }
}

export async function analyzeStock(stock: Stock): Promise<StockAnalysisResult> {
  const { tech, fund, source } = await loadSnapshots(stock.symbol);
  const currentPrice = stock.price;

  const fundamentalInputs: FundamentalInputs = {
    ...stockToFundamentals(stock),
    ...(fund ?? {}),
  };

  const fundamentalScore = calculateFundamentalScore(fundamentalInputs);
  const technicalScore = calculateTechnicalScore(tech, currentPrice);
  const combined = combinedScore(technicalScore, fundamentalScore);
  const recommendation = getRecommendationFromScore(
    combined,
    technicalScore,
    fundamentalScore,
    tech,
    currentPrice,
  );

  return {
    symbol: stock.symbol,
    currentPrice,
    technicalScore,
    fundamentalScore,
    combinedScore: combined,
    recommendation,
    technicalRating: scoreRating(technicalScore),
    fundamentalRating: scoreRating(fundamentalScore),
    maTrend: tech ? describeMaTrend(tech, currentPrice) : "N/A",
    momentum: tech ? describeMomentum(tech) : "N/A",
    supportResistance: tech
      ? describeSupportResistance(tech, currentPrice)
      : "N/A",
    source,
  };
}
