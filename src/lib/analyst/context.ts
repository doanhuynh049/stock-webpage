// Gathers all data an analyst agent could need for one symbol, reusing the
// existing market / news / analysis services. One batched fetch keeps the
// orchestrator fast and within free-tier rate limits.

import { getStock, getTechnicalSignals, getMarketSnapshot } from "@/lib/market-service";
import { getNewsLive } from "@/lib/news-service";
import { analyzeStock, type StockAnalysisResult } from "@/lib/analysis/stock-analysis";
import type { MarketSnapshot, NewsItem, Stock, TechnicalSignal } from "@/types/stock";

export type AnalystContext = {
  stock: Stock;
  technicals: TechnicalSignal[];
  analysis: StockAnalysisResult | null;
  news: NewsItem[];
  market: MarketSnapshot | null;
};

export async function gatherAnalystContext(
  symbol: string,
): Promise<AnalystContext | null> {
  const sym = symbol.toUpperCase().trim();
  const stock = await getStock(sym);
  if (!stock || stock.price <= 0) return null;

  const [technicals, analysis, news, market] = await Promise.all([
    getTechnicalSignals(stock).catch(() => [] as TechnicalSignal[]),
    analyzeStock(stock).catch(() => null),
    getNewsLive(sym).catch(() => [] as NewsItem[]),
    getMarketSnapshot().catch(() => null),
  ]);

  return { stock, technicals, analysis, news, market };
}

/** Find a technical signal by (case-insensitive, prefix) indicator name. */
export function findSignal(
  technicals: TechnicalSignal[],
  indicatorPrefix: string,
): TechnicalSignal | undefined {
  const p = indicatorPrefix.toLowerCase();
  return technicals.find((t) => t.indicator.toLowerCase().startsWith(p));
}
