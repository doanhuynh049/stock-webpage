import { analyzeStock } from "@/lib/analysis/stock-analysis";
import type { FundamentalAnalysisRow } from "@/lib/analysis/fundamental-analysis";
import { analyzeFundamentalRow } from "@/lib/analysis/fundamental-analysis";
import type { IndexStock } from "@/lib/analysis/index-universe";
import { getStock } from "@/lib/market-service";
import type { Stock } from "@/types/stock";

export type TechnicalAnalysisRow = {
  symbol: string;
  name: string;
  sector: string;
  currentPrice: number;
  technicalScore: number;
  technicalRating: string;
  maTrend: string;
  momentum: string;
  supportResistance: string;
  source: string;
};

export type CombinedAnalysisRow = {
  symbol: string;
  name: string;
  sector: string;
  technicalScore: number;
  fundamentalScore: number;
  combinedScore: number;
  recommendation: string;
  source: string;
};

async function stockForSymbol(meta: IndexStock | { symbol: string; name?: string | null; sector?: string | null }): Promise<Stock> {
  const sym = meta.symbol.toUpperCase();
  const existing = await getStock(sym);
  if (existing) return existing;
  return {
    symbol: sym,
    name: ("name" in meta && meta.name) || sym,
    sector: ("sector" in meta && meta.sector) || "Unknown",
    exchange: "HOSE",
    price: 0,
    change: 0,
    changePercent: 0,
    volume: 0,
    marketCap: 0,
    pe: 0,
    pb: 0,
    roe: 0,
    revenueGrowth: 0,
    rsi: 50,
    dividendYield: 0,
    high52w: 0,
    low52w: 0,
    analystRating: "Hold",
    analystTarget: 0,
    profile: "",
    financials: { years: [], revenue: [], netProfit: [], totalDebt: [] },
  };
}

export async function analyzeTechnicalRow(
  meta: IndexStock | { symbol: string; name?: string | null; sector?: string | null },
): Promise<TechnicalAnalysisRow> {
  const stock = await stockForSymbol(meta);
  const a = await analyzeStock(stock);
  return {
    symbol: a.symbol,
    name: stock.name,
    sector: stock.sector,
    currentPrice: a.currentPrice,
    technicalScore: a.technicalScore,
    technicalRating: a.technicalRating,
    maTrend: a.maTrend,
    momentum: a.momentum,
    supportResistance: a.supportResistance,
    source: a.source,
  };
}

export async function analyzeCombinedRow(
  meta: IndexStock | { symbol: string; name?: string | null; sector?: string | null },
): Promise<CombinedAnalysisRow> {
  const stock = await stockForSymbol(meta);
  const a = await analyzeStock(stock);
  return {
    symbol: a.symbol,
    name: stock.name,
    sector: stock.sector,
    technicalScore: a.technicalScore,
    fundamentalScore: a.fundamentalScore,
    combinedScore: a.combinedScore,
    recommendation: a.recommendation,
    source: a.source,
  };
}

export async function analyzeTechnicalUniverse(
  universe: IndexStock[],
  limit?: number,
): Promise<TechnicalAnalysisRow[]> {
  const rows = await Promise.all(universe.map((s) => analyzeTechnicalRow(s)));
  const sorted = rows.sort((a, b) => b.technicalScore - a.technicalScore);
  return limit ? sorted.slice(0, limit) : sorted;
}

export async function analyzeCombinedUniverse(
  universe: IndexStock[],
  limit?: number,
): Promise<CombinedAnalysisRow[]> {
  const rows = await Promise.all(universe.map((s) => analyzeCombinedRow(s)));
  const sorted = rows.sort((a, b) => b.combinedScore - a.combinedScore);
  return limit ? sorted.slice(0, limit) : sorted;
}

export async function analyzePortfolioTechnical(
  holdings: Array<{ symbol: string; name?: string | null; sector?: string | null }>,
): Promise<TechnicalAnalysisRow[]> {
  const rows = await Promise.all(holdings.map((h) => analyzeTechnicalRow(h)));
  return rows.sort((a, b) => b.technicalScore - a.technicalScore);
}

export async function analyzePortfolioCombined(
  holdings: Array<{ symbol: string; name?: string | null; sector?: string | null }>,
): Promise<CombinedAnalysisRow[]> {
  const rows = await Promise.all(holdings.map((h) => analyzeCombinedRow(h)));
  return rows.sort((a, b) => b.combinedScore - a.combinedScore);
}

export type UniverseAnalysisBundle = {
  fundamental: FundamentalAnalysisRow[];
  technical: TechnicalAnalysisRow[];
  combined: CombinedAnalysisRow[];
};

export async function analyzeUniverseBundle(
  universe: IndexStock[],
  limit?: number,
): Promise<UniverseAnalysisBundle> {
  const [fundamental, technical, combined] = await Promise.all([
    Promise.all(universe.map((s) => analyzeFundamentalRow(s))).then((r) =>
      r.sort((a, b) => b.breakdown.finalScore - a.breakdown.finalScore).slice(0, limit ?? r.length),
    ),
    analyzeTechnicalUniverse(universe, limit),
    analyzeCombinedUniverse(universe, limit),
  ]);
  return { fundamental, technical, combined };
}
