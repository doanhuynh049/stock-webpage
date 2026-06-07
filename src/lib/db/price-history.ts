import { shouldSkipDbReads } from "@/lib/db/cache-first";
import { readCachedPriceDaily } from "@/lib/db/neon-cache";
import { isPersistenceEnabled } from "@/lib/persistence";
import { prisma } from "@/lib/prisma";
import { withDbRetry } from "@/lib/prisma-query";
import type { PricePoint } from "@/types/stock";

function fromCacheRows(
  symbol: string,
  days: number,
): PricePoint[] | null {
  const rows = readCachedPriceDaily(symbol, days);
  if (!rows || rows.length < 2) return null;
  return rows.map((r) => ({
    date: r.trade_date,
    open: r.open_px ?? r.close_px ?? 0,
    high: r.high_px ?? r.close_px ?? 0,
    low: r.low_px ?? r.close_px ?? 0,
    close: r.close_px ?? 0,
    volume: Number(r.volume ?? 0),
  }));
}

export async function getDbPriceHistory(
  symbol: string,
  days = 90,
): Promise<PricePoint[]> {
  if (shouldSkipDbReads()) {
    return fromCacheRows(symbol, days) ?? [];
  }

  if (!isPersistenceEnabled()) {
    return fromCacheRows(symbol, days) ?? [];
  }

  try {
    const sym = symbol.toUpperCase();
    const since = new Date();
    since.setDate(since.getDate() - days);

    const rows = await withDbRetry(
      () =>
        prisma.priceDaily.findMany({
          where: {
            symbol: sym,
            tradeDate: { gte: since },
          },
          orderBy: { tradeDate: "asc" },
        }),
      "price-daily",
      0,
    );

    if (rows.length < 2) {
      return fromCacheRows(symbol, days) ?? [];
    }

    return rows.map((r) => ({
      date: r.tradeDate.toISOString().slice(0, 10),
      open: r.openPx ?? r.closePx ?? 0,
      high: r.highPx ?? r.closePx ?? 0,
      low: r.lowPx ?? r.closePx ?? 0,
      close: r.closePx ?? 0,
      volume: Number(r.volume ?? 0),
    }));
  } catch {
    return fromCacheRows(symbol, days) ?? [];
  }
}
