import { prisma } from "@/lib/prisma";
import { withDbRetry } from "@/lib/prisma-query";
import { log } from "@/lib/logger";

export type PortfolioHoldingInput = {
  symbol: string;
  name?: string | null;
  exchange?: string | null;
  sector?: string | null;
  industry?: string | null;
  shares: number;
  avgBuyPrice?: number | null;
  target3Month?: number | null;
  targetLongTerm?: number | null;
  targetSetDate?: string | null;
  platform?: string | null;
};

export async function listPortfolioHoldings(userId: string) {
  return withDbRetry(
    () =>
      prisma.portfolioHolding.findMany({
        where: { userId, shares: { gt: 0 } },
        orderBy: { symbol: "asc" },
      }),
    "portfolio-list",
    0,
  );
}

/**
 * Full replace sync — mirrors stock-service replacePortfolioHoldings.
 *
 * Uses individual queries instead of prisma.$transaction() because the Neon
 * HTTP driver used on Vercel (DB_DRIVER=http) does NOT support interactive
 * transactions. Individual upserts + a trailing deleteMany achieve the same
 * result without a transaction wrapper.
 */
export async function syncPortfolioHoldings(
  userId: string,
  incoming: PortfolioHoldingInput[],
) {
  const rows = (incoming ?? []).filter(
    (h) => h.symbol?.trim() && Number(h.shares) > 0,
  );
  const symbols = rows.map((h) => h.symbol.toUpperCase());

  if (symbols.length === 0) {
    await withDbRetry(
      () => prisma.portfolioHolding.deleteMany({ where: { userId } }),
      "portfolio-clear",
      0,
    );
    return 0;
  }

  log.debug("portfolio-sync", "syncPortfolioHoldings start", { userId, incoming: symbols.length, symbols });

  // Upsert each incoming holding individually
  for (const h of rows) {
    const sym = h.symbol.toUpperCase();
    const fields = {
      name: h.name ?? null,
      exchange: h.exchange ?? null,
      sector: h.sector ?? null,
      industry: h.industry ?? null,
      shares: h.shares,
      avgBuyPrice: h.avgBuyPrice ?? null,
      target3Month: h.target3Month ?? null,
      targetLongTerm: h.targetLongTerm ?? null,
      targetSetDate: h.targetSetDate ?? null,
      platform: h.platform ?? null,
    };
    try {
      await withDbRetry(
        () =>
          prisma.portfolioHolding.upsert({
            where: { userId_symbol: { userId, symbol: sym } },
            create: { userId, symbol: sym, ...fields },
            update: fields,
          }),
        "portfolio-upsert",
        0,
      );
      log.debug("portfolio-sync", "upserted holding", { userId, symbol: sym, shares: h.shares });
    } catch (err) {
      log.error("portfolio-sync", "upsert failed", { userId, symbol: sym, error: (err as Error).message });
      throw err;
    }
  }

  // Remove any holdings that are no longer in the rebuilt list
  try {
    const deleted = await withDbRetry(
      () =>
        prisma.portfolioHolding.deleteMany({
          where: { userId, symbol: { notIn: symbols } },
        }),
      "portfolio-delete-stale",
      0,
    );
    if (deleted.count > 0) {
      log.info("portfolio-sync", "removed stale holdings", { userId, removed: deleted.count });
    }
  } catch (err) {
    log.error("portfolio-sync", "deleteMany stale failed", { userId, error: (err as Error).message });
    throw err;
  }

  log.info("portfolio-sync", "syncPortfolioHoldings done", { userId, synced: symbols.length });
  return symbols.length;
}
