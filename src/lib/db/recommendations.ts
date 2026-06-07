import { isDbCacheFirst } from "@/lib/db/cache-first";
import { readCachedRecommendations } from "@/lib/db/neon-cache";
import { prisma } from "@/lib/prisma";
import { withDbRetry } from "@/lib/prisma-query";
import { isPersistenceEnabled } from "@/lib/persistence";
import { getStock } from "@/lib/market-service";
import type { StockPick, PickHorizon } from "@/lib/stock-picks";

function mapRecommendation(rec: string): PickHorizon {
  const upper = rec.toUpperCase();
  if (upper.includes("BUY") || upper.includes("ACCUMULATE")) return "short";
  return "medium";
}

async function picksFromCache(limit: number): Promise<StockPick[] | null> {
  const cached = readCachedRecommendations();
  if (!cached?.length) return null;
  const picks: StockPick[] = [];
  for (const row of cached.slice(0, limit)) {
    const stock = await getStock(row.symbol);
    if (!stock) continue;
    const upsidePercent =
      row.price_at_recommendation > 0
        ? ((stock.price - row.price_at_recommendation) /
            row.price_at_recommendation) *
          100
        : 0;
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
  return picks.length ? picks : null;
}

export async function getDbRecommendations(
  limit = 5,
): Promise<StockPick[] | null> {
  if (!isPersistenceEnabled()) return null;

  if (isDbCacheFirst()) {
    const cached = await picksFromCache(limit);
    if (cached) return cached;
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
    if (!latest) return null;

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

    if (!rows.length) return null;

    const picks: StockPick[] = [];
    for (const row of rows) {
      const stock = await getStock(row.symbol);
      if (!stock) continue;

      const upsidePercent =
        row.priceAtRecommendation > 0
          ? ((stock.price - row.priceAtRecommendation) /
              row.priceAtRecommendation) *
            100
          : 0;

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

    return picks.length ? picks : null;
  } catch (error) {
    const cached = await picksFromCache(limit);
    if (cached) {
      console.info("[getDbRecommendations] Using JSON cache");
      return cached;
    }
    console.warn("[getDbRecommendations]", (error as Error).message);
    return null;
  }
}
