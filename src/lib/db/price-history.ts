import { prisma } from "@/lib/prisma";
import { withDbRetry } from "@/lib/prisma-query";
import { isPersistenceEnabled } from "@/lib/persistence";
import type { PricePoint } from "@/types/stock";

export async function getDbPriceHistory(
  symbol: string,
  days = 90,
): Promise<PricePoint[]> {
  if (!isPersistenceEnabled()) return [];

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
      1,
    );

    if (rows.length < 2) return [];

    return rows.map((r) => ({
      date: r.tradeDate.toISOString().slice(0, 10),
      open: r.openPx ?? r.closePx ?? 0,
      high: r.highPx ?? r.closePx ?? 0,
      low: r.lowPx ?? r.closePx ?? 0,
      close: r.closePx ?? 0,
      volume: Number(r.volume ?? 0),
    }));
  } catch (error) {
    console.error("[getDbPriceHistory]", error);
    return [];
  }
}
