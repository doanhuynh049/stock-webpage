/**
 * Server-only ETF analysis.
 * Imports Prisma / snapshot DB — must NOT be imported by client components.
 * Client components import types from etf-universe.ts instead.
 */

import { analyzeTechnicalRow } from "@/lib/analysis/combined-analysis";
import { loadAnalysisSnapshotStore } from "@/lib/db/analysis-snapshots";
import { fetchYahooHistory } from "@/lib/providers/yahoo";
import { ETF_UNIVERSE, type EtfAnalysisRow } from "@/lib/analysis/etf-universe";

/**
 * Compute 1-year price return (%) from Yahoo history.
 * Fetches 365 trading-day candles; uses first vs last close.
 * Returns null when fewer than 200 candles are available (newly listed ETF).
 */
async function fetchOneYearReturn(symbol: string): Promise<number | null> {
  try {
    const history = await fetchYahooHistory(symbol, 365);
    if (history.length < 200) return null;
    const first = history[0].close;
    const last = history[history.length - 1].close;
    if (!first || !last) return null;
    return Math.round(((last - first) / first) * 10000) / 100; // 2 decimal places
  } catch {
    return null;
  }
}

export async function analyzeEtfUniverse(): Promise<EtfAnalysisRow[]> {
  const symbols = ETF_UNIVERSE.map((e) => e.symbol);

  // Run DB snapshot fetch and Yahoo 1yr returns in parallel
  const [snapshotStore, yearReturns] = await Promise.all([
    loadAnalysisSnapshotStore(symbols),
    Promise.all(ETF_UNIVERSE.map((etf) => fetchOneYearReturn(etf.symbol))),
  ]);

  const rows = await Promise.all(
    ETF_UNIVERSE.map(async (etf, i) => {
      const techRow = await analyzeTechnicalRow(
        { symbol: etf.symbol, name: etf.name, sector: "ETF" },
        snapshotStore,
      );
      const hasData = techRow.source !== "computed";
      return {
        ...etf,
        currentPrice: techRow.currentPrice,
        technicalScore: techRow.technicalScore,
        technicalRating: techRow.technicalRating,
        maTrend: techRow.maTrend,
        momentum: techRow.momentum,
        supportResistance: techRow.supportResistance,
        source: techRow.source,
        hasData,
        oneYearReturn: yearReturns[i] ?? null,
      } satisfies EtfAnalysisRow;
    }),
  );

  return rows.sort((a, b) => b.technicalScore - a.technicalScore);
}
