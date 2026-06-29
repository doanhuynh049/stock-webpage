import { analyzeStock } from "@/lib/analysis/stock-analysis";
import type { FundamentalAnalysisRow } from "@/lib/analysis/fundamental-analysis";
import { analyzeFundamentalRow } from "@/lib/analysis/fundamental-analysis";
import type { IndexStock } from "@/lib/analysis/index-universe";
import { loadAnalysisSnapshotStore } from "@/lib/db/analysis-snapshots";
import { getStock } from "@/lib/market-service";
import { isEtfSymbol } from "@/lib/analysis/etf-utils";
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
  isEtf?: boolean;
};

export type CombinedAnalysisRow = {
  symbol: string;
  name: string;
  sector: string;
  currentPrice: number;
  technicalScore: number;
  fundamentalScore: number;
  combinedScore: number;
  recommendation: string;
  source: string;
  isEtf?: boolean;
};

type StockMeta = IndexStock | {
  symbol: string;
  name?: string | null;
  sector?: string | null;
};

async function stockForSymbol(meta: StockMeta): Promise<Stock> {
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
  meta: StockMeta,
  store?: Awaited<ReturnType<typeof loadAnalysisSnapshotStore>>,
): Promise<TechnicalAnalysisRow> {
  const stock = await stockForSymbol(meta);
  const etf = isEtfSymbol(stock.symbol);
  const a = await analyzeStock(stock, store);
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
    isEtf: etf,
  };
}

export async function analyzeCombinedRow(
  meta: StockMeta,
  store?: Awaited<ReturnType<typeof loadAnalysisSnapshotStore>>,
): Promise<CombinedAnalysisRow> {
  const stock = await stockForSymbol(meta);
  const etf = isEtfSymbol(stock.symbol);
  const a = await analyzeStock(stock, store);
  // ETFs have no fundamentals — combined score is purely technical
  const combinedScore = etf ? a.technicalScore : a.combinedScore;
  return {
    symbol: a.symbol,
    name: stock.name,
    sector: stock.sector,
    currentPrice: a.currentPrice,
    technicalScore: a.technicalScore,
    fundamentalScore: etf ? 0 : a.fundamentalScore,
    combinedScore,
    recommendation: a.recommendation,
    source: a.source,
    isEtf: etf,
  };
}

export async function analyzeTechnicalUniverse(
  universe: IndexStock[],
  limit?: number,
  store?: Awaited<ReturnType<typeof loadAnalysisSnapshotStore>>,
): Promise<TechnicalAnalysisRow[]> {
  const snapshotStore =
    store ??
    (await loadAnalysisSnapshotStore(universe.map((s) => s.symbol)));
  const rows = await Promise.all(
    universe.map((s) => analyzeTechnicalRow(s, snapshotStore)),
  );
  const sorted = rows.sort((a, b) => b.technicalScore - a.technicalScore);
  return limit ? sorted.slice(0, limit) : sorted;
}

export async function analyzeCombinedUniverse(
  universe: IndexStock[],
  limit?: number,
  store?: Awaited<ReturnType<typeof loadAnalysisSnapshotStore>>,
): Promise<CombinedAnalysisRow[]> {
  const snapshotStore =
    store ??
    (await loadAnalysisSnapshotStore(universe.map((s) => s.symbol)));
  const rows = await Promise.all(
    universe.map((s) => analyzeCombinedRow(s, snapshotStore)),
  );
  const sorted = rows.sort((a, b) => b.combinedScore - a.combinedScore);
  return limit ? sorted.slice(0, limit) : sorted;
}

export async function analyzePortfolioTechnical(
  holdings: Array<{ symbol: string; name?: string | null; sector?: string | null }>,
  store?: Awaited<ReturnType<typeof loadAnalysisSnapshotStore>>,
): Promise<TechnicalAnalysisRow[]> {
  const snapshotStore =
    store ??
    (await loadAnalysisSnapshotStore(holdings.map((h) => h.symbol)));
  const rows = await Promise.all(
    holdings.map((h) => analyzeTechnicalRow(h, snapshotStore)),
  );
  return rows.sort((a, b) => b.technicalScore - a.technicalScore);
}

export async function analyzePortfolioCombined(
  holdings: Array<{ symbol: string; name?: string | null; sector?: string | null }>,
  store?: Awaited<ReturnType<typeof loadAnalysisSnapshotStore>>,
): Promise<CombinedAnalysisRow[]> {
  const snapshotStore =
    store ??
    (await loadAnalysisSnapshotStore(holdings.map((h) => h.symbol)));
  const rows = await Promise.all(
    holdings.map((h) => analyzeCombinedRow(h, snapshotStore)),
  );
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
  const snapshotStore = await loadAnalysisSnapshotStore(
    universe.map((s) => s.symbol),
  );

  const [fundamental, technical, combined] = await Promise.all([
    Promise.all(universe.map((s) => analyzeFundamentalRow(s, snapshotStore))).then(
      (r) =>
        r
          .sort((a, b) => b.breakdown.finalScore - a.breakdown.finalScore)
          .slice(0, limit ?? r.length),
    ),
    analyzeTechnicalUniverse(universe, limit, snapshotStore),
    analyzeCombinedUniverse(universe, limit, snapshotStore),
  ]);

  return { fundamental, technical, combined };
}
