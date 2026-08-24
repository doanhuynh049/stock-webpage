import { getPortfolioWithStocks } from "@/lib/db/advisory-portfolio";
import { enrichHoldings } from "@/lib/portfolio/holdings-enrichment";
import { analyzePortfolioCombined } from "@/lib/analysis/combined-analysis";
import { buildPricePrediction, type PricePrediction } from "@/lib/analysis/prediction-model";
import { DEFAULT_HORIZON_DAYS } from "@/lib/analysis/prediction-config";

/**
 * Portfolio-wide AI Prediction overview.
 *
 * Unlike AI News's portfolio overview (one LLM call per holding, capped at
 * 10), this pipeline is pure math — no LLM call — so every holding is
 * analyzed, not just the top-weighted ones. `MAX_PREDICTION_HOLDINGS` exists
 * purely as a serverless-execution-time safety valve (each holding still
 * costs one price-history fetch), not a cost cap; holdings beyond it are
 * reported, never silently dropped.
 */
export const MAX_PREDICTION_HOLDINGS = 50;

export type PortfolioPredictionRow = {
  symbol: string;
  name: string;
  sector: string;
  weightPct: number | null;
  prediction: PricePrediction;
};

export type PortfolioPredictionOverview = {
  generatedAt: string;
  horizonDays: number;
  holdingsCount: number;
  analyzedCount: number;
  skippedSymbols: string[];
  rows: PortfolioPredictionRow[];
};

export async function buildPortfolioPredictionOverview(
  userId: string,
  horizonDays: number = DEFAULT_HORIZON_DAYS,
): Promise<PortfolioPredictionOverview> {
  const portfolio = await getPortfolioWithStocks(userId);
  const [enriched, combinedRows] = await Promise.all([
    enrichHoldings(portfolio.holdings),
    analyzePortfolioCombined(portfolio.holdings),
  ]);

  const combinedBySymbol = new Map(combinedRows.map((r) => [r.symbol.toUpperCase(), r]));

  const totalValueK = enriched.reduce((sum, h) => sum + (h.currentValueK ?? 0), 0);
  const ranked = enriched
    .map((h) => ({
      holding: h,
      weightPct: totalValueK > 0 && h.currentValueK != null ? (h.currentValueK / totalValueK) * 100 : null,
    }))
    .sort((a, b) => (b.weightPct ?? 0) - (a.weightPct ?? 0));

  const selected = ranked.slice(0, MAX_PREDICTION_HOLDINGS);
  const skipped = ranked.slice(MAX_PREDICTION_HOLDINGS);

  const rows = await Promise.all(
    selected.map(async ({ holding, weightPct }): Promise<PortfolioPredictionRow> => {
      const sym = holding.symbol.toUpperCase();
      const combinedScore = combinedBySymbol.get(sym)?.combinedScore ?? null;
      const prediction = await buildPricePrediction(sym, { horizonDays, combinedScore });
      return {
        symbol: sym,
        name: holding.name ?? sym,
        sector: holding.sector ?? "Unknown",
        weightPct,
        prediction,
      };
    }),
  );

  return {
    generatedAt: new Date().toISOString(),
    horizonDays,
    holdingsCount: enriched.length,
    analyzedCount: rows.length,
    skippedSymbols: skipped.map((s) => s.holding.symbol.toUpperCase()),
    rows,
  };
}
