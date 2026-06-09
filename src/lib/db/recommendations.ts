import { shouldSkipDbReads } from "@/lib/db/cache-first";
import { readCachedRecommendations } from "@/lib/db/neon-cache";
import { prisma } from "@/lib/prisma";
import { withDbRetry } from "@/lib/prisma-query";
import { isPersistenceEnabled } from "@/lib/persistence";
import { getStock } from "@/lib/market-service";
import { analystTargetUpsidePercent, toVndPrice } from "@/lib/price-utils";
import type { StockPick, PickHorizon } from "@/lib/stock-picks";
import type { Stock } from "@/types/stock";

function dedupePicks(picks: StockPick[]): StockPick[] {
  const bySymbol = new Map<string, StockPick>();
  for (const pick of picks) {
    const sym = pick.stock.symbol.toUpperCase();
    const prev = bySymbol.get(sym);
    if (!prev || pick.score > prev.score) bySymbol.set(sym, pick);
  }
  return Array.from(bySymbol.values());
}

function mapRecommendation(rec: string): PickHorizon {
  const upper = rec.toUpperCase();
  if (upper.includes("BUY") || upper.includes("ACCUMULATE")) return "short";
  return "medium";
}

function minimalStock(row: {
  symbol: string;
  name: string | null;
  price_at_recommendation: number;
}): Stock {
  const price = toVndPrice(row.price_at_recommendation);
  return {
    symbol: row.symbol,
    name: row.name ?? row.symbol,
    exchange: "HOSE",
    sector: "Unknown",
    price,
    change: 0,
    changePercent: 0,
    volume: 0,
    marketCap: 0,
    pe: 0,
    pb: 0,
    roe: 0,
    dividendYield: 0,
    revenueGrowth: 0,
    rsi: 50,
    high52w: price,
    low52w: price,
    analystRating: "Hold",
    analystTarget: price,
    profile: "",
    financials: { years: [], revenue: [], netProfit: [], totalDebt: [] },
  };
}

async function picksFromCache(limit: number): Promise<StockPick[] | null> {
  const cached = readCachedRecommendations();
  if (!cached?.length) return null;
  const picks: StockPick[] = [];
  for (const row of cached.slice(0, limit)) {
    const stock = (await getStock(row.symbol)) ?? minimalStock(row);
    const upsidePercent = analystTargetUpsidePercent(stock);
    picks.push({
      stock,
      score: row.combined_score,
      horizon: mapRecommendation(row.recommendation),
      reasons: [
        row.recommendation,
        `Technical ${row.technical_score} · Fundamental ${row.fundamental_score}`,
        row.name ?? row.symbol,
      ].filter(Boolean) as string[],
      upsidePercent,
    });
  }
  return picks.length ? dedupePicks(picks) : null;
}

export async function getDbRecommendations(
  limit = 5,
): Promise<StockPick[] | null> {
  if (!isPersistenceEnabled()) return null;

  if (shouldSkipDbReads()) {
    return picksFromCache(limit);
  }

  try {
    const latest = await withDbRetry(
      () =>
        prisma.recommendation.findFirst({
          orderBy: { recommendationDate: "desc" },
          select: { recommendationDate: true },
        }),
      "recommendation-latest",
      0,
    );
    if (!latest) return picksFromCache(limit);

    const rows = await withDbRetry(
      () =>
        prisma.recommendation.findMany({
          where: { recommendationDate: latest.recommendationDate },
          orderBy: { combinedScore: "desc" },
          take: limit,
        }),
      "recommendation-list",
      0,
    );

    if (!rows.length) return picksFromCache(limit);

    const picks: StockPick[] = [];
    for (const row of rows) {
      const stock = await getStock(row.symbol);
      if (!stock) continue;

      const upsidePercent = analystTargetUpsidePercent(stock);

      picks.push({
        stock,
        score: row.combinedScore,
        horizon: mapRecommendation(row.recommendation),
        reasons: [
          row.recommendation,
          `Technical ${row.technicalScore} · Fundamental ${row.fundamentalScore}`,
          row.source,
          row.name ?? row.symbol,
        ].filter(Boolean) as string[],
        upsidePercent,
      });
    }

    return picks.length ? dedupePicks(picks) : picksFromCache(limit);
  } catch {
    return picksFromCache(limit);
  }
}
