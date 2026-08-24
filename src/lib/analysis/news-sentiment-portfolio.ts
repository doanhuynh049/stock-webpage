import { getPortfolioWithStocks } from "@/lib/db/advisory-portfolio";
import { enrichHoldings } from "@/lib/portfolio/holdings-enrichment";
import { buildNewsSentimentReport, newsStance, socialStance, type NewsSentimentReport, type Stance } from "@/lib/analysis/news-sentiment";
import type { LlmApiKeys } from "@/lib/providers/llm";

/**
 * Portfolio-wide AI News overview — runs the full (LLM-backed) per-ticker
 * pipeline for each holding, in parallel.
 *
 * COST NOTE (explicit per user decision, Aug 2026): unlike AI Analyst (1 LLM
 * call total regardless of portfolio size, via `skipLlm`) and AI Screening
 * (1 LLM call for up to 20 candidates), this runs one full LLM classification
 * per holding. Capped at `MAX_HOLDINGS` by portfolio weight so a large
 * portfolio can't fire an unbounded number of parallel LLM calls on every
 * tab open / background prefetch. Skipped holdings are reported, never
 * silently dropped.
 */
export const MAX_OVERVIEW_HOLDINGS = 10;

export type PortfolioNewsOverviewRow = {
  symbol: string;
  name: string;
  sector: string;
  weightPct: number | null;
  overallNewsStance: Stance;
  overallSocialStance: Stance | null;
  report: NewsSentimentReport;
};

export type PortfolioNewsOverview = {
  generatedAt: string;
  holdingsCount: number;
  analyzedCount: number;
  skippedSymbols: string[];
  rows: PortfolioNewsOverviewRow[];
};

export async function buildPortfolioNewsOverview(
  userId: string,
  opts?: { apiKeys?: LlmApiKeys },
): Promise<PortfolioNewsOverview> {
  const portfolio = await getPortfolioWithStocks(userId);
  const enriched = await enrichHoldings(portfolio.holdings);

  const totalValueK = enriched.reduce((sum, h) => sum + (h.currentValueK ?? 0), 0);
  const ranked = enriched
    .map((h) => ({
      holding: h,
      weightPct: totalValueK > 0 && h.currentValueK != null ? (h.currentValueK / totalValueK) * 100 : null,
    }))
    .sort((a, b) => (b.weightPct ?? 0) - (a.weightPct ?? 0));

  const selected = ranked.slice(0, MAX_OVERVIEW_HOLDINGS);
  const skipped = ranked.slice(MAX_OVERVIEW_HOLDINGS);

  const rows = await Promise.all(
    selected.map(async ({ holding, weightPct }): Promise<PortfolioNewsOverviewRow> => {
      const report = await buildNewsSentimentReport(holding.symbol, opts);
      return {
        symbol: holding.symbol.toUpperCase(),
        name: holding.name ?? holding.symbol,
        sector: holding.sector ?? "Unknown",
        weightPct,
        overallNewsStance: newsStance(report.news_items),
        overallSocialStance: report.social_sentiment ? socialStance(report.social_sentiment) : null,
        report,
      };
    }),
  );

  return {
    generatedAt: new Date().toISOString(),
    holdingsCount: enriched.length,
    analyzedCount: rows.length,
    skippedSymbols: skipped.map((s) => s.holding.symbol.toUpperCase()),
    rows,
  };
}
