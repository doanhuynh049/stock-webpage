import { Prisma } from "@/generated/prisma/client";
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

  // Step 2: bulk-insert the rebuilt list via a single raw INSERT statement.
  //
  // Neither createMany nor upsert works on the Neon HTTP adapter: Prisma wraps
  // both in an implicit transaction internally, and Neon HTTP rejects any
  // BEGIN/COMMIT ("Transactions are not supported in HTTP mode").
  //
  // $executeRaw generates exactly one SQL statement — no transaction wrapper —
  // so it is safe with the Neon HTTP driver.  Prisma.sql / Prisma.join are
  // the tagged-template helpers that parameterise values safely.
  try {
    const valueFragments = rows.map((h) =>
      Prisma.sql`(
        ${userId},
        ${h.symbol.toUpperCase()},
        ${h.name ?? null},
        ${h.exchange ?? null},
        ${h.sector ?? null},
        ${h.industry ?? null},
        ${h.shares},
        ${h.avgBuyPrice ?? null},
        ${h.target3Month ?? null},
        ${h.targetLongTerm ?? null},
        ${h.targetSetDate ?? null},
        ${h.platform ?? null}
      )`
    );

    await withDbRetry(
      () => prisma.$executeRaw`
        INSERT INTO "portfolio_holding"
          ("user_id","symbol","name","exchange","sector","industry",
           "shares","avg_buy_price","target_3_month","target_long_term",
           "target_set_date","platform")
        VALUES ${Prisma.join(valueFragments)}
      `,
      "portfolio-insert-raw",
      1,
    );
  } catch (err) {
    log.error("portfolio-sync", "bulk insert failed", { userId, symbols, error: (err as Error).message });
    throw err;
  }

  log.info("portfolio-sync", "syncPortfolioHoldings done", { userId, synced: symbols.length });
  return symbols.length;
}
