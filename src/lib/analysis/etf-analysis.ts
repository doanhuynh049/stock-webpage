/**
 * Server-only ETF analysis.
 * Imports Prisma / snapshot DB — must NOT be imported by client components.
 * Client components import types from etf-universe.ts instead.
 */

import { analyzeTechnicalRow } from "@/lib/analysis/combined-analysis";
import { loadAnalysisSnapshotStore } from "@/lib/db/analysis-snapshots";
import { ETF_UNIVERSE, type EtfAnalysisRow } from "@/lib/analysis/etf-universe";

export async function analyzeEtfUniverse(): Promise<EtfAnalysisRow[]> {
  const symbols = ETF_UNIVERSE.map((e) => e.symbol);
  const snapshotStore = await loadAnalysisSnapshotStore(symbols);

  const rows = await Promise.all(
    ETF_UNIVERSE.map(async (etf) => {
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
      } satisfies EtfAnalysisRow;
    }),
  );

  return rows.sort((a, b) => b.technicalScore - a.technicalScore);
}
