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
 * Two queries: deleteMany (all user rows) → createMany (rebuilt list).
 * This is safe on Vercel/Neon HTTP because:
 *  - The Neon HTTP driver does NOT support interactive transactions, so we
 *    cannot wrap these in a transaction anyway.
 *  - The gap between delete and create is sub-millisecond inside a single
 *    serverless invocation; cache tags are busted only after both complete.
 *  - 2 round-trips vs the old N-upserts + 1-deleteMany (e.g. 26 for 25 holdings)
 *    dramatically reduces Vercel function duration and Neon connection pressure.
 */
export async function syncPortfolioHoldings(
  userId: string,
  incoming: PortfolioHoldingInput[],
) {
  const rows = (incoming ?? []).filter(
    (h) => h.symbol?.trim() && Number(h.shares) > 0,
  );
  const symbols = rows.map((h) => h.symbol.toUpperCase());

  log.debug("portfolio-sync", "syncPortfolioHoldings start", { userId, incoming: symbols.length });

  // Step 1: wipe existing holdings for this user.
  try {
    await withDbRetry(
      () => prisma.portfolioHolding.deleteMany({ where: { userId } }),
      "portfolio-delete-all",
      0,
    );
  } catch (err) {
    log.error("portfolio-sync", "deleteMany failed", { userId, error: (err as Error).message });
    throw err;
  }

  if (rows.length === 0) {
    log.info("portfolio-sync", "syncPortfolioHoldings: cleared all holdings", { userId });
    return 0;
  }

  // Step 2: bulk-insert the rebuilt list.
  try {
    await withDbRetry(
      () =>
        prisma.portfolioHolding.createMany({
          data: rows.map((h) => ({
            userId,
            symbol: h.symbol.toUpperCase(),
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
          })),
        }),
      "portfolio-createMany",
      1,
    );
  } catch (err) {
    log.error("portfolio-sync", "createMany failed", { userId, symbols, error: (err as Error).message });
    throw err;
  }

  log.info("portfolio-sync", "syncPortfolioHoldings done", { userId, synced: symbols.length });
  return symbols.length;
}
